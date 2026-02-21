//! # ZK-UNO Guest Program (RISC Zero zkVM)
//!
//! This program runs inside the RISC Zero zkVM to prove that a player's hidden
//! UNO hand is valid, without revealing the hand to any observer.
//!
//! ## What this proves (zero-knowledge statement):
//!
//! **Private inputs (only the prover knows):**
//!   - `hand_bytes`: 14-byte encoding of 7 UNO cards (2 bytes per card: colour, value)
//!   - `salt`: 32-byte random nonce chosen by the player at game start
//!
//! **Public inputs (visible to everyone, passed as journal)**:
//!   - `session_id`: 4-byte big-endian game session identifier
//!   - `hand_hash`: 32-byte keccak256(hand_bytes || salt) commitment
//!
//! ## Proof statement:
//!
//! "I know (hand_bytes, salt) such that:
//!   1. keccak256(hand_bytes || salt) == hand_hash
//!   2. hand_bytes encodes exactly 7 syntactically valid UNO cards"
//!
//! The contract verifies this proof via `commit_hand_zk`, then stores `hand_hash`.
//! On card play, the existing keccak commit-reveal scheme enforces card legality.
//!
//! ## Journal format (public output committed to the proof):
//!
//!   4 bytes: session_id (big-endian u32)
//!  32 bytes: hand_hash (keccak256 commitment)
//! ─────────
//!  36 bytes total
//!
//! The Soroban contract computes `sha256(journal_bytes)` and passes it as
//! `journal_sha256` to the RISC Zero verifier router (as required by the interface).
//!
//! ## Card encoding (2 bytes per card):
//!   byte 0 — colour: 0=Red, 1=Yellow, 2=Green, 3=Blue, 4=Wild
//!   byte 1 — value:  0-9=numbers, 10=Skip, 11=Reverse, 12=DrawTwo,
//!                    13=Wild(colour-4 only), 14=WildDraw4(colour-4 only)
//!
//! ## Building:
//!   cd zk-uno-guest
//!   rzup install           # first time only
//!   cargo +risc0 risczero build
//!   # Copy the printed IMAGE_ID into contracts/zk-uno/src/lib.rs  →  ZK_UNO_IMAGE_ID

use risc0_zkvm::guest::env;
use tiny_keccak::{Hasher, Keccak};

/// Valid card colours
const WILD_COLOUR: u8 = 4;
const MAX_COLOUR: u8 = 4;   // 0-4 inclusive

/// Valid card values
const MAX_NORMAL_VALUE: u8 = 12;   // 0-12: numbers 0-9, Skip, Reverse, DrawTwo
const WILD_VALUE: u8       = 13;   // only legal with colour == WILD
const WILD_DRAW4_VALUE: u8 = 14;   // only legal with colour == WILD

/// Bytes per card in the hand encoding
const BYTES_PER_CARD: usize = 2;

/// Number of cards in the initial hand
const INITIAL_HAND_SIZE: usize = 7;

/// Expected byte length of the full hand encoding
const HAND_BYTES_LEN: usize = INITIAL_HAND_SIZE * BYTES_PER_CARD; // 14

fn main() {
    // =========================================================================
    // 1. Read private inputs from the prover (not revealed in the proof)
    // =========================================================================

    // The prover supplies: session_id (u32), hand_bytes ([u8; 14]), salt ([u8; 32])
    let session_id: u32      = env::read();
    let hand_bytes: [u8; HAND_BYTES_LEN] = env::read();
    let salt: [u8; 32]       = env::read();

    // The expected public commitment (the prover also supplies this so the guest
    // can verify it matches — it is independently re-checked by the contract)
    let expected_hash: [u8; 32] = env::read();

    // =========================================================================
    // 2. Verify commitment: keccak256(hand_bytes || salt) == expected_hash
    // =========================================================================

    let computed_hash = keccak256_hand(&hand_bytes, &salt);

    assert_eq!(
        computed_hash, expected_hash,
        "Hand hash mismatch: the supplied hand_bytes/salt do not match the commitment"
    );

    // =========================================================================
    // 3. Verify hand validity: exactly 7 syntactically valid UNO cards
    // =========================================================================

    for i in 0..INITIAL_HAND_SIZE {
        let colour = hand_bytes[i * BYTES_PER_CARD];
        let value  = hand_bytes[i * BYTES_PER_CARD + 1];

        assert!(
            colour <= MAX_COLOUR,
            "Card {}: invalid colour {} (must be 0-4)", i, colour
        );

        if colour == WILD_COLOUR {
            // Wild cards may only have value 13 (Wild) or 14 (WildDraw4)
            assert!(
                value == WILD_VALUE || value == WILD_DRAW4_VALUE,
                "Card {}: wild card has invalid value {} (must be 13 or 14)", i, value
            );
        } else {
            // Coloured cards: value 0-12
            assert!(
                value <= MAX_NORMAL_VALUE,
                "Card {}: coloured card has invalid value {} (must be 0-12)", i, value
            );
        }
    }

    // =========================================================================
    // 4. Commit public output to the journal
    //
    // Journal = session_id_be32 (4 bytes) || hand_hash (32 bytes) = 36 bytes
    //
    // The Soroban contract computes sha256(journal_bytes) and verifies it
    // matches the `journal_sha256` argument passed to the RISC Zero router.
    // Including session_id in the journal prevents proof replay across sessions.
    // =========================================================================

    env::commit(&session_id.to_be_bytes());
    env::commit(&expected_hash);
}

// =============================================================================
// Helpers
// =============================================================================

/// Compute keccak256(hand_bytes || salt) — matches the Soroban contract logic.
fn keccak256_hand(hand: &[u8; HAND_BYTES_LEN], salt: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(hand);
    hasher.update(salt);
    let mut output = [0u8; 32];
    hasher.finalize(&mut output);
    output
}
