//! # ZK-UNO Declare-UNO Proof Guest (RISC Zero zkVM)
//!
//! Proves that a player's committed hand contains exactly ONE card, without
//! revealing which card it is (or in general, anything about the hand).
//!
//! This is the ZK equivalent of calling `declare_uno` — it lets a player
//! announce they have one card left without showing it to the opponent.
//!
//! ## What this proves (zero-knowledge statement):
//!
//! **Private inputs (never leave the prover's machine):**
//!   - `hand_bytes`: 2-byte encoding of the single remaining card
//!   - `salt`:       32-byte random nonce matching the current commitment
//!
//! **Public inputs (bound into the proof journal, go on-chain):**
//!   - `session_id` : u32 — scopes the proof to this session (anti-replay)
//!
//! ## Statements proven inside the zkVM:
//!
//!   1. `keccak256(hand_bytes || salt) == hand_hash`    (matches stored commitment)
//!   2. `hand_bytes.len() == 2`                         (exactly one card)
//!   3. The single card is a syntactically valid UNO card
//!
//! ## Journal layout (36 bytes — public output):
//!
//!   [0..4]   session_id  (u32 big-endian)
//!   [4..36]  hand_hash   (keccak256(hand_bytes || salt))
//!
//! The Soroban contract computes sha256(these 36 bytes) and verifies it against
//! the `journal_sha256` argument passed to the RISC Zero verifier router.
//! After verification, the contract confirms `hand_hash` matches the stored
//! commitment for that player, proving they have exactly one card left.

use risc0_zkvm::guest::env;
use tiny_keccak::{Hasher, Keccak};

const WILD_COLOUR: u8      = 4;
const MAX_COLOUR: u8       = 4;   // 0-4 inclusive
const MAX_NORMAL_VALUE: u8 = 12;  // 0-12: numbers 0-9, Skip, Reverse, DrawTwo
const WILD_VALUE: u8       = 13;  // only legal with colour == WILD
const WILD_DRAW4_VALUE: u8 = 14;  // only legal with colour == WILD
const BYTES_PER_CARD: usize = 2;
const EXPECTED_HAND_BYTES: usize = BYTES_PER_CARD; // exactly 1 card

fn main() {
    // ── Private inputs ────────────────────────────────────────────────────────

    let hand_bytes: [u8; EXPECTED_HAND_BYTES] = env::read();
    let salt: [u8; 32]                        = env::read();

    // ── Public inputs  ────────────────────────────────────────────────────────

    let session_id: u32      = env::read();
    let expected_hash: [u8; 32] = env::read(); // stored on-chain, re-checked by contract

    // ── 1. Verify commitment ──────────────────────────────────────────────────

    let computed_hash = keccak256_hand(&hand_bytes, &salt);
    assert_eq!(
        computed_hash, expected_hash,
        "Hand hash mismatch: supplied hand_bytes/salt do not match commitment"
    );

    // ── 2. Validate the single card ───────────────────────────────────────────

    let colour = hand_bytes[0];
    let value  = hand_bytes[1];

    assert!(
        colour <= MAX_COLOUR,
        "Invalid colour {} (must be 0-4)", colour
    );

    if colour == WILD_COLOUR {
        assert!(
            value == WILD_VALUE || value == WILD_DRAW4_VALUE,
            "Wild card has invalid value {} (must be 13 or 14)", value
        );
    } else {
        assert!(
            value <= MAX_NORMAL_VALUE,
            "Coloured card has invalid value {} (must be 0-12)", value
        );
    }

    // ── 3. Commit public output to journal ────────────────────────────────────
    //
    // Journal = session_id_be32 (4 bytes) || hand_hash (32 bytes) = 36 bytes
    //
    // The Soroban contract computes sha256(journal_bytes) and verifies
    // it against the `journal_sha256` passed to the RISC Zero router.
    // It then checks hand_hash matches the stored commitment for this player.

    env::commit(&session_id.to_be_bytes());
    env::commit(&expected_hash);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn keccak256_hand(hand: &[u8; EXPECTED_HAND_BYTES], salt: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(hand);
    hasher.update(salt);
    let mut output = [0u8; 32];
    hasher.finalize(&mut output);
    output
}
