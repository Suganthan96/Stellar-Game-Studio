#![no_std]

//! # ZK-UNO Contract
//!
//! A 2-player UNO variant where hand contents are NEVER stored on-chain.
//! Each player's hand is represented only as a 32-byte keccak256 commitment.
//! Every move is verified by a RISC Zero ZK proof so the opponent can never
//! count cards.
//!
//! **ZK Guarantee:**
//! - `commit_hand_zk`    — proves hand is valid without revealing cards
//! - `play_card_zk`      — proves card is in hand and move is legal (+4 enforced)
//! - `draw_card_zk`      — proves the correct card was appended to the hand
//! - `declare_uno_zk`    — proves hand has exactly 1 card without revealing it
//!
//! **Game Hub Integration:**
//! Every game calls `start_game` and `end_game` on the Game Hub contract.

use soroban_sdk::{
    Address, Bytes, BytesN, Env, IntoVal, contract, contractclient,
    contracterror, contractimpl, contracttype, vec,
};
use risc0_interface::RiscZeroVerifierRouterClient;

// ============================================================================
// Game Hub client interface
// ============================================================================

#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );
    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound         = 1,
    NotPlayer            = 2,
    GameAlreadyEnded     = 3,
    NotYourTurn          = 4,
    HandNotCommitted     = 5,
    InvalidHandHash      = 6,
    CardNotInHand        = 7,
    InvalidCard          = 8,
    IllegalWildDraw4     = 9,
    InvalidHandSize      = 10,
    HandAlreadyCommitted = 11,
    ZkProofInvalid       = 12,
    ZkVerifierNotSet     = 13,
    ZkActiveColourMismatch = 14,
    ZkDrawCountMismatch  = 15,
}

// ============================================================================
// Card constants (must match zkUnoService.ts)
// ============================================================================

pub const RED:    u32 = 0;
pub const YELLOW: u32 = 1;
pub const GREEN:  u32 = 2;
pub const BLUE:   u32 = 3;
pub const WILD:   u32 = 4;

pub const SKIP:       u32 = 10;
pub const REVERSE:    u32 = 11;
pub const DRAW_TWO:   u32 = 12;
pub const WILD_CARD:  u32 = 13;
pub const WILD_DRAW4: u32 = 14;

pub const INITIAL_HAND_SIZE: u32 = 7;
pub const BYTES_PER_CARD:    u32 = 2;

// ============================================================================
// RISC Zero IMAGE_IDs (placeholders — replace after guest build)
// ============================================================================

/// Hand-commitment guest (zk-uno-guest / main.rs)
pub const ZK_UNO_IMAGE_ID: [u8; 32] = [
    0xb7, 0x21, 0x64, 0x47, 0x95, 0xbe, 0xce, 0x69,
    0xd9, 0x5e, 0x97, 0x52, 0x12, 0xf2, 0xd9, 0x6c,
    0xfb, 0x9d, 0xf1, 0x21, 0x27, 0xe8, 0xb3, 0x65,
    0x38, 0xab, 0xa6, 0x57, 0xb7, 0xcc, 0x3c, 0x08,
];

/// Move-proof guest (zk-uno-guest / move_main.rs)
pub const ZK_UNO_MOVE_IMAGE_ID: [u8; 32] = [
    0x01, 0x84, 0xe7, 0x52, 0x61, 0x29, 0xc9, 0x3e,
    0x6a, 0x6c, 0xfa, 0x22, 0xe8, 0x26, 0x95, 0x4d,
    0xe3, 0xf5, 0x98, 0x57, 0x4d, 0xd5, 0xb9, 0x27,
    0x92, 0x93, 0xdb, 0x3a, 0x7f, 0x74, 0xc9, 0x62,
];

/// Draw-proof guest (zk-uno-guest / draw_main.rs)
pub const ZK_UNO_DRAW_IMAGE_ID: [u8; 32] = [
    0xca, 0xa5, 0xc9, 0x75, 0x2b, 0x08, 0x63, 0x13,
    0x2d, 0x41, 0xac, 0x6a, 0x21, 0xc5, 0xb3, 0x71,
    0x5e, 0x3a, 0xc3, 0x19, 0x49, 0x6d, 0x99, 0x36,
    0xfe, 0x24, 0xb7, 0x65, 0x92, 0xca, 0x70, 0x67,
];

/// Declare-UNO proof guest (zk-uno-guest / uno_main.rs)
pub const ZK_UNO_UNO_IMAGE_ID: [u8; 32] = [
    0xf3, 0x15, 0x81, 0x27, 0xcf, 0xb8, 0x13, 0x68,
    0x58, 0x4b, 0x80, 0x1e, 0xaa, 0x5c, 0x5e, 0x1b,
    0x88, 0x9b, 0x5b, 0x4c, 0x27, 0xed, 0x06, 0x0d,
    0xa6, 0xed, 0xfc, 0x3b, 0xcb, 0x02, 0xb3, 0x73,
];

