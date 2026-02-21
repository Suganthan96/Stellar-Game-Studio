#![cfg(test)]

use crate::{
    Error, ZkUnoContract, ZkUnoContractClient,
    RED, YELLOW, GREEN, BLUE, WILD,
    WILD_CARD,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

// ============================================================================
// Mock Game Hub
// ============================================================================

#[contract]
pub struct MockGameHub;

#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env,
        _game_id: Address,
        _session_id: u32,
        _player1: Address,
        _player2: Address,
        _player1_points: i128,
        _player2_points: i128,
    ) {}
    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {}
    pub fn add_game(_env: Env, _game_address: Address) {}
}

// ============================================================================
// Mock RISC Zero Verifier (always passes)
// ============================================================================

#[contract]
pub struct MockRisc0Router;

#[contractimpl]
impl MockRisc0Router {
    pub fn verify(
        _env: Env,
        _seal: Bytes,
        _image_id: BytesN<32>,
        _journal_sha256: BytesN<32>,
    ) {
        // always passes
    }
}

// ============================================================================
// Mock RISC Zero Verifier (always fails)
// ============================================================================

#[contract]
pub struct MockRisc0RouterFail;

#[contractimpl]
impl MockRisc0RouterFail {
    pub fn verify(
        _env: Env,
        _seal: Bytes,
        _image_id: BytesN<32>,
        _journal_sha256: BytesN<32>,
    ) {
        panic!("InvalidProof");
    }
}

// ============================================================================
// Test helpers
// ============================================================================

fn setup() -> (Env, ZkUnoContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let hub_addr = env.register(MockGameHub, ());
    let admin = Address::generate(&env);
    let contract_id = env.register(ZkUnoContract, (&admin, &hub_addr));
    let client = ZkUnoContractClient::new(&env, &contract_id);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    (env, client, p1, p2)
}

fn zero_salt(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn one_salt(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1u8; 32])
}

fn make_hand(env: &Env, pairs: &[(u32, u32)]) -> Bytes {
    let mut b = Bytes::new(env);
    for (c, v) in pairs {
        b.append(&Bytes::from_array(env, &[*c as u8, *v as u8]));
    }
    b
}

fn valid_hand(env: &Env) -> Bytes {
    make_hand(
        env,
        &[
            (RED, 0), (RED, 0), (RED, 0), (RED, 0),
            (RED, 0), (RED, 0), (RED, 0),
        ],
    )
}

fn hand_hash(env: &Env, hand: &Bytes, salt: &BytesN<32>) -> BytesN<32> {
    let mut pre = hand.clone();
    pre.append(&Bytes::from_array(env, &salt.to_array()));
    env.crypto().keccak256(&pre).into()
}

#[allow(dead_code)]
fn empty_hand(env: &Env) -> Bytes {
    Bytes::new(env)
}

fn setup_zk(env: &Env, client: &ZkUnoContractClient) -> Address {
    let verifier = env.register(MockRisc0Router, ());
    client.set_risc0_verifier(&verifier);
    verifier
}

fn mock_seal(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0u8; 36])
}

// ============================================================================
// 1. test_start_game
// ============================================================================

#[test]
fn test_start_game() {
    let (_, client, p1, p2) = setup();
    client.start_game(&1u32, &p1, &p2, &100i128, &100i128);
    let game = client.get_game(&1u32);
    assert_eq!(game.player1, p1);
    assert_eq!(game.player2, p2);
    assert_eq!(game.current_turn, 0);
    assert_eq!(game.draw_count, 15);
    assert!(game.winner.is_none());
    assert!(game.hand_hash_p1.is_none());
}

// ============================================================================
// 2. test_get_deck_card_is_deterministic
// ============================================================================

#[test]
fn test_get_deck_card_is_deterministic() {
    let (_env, client, p1, p2) = setup();
    client.start_game(&99u32, &p1, &p2, &100i128, &100i128);
    let (c1, v1) = client.get_deck_card(&99u32, &0u32);
    let (c2, v2) = client.get_deck_card(&99u32, &0u32);
    assert_eq!((c1, v1), (c2, v2));
}

// ============================================================================
// 15. test_commit_hand_zk_success
// ============================================================================

