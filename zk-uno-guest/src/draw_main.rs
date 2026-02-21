//! # ZK-UNO Draw Proof Guest (RISC Zero zkVM)
//!
//! Proves that a player correctly added the deterministically-drawn card to their
//! hand commitment — without revealing their hand contents or card count.
//!
//! ## Why this matters:
//!   Without this proof, a player could draw a card and then provide a new
//!   commitment that skips adding it (keeping their count the same fraudulently).
//!   This guest ensures the drawn card was honestly incorporated.
//!
//! ## What this proves:
//!
//! **Private inputs:**
//!   - `old_hand`: hand bytes before drawing
//!   - `old_salt`: salt for the current commitment
//!   - `new_hand`: hand bytes after appending drawn card
//!   - `new_salt`: fresh salt for the updated commitment
//!
//! **Public inputs (in journal):**
//!   - `session_id` : u32 — anti-replay
//!   - `draw_count` : u32 — game.draw_count at the time of draw (determines which card)
//!
//! ## Statements proven:
//!   1. `keccak256(old_hand || old_salt) == old_hand_hash`
//!   2. `drawn_card == derive_card(session_id, draw_count)` (deterministic)
//!   3. `new_hand == old_hand ++ [drawn_colour, drawn_value]`
//!   4. `keccak256(new_hand || new_salt) == new_hand_hash`
//!
//! ## Journal layout (72 bytes):
//!
//!   [0..4]   session_id    (u32 big-endian)
//!   [4..36]  old_hand_hash (keccak256(old_hand || old_salt))
//!   [36..68] new_hand_hash (keccak256(new_hand || new_salt))
//!   [68..72] draw_count    (u32 big-endian — contract uses same value to derive card)

use risc0_zkvm::guest::env;
use tiny_keccak::{Hasher, Keccak};

fn main() {
    // ── Private inputs ────────────────────────────────────────────────────────
    let old_hand: Vec<u8>  = env::read();
    let old_salt: [u8; 32] = env::read();
    let new_hand: Vec<u8>  = env::read();
    let new_salt: [u8; 32] = env::read();

    // ── Public inputs ─────────────────────────────────────────────────────────
    let session_id: u32  = env::read();
    let draw_count: u32  = env::read(); // game.draw_count at time of draw

    // ── 1. Compute old hand commitment ────────────────────────────────────────
    let old_hash = keccak256_hand(&old_hand, &old_salt);

    // ── 2. Derive the drawn card — must match contract's derive_card exactly ──
    let (drawn_colour, drawn_value) = derive_card(session_id, draw_count);

    // ── 3. Verify hand update: new_hand == old_hand ++ [drawn_colour, drawn_value]
    let mut expected_new = old_hand.clone();
    expected_new.push(drawn_colour);
    expected_new.push(drawn_value);
    assert_eq!(
        expected_new, new_hand,
        "New hand does not equal old hand with drawn card appended"
    );

    // ── 4. Compute new hand commitment ────────────────────────────────────────
    let new_hash = keccak256_hand(&new_hand, &new_salt);

    // ── Commit journal (72 bytes) ─────────────────────────────────────────────
    env::commit(&session_id.to_be_bytes());   // 4
    env::commit(&old_hash);                   // 32
    env::commit(&new_hash);                   // 32
    env::commit(&draw_count.to_be_bytes());   // 4
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// keccak256(hand_bytes || salt)
fn keccak256_hand(hand: &[u8], salt: &[u8; 32]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(hand);
    k.update(salt);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// keccak256 of raw bytes — used for deck seed.
fn keccak256_raw(data: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(data);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Deterministic card derivation — MUST match the Soroban contract's
/// `deck_seed` + `derive_card` helper functions exactly.
///
/// seed        = keccak256(session_id_be32 || index_be32)
/// colour_raw  = first 4 bytes of seed as u32
/// value_raw   = bytes 4-7 of seed as u32
/// colour      = colour_raw % 5   (0-3 normal, 4 wild)
/// value       = if colour==4 { 13 + value_raw%2 } else { value_raw%13 }
fn derive_card(session_id: u32, index: u32) -> (u8, u8) {
    let mut seed_data = [0u8; 8];
    seed_data[0..4].copy_from_slice(&session_id.to_be_bytes());
    seed_data[4..8].copy_from_slice(&index.to_be_bytes());
    let seed = keccak256_raw(&seed_data);

    let colour_raw = u32::from_be_bytes([seed[0], seed[1], seed[2], seed[3]]);
    let value_raw  = u32::from_be_bytes([seed[4], seed[5], seed[6], seed[7]]);

    let colour = (colour_raw % 5) as u8;
    let value = if colour == 4 {
        (13 + (value_raw % 2)) as u8 // 13=Wild, 14=WildDraw4
    } else {
        (value_raw % 13) as u8       // 0-12: numbers + Skip + Reverse + DrawTwo
    };
    (colour, value)
}
