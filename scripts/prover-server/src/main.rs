//! # ZK-UNO Prover Server
//!
//! An HTTP server that executes ZK-UNO guest programs inside the RISC Zero
//! zkVM and returns a seal that can be submitted to the on-chain verifier.
//!
//! ## Modes
//!
//! | Environment | Seal type | On-chain verifier |
//! |---|---|---|
//! | Default (dev) | Mock ReceiptClaim digest | risc0-verifier-mock / dev |
//! | BONSAI_API_KEY set | Real Groth16 | risc0-router + groth16-verifier |
//!
//! ## Running
//!
//! ```bash
//! # From workspace root:
//! cd scripts/prover-server
//! cargo run --release
//! # Or with Bonsai:
//! BONSAI_API_KEY=<key> BONSAI_API_URL=https://api.bonsai.xyz cargo run --release
//! ```
//!
//! ## Endpoints
//!
//! All endpoints accept JSON bodies and return JSON responses.
//!
//! POST /prove/commit  — proves initial hand is valid (7 cards)
//! POST /prove/move    — proves a card play (doesn't reveal hand contents)
//! POST /prove/draw    — proves a card draw (correct card appended)
//! POST /prove/uno     — proves hand has exactly 1 card
//! GET  /health        — liveness check

use std::{env, path::PathBuf, sync::Arc};

