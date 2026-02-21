//! # ZK-UNO Move Proof Guest (RISC Zero zkVM)
//!
//! Proves a single card play while keeping the player's hand completely hidden.
//! Hand contents and hand SIZE never appear on-chain — only the 32-byte hash.
//!
//! ## What this proves (zero-knowledge statement):
//!
//! **Private inputs (never leave the prover's machine):**
//!   - `old_hand`: hand bytes BEFORE playing  (2 bytes per card: colour, value)
//!   - `old_salt`: 32-byte random nonce for the current commitment
//!   - `new_hand`: hand bytes AFTER removing the played card
//!   - `new_salt`: fresh 32-byte random nonce for the updated commitment
//!
//! **Public inputs (bound into the proof journal, go on-chain):**
//!   - `session_id`    : u32  — scopes the proof to this session (anti-replay)
//!   - `played_colour` : u8   — colour of the played card
//!   - `played_value`  : u8   — value of the played card
//!   - `wild_colour`   : u8   — chosen colour when wild/+4 is played (else ignored)
//!   - `active_colour` : u8   — game's current active_colour (for +4 rule check)
//!
//! ## Statements proven inside the zkVM:
//!
//!   1. `keccak256(old_hand || old_salt) == old_hand_hash`    (player had committed this hand)
//!   2. `played_card ∈ old_hand`                              (card exists in hand)
//!   3. If played_value == 14 (+4): no card in old_hand has colour == active_colour
//!                                                            (Wild Draw 4 legality)
//!   4. `new_hand == old_hand with played_card removed`        (honest hand update)
//!   5. `keccak256(new_hand || new_salt) == new_hand_hash`    (new commitment is correct)
//!   6. `is_winner == (new_hand is empty)`                    (win flag honest)
//!   7. `is_uno == (new_hand has exactly 1 card)`             (UNO flag honest)
//!
//! ## Journal layout (74 bytes — public output):
//!
//!   [0..4]   session_id      (u32 big-endian)
//!   [4..36]  old_hand_hash   (keccak256(old_hand || old_salt))
//!   [36..68] new_hand_hash   (keccak256(new_hand || new_salt))
//!   [68]     played_colour
//!   [69]     played_value
//!   [70]     wild_colour
//!   [71]     active_colour   (contract verifies this matches on-chain state)
//!   [72]     is_winner       (1 if new hand is empty, 0 otherwise)
//!   [73]     is_uno          (1 if new hand has exactly 1 card, 0 otherwise)
//!
//! The Soroban contract computes sha256(these 74 bytes) and verifies it against
//! the `journal_sha256` argument passed to the RISC Zero verifier router.
//! After verification, the contract uses the journal fields directly to update
//! game state — new_hand_hash, top card, active_colour, turn, win detection.

use risc0_zkvm::guest::env;
use tiny_keccak::{Hasher, Keccak};

const WILD_COLOUR: u8       = 4;
const WILD_DRAW4_VALUE: u8  = 14;
const WILD_CARD_VALUE: u8   = 13;
const BYTES_PER_CARD: usize = 2;