// ============================================================================
// Data Types
// ============================================================================

const GAME_TTL_LEDGERS: u32 = 518_400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    /// keccak256(hand_bytes || salt) — NEVER the raw hand
    pub hand_hash_p1: Option<BytesN<32>>,
    /// keccak256(hand_bytes || salt) — NEVER the raw hand
    pub hand_hash_p2: Option<BytesN<32>>,
    pub top_colour: u32,
    pub top_value: u32,
    /// May differ from top_colour after a Wild is played
    pub active_colour: u32,
    /// 0 = player1's turn, 1 = player2's turn
    pub current_turn: u32,
    /// Index of the next card to draw from the deterministic deck
    pub draw_count: u32,
    pub winner: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameHubAddress,
    Admin,
    Risc0Verifier,
}

// ============================================================================
// Helpers
// ============================================================================

/// Build a deterministic 32-byte seed for (session_id, nonce) using keccak256.
fn deck_seed(env: &Env, session_id: u32, nonce: u32) -> BytesN<32> {
    let mut data = [0u8; 8];
    data[0..4].copy_from_slice(&session_id.to_be_bytes());
    data[4..8].copy_from_slice(&nonce.to_be_bytes());
    env.crypto().keccak256(&Bytes::from_array(env, &data)).into()
}

/// Derive a single card (colour, value) deterministically.
pub fn derive_card(env: &Env, session_id: u32, card_index: u32) -> (u32, u32) {
    let seed = deck_seed(env, session_id, card_index);
    let bytes = seed.to_array();
    let colour_raw = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    let value_raw  = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
    let colour = colour_raw % 5;
    let value  = if colour == WILD {
        WILD_CARD + (value_raw % 2) // 13=Wild, 14=WildDraw4
    } else {
        value_raw % 13
    };
    (colour, value)
}

fn can_play(card_colour: u32, card_value: u32, active_colour: u32, top_value: u32) -> bool {
    if card_colour == WILD           { return true; }
    if card_colour == active_colour  { return true; }
    if card_value == top_value && card_value <= DRAW_TWO { return true; }
    false
}

// ============================================================================
// Contract
// ============================================================================

#[contract]
pub struct ZkUnoContract;

#[contractimpl]
impl ZkUnoContract {