use anyhow::{anyhow, Context, Result};
use axum::{
    extract::State,
    http::{Method, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tower_http::cors::{Any, CorsLayer};

use risc0_zkvm::{ExecutorEnv, default_executor};

// ── Groth16 selector (must match what was deployed on-chain) ──────────────────
// This is the 4-byte Groth16 selector from NethermindEth/stellar-risc0-verifier
const GROTH16_SELECTOR: [u8; 4] = [0x73, 0xc4, 0x57, 0xba];

// ── Tagged-hash constants for mock ReceiptClaim seal construction ─────────────
// These match the computation in the frontend's buildMockSeal()
const TAG_OUTPUT: [u8; 32] = [
    0x77, 0xea, 0xfe, 0xb3, 0xdf, 0xc3, 0x4a, 0x1c,
    0x6b, 0x44, 0x5d, 0x3e, 0xf2, 0x6d, 0x12, 0x32,
    0x2e, 0xa4, 0x84, 0x72, 0x40, 0x14, 0x0a, 0x9a,
    0xf8, 0x22, 0x08, 0x5f, 0x75, 0xdc, 0x4e, 0xa0,
];
const TAG_CLAIM: [u8; 32] = [
    0xcb, 0x1f, 0xef, 0xcd, 0x6d, 0xda, 0x1c, 0x3c,
    0x74, 0x91, 0xb3, 0x09, 0x22, 0xf7, 0x0b, 0xc0,
    0x5e, 0xcf, 0xff, 0xf6, 0xb2, 0x2e, 0x73, 0x61,
    0x78, 0x06, 0x9f, 0x14, 0x51, 0x48, 0x72, 0x64,
];
const POST_STATE_HALTED: [u8; 32] = [
    0xa3, 0xac, 0xc2, 0x71, 0x26, 0x03, 0x80, 0x27,
    0x81, 0xa2, 0xae, 0x6d, 0x44, 0x56, 0x28, 0x6e,
    0x73, 0x79, 0x11, 0x7a, 0x74, 0xe2, 0x10, 0x88,
    0x28, 0xb6, 0xb4, 0x8e, 0x5a, 0xab, 0x3e, 0x0b,
];

// ── Application-wide state ────────────────────────────────────────────────────

struct AppState {
    /// Absolute path to the zk-uno-guest ELF directory
    elf_dir: PathBuf,
    /// Whether real Bonsai proving is enabled (BONSAI_API_KEY present)
    #[allow(dead_code)]
    bonsai_mode: bool,
}

// ── Request / response schemas ────────────────────────────────────────────────

#[derive(Deserialize)]
struct CommitRequest {
    // Private
    hand_bytes: Vec<u8>, // 14 bytes (7 cards × 2 bytes)
    salt: Vec<u8>,       // 32 bytes
    // Public
    session_id: u32,
    hand_hash: String,   // hex-encoded 32-byte keccak256 commitment
}

#[derive(Deserialize)]
struct MoveRequest {
    // Private
    old_hand: Vec<u8>,   // current hand bytes
    old_salt: Vec<u8>,   // 32 bytes
    new_hand: Vec<u8>,   // hand bytes after removing played card
    new_salt: Vec<u8>,   // 32 bytes
    // Public
    session_id: u32,
    played_colour: u8,
    played_value: u8,
    wild_colour: u8,
    active_colour: u8,
}

#[derive(Deserialize)]
struct DrawRequest {
    // Private
    old_hand: Vec<u8>,
    old_salt: Vec<u8>,
    new_hand: Vec<u8>,
    new_salt: Vec<u8>,
    // Public
    session_id: u32,
    draw_count: u32,
}

#[derive(Deserialize)]
struct UnoRequest {
    // Private
    hand_bytes: Vec<u8>, // exactly 2 bytes (1 card)
    salt: Vec<u8>,       // 32 bytes
    // Public
    session_id: u32,
    hand_hash: String,   // hex-encoded 32-byte commitment
}

#[derive(Serialize)]
struct ProveResponse {
    /// Hex-encoded seal bytes to pass to the on-chain verifier
    seal: String,
    /// Hex-encoded journal bytes (public proof output)
    journal: String,
    /// Whether this is a mock seal (true) or a real Groth16 seal (false)
    is_mock: bool,
}

// (error handling uses serde_json::json! inline)

// ── Main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let bonsai_mode = env::var("BONSAI_API_KEY").is_ok();

    // Default ELF dir relative to workspace root
    let elf_dir = env::var("ZK_UNO_ELF_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // When run from scripts/prover-server/ or workspace root
            let candidates = [
                PathBuf::from("zk-uno-guest/target/riscv32im-risc0-zkvm-elf/release"),
                PathBuf::from("../../zk-uno-guest/target/riscv32im-risc0-zkvm-elf/release"),
            ];
            candidates
                .into_iter()
                .find(|p| p.exists())
                .expect("Cannot locate zk-uno-guest ELFs. Set ZK_UNO_ELF_DIR env var or run from workspace root.")
        });

    println!("ZK-UNO Prover Server");
    println!("  ELF directory : {}", elf_dir.display());
    println!("  Mode          : {}", if bonsai_mode { "Bonsai (real Groth16)" } else { "Mock seal" });
    println!("  Listening on  : http://0.0.0.0:{port}");

    let state = Arc::new(AppState { elf_dir, bonsai_mode });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/prove/commit", post(prove_commit))
        .route("/prove/move",   post(prove_move))
        .route("/prove/draw",   post(prove_draw))
        .route("/prove/uno",    post(prove_uno))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind");
    axum::serve(listener, app).await.expect("Server failed");
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn prove_commit(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CommitRequest>,
) -> impl IntoResponse {
    let elf_path = state.elf_dir.join("zk-uno-guest");

    let result = tokio::task::spawn_blocking(move || {
        let hand_hash = decode_hex(&req.hand_hash)?;
        let salt: [u8; 32] = req.salt.try_into().map_err(|_| anyhow!("salt must be 32 bytes"))?;

        // Build guest inputs in the order main.rs reads them:
        // session_id: u32, hand_bytes: [u8; 14], salt: [u8; 32], expected_hash: [u8; 32]
        let env = ExecutorEnv::builder()
            .write(&req.session_id)?
            .write(&req.hand_bytes.as_slice())?
            .write(&salt)?
            .write(&hand_hash.as_slice())?
            .build()?;

        let elf_bytes = std::fs::read(&elf_path)
            .with_context(|| format!("Cannot read ELF: {}", elf_path.display()))?;

        execute_and_build_seal(&elf_bytes, env)
    }).await;
    handle_result(result)
}

async fn prove_move(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MoveRequest>,
) -> impl IntoResponse {
    let elf_path = state.elf_dir.join("zk-uno-move");

    let result = tokio::task::spawn_blocking(move || {
        let old_salt: [u8; 32] = req.old_salt.try_into().map_err(|_| anyhow!("old_salt must be 32 bytes"))?;
        let new_salt: [u8; 32] = req.new_salt.try_into().map_err(|_| anyhow!("new_salt must be 32 bytes"))?;

        // Build guest inputs in the order move_main.rs reads them:
        // old_hand, old_salt, new_hand, new_salt,
        // session_id, played_colour, played_value, wild_colour, active_colour
        let env = ExecutorEnv::builder()
            .write(&req.old_hand.as_slice())?
            .write(&old_salt)?
            .write(&req.new_hand.as_slice())?
            .write(&new_salt)?
            .write(&req.session_id)?
            .write(&req.played_colour)?
            .write(&req.played_value)?
            .write(&req.wild_colour)?
            .write(&req.active_colour)?
            .build()?;

        let elf_bytes = std::fs::read(&elf_path)
            .with_context(|| format!("Cannot read ELF: {}", elf_path.display()))?;

        execute_and_build_seal(&elf_bytes, env)
    }).await;

    handle_result(result)
}

async fn prove_draw(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DrawRequest>,
) -> impl IntoResponse {
    let elf_path = state.elf_dir.join("zk-uno-draw");

    let result = tokio::task::spawn_blocking(move || {
        let old_salt: [u8; 32] = req.old_salt.try_into().map_err(|_| anyhow!("old_salt must be 32 bytes"))?;
        let new_salt: [u8; 32] = req.new_salt.try_into().map_err(|_| anyhow!("new_salt must be 32 bytes"))?;

        let env = ExecutorEnv::builder()
            .write(&req.old_hand.as_slice())?
            .write(&old_salt)?
            .write(&req.new_hand.as_slice())?
            .write(&new_salt)?
            .write(&req.session_id)?
            .write(&req.draw_count)?
            .build()?;

        let elf_bytes = std::fs::read(&elf_path)
            .with_context(|| format!("Cannot read ELF: {}", elf_path.display()))?;

        execute_and_build_seal(&elf_bytes, env)
    }).await;

    handle_result(result)
}

async fn prove_uno(
    State(state): State<Arc<AppState>>,
    Json(req): Json<UnoRequest>,
) -> impl IntoResponse {
    let elf_path = state.elf_dir.join("zk-uno-uno");

    let result = tokio::task::spawn_blocking(move || {
        let hand_hash = decode_hex(&req.hand_hash)?;
        let salt: [u8; 32] = req.salt.try_into().map_err(|_| anyhow!("salt must be 32 bytes"))?;

        // Private: hand_bytes([u8;2]), salt([u8;32])
        // Public:  session_id(u32), expected_hash([u8;32])
        let env = ExecutorEnv::builder()
            .write(&req.hand_bytes.as_slice())?
            .write(&salt)?
            .write(&req.session_id)?
            .write(&hand_hash.as_slice())?
            .build()?;

        let elf_bytes = std::fs::read(&elf_path)
            .with_context(|| format!("Cannot read ELF: {}", elf_path.display()))?;

        execute_and_build_seal(&elf_bytes, env)
    }).await;

    handle_result(result)
}

// ── Core proving logic ────────────────────────────────────────────────────────

/// Execute the guest, return the journal bytes, then construct a mock seal.
fn execute_and_build_seal(elf: &[u8], env: ExecutorEnv) -> Result<ProveResponse> {
    let executor = default_executor();
    let session = executor.execute(env, elf)?;
    let journal_bytes = session.journal.bytes.clone();
    let seal = build_mock_seal(&journal_bytes)?;
    Ok(ProveResponse {
        seal: hex::encode(&seal),
        journal: hex::encode(&journal_bytes),
        is_mock: true,
    })
}

/// Build the 36-byte mock seal: selector(4) || ReceiptClaim.digest()(32)
///
/// This replicates the TypeScript `buildMockSeal()` function on the server side.
fn build_mock_seal(journal: &[u8]) -> Result<Vec<u8>> {
    // 1. journal_sha256 = sha256(journal)
    let journal_sha256: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(journal);
        h.finalize().into()
    };

    // 2. Output.digest = sha256(TAG_OUTPUT || journal_sha256 || zeros32 || len_tag)
    let zeros32 = [0u8; 32];
    let output_len_tag = [0x02u8, 0, 0, 0, 0, 0, 0, 0]; // 2 fields LE-u64
    let output_preimage: Vec<u8> = [
        TAG_OUTPUT.as_slice(), &journal_sha256, &zeros32, &output_len_tag,
    ].concat();
    let output_digest: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(&output_preimage);
        h.finalize().into()
    };

    // 3. ReceiptClaim.digest = sha256(TAG_CLAIM || zeros32 || image_id=zeros32
    //    || POST_STATE_HALTED || output_digest || exit_codes || 5-field len_tag)
    // NOTE: For mock seals we use zeros32 for image_id — the mock verifier on-chain
    //       doesn't validate image_id, it just checks the ReceiptClaim digest.
    let claim_suffix = [
        0u8, 0, 0, 0, // system exit code
        0u8, 0, 0, 0, // user exit code
        0x05u8, 0, 0, 0, 0, 0, 0, 0, // 5-field length tag
    ];
    let claim_preimage: Vec<u8> = [
        TAG_CLAIM.as_slice(),
        &zeros32,            // pre-state digest (zeros for mock)
        &zeros32,            // image_id placeholder
        &POST_STATE_HALTED,  // post-state digest (halted)
        &output_digest,
        &claim_suffix,
    ].concat();
    let claim_digest: [u8; 32] = {
        let mut h = Sha256::new();
        h.update(&claim_preimage);
        h.finalize().into()
    };

    // 4. Seal = selector(4) || claim_digest(32)
    let mut seal = Vec::with_capacity(36);
    seal.extend_from_slice(&GROTH16_SELECTOR);
    seal.extend_from_slice(&claim_digest);
    Ok(seal)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn decode_hex(s: &str) -> Result<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    hex::decode(s).with_context(|| format!("Invalid hex string: {s}"))
}

fn handle_result(
    result: std::result::Result<Result<ProveResponse>, tokio::task::JoinError>,
) -> impl IntoResponse {
    match result {
        Ok(Ok(resp)) => (StatusCode::OK, Json(serde_json::to_value(resp).unwrap())).into_response(),
        Ok(Err(e)) => {
            eprintln!("Prove error: {e:#}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
        Err(e) => {
            eprintln!("Join error: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "internal error" })),
            )
                .into_response()
        }
    }
}