fn main() {
    // ── Private inputs (invisible to verifier, stay on the prover's machine) ──
    let old_hand: Vec<u8>   = env::read(); // encoded hand before play
    let old_salt: [u8; 32]  = env::read();
    let new_hand: Vec<u8>   = env::read(); // encoded hand after removing played card
    let new_salt: [u8; 32]  = env::read();

    // ── Public inputs (become part of the journal, go on-chain) ───────────────
    let session_id: u32    = env::read();
    let played_colour: u8  = env::read();
    let played_value: u8   = env::read();
    let wild_colour: u8    = env::read(); // chosen colour when wild/+4; ignored otherwise
    let active_colour: u8  = env::read(); // game.active_colour — for +4 legality check

    // ── 1. Compute old hand commitment ────────────────────────────────────────
    let old_hash = keccak256_hand(&old_hand, &old_salt);

    // ── 2. Played card must exist in the old hand ─────────────────────────────
    assert!(
        card_in_hand(&old_hand, played_colour, played_value),
        "Played card not found in committed hand"
    );

    // ── 3. Wild Draw 4 (+4) legality: no card in hand matches active_colour ───
    //       This rule is normally unenforceable in physical UNO.
    //       Here it is cryptographically guaranteed.
    if played_value == WILD_DRAW4_VALUE {
        assert!(
            !has_matching_colour(&old_hand, active_colour),
            "Illegal Wild Draw 4: hand contains a card of the active colour"
        );
    }

    // ── 4. Hand update integrity: new_hand == old_hand minus played card ──────
    //       The player cannot forge a different new commitment; the guest
    //       computes the expected new_hand deterministically and compares.
    let expected_new = remove_first_card(&old_hand, played_colour, played_value);
    assert_eq!(
        expected_new, new_hand,
        "New hand does not equal old hand with played card removed"
    );

    // ── 5. Compute new hand commitment ────────────────────────────────────────
    let new_hash = keccak256_hand(&new_hand, &new_salt);

    // ── 6 & 7. Derive public status flags ─────────────────────────────────────
    //       is_winner and is_uno are computed FROM the private new_hand size,
    //       then committed to the journal — so the contract learns win/UNO
    //       status WITHOUT ever seeing the actual card count.
    let new_count  = new_hand.len() / BYTES_PER_CARD;
    let is_winner: u8 = (new_count == 0) as u8;
    let is_uno: u8    = (new_count == 1) as u8;

    // ── Commit journal (74 bytes) ─────────────────────────────────────────────
    env::commit(&session_id.to_be_bytes());                                   // 4
    env::commit(&old_hash);                                                   // 32
    env::commit(&new_hash);                                                   // 32
    env::commit(&[played_colour, played_value, wild_colour, active_colour,   // 6
                  is_winner, is_uno]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers  (must match Soroban contract logic exactly)
// ─────────────────────────────────────────────────────────────────────────────

/// keccak256(hand_bytes || salt) — matches Soroban `compute_hand_hash`
fn keccak256_hand(hand: &[u8], salt: &[u8; 32]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(hand);
    k.update(salt);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Check whether a card (colour, value) exists anywhere in encoded hand bytes.
fn card_in_hand(hand: &[u8], colour: u8, value: u8) -> bool {
    let mut i = 0;
    while i + 1 < hand.len() {
        if hand[i] == colour && hand[i + 1] == value {
            return true;
        }
        i += 2;
    }
    false
}

/// Check whether any non-wild card in the hand matches `colour`.
/// Matches Soroban `has_matching_colour` — wild cards (colour == 4) are excluded.
fn has_matching_colour(hand: &[u8], colour: u8) -> bool {
    let mut i = 0;
    while i + 1 < hand.len() {
        let c = hand[i];
        let v = hand[i + 1];
        // Wild cards themselves are never a "colour match" for +4 purposes
        if c == colour && c != WILD_COLOUR && v != WILD_CARD_VALUE && v != WILD_DRAW4_VALUE {
            return true;
        }
        i += 2;
    }
    false
}

/// Remove the first occurrence of (colour, value) from hand bytes.
/// Panics if the card is not found (should never happen after card_in_hand check).
fn remove_first_card(hand: &[u8], colour: u8, value: u8) -> Vec<u8> {
    let mut result = Vec::with_capacity(hand.len().saturating_sub(2));
    let mut removed = false;
    let mut i = 0;
    while i + 1 < hand.len() {
        if !removed && hand[i] == colour && hand[i + 1] == value {
            removed = true; // skip this card (remove it)
        } else {
            result.push(hand[i]);
            result.push(hand[i + 1]);
        }
        i += 2;
    }
    assert!(removed, "Card to remove was not found in hand bytes");
    result
}
