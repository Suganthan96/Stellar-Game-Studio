#![no_std]

//! # Mock RISC Zero Verifier
//!
//! A Soroban contract that implements the same `verify` interface as the
//! real RISC Zero verifier router, but **always passes** — every seal is
//! accepted unconditionally.
//!
//! Use this on testnet when you want to test ZK game logic without a live
//! prover server.  Point ZK_UNO at this contract via:
//!
//!   `zk_uno.set_risc0_verifier({ verifier: MOCK_VERIFIER_ID })`
//!
//! ⚠️  Never use in production — this provides no cryptographic security.

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env};

#[contract]
pub struct MockRisc0Verifier;

#[contractimpl]
impl MockRisc0Verifier {
    /// Always returns without error, accepting any seal/image_id/journal.
    pub fn verify(
        _env: Env,
        _seal: Bytes,
        _image_id: BytesN<32>,
        _journal_sha256: BytesN<32>,
    ) {
        // No-op: accept every proof unconditionally (dev / testnet only)
    }
}