#[test]
fn test_commit_hand_zk_success() {
    let (env, client, p1, p2) = setup();
    client.start_game(&42u32, &p1, &p2, &100i128, &100i128);
    setup_zk(&env, &client);
    let h = hand_hash(&env, &valid_hand(&env), &zero_salt(&env));
    client.commit_hand_zk(&42u32, &p1, &h, &mock_seal(&env));
    let game = client.get_game(&42u32);
    assert_eq!(game.hand_hash_p1, Some(h));
}

// ============================================================================
// 16. test_commit_hand_zk_invalid_proof_rejected
// ============================================================================

#[test]
#[should_panic]
fn test_commit_hand_zk_invalid_proof_rejected() {
    let (env, client, p1, p2) = setup();
    client.start_game(&43u32, &p1, &p2, &100i128, &100i128);
    let fail_verifier = env.register(MockRisc0RouterFail, ());
    client.set_risc0_verifier(&fail_verifier);
    let h = hand_hash(&env, &valid_hand(&env), &zero_salt(&env));
    client.commit_hand_zk(&43u32, &p1, &h, &mock_seal(&env));
}

// ============================================================================
// 17. test_commit_hand_zk_verifier_not_set
// ============================================================================

#[test]
fn test_commit_hand_zk_verifier_not_set() {
    let (env, client, p1, p2) = setup();
    client.start_game(&44u32, &p1, &p2, &100i128, &100i128);
    let h = hand_hash(&env, &valid_hand(&env), &zero_salt(&env));
    let result = client.try_commit_hand_zk(&44u32, &p1, &h, &mock_seal(&env));
    assert_eq!(result, Err(Ok(Error::ZkVerifierNotSet)));
}

// ============================================================================
// 18. test_play_card_zk_success
// ============================================================================

#[test]
fn test_play_card_zk_success() {
    let (env, client, p1, p2) = setup();
    client.start_game(&50u32, &p1, &p2, &100i128, &100i128);
    setup_zk(&env, &client);
    let hand = make_hand(
        &env,
        &[
            (RED, 0), (RED, 1), (RED, 2), (YELLOW, 3),
            (GREEN, 4), (BLUE, 5), (WILD, WILD_CARD),
        ],
    );
    let salt = zero_salt(&env);
    let h = hand_hash(&env, &hand, &salt);
    client.commit_hand_zk(&50u32, &p1, &h, &mock_seal(&env));
    let new_hand = make_hand(
        &env,
        &[(RED, 0), (RED, 1), (RED, 2), (YELLOW, 3), (GREEN, 4), (BLUE, 5)],
    );
    let new_h = hand_hash(&env, &new_hand, &one_salt(&env));
    client.play_card_zk(
        &50u32, &p1,
        &WILD, &WILD_CARD, &RED,
        &new_h, &mock_seal(&env),
        &false, &false,
    );
    let game = client.get_game(&50u32);
    assert_eq!(game.top_colour, WILD);
    assert_eq!(game.top_value, WILD_CARD);
    assert_eq!(game.active_colour, RED);
    assert_eq!(game.current_turn, 1);
    assert_eq!(game.hand_hash_p1, Some(new_h));
}

// ============================================================================
// 19. test_play_card_zk_invalid_seal_rejected
// ============================================================================

#[test]
#[should_panic]
fn test_play_card_zk_invalid_seal_rejected() {
    let (env, client, p1, p2) = setup();
    client.start_game(&51u32, &p1, &p2, &100i128, &100i128);
    // Commit with a passing verifier first
    setup_zk(&env, &client);
    let h = hand_hash(&env, &valid_hand(&env), &zero_salt(&env));
    client.commit_hand_zk(&51u32, &p1, &h, &mock_seal(&env));
    // Now swap in a failing verifier before the play
    let fail_verifier = env.register(MockRisc0RouterFail, ());
    client.set_risc0_verifier(&fail_verifier);
    let new_hand = make_hand(
        &env,
        &[(RED, 0), (RED, 0), (RED, 0), (RED, 0), (RED, 0), (RED, 0)],
    );
    let new_h = hand_hash(&env, &new_hand, &one_salt(&env));
    client.play_card_zk(
        &51u32, &p1,
        &WILD, &WILD_CARD, &RED,
        &new_h, &mock_seal(&env),
        &false, &false,
    );
}