    pub fn __constructor(env: Env, admin: Address, game_hub: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GameHubAddress, &game_hub);
    }

    // ── Game lifecycle ────────────────────────────────────────────────────────

    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        if player1 == player2 { panic!("self-play not allowed"); }

        player1.require_auth_for_args(
            vec![&env, session_id.into_val(&env), player1_points.into_val(&env)]
        );
        player2.require_auth_for_args(
            vec![&env, session_id.into_val(&env), player2_points.into_val(&env)]
        );

        let game_hub_addr: Address = env.storage().instance()
            .get(&DataKey::GameHubAddress).expect("GameHub not set");
        GameHubClient::new(&env, &game_hub_addr).start_game(
            &env.current_contract_address(),
            &session_id, &player1, &player2,
            &player1_points, &player2_points,
        );

        let (top_colour, top_value) = derive_card(&env, session_id, 14);
        let (top_colour, top_value) = if top_colour == WILD {
            (RED, top_value % 10)
        } else {
            (top_colour, top_value)
        };

        let game = Game {
            player1, player2, player1_points, player2_points,
            hand_hash_p1: None, hand_hash_p2: None,
            top_colour, top_value, active_colour: top_colour,
            current_turn: 0, draw_count: 15, winner: None,
        };
        let key = DataKey::Game(session_id);
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    // ── Hand commitment ───────────────────────────────────────────────────────

    /// Commit initial hand hash WITH a RISC Zero ZK proof.
    ///
    /// Journal (36 bytes): session_id_be32 || hand_hash
    pub fn commit_hand_zk(
        env: Env,
        session_id: u32,
        player: Address,
        hand_hash: BytesN<32>,
        zk_seal: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let risc0_addr: Address = env.storage().instance()
            .get(&DataKey::Risc0Verifier).ok_or(Error::ZkVerifierNotSet)?;

        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &session_id.to_be_bytes()));
        preimage.append(&Bytes::from_array(&env, &hand_hash.to_array()));
        let journal_sha256: BytesN<32> = env.crypto().sha256(&preimage).into();

        RiscZeroVerifierRouterClient::new(&env, &risc0_addr).verify(
            &zk_seal,
            &BytesN::from_array(&env, &ZK_UNO_IMAGE_ID),
            &journal_sha256,
        );

        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;
        if game.winner.is_some() { return Err(Error::GameAlreadyEnded); }
        if player == game.player1 {
            if game.hand_hash_p1.is_some() { return Err(Error::HandAlreadyCommitted); }
            game.hand_hash_p1 = Some(hand_hash);
        } else if player == game.player2 {
            if game.hand_hash_p2.is_some() { return Err(Error::HandAlreadyCommitted); }
            game.hand_hash_p2 = Some(hand_hash);
        } else {
            return Err(Error::NotPlayer);
        }
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    // ── Play card ZK ──────────────────────────────────────────────────────────

    /// Play a card using a RISC Zero ZK proof.
    ///
    /// Journal (74 bytes):
    ///   session_id_be32 || old_hash(32) || new_hash(32) ||
    ///   played_colour(1) || played_value(1) || wild_colour(1) || active_colour(1) ||
    ///   is_winner(1) || is_uno(1)
    ///
    /// The ZK proof guarantees is_winner/is_uno are honestly computed from the
    /// hand update.  When is_winner is true, the contract finalizes the game and
    /// reports to the Game Hub — hand size is never revealed on-chain.
    pub fn play_card_zk(
        env: Env,
        session_id: u32,
        player: Address,
        played_colour: u32,
        played_value: u32,
        wild_colour: u32,
        new_hand_hash: BytesN<32>,
        zk_seal: Bytes,
        is_winner: bool,
        is_uno: bool,
    ) -> Result<(), Error> {
        player.require_auth();
        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;
        if game.winner.is_some() { return Err(Error::GameAlreadyEnded); }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 { return Err(Error::NotPlayer); }
        if (if is_p1 { 0u32 } else { 1u32 }) != game.current_turn { return Err(Error::NotYourTurn); }

        if !can_play(played_colour, played_value, game.active_colour, game.top_value) {
            return Err(Error::InvalidCard);
        }

        let old_hash = if is_p1 {
            game.hand_hash_p1.clone().ok_or(Error::HandNotCommitted)?
        } else {
            game.hand_hash_p2.clone().ok_or(Error::HandNotCommitted)?
        };

        let risc0_addr: Address = env.storage().instance()
            .get(&DataKey::Risc0Verifier).ok_or(Error::ZkVerifierNotSet)?;

        // 74-byte journal: matches guest move_main.rs output exactly
        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &session_id.to_be_bytes()));
        preimage.append(&Bytes::from_array(&env, &old_hash.to_array()));
        preimage.append(&Bytes::from_array(&env, &new_hand_hash.to_array()));
        preimage.append(&Bytes::from_array(&env, &[
            (played_colour       & 0xff) as u8,
            (played_value        & 0xff) as u8,
            (wild_colour         & 0xff) as u8,
            (game.active_colour  & 0xff) as u8,
            is_winner as u8,
            is_uno    as u8,
        ]));
        let journal_sha256: BytesN<32> = env.crypto().sha256(&preimage).into();

        RiscZeroVerifierRouterClient::new(&env, &risc0_addr).verify(
            &zk_seal,
            &BytesN::from_array(&env, &ZK_UNO_MOVE_IMAGE_ID),
            &journal_sha256,
        );

        game.top_colour = played_colour;
        game.top_value  = played_value;
        game.active_colour = if played_colour == WILD { wild_colour % 4 } else { played_colour };
        if is_p1 { game.hand_hash_p1 = Some(new_hand_hash); }
        else      { game.hand_hash_p2 = Some(new_hand_hash); }

        // ZK proof guarantees is_winner is honest — finalize if hand is empty
        if is_winner {
            return Self::finalize_win(&env, session_id, &mut game, &key, &player);
        }

        game.current_turn = Self::apply_card_effects(game.current_turn, played_value, &mut game.draw_count);
        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    // ── Draw card ZK ──────────────────────────────────────────────────────────

    /// Draw a card using a RISC Zero ZK proof.
    ///
    /// Journal (72 bytes):
    ///   session_id_be32 || old_hash(32) || new_hash(32) || draw_count_be32(4)
    pub fn draw_card_zk(
        env: Env,
        session_id: u32,
        player: Address,
        new_hand_hash: BytesN<32>,
        zk_seal: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();
        let key = DataKey::Game(session_id);
        let mut game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;
        if game.winner.is_some() { return Err(Error::GameAlreadyEnded); }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 { return Err(Error::NotPlayer); }
        if (if is_p1 { 0u32 } else { 1u32 }) != game.current_turn { return Err(Error::NotYourTurn); }

        let old_hash = if is_p1 {
            game.hand_hash_p1.clone().ok_or(Error::HandNotCommitted)?
        } else {
            game.hand_hash_p2.clone().ok_or(Error::HandNotCommitted)?
        };

        let risc0_addr: Address = env.storage().instance()
            .get(&DataKey::Risc0Verifier).ok_or(Error::ZkVerifierNotSet)?;

        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &session_id.to_be_bytes()));
        preimage.append(&Bytes::from_array(&env, &old_hash.to_array()));
        preimage.append(&Bytes::from_array(&env, &new_hand_hash.to_array()));
        preimage.append(&Bytes::from_array(&env, &game.draw_count.to_be_bytes()));
        let journal_sha256: BytesN<32> = env.crypto().sha256(&preimage).into();

        RiscZeroVerifierRouterClient::new(&env, &risc0_addr).verify(
            &zk_seal,
            &BytesN::from_array(&env, &ZK_UNO_DRAW_IMAGE_ID),
            &journal_sha256,
        );

        game.draw_count += 1;
        if is_p1 { game.hand_hash_p1 = Some(new_hand_hash); }
        else      { game.hand_hash_p2 = Some(new_hand_hash); }
        game.current_turn = 1 - game.current_turn;

        env.storage().temporary().set(&key, &game);
        env.storage().temporary().extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    // ── Declare UNO ZK ─────────────────────────────────────────────────────────

    /// Prove you have exactly 1 card without revealing it.
    ///
    /// Journal (36 bytes): session_id_be32 || hand_hash
    /// The ZK proof ties the proof to the player's currently-stored hand_hash,
    /// preventing the proof from being replayed in a different session or for a
    /// player with a different hand state.
    pub fn declare_uno_zk(
        env: Env,
        session_id: u32,
        player: Address,
        zk_seal: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();
        let key = DataKey::Game(session_id);
        let game: Game = env.storage().temporary().get(&key).ok_or(Error::GameNotFound)?;
        if game.winner.is_some() { return Err(Error::GameAlreadyEnded); }

        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 { return Err(Error::NotPlayer); }

        // Check verifier availability before accessing hand state so that
        // `ZkVerifierNotSet` is always returned when the verifier is absent,
        // regardless of hand-commitment status.
        let risc0_addr: Address = env.storage().instance()
            .get(&DataKey::Risc0Verifier).ok_or(Error::ZkVerifierNotSet)?;

        let stored_hash = if is_p1 {
            game.hand_hash_p1.clone().ok_or(Error::HandNotCommitted)?
        } else {
            game.hand_hash_p2.clone().ok_or(Error::HandNotCommitted)?
        };

        // 36-byte journal: matches guest uno_main.rs output exactly
        let mut preimage = Bytes::new(&env);
        preimage.append(&Bytes::from_array(&env, &session_id.to_be_bytes()));
        preimage.append(&Bytes::from_array(&env, &stored_hash.to_array()));
        let journal_sha256: BytesN<32> = env.crypto().sha256(&preimage).into();

        RiscZeroVerifierRouterClient::new(&env, &risc0_addr).verify(
            &zk_seal,
            &BytesN::from_array(&env, &ZK_UNO_UNO_IMAGE_ID),
            &journal_sha256,
        );

        Ok(())
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    pub fn get_game(env: Env, session_id: u32) -> Game {
        env.storage().temporary()
            .get(&DataKey::Game(session_id))
            .expect("Game not found")
    }

    pub fn get_deck_card(env: Env, session_id: u32, index: u32) -> (u32, u32) {
        derive_card(&env, session_id, index)
    }

    // ── Verifier administration ───────────────────────────────────────────────

    pub fn set_risc0_verifier(env: Env, verifier: Address) {
        let admin: Address = env.storage().instance()
            .get(&DataKey::Admin).expect("Admin not set");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Risc0Verifier, &verifier);
    }

    pub fn get_risc0_verifier(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Risc0Verifier)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn apply_card_effects(current_turn: u32, played_value: u32, draw_count: &mut u32) -> u32 {
        if played_value == DRAW_TWO   { *draw_count += 2; }
        if played_value == WILD_DRAW4 { *draw_count += 4; }
        if played_value == SKIP || played_value == REVERSE
            || played_value == DRAW_TWO || played_value == WILD_DRAW4
        {
            current_turn
        } else {
            1 - current_turn
        }
    }

    fn finalize_win(
        env: &Env,
        session_id: u32,
        game: &mut Game,
        key: &DataKey,
        winner: &Address,
    ) -> Result<(), Error> {
        game.winner = Some(winner.clone());
        env.storage().temporary().set(key, game);
        env.storage().temporary().extend_ttl(key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        let game_hub_addr: Address = env.storage().instance()
            .get(&DataKey::GameHubAddress).expect("GameHub not set");
        GameHubClient::new(env, &game_hub_addr).end_game(&session_id, &(*winner == game.player1));
        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;