// ============================================================================
// 20. test_draw_card_zk_success
// ============================================================================

#[test]
fn test_draw_card_zk_success() {
    let (env, client, p1, p2) = setup();
    client.start_game(&52u32, &p1, &p2, &100i128, &100i128);
    setup_zk(&env, &client);
    let hand = valid_hand(&env);
    let salt = zero_salt(&env);
    let h = hand_hash(&env, &hand, &salt);
    client.commit_hand_zk(&52u32, &p1, &h, &mock_seal(&env));
    let game_before = client.get_game(&52u32);
    assert_eq!(game_before.draw_count, 15);
    let new_h = hand_hash(&env, &valid_hand(&env), &one_salt(&env));
    client.draw_card_zk(&52u32, &p1, &new_h, &mock_seal(&env));
    let game = client.get_game(&52u32);
    assert_eq!(game.draw_count, 16);
    assert_eq!(game.current_turn, 1);
    assert_eq!(game.hand_hash_p1, Some(new_h));
}

// ============================================================================
// 21. test_play_card_zk_win_detection
// ============================================================================

#[test]
fn test_play_card_zk_win_detection() {
    let (env, client, p1, p2) = setup();
    client.start_game(&60u32, &p1, &p2, &100i128, &100i128);
    setup_zk(&env, &client);

    // Player 1 commits a hand with a single card
    let hand = make_hand(&env, &[(WILD, WILD_CARD)]);
    let salt = zero_salt(&env);
    let h = hand_hash(&env, &hand, &salt);
    client.commit_hand_zk(&60u32, &p1, &h, &mock_seal(&env));

    // Player 2 also commits (required for game to be playable)
    let p2_hand = valid_hand(&env);
    let p2_salt = zero_salt(&env);
    let p2_h = hand_hash(&env, &p2_hand, &p2_salt);
    client.commit_hand_zk(&60u32, &p2, &p2_h, &mock_seal(&env));

    // Play the last card with is_winner=true — empty hand hash (keccak256 of "" || salt)
    let empty_hand = Bytes::new(&env);
    let new_salt = one_salt(&env);
    let new_h = hand_hash(&env, &empty_hand, &new_salt);
    client.play_card_zk(
        &60u32, &p1,
        &WILD, &WILD_CARD, &RED,
        &new_h, &mock_seal(&env),
        &true, &false,
    );

    let game = client.get_game(&60u32);
    assert_eq!(game.winner, Some(p1));
}

// ============================================================================
// 22. test_declare_uno_zk_success
// ============================================================================

#[test]
fn test_declare_uno_zk_success() {
    let (env, client, p1, p2) = setup();
    client.start_game(&70u32, &p1, &p2, &100i128, &100i128);
    setup_zk(&env, &client);

    // Commit a single-card hand
    let hand = make_hand(&env, &[(RED, 0)]);
    let salt = zero_salt(&env);
    let h = hand_hash(&env, &hand, &salt);
    client.commit_hand_zk(&70u32, &p1, &h, &mock_seal(&env));

    // Declare UNO via ZK — proves hand has exactly 1 card
    client.declare_uno_zk(&70u32, &p1, &mock_seal(&env));

    // Game state should be unchanged (declare_uno_zk is validation only)
    let game = client.get_game(&70u32);
    assert!(game.winner.is_none());
    assert_eq!(game.hand_hash_p1, Some(h));
}

// ============================================================================
// 23. test_declare_uno_zk_verifier_not_set
// ============================================================================

#[test]
fn test_declare_uno_zk_verifier_not_set() {
    let (env, client, p1, p2) = setup();
    client.start_game(&71u32, &p1, &p2, &100i128, &100i128);
    // No verifier is set on this fresh contract instance
    // declare_uno_zk must return ZkVerifierNotSet before checking hand state
    let result = client.try_declare_uno_zk(&71u32, &p1, &mock_seal(&env));
    assert_eq!(result, Err(Ok(Error::ZkVerifierNotSet)));
}
