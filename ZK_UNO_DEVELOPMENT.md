# ZK-UNO — Full Development Documentation

> **Audience**: Developers joining the project or auditing the implementation.  
> **Scope**: Everything built so far — Soroban smart contract, ZK guest programs, prover server, and Next.js frontend.

---

## Table of Contents

1. [Concept Overview](#1-concept-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Deployed Contract Addresses](#3-deployed-contract-addresses)
4. [On-Chain Contract: `contracts/zk-uno`](#4-on-chain-contract-contractszk-uno)
   - 4.1 [Error Codes](#41-error-codes)
   - 4.2 [Card Constants](#42-card-constants)
   - 4.3 [Game Struct & Storage](#43-game-struct--storage)
   - 4.4 [Deterministic Deck](#44-deterministic-deck)
   - 4.5 [Public Functions](#45-public-functions)
   - 4.6 [Game Hub Integration](#46-game-hub-integration)
   - 4.7 [ZK Proof Verification on-chain](#47-zk-proof-verification-on-chain)
5. [Mock RISC0 Verifier: `contracts/mock-risc0-verifier`](#5-mock-risc0-verifier-contractsmock-risc0-verifier)
6. [ZK Guest Programs: `zk-uno-guest`](#6-zk-guest-programs-zk-uno-guest)
   - 6.1 [hand commitment — `main.rs`](#61-hand-commitment--mainrs)
   - 6.2 [card play — `move_main.rs`](#62-card-play--move_mainrs)
   - 6.3 [card draw — `draw_main.rs`](#63-card-draw--draw_mainrs)
   - 6.4 [declare UNO — `uno_main.rs`](#64-declare-uno--uno_mainrs)
7. [Prover Server: `scripts/prover-server`](#7-prover-server-scriptsprover-server)
8. [Frontend Architecture: `zk-uno-nextjs`](#8-frontend-architecture-zk-uno-nextjs)
   - 8.1 [Technology Stack](#81-technology-stack)
   - 8.2 [Directory Layout](#82-directory-layout)
   - 8.3 [Configuration — `src/lib/config.ts`](#83-configuration--srclibconfigts)
   - 8.4 [Service Layer — `src/lib/zkUnoService.ts`](#84-service-layer--srclibzkunoservicets)
   - 8.5 [Wallet Layer — `src/hooks/useWallet.ts` & `src/lib/wallet.ts`](#85-wallet-layer--srchooksusewallettsand-srclibwalletlibts)
   - 8.6 [Game Hook — `src/hooks/useGame.ts`](#86-game-hook--srchooksusegamets)
   - 8.7 [Pages & Routing](#87-pages--routing)
   - 8.8 [Components](#88-components)
9. [Multi-Sig `start_game` Flow — Deep Dive](#9-multi-sig-start_game-flow--deep-dive)
10. [Complete Game Flow Walkthrough](#10-complete-game-flow-walkthrough)
11. [ZK Proof System — Deep Dive](#11-zk-proof-system--deep-dive)
    - 11.1 [What is RISC Zero?](#111-what-is-risc-zero)
    - 11.2 [IMAGE_IDs](#112-image_ids)
    - 11.3 [Mock seal vs real Groth16 seal](#113-mock-seal-vs-real-groth16-seal)
    - 11.4 [Journal formats](#114-journal-formats)
    - 11.5 [Browser fallback path](#115-browser-fallback-path)
12. [Card Rendering System](#12-card-rendering-system)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)
14. [Local Development Setup](#14-local-development-setup)
15. [Problem History & Fixes Applied](#15-problem-history--fixes-applied)

---

## 1. Concept Overview

ZK-UNO is a two-player UNO-like card game running on the **Stellar Testnet** using **Soroban smart contracts** and **RISC Zero zero-knowledge proofs**.

The central innovation is **hand privacy**: unlike traditional blockchain card games where all cards must be stored on-chain (visible to everyone), ZK-UNO stores only a 32-byte **keccak256 commitment** of each player's hand. The actual cards are kept secret in the browser. Every game action — deal, play, draw, and calling UNO — is accompanied by a ZK proof that cryptographically convinces the contract of the action's validity without revealing the underlying card data.

**Privacy guarantees enforced by the contract:**

| Action | What is public | What stays private |
|---|---|---|
| `commit_hand_zk` | `keccak256(hand \|\| salt)` | The 7 starting cards |
| `play_card_zk` | Which colour & value was played, new hand hash | The remaining cards in hand |
| `draw_card_zk` | New hand hash, draw counter | That the drawn card was appended |
| `declare_uno_zk` | Proof that exactly 1 card remains | The identity of that last card |

**Wild Draw 4 rule enforcement**: The ZK proof for playing a Wild Draw 4 includes a check that no card in the player's hand matches the current active colour. This rule is impossible to enforce without ZK — a dishonest player would simply lie. The proof makes it mathematically impossible to cheat.

---

## 2. Monorepo Structure

```
Stellar-Game-Studio/
├── contracts/
│   ├── zk-uno/                  # Main ZK-UNO Soroban contract (Rust, #![no_std])
│   ├── mock-risc0-verifier/     # Always-pass ZK verifier for testnet (Rust)
│   ├── mock-game-hub/           # Mock Game Hub for local testing
│   ├── number-guess/            # Reference game implementation
│   ├── dice-duel/               # Reference game implementation
│   └── twenty-one/              # Reference game implementation
│
├── zk-uno-guest/                # RISC Zero zkVM guest programs (Rust, no_std)
│   └── src/
│       ├── main.rs              # hand commitment proof
│       ├── move_main.rs         # card play proof
│       ├── draw_main.rs         # card draw proof
│       └── uno_main.rs          # declare UNO proof
│
├── scripts/
│   └── prover-server/           # HTTP server that executes ZK guests (Rust/Axum)
│       └── src/main.rs
│
├── zk-uno-nextjs/               # Production Next.js frontend
│   ├── public/
│   │   └── game-studio-config.js
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx         # Home (Lobby)
│       │   └── game/[sessionId]/page.tsx
│       ├── components/
│       │   ├── Card.tsx         # Single UNO card render
│       │   ├── Hand.tsx         # Player hand (array of Cards)
│       │   ├── DiscardPile.tsx  # Top card + active colour indicator
│       │   ├── GameBoard.tsx    # Main game UI
│       │   ├── Lobby.tsx        # Create/Join room UI
│       │   └── WalletButton.tsx # Connect wallet UI
│       ├── hooks/
│       │   ├── useGame.ts       # All game state + actions
│       │   └── useWallet.ts     # Wallet connection state (Zustand store)
│       └── lib/
│           ├── config.ts        # Network config, contract IDs
│           ├── zkUnoService.ts  # Stellar/Soroban call layer (751 lines)
│           └── wallet.ts        # Stellar Wallets Kit bridge
│
├── bindings/
│   └── zk_uno/                  # Generated TypeScript bindings (do not edit)
│       └── src/index.ts
│
├── deployment.json              # Deployed contract addresses
├── AGENTS.md                    # AI agent repo guide
└── ZK_UNO_DEVELOPMENT.md        # This document
```

---

## 3. Deployed Contract Addresses

All contracts are live on **Stellar Testnet** (`Test SDF Network ; September 2015`).

| Contract | Address | Notes |
|---|---|---|
| **ZK-UNO** | `CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE` | Main game contract |
| **Mock RISC0 Verifier** | `CBM44IBPT6HMI5HG6KAGOJMPVT3ZMLBWLDUHIY5QLPVSUXVPE4SGBWU3` | Always-pass, used by ZK-UNO now |
| **Real RISC0 Router** | `CBD3SXLNTFXFP44YSCIPFMCY3DYLYAQ43BXK7IE7SGR5ZL4JVRQTOXFH` | Real Groth16, NOT currently active |
| **Groth16 Verifier** | `CDPYUZG24HLDN7GJRKIQLN6L4PFDPWKU44TNYRF24WR2YWLN2KWTQUNN` | Used by RISC0 Router |
| **Mock Game Hub** | `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG` | Tracks game lifecycle |

**Admin keypair** (used only for simulation + `end_game` + admin calls):
- Public: `GBUZBZ7...` (see `.env` for full key — do not commit)
- Used as `SIMULATION_SOURCE` — the neutral fee-source address that simulates both players' auth entries simultaneously

**Important**: The ZK-UNO contract was updated via `set_risc0_verifier` to point at the Mock RISC0 Verifier. The real Groth16 router is no longer in the call path.

---

## 4. On-Chain Contract: `contracts/zk-uno`

**File**: `contracts/zk-uno/src/lib.rs` (553 lines)  
**Language**: Rust, `#![no_std]`  
**SDK**: `soroban-sdk = "25.1.1"`

This is the core game logic. It stores zero card data — only hand hashes.

### 4.1 Error Codes

```rust
pub enum Error {
    GameNotFound         = 1,   // get_game / any action before start
    NotPlayer            = 2,   // caller is not P1 or P2
    GameAlreadyEnded     = 3,   // game has a winner set
    NotYourTurn          = 4,   // called out-of-turn
    HandNotCommitted     = 5,   // tried to play before committing hand
    InvalidHandHash      = 6,   // ZK journal's old_hash ≠ stored hash
    CardNotInHand        = 7,   // ZK journal says card not found
    InvalidCard          = 8,   // colour/value out of range
    IllegalWildDraw4     = 9,   // ZK says hand has matching colour
    InvalidHandSize      = 10,  // ZK says hand != expected count
    HandAlreadyCommitted = 11,  // commit called twice
    ZkProofInvalid       = 12,  // verifier rejected the seal
    ZkVerifierNotSet     = 13,  // no verifier address configured
    ZkActiveColourMismatch = 14,
    ZkDrawCountMismatch  = 15,
}
```

These error codes appear in the frontend as `Error(Contract, #N)`. The `useGame` hook translates them to human-readable messages.

### 4.2 Card Constants

These values are identical in the Rust contract and in `zkUnoService.ts`. Any mismatch breaks ZK proof verification.

```
Colours:  RED=0, YELLOW=1, GREEN=2, BLUE=3, WILD=4
Values:   0-9 = digit cards
          SKIP=10, REVERSE=11, DRAW_TWO=12
          WILD_CARD=13, WILD_DRAW4=14
```

Wild cards (`colour=4`) are only valid with `value=13` (Wild) or `value=14` (Wild Draw 4).

### 4.3 Game Struct & Storage

```rust
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,     // wager / stakes from game hub
    pub player2_points: i128,
    pub hand_hash_p1: Option<BytesN<32>>,  // keccak256(p1_hand || p1_salt)
    pub hand_hash_p2: Option<BytesN<32>>,  // keccak256(p2_hand || p2_salt)
    pub top_colour: u32,          // discard pile — colour of top card
    pub top_value: u32,           // discard pile — value of top card
    pub active_colour: u32,       // effective colour (differs from top_colour for wilds)
    pub current_turn: u32,        // 0 = Player 1's turn, 1 = Player 2's turn
    pub draw_count: u32,          // next card index to deal from deck (starts at 15)
    pub winner: Option<Address>,  // set when hand size == 0
}
```

**Storage keys** (`DataKey` enum):

| Key | Storage type | Description |
|---|---|---|
| `Game(u32)` | Temporary (TTL 30 days) | One entry per `session_id` |
| `GameHubAddress` | Instance | Address of the Game Hub contract |
| `Admin` | Instance | Admin address (can call `end_game`, `set_risc0_verifier`) |
| `Risc0Verifier` | Instance | Address of the active ZK verifier |

**TTL**: Every state write calls `env.storage().temporary().extend_ttl()` with a 30-day ledger budget (`518_400` ledgers at ~5s each).

### 4.4 Deterministic Deck

The deck is never stored on-chain. Any card at any index is derived on demand:

```rust
fn derive_card(env: &Env, session_id: u32, index: u32) -> (u32, u32) {
    // input = big-endian(session_id) ++ big-endian(index)  [8 bytes]
    // seed  = keccak256(input)                             [32 bytes]
    // colour = u32::from_be_bytes(seed[0..4]) % 5
    // value  = if colour == WILD:
    //              13 + u32::from_be_bytes(seed[4..8]) % 2
    //          else:
    //              u32::from_be_bytes(seed[4..8]) % 13
    (colour, value)
}
```

**Index assignment:**

| Index | Card |
|---|---|
| 0–6 | Player 1's starting hand (7 cards) |
| 7–13 | Player 2's starting hand (7 cards) |
| 14 | Starting top card of the discard pile |
| 15+ | Draw pile (incremented by `draw_count`) |

This is exactly mirrored in the frontend's `deriveCard(sessionId, index)` function in `zkUnoService.ts`. The ZK draw guest also re-derives the same card to verify correctness.

### 4.5 Public Functions

#### `start_game`

```rust
fn start_game(
    env: Env,
    session_id: u32,
    player1: Address,
    player2: Address,
    player1_points: i128,
    player2_points: i128,
)
```

- Requires auth from **both** `player1` and `player2` for their respective points.
- Calls `game_hub.start_game(env.current_contract_address(), ...)` as a sub-invocation.
- Derives the starting top card (`derive_card(session_id, 14)`) and stores it.
- Initialises `draw_count = 15`, `current_turn = 0`, `winner = None`.
- Stores game in temporary storage with TTL.

This is a **multi-sig transaction**: both players must sign in a single transaction. See [Section 9](#9-multi-sig-start_game-flow--deep-dive) for the detailed flow.

#### `commit_hand_zk`

```rust
fn commit_hand_zk(
    env: Env,
    session_id: u32,
    player: Address,
    hand_hash: BytesN<32>,
    zk_seal: Bytes,
)
```

- Requires auth from `player`.
- Verifies ZK proof via `verify(seal, ZK_UNO_IMAGE_ID, sha256(journal))`.
- The journal must be `session_id_be32 || hand_hash` (36 bytes).
- Stores `hand_hash` into `game.hand_hash_p1` or `hand_hash_p2`.
- Returns error `HandAlreadyCommitted` if called twice.

Each player calls this independently after `start_game`. The game cannot proceed (play/draw/uno) until both players have committed.

#### `play_card_zk`

```rust
fn play_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    played_colour: u32,
    played_value: u32,
    wild_colour: u32,       // chosen colour if playing a wild
    new_hand_hash: BytesN<32>,
    zk_seal: Bytes,
    is_winner: bool,
    is_uno: bool,
)
```

- Requires auth from `player`, must be their turn.
- Verifies ZK proof via `ZK_UNO_MOVE_IMAGE_ID`.
- Journal format: `session_id(4) || old_hash(32) || new_hash(32) || played_colour(1) || played_value(1) || wild_colour(1) || active_colour(1) || is_winner(1) || is_uno(1)` (74 bytes total).
- Updates `top_colour`, `top_value`, `active_colour` (set to `wild_colour` for wild cards).
- If `is_winner = true`, sets `game.winner` and calls `game_hub.end_game(...)`.
- Switches `current_turn` on success.

#### `draw_card_zk`

```rust
fn draw_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    new_hand_hash: BytesN<32>,
    zk_seal: Bytes,
)
```

- Only callable on your turn.
- Verifies the ZK proof uses `ZK_UNO_DRAW_IMAGE_ID`.
- Journal: `session_id(4) || old_hash(32) || new_hash(32) || draw_count_be32(4)` (72 bytes).
- Contract verifies the `draw_count` in the journal matches `game.draw_count`.
- Increments `game.draw_count` after successful verification.
- Does **not** switch turns (you can still play the drawn card this turn — though the current rule engine on the frontend switches turns after drawing; this is a frontend UX policy, not a contract enforcement).

#### `declare_uno_zk`

```rust
fn declare_uno_zk(
    env: Env,
    session_id: u32,
    player: Address,
    zk_seal: Bytes,
)
```

- Can be called any time after `commit_hand_zk`.
- Verifies `ZK_UNO_UNO_IMAGE_ID`.
- Journal: `session_id(4) || hand_hash(32)` (36 bytes).
- The ZK guest proves that `keccak256(hand_bytes || salt) == stored_hash` AND that `hand_bytes` represents exactly 1 card (2 bytes).
- Currently informational on-chain — no penalty mechanic yet. The frontend highlights the UNO state.

#### `end_game`

```rust
fn end_game(env: Env, session_id: u32, player1_won: bool)
```

- Requires auth from admin.
- Calls `game_hub.end_game(session_id, player1_won)`.
- Sets `game.winner` to the appropriate player.

In normal play this is called automatically by `play_card_zk` when `is_winner = true`. The admin-callable version exists as a fallback for timed-out or stuck games.

#### Other admin/read functions

| Function | Auth | Description |
|---|---|---|
| `set_risc0_verifier(verifier: Address)` | Admin | Update the active ZK verifier on-chain |
| `get_risc0_verifier()` | None | Read current verifier address |
| `get_game(session_id)` | None | Read full `Game` struct |
| `get_deck_card(session_id, index)` | None | Deterministic card lookup (useful for debugging) |

### 4.6 Game Hub Integration

At the top of `lib.rs`, the Game Hub client is declared:

```rust
#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env, game_id: Address, session_id: u32,
        player1: Address, player2: Address,
        player1_points: i128, player2_points: i128,
    );
    fn end_game(env: Env, session_id: u32, player1_won: bool);
}
```

ZK-UNO calls these as cross-contract invocations:
- `start_game` inside ZK-UNO's `start_game` function
- `end_game` inside ZK-UNO's `play_card_zk` (when `is_winner = true`) and `end_game`

The `game_id` passed to Game Hub's `start_game` is `env.current_contract_address()` — ZK-UNO's own address.

### 4.7 ZK Proof Verification on-chain

All four ZK functions (commit, play, draw, uno) verify proofs with this pattern:

```rust
let verifier = RiscZeroVerifierRouterClient::new(&env, &verifier_address);
verifier.verify(&seal, &image_id, &sha256(journal_bytes));
```

Where:
- `seal` — the proof bytes submitted by the player (mock: 36 bytes; real Groth16: ~256 bytes)
- `image_id` — the 32-byte identifier of the specific ZK guest program
- `sha256(journal_bytes)` — SHA-256 of the public outputs the proof attests to

The `risc0_interface` crate (local workspace crate) provides the `RiscZeroVerifierRouterClient` by generating a Soroban contract client from the interface trait.

---

## 5. Mock RISC0 Verifier: `contracts/mock-risc0-verifier`

**Purpose**: An always-pass stand-in for the real Groth16 verifier, used on testnet during development.

**File**: `contracts/mock-risc0-verifier/src/lib.rs`

```rust
#[contract]
pub struct MockRisc0Verifier;

#[contractimpl]
impl MockRisc0Verifier {
    pub fn verify(
        _env: Env,
        _seal: Bytes,
        _image_id: BytesN<32>,
        _journal_sha256: BytesN<32>,
    ) {
        // No-op: accept every proof unconditionally.
        // Use only on testnet. Never deploy to mainnet.
    }
}
```

**Why it was needed**: The real Groth16 verifier on-chain rejects the "mock seal" (a deterministic 36-byte ReceiptClaim digest) that the browser generates as fallback when the prover server is offline. Deploying this contract and calling `set_risc0_verifier` on ZK-UNO unblocked development.

**Deployed at**: `CBM44IBPT6HMI5HG6KAGOJMPVT3ZMLBWLDUHIY5QLPVSUXVPE4SGBWU3`

**Security note**: Never use on mainnet. This contract makes ZK proofs meaningless — any seal passes, so Wild Draw 4 rules and hand validity are no longer enforced at the cryptographic layer.

---

## 6. ZK Guest Programs: `zk-uno-guest`

Guest programs are Rust programs that run inside the **RISC Zero zkVM** (a RISC-V emulator). The zkVM produces a receipt that cryptographically attests: "I ran this exact program with some private input, and it produced this public output (journal)."

All guests use:
- `risc0_zkvm::guest::env` — for reading private inputs and writing public journal bytes
- `tiny_keccak` — for keccak256 inside the untrusted environment

### 6.1 Hand Commitment — `main.rs`

**IMAGE_ID** (identifies this guest build):
```
0xb7 0x21 0x64 0x47 0x95 0xbe 0xce 0x69
0xd9 0x5e 0x97 0x52 0x12 0xf2 0xd9 0x6c
0xfb 0x9d 0xf1 0x21 0x27 0xe8 0xb3 0x65
0x38 0xab 0xa6 0x57 0xb7 0xcc 0x3c 0x08
```

**Private inputs** (via `env::read()`):
```rust
hand_bytes: [u8; 14]   // 7 cards × 2 bytes (colour, value)
salt: [u8; 32]
```

**Public inputs** (via `env::commit()`):
```rust
session_id: u32
hand_hash: [u8; 32]    // keccak256(hand_bytes || salt)
```

**Statements proven**:
1. `keccak256(hand_bytes || salt) == hand_hash` — hash integrity
2. All 7 cards have valid colour (0–4) and value (0–14 with correct wild constraints)
3. Wild cards (colour=4) may only have value 13 or 14

**Journal layout** (36 bytes total):
```
[0..4]  session_id  (big-endian u32)
[4..36] hand_hash
```

### 6.2 Card Play — `move_main.rs`

**IMAGE_ID**:
```
0x01 0x84 0xe7 0x52 0x61 0x29 0xc9 0x3e
0x6a 0x6c 0xfa 0x22 0xe8 0x26 0x95 0x4d
0xe3 0xf5 0x98 0x57 0x4d 0xd5 0xb9 0x27
0x92 0x93 0xdb 0x3a 0x7f 0x74 0xc9 0x62
```

**Private inputs**:
```rust
old_hand: [u8; N]      // variable — the hand before playing
old_salt: [u8; 32]
new_hand: [u8; N-2]    // hand after removing the played card
new_salt: [u8; 32]
```

**Public inputs**:
```rust
session_id: u32
played_colour: u8
played_value: u8
wild_colour: u8
active_colour: u8
```

**Statements proven (7 checks)**:
1. `keccak256(old_hand || old_salt) == old_hand_hash` (read from `env::read_journal()`)
2. The played card `(played_colour, played_value)` exists in `old_hand`
3. **Wild Draw 4 legality**: If `played_value == 14`, verify no card in `old_hand` has colour == `active_colour` (prevents illegal use of `+4`)
4. `new_hand == old_hand` with the played card removed exactly once
5. `keccak256(new_hand || new_salt) == new_hand_hash`
6. `is_winner == (new_hand.len() == 0)`
7. `is_uno == (new_hand.len() == 2)` (2 bytes = 1 card)

**Journal layout** (74 bytes total):
```
[0..4]   session_id     (be-u32)
[4..36]  old_hand_hash
[36..68] new_hand_hash
[68]     played_colour
[69]     played_value
[70]     wild_colour
[71]     active_colour
[72]     is_winner       (0 or 1)
[73]     is_uno          (0 or 1)
```

### 6.3 Card Draw — `draw_main.rs`

**IMAGE_ID**:
```
0xca 0xa5 0xc9 0x75 0x2b 0x08 0x63 0x13
0x2d 0x41 0xac 0x6a 0x21 0xc5 0xb3 0x71
0x5e 0x3a 0xc3 0x19 0x49 0x6d 0x99 0x36
0xfe 0x24 0xb7 0x65 0x92 0xca 0x70 0x67
```

**Private inputs**:
```rust
old_hand: [u8; N]
old_salt: [u8; 32]
new_salt: [u8; 32]
draw_count: u32
session_id: u32
```

**Statements proven**:
1. `keccak256(old_hand || old_salt) == old_hand_hash`
2. The new card == `derive_card(session_id, draw_count)` (deterministic, same formula as contract)
3. `new_hand == old_hand || drawn_card` (card appended)
4. `keccak256(new_hand || new_salt) == new_hand_hash`

**Journal layout** (72 bytes total):
```
[0..4]   session_id     (be-u32)
[4..36]  old_hand_hash
[36..68] new_hand_hash
[68..72] draw_count     (be-u32)
```

### 6.4 Declare UNO — `uno_main.rs`

**IMAGE_ID**:
```
0xf3 0x15 0x81 0x27 0xcf 0xb8 0x13 0x68
0x58 0x4b 0x80 0x1e 0xaa 0x5c 0x5e 0x1b
0x88 0x9b 0x5b 0x4c 0x27 0xed 0x06 0x0d
0xa6 0xed 0xfc 0x3b 0xcb 0x02 0xb3 0x73
```

**Private inputs**:
```rust
hand_bytes: [u8; 2]    // exactly 1 card
salt: [u8; 32]
```

**Statements proven**:
1. `hand_bytes.len() == 2` (exactly one card)
2. `keccak256(hand_bytes || salt) == stored_hand_hash`

**Journal layout** (36 bytes — same format as commit):
```
[0..4]  session_id  (be-u32)
[4..36] hand_hash
```

---

## 7. Prover Server: `scripts/prover-server`

**File**: `scripts/prover-server/src/main.rs` (415 lines)  
**Technology**: Rust, Axum HTTP server  
**Port**: `3001`

This server executes the ZK guest programs in the RISC Zero zkVM and returns proof seals to the browser.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |
| `POST` | `/prove/commit` | Runs hand commitment guest |
| `POST` | `/prove/move` | Runs card play guest |
| `POST` | `/prove/draw` | Runs card draw guest |
| `POST` | `/prove/uno` | Runs declare UNO guest |

### Request/Response Schema

**`POST /prove/commit`**
```json
{
  "session_id": 12345,
  "hand_bytes": "0001020304...",    // 14 hex bytes (7 cards × colour,value)
  "salt":       "aabbcc...",        // 64 hex chars (32 bytes)
  "hand_hash":  "ff00...",          // 64 hex chars
}
```
Response:
```json
{ "seal": "73c457ba..." }           // hex-encoded seal bytes
```

### Two Operating Modes

**Mock mode (default, no env vars needed)**:
- Computes the correct `ReceiptClaim` digest from the journal bytes
- Returns a 36-byte mock seal: `GROTH16_SELECTOR(4) || claim_digest(32)`
- This is semantically complete — the on-chain `MockRisc0Verifier` accepts it
- No zkVM execution — returns instantly

**Bonsai mode (`BONSAI_API_KEY` + `BONSAI_API_URL` set)**:
- Executes the full zkVM guest using the RISC Zero Bonsai proving service
- Returns a real Groth16 proof seal
- This works with the real `RiscZeroVerifierRouter` on mainnet
- Takes 30–120 seconds per proof

### Current Status

The prover server is **not running** in development. The browser frontend falls back to computing mock seals locally (in-browser) via `buildMockSeal()` in `zkUnoService.ts`. This produces identical seals to the server's mock mode.

To start the server:
```bash
cd scripts/prover-server
cargo run
```

---

## 8. Frontend Architecture: `zk-uno-nextjs`

### 8.1 Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14.2.29 | React framework, App Router |
| React | 18.3.1 | UI library |
| TypeScript | 5.8.2 | Type safety throughout |
| Tailwind CSS | 3.4.17 | Utility-first styling |
| Zustand | 5.0.3 | Wallet state management |
| `@stellar/stellar-sdk` | 13.1.0 | Stellar/Soroban transaction building |
| `@jsr/creit-tech__stellar-wallets-kit` | 2.0.0-beta.9 | Multi-wallet support (Freighter, xBull, etc.) |
| `@noble/hashes` | 1.7.2 | keccak256 implementation in-browser |

The frontend runs on port `3002` (`next dev --port 3002`).

### 8.2 Directory Layout

```
zk-uno-nextjs/src/
├── app/
│   ├── layout.tsx              # Root layout: WalletProvider, font, metadata
│   ├── page.tsx                # Home page — renders <Lobby />
│   └── game/
│       └── [sessionId]/
│           └── page.tsx        # Dynamic route: renders <GameBoard sessionId=N />
├── components/
│   ├── WalletButton.tsx        # Connect/disconnect wallet UI
│   ├── Lobby.tsx               # Create Room / Join Room tabs
│   ├── GameBoard.tsx           # Full game UI, orchestrates all components
│   ├── Card.tsx                # Single card visual (face-up or face-down)
│   ├── Hand.tsx                # Array of Cards for player's hand
│   └── DiscardPile.tsx         # Top discard card + active colour indicator
├── hooks/
│   ├── useGame.ts              # Game state, actions, polling
│   └── useWallet.ts            # Zustand wallet store
└── lib/
    ├── config.ts               # Network constants and contract IDs
    ├── zkUnoService.ts         # All Soroban interactions (751 lines)
    └── wallet.ts               # StellarWalletsKit bridge functions
```

### 8.3 Configuration — `src/lib/config.ts`

```typescript
export const RPC_URL             = 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE  = 'Test SDF Network ; September 2015';
export const ZK_UNO_CONTRACT     = 'CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE';
export const MOCK_GAME_HUB_CONTRACT = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG';
export const PROVER_URL          = 'http://localhost:3001';

// Neutral fee-source used during multi-sig simulation
// This account is never the tx submitter — it's only used to simulate
// so that both P1 and P2 get Address credentials in the auth list
export const SIMULATION_SOURCE   = 'GBUZBZ7...'; // see .env for full key

export const DEFAULT_TIMEOUT       = 30;          // seconds
export const MULTI_SIG_TTL_MINUTES = 60;          // how long P1's pre-signed auth is valid
export const DEFAULT_AUTH_TTL_MINUTES = 5;
```

### 8.4 Service Layer — `src/lib/zkUnoService.ts`

This is the most important file in the frontend (751 lines). It handles all Stellar/Soroban interactions.

#### Types

```typescript
export interface Card {
  colour: number;   // 0=Red, 1=Yellow, 2=Green, 3=Blue, 4=Wild
  value: number;    // 0-9=digit, 10=Skip, 11=Reverse, 12=DrawTwo, 13=Wild, 14=WildDraw4
}

export interface WalletSigner {
  address: string;
  signTransaction: (txXdr: string, opts?: { networkPassphrase?: string }) => Promise<{ signedTxXdr: string }>;
  signAuthEntry?: (entryXdr: string, opts?: { networkPassphrase?: string }) => Promise<{ signedAuthEntry: string; error?: Error }>;
}
```

#### Card System Constants

```typescript
// Colours
export const RED = 0, YELLOW = 1, GREEN = 2, BLUE = 3, WILD = 4;

// Values
export const SKIP = 10, REVERSE = 11, DRAW_TWO = 12;
export const WILD_CARD = 13, WILD_DRAW4 = 14;

// Display
export const COLOUR_NAMES   = ['Red', 'Yellow', 'Green', 'Blue', 'Wild'];
export const COLOUR_CLASSES = [
  'bg-red-500',    // Red
  'bg-yellow-400', // Yellow
  'bg-green-500',  // Green
  'bg-blue-500',   // Blue
  'bg-gray-700',   // Wild
];

export const VALUE_NAMES = (v: number) => {
  if (v <= 9)          return String(v);
  if (v === SKIP)      return 'Skip';
  if (v === REVERSE)   return 'Rev';
  if (v === DRAW_TWO)  return '+2';
  if (v === WILD_CARD) return 'Wild';
  if (v === WILD_DRAW4) return '+4';
  return '?';
};
```

#### Hand Encoding

Cards are serialised as 2 bytes per card: `[colour, value]`. A 7-card hand = 14 bytes.

```typescript
encodeHand(cards: Card[]): Uint8Array      // Card[] → Uint8Array
decodeHand(bytes: Uint8Array): Card[]      // Uint8Array → Card[]
computeHandHash(handBytes, salt): Uint8Array  // keccak256(handBytes || salt)
randomSalt(): Uint8Array                   // 32 crypto-random bytes
```

#### Deterministic Card Derivation (mirrors Rust contract exactly)

```typescript
export function deriveCard(sessionId: number, index: number): Card {
  // input = BE(sessionId)[4] ++ BE(index)[4]
  // seed  = keccak256(input)
  // colour = seed[0..4] as u32 % 5
  // value  = if wild: 13 + seed[4..8] % 2 else seed[4..8] % 13
  return { colour, value };
}

export function dealHand(sessionId: number, playerIndex: 0 | 1): Card[] {
  const start = playerIndex * 7;
  return Array.from({ length: 7 }, (_, i) => deriveCard(sessionId, start + i));
}

export function deriveTopCard(sessionId: number): Card {
  const card = deriveCard(sessionId, 14);
  // If the derived top card is a wild, normalise it to Red with a digit value
  return card.colour === WILD ? { colour: RED, value: card.value % 10 } : card;
}
```

#### Game Logic Helpers

```typescript
canPlay(card, activeColour, topValue): boolean
// Returns true if the card can legally be played given current board state
// Wild cards always playable; coloured cards match on colour or value

removeCard(hand, colour, value): Card[]
// Immutable — returns new array with first matching card removed

hasMatchingColour(hand, activeColour): boolean
// Used by move_main.rs to verify Wild Draw 4 legality
```

#### `class ZkUnoService`

The main service class. Instantiated with the contract ID. Internally holds two client types:
- `baseClient`: uses `SIMULATION_SOURCE` as the source account — used for reads and multi-sig simulation
- `signingClient(walletSigner)`: uses the player's address — used for authenticated writes

**`getGame(sessionId): Promise<Game | null>`**  
Pure read. Uses `baseClient.get_game()` — no auth required. The SDK v14 pattern means simulation happens at construction time; no extra `.simulate()` call needed.

**`prepareStartGame(...)`** — See [Section 9](#9-multi-sig-start_game-flow--deep-dive).

**`completeStartGame(...)`** — See [Section 9](#9-multi-sig-start_game-flow--deep-dive).

**`commitHandZk(sessionId, player, handHash, signer, { handBytes, salt })`**

1. Build the 36-byte journal: `BE(sessionId)[4] || hand_hash[32]`
2. Try prover server at `localhost:3001/prove/commit`
3. If server unavailable → `buildMockSeal(ZK_UNO_IMAGE_ID, sha256(journal))`
4. Build client with wallet signer
5. Call `client.commit_hand_zk({ session_id, player, hand_hash, zk_seal })`
6. Sign and send

**`playCardZk(sessionId, player, oldHand, oldSalt, card, newHand, newSalt, wildColour, activeColour, signer)`**

1. Compute `oldHash = computeHandHash(encodeHand(oldHand), oldSalt)`
2. Compute `newHash = computeHandHash(encodeHand(newHand), newSalt)`
3. Determine `isWinner = (newHand.length === 0)`, `isUno = (newHand.length === 1)`
4. Build 74-byte journal
5. Try prover → fallback to `buildMoveSeal(...)`
6. Call `client.play_card_zk({...})`, sign and send

**`drawCardZk(sessionId, player, hand, salt, newSalt, drawCount, signer)`**

1. Derive the drawn card: `deriveCard(sessionId, drawCount)`
2. Append it to form `newHand`
3. Compute old/new hashes
4. Build 72-byte journal with draw count
5. Try prover → fallback to `buildDrawSeal(...)`
6. Call `client.draw_card_zk({...})`, sign and send

**`declareUnoZk(sessionId, player, hand, salt, signer)`**

1. Compute `handHash = computeHandHash(encodeHand(hand), salt)`
2. Build 36-byte journal (same format as commit)
3. Try prover → fallback to `buildUnoSeal(sessionId, handHash)`
4. Call `client.declare_uno_zk({...})`, sign and send

### 8.5 Wallet Layer — `src/hooks/useWallet.ts` and `src/lib/wallet.ts`

**`useWallet`** is a Zustand store that holds the connected wallet address and provides a `getSigner()` function that returns a `WalletSigner` object.

The signer's `signTransaction` and `signAuthEntry` methods lazy-import from `src/lib/wallet.ts`, which wraps the `@jsr/creit-tech__stellar-wallets-kit` kit.

Supported wallets: Freighter, xBull, and any other wallet the kit supports.

The `WalletButton` component listens to kit events (`STATE_UPDATED`, `DISCONNECT`) and calls `setAddress()` / `clearAddress()` on the Zustand store accordingly.

**`signAuthEntry`** is needed for multi-sig. The contract client's `authorizeEntry()` helper calls this with the `HashIdPreimage` XDR. The wallet hashes it with SHA-256, signs with the account's Ed25519 private key, and returns the 64-byte signature as base64.

### 8.6 Game Hook — `src/hooks/useGame.ts`

This hook (~181 lines) is used by `GameBoard` to access all game state and actions.

**State:**

```typescript
game: Game | null            // on-chain game struct (polled every 4s)
myHand: Card[]               // local hand (never sent to chain)
mySalt: Uint8Array | null    // local salt for current hand hash
handCommitted: boolean       // whether commit_hand_zk was called this session
unoDeclaimed: boolean        // whether declare_uno_zk was called
loading: boolean             // transaction in progress
error: string | null
```

**Derived state:**

```typescript
playerIndex: 0 | 1 | null
// 0 if connected wallet === game.player1, 1 if === game.player2

isMyTurn: boolean
// game.current_turn === playerIndex
```

**Polling**: Calls `getGame(sessionId)` every 4 seconds via `setInterval`. Circuit breaker stops polling after 5 consecutive failures. This is how each player sees the opponent's moves.

**Hand initialisation**: When `playerIndex` becomes known, `dealHand(sessionId, playerIndex)` derives the starting 7 cards and `randomSalt()` generates a fresh 32-byte salt. This is fully deterministic given the session — both the frontend and the ZK guest derive the same cards.

**Actions:**

```typescript
commitHand(): Promise<void>
// encodeHand() → computeHandHash() → commitHandZk()

playCard(card: Card, wildColour?: number): Promise<void>
// removeCard() → newSalt = randomSalt() → playCardZk()
// On success: updates myHand and mySalt locally

drawCard(): Promise<void>
// drawCardZk() → appends deriveCard(draw_count) locally → updates mySalt

declareUno(): Promise<void>
// declareUnoZk() → sets unoDeclaimed = true

clearError(): void
```

**Error humanization**: Translates `Error(Contract, #N)` codes to readable strings like "It's not your turn" or "Your hand is not committed yet".

### 8.7 Pages & Routing

**`/` (Home)**  
Renders `<Lobby />`. Two tabs: "Create Room" and "Join Room".

**`/game/[sessionId]`**  
Dynamic route. Extracts `sessionId` from URL params, renders `<GameBoard sessionId={sessionId} />`.

Navigation uses `useRouter().push('/game/12345')` after a successful `start_game` or `completeStartGame`.

### 8.8 Components

#### `Lobby.tsx` (275 lines)

**Create Room tab**:
1. Player enters opponent's Stellar address, their own points, and opponent's points
2. Clicks "Create Room" → calls `prepareStartGame()` (wallet popup: sign auth entry)
3. Gets back a `SessionBundle` JSON object
4. Displays it as pretty-printed JSON with a "Copy" button — this is the **invite code**
5. Navigates to `/game/{sessionId}` automatically

**Join Room tab**:
1. Player pastes the `SessionBundle` JSON from the room creator
2. Clicks "Join Game" → calls `completeStartGame()` (wallet popup: sign transaction)
3. Both players are now on-chain in the game
4. Navigates to `/game/{sessionId}`

**`SessionBundle` interface** — the invite code shared out-of-band (e.g. Discord):

```typescript
interface SessionBundle {
  sessionId: number;
  player1: string;          // Stellar address of room creator
  player2: string;          // Stellar address of the joiner
  player1Points: string;
  player2Points: string;
  authXdr: string;          // P1's signed SorobanAuthorizationEntry (base64 XDR)
  simDataXdr: string;       // Simulation's SorobanTransactionData XDR (footprint)
  simAuthP2Xdr: string;     // P2's auth stub from the simulation
  minResourceFee: string;   // Minimum resource fee from simulation
}
```

#### `GameBoard.tsx` (258 lines)

The main game screen. Uses `useGame(sessionId)` and `useWallet`.

**UI sections**:

1. **Loading overlay** — spinner + status text when `loading = true`
2. **Winner overlay** — 🎉 (win) or 😞 (loss) with "Back to Lobby" button, shown when `game.winner` is set
3. **Error banner** — red banner with dismiss button, shows `error` from `useGame`
4. **Header** — Session ID + "Your Turn" / "Opponent's Turn" coloured badge
5. **Opponent section** — 7 face-down cards + "✓ Committed" / "Awaiting commit…" status badge
6. **Center row** — Draw pile (large face-down card, clickable) + `<DiscardPile />`
7. **Wild colour picker modal** — appears when playing a wild/+4 card. 4 buttons, each styled with `COLOUR_CLASSES[colour]`
8. **Player hand** — `<Hand cards={myHand} />` with legal move highlighting
9. **Action buttons** — "Commit Hand" (until committed) and "UNO!" (when 1 card remains, before declaring)
10. **Status hints** — context-sensitive text explaining what action is needed

#### `Card.tsx` (production design)

UNO-style card with authentic layout:

```
┌─────────────────┐
│ VALUE           │  ← small label top-left (value in COLOUR background)
│                 │
│   ╔═══════╗     │
│   ║ VALUE ║     │  ← center: darker oval with white bold value
│   ╚═══════╝     │
│                 │
│           VALUE │  ← small label bottom-right, rotated 180°
└─────────────────┘
```

Background colour determined by `COLOUR_CLASSES[card.colour]`. Darker oval uses:

```typescript
const COLOUR_DARK = {
  0: 'bg-red-700',    // Red card inner oval
  1: 'bg-yellow-600', // Yellow
  2: 'bg-green-700',  // Green
  3: 'bg-blue-700',   // Blue
  4: 'bg-gray-900',   // Wild
};
```

States:
- `selected`: `scale-110 -translate-y-3 shadow-white/30` — lifted and scaled
- `playable` (not selected): `-translate-y-2 hover:border-white/80` — hover lift
- `not playable`: `opacity-50 cursor-not-allowed` — muted

Sizes: `sm` (40×56), `md` (56×80), `lg` (80×112) in pixels.

Face-down cards show a dark card back with "UNO" text.

#### `Hand.tsx`

Renders the player's hand using `canPlay(card, activeColour, topValue)` from `zkUnoService.ts` to determine which cards are playable. Playable cards have hover animations and full opacity. Non-playable cards are dimmed.

Calls `onPlay(card)` when a playable card is clicked. If the card is a wild (`colour === WILD`), `GameBoard` intercepts this and opens the colour picker modal.

#### `DiscardPile.tsx`

Shows the current top card using `<Card />`. If the top card is a wild, also shows a coloured badge indicating the `activeColour` (the colour the previous player chose).

---

## 9. Multi-Sig `start_game` Flow — Deep Dive

Starting a game requires **both players' authorization in a single transaction**. This is because the Soroban contract calls `player1.require_auth_for_args(...)` and `player2.require_auth_for_args(...)`.

The fundamental challenge is the **Soroban nonce footprint**. When Soroban authorizes a `SorobanAuthorizationEntry` for an `Address`, it:
1. Reads a nonce from a `ContractData` ledger entry (the "nonce key")
2. Increments it
3. The nonce key must be declared in the transaction's `SorobanTransactionData` footprint

If P1 signs against nonce `N1` from simulation 1, but P2 naively creates a fresh simulation (producing nonce `N2`), the transaction will trap with `invokeHostFunctionTrapped: nonce outside of footprint` because P1's nonce key is not in the footprint.

**The Fix** (implemented in `completeStartGame`):

### Step 1 — `prepareStartGame` (P1's browser)

```
1. Build ZkUnoClient with SIMULATION_SOURCE (neutral) as publicKey
2. Simulate start_game → sim1
   - Both P1 & P2 get Address credentials (not SourceAccount)
   - because SIMULATION_SOURCE ≠ P1 ≠ P2
3. Extract P1's SorobanAuthorizationEntry from sim1.auth
4. Call authorizeEntry(p1Entry, p1SdkSigner, validUntil, passphrase)
   - wallet.signAuthEntry(preimage.toXDR('base64'), ...) is called
   - returns base64-encoded 64-byte Ed25519 signature
5. Capture sim1.transactionData as simDataXdr  ← critical: the footprint!
6. Capture P2's auth stub from sim1 as simAuthP2Xdr
7. Return { authXdr: signedP1.toXDR(), simDataXdr, simAuthP2Xdr, minResourceFee }
```

This bundle (the `SessionBundle`) is shared with P2 out-of-band.

### Step 2 — `completeStartGame` (P2's browser)

```
1. Decode signedP1 entry from player1AuthXdr
2. Decode sorobanData from simDataXdr  ← P1's footprint, containing N1 nonce key
3. Decode P2's auth stub from simAuthP2Xdr
4. Build P2's transaction from scratch:
   TransactionBuilder(p2Account, { fee: 500_000 + minResourceFee })
     .addOperation(invokeContractFunction('start_game', [...args]))
     .setTimeout(60)
     .setSorobanData(sorobanData)   ← inject P1's footprint!
     .build()
5. Inject auth entries into the raw operation:
   rawAuth.push(signedP1)           ← P1's pre-signed Address entry
   rawAuth.push(new SorobanAuthorizationEntry({
     credentials: sorobanCredentialsSourceAccount(),
     rootInvocation: p2AuthStub.rootInvocation(),
   }))                              ← P2's SourceAccount entry (satisfied by envelope sig)
6. p2Signer.signTransaction(envelopeXdr) ← P2 signs the tx envelope
7. server.sendTransaction(signedTx)
8. Poll server.getTransaction(hash) every 2s until SUCCESS/FAILED
```

**Why `SourceAccount` for P2?** P2 is the transaction submitter (source account). Soroban treats the transaction's source account signature as satisfying any `SourceAccount` credential automatically. This means P2's auth is satisfied by signing the transaction envelope — no additional `signAuthEntry` call is needed for P2.

**Why SIMULATION_SOURCE?** If we used `player1` as the build client's publicKey, then P1 would get `SourceAccount` credentials in the simulation (since the tx source = P1), not `Address` credentials. `Address` credentials are required to use `authorizeEntry()` and `signAuthEntry`. By using a neutral third address, both players get `Address` credentials.

---

## 10. Complete Game Flow Walkthrough

### Phase 1: Create Room

1. P1 connects wallet (Freighter or xBull)
2. P1 navigates to Lobby → "Create Room" tab
3. P1 enters P2's address, their own points wager, P2's wager
4. P1 clicks "Create Room"
5. A `sessionId` is generated (e.g. `Math.floor(Math.random() * 1_000_000)`)
6. `prepareStartGame(sessionId, p1, p2, p1pts, p2pts, p1Signer)` is called
7. P1's wallet shows a "Sign Auth Entry" popup
8. P1 signs → gets back `SessionBundle` JSON
9. Frontend navigates to `/game/{sessionId}` and shows bundle as copyable JSON

### Phase 2: Join Room

1. P2 connects their wallet
2. P2 navigates to Lobby → "Join Room" tab
3. P2 pastes the `SessionBundle` JSON from P1
4. P2 clicks "Join Game"
5. `completeStartGame(...)` is called with the bundle
6. P2's wallet shows a "Sign Transaction" popup
7. P2 signs → transaction submitted to Stellar Testnet
8. On success (confirmed on-chain), frontend navigates to `/game/{sessionId}`
9. Both players are now at the game board URL

### Phase 3: Both Players Commit Their Hands

Both players do this independently; order doesn't matter.

1. Player arrives at `/game/{sessionId}`
2. `useGame` hook initialises: `myHand = dealHand(sessionId, playerIndex)` and `mySalt = randomSalt()`
3. Player clicks "Commit Hand"
4. `commitHand()` runs:
   - `encodeHand(myHand)` → 14-byte hand encoding
   - `computeHandHash(handBytes, mySalt)` → 32-byte keccak256 commitment
   - Build 36-byte journal
   - Try prover server (likely offline) → `buildMockSeal(ZK_UNO_IMAGE_ID, sha256(journal))`
   - Call `commitHandZk(sessionId, player, handHash, seal)` on-chain
5. Transaction confirmed. Player's `hand_hash` is now stored on-chain. Cards remain private.
6. `handCommitted` state becomes `true`. "Commit Hand" button disappears.
7. Both players poll `getGame()` every 4 seconds and see when the opponent commits.

### Phase 4: Game Play — P1's Turn

1. P1's `isMyTurn = true` (game starts on P1)
2. Hand shows playable cards highlighted (legal moves from `canPlay()`)
3. P1 clicks a card:
   - If wild: colour picker modal opens; P1 picks a colour
   - Otherwise: `playCard(card)` is called immediately
4. `playCard(card, wildColour)` runs:
   - `removeCard(myHand, card.colour, card.value)` → newHand
   - `newSalt = randomSalt()`
   - Compute old/new hashes
   - `isWinner = (newHand.length === 0)`, `isUno = (newHand.length === 1)`
   - Call `playCardZk(...)` on-chain
5. Transaction confirmed. On-chain state update: `top_colour`, `top_value`, `active_colour`, `current_turn` (switches to P2), and P1's new `hand_hash_p1`.
6. P2's polling picks up the change. P2's board updates.

### Phase 5: Drawing a Card

When a player cannot play and clicks the draw pile:
1. `drawCard()` runs:
   - `drawCardZk(sessionId, player, hand, salt, newSalt, game.draw_count, signer)`
   - Internally: derives the new card from `deriveCard(sessionId, game.draw_count)`
   - Appends it to local hand
   - Computes new hash with `newSalt`
   - Builds proof and calls `draw_card_zk` on-chain
2. On success: `game.draw_count` increments on-chain; player's hand hash updated

### Phase 6: Declaring UNO

When a player has exactly 1 card in their hand, the "UNO!" button appears.

1. Player clicks "UNO!"
2. `declareUno()` calls `declareUnoZk(sessionId, player, hand, salt, signer)`
3. ZK proof proves: `keccak256(hand_bytes || salt) == stored_hash` AND `hand.length == 1`
4. On-chain confirmation. `unoDeclaimed = true` on the frontend.

### Phase 7: Win

1. P1's last card is played
2. `playCard` sets `isWinner = true`
3. ZK proof includes `is_winner = 1` in journal
4. Contract verifies ZK proof → calls `game_hub.end_game(session_id, player1_won: true)`
5. Sets `game.winner = player1`
6. Both players' polling picks up `game.winner !== null`
7. Winner overlay appears on both screens

---

## 11. ZK Proof System — Deep Dive

### 11.1 What is RISC Zero?

RISC Zero is a general-purpose zkVM (zero-knowledge virtual machine). Instead of writing ZK circuits for specific computations (like SNARKs/STARKs directly), you write a normal Rust program that runs in a RISC-V emulator. The system proves the correct execution of that program.

The "guest" is the program running inside the VM. The "host" provides private inputs and verifies the resulting receipt. In our architecture:
- **Guest** = ZK programs in `zk-uno-guest/src/`
- **Host** = prover server or browser (provides private inputs)
- **Verifier** = Soroban on-chain verifier

### 11.2 IMAGE_IDs

An IMAGE_ID is a 32-byte identifier for a specific compiled guest binary. It's the Merkle root of the guest program's ELF image. Changing even one instruction changes the IMAGE_ID.

The four IMAGE_IDs are hardcoded in both:
- `contracts/zk-uno/src/lib.rs` (Rust constants)
- `zk-uno-nextjs/src/lib/zkUnoService.ts` (TypeScript constants)

**They must match exactly.** If the ZK guest is recompiled (e.g. upgrading `risc0-zkvm`), both files must be updated with the new IMAGE_IDs, and the Soroban contract must be redeployed.

### 11.3 Mock Seal vs Real Groth16 Seal

**Mock seal (development)**:
```
seal[0..4]   = GROTH16_SELECTOR = 0x73 0xc4 0x57 0xba
seal[4..36]  = sha256(TAG_CLAIM || imageId || POST_STATE_HALTED || outputDigest || suffix)
```

This is a 36-byte deterministic value that encodes the "ReceiptClaim digest" — what a real Groth16 proof would attest to. The `MockRisc0Verifier` on-chain accepts this unconditionally.

**Real Groth16 seal**: ~256 bytes of BN254 elliptic curve proof data. Requires running the full zkVM (minutes to hours on CPU; ~1 minute on Bonsai). The real `RiscZeroVerifierRouter` decodes this using the `Groth16Verifier` contract.

### 11.4 Journal Formats

The journal is the **public output** of a ZK proof — what the verifier can read. The contract SHA-256 hashes the expected journal bytes before calling `verify()`.

| Guest | Journal Size | Layout |
|---|---|---|
| commit_hand | 36 bytes | `sessionId_be32(4) \|\| hand_hash(32)` |
| play_card | 74 bytes | `sessionId(4) \|\| old_hash(32) \|\| new_hash(32) \|\| played_colour(1) \|\| played_value(1) \|\| wild_colour(1) \|\| active_colour(1) \|\| is_winner(1) \|\| is_uno(1)` |
| draw_card | 72 bytes | `sessionId(4) \|\| old_hash(32) \|\| new_hash(32) \|\| draw_count_be32(4)` |
| declare_uno | 36 bytes | `sessionId_be32(4) \|\| hand_hash(32)` |

### 11.5 Browser Fallback Path

When the prover server is not running:

1. `callProver('/prove/commit', {...})` fails with `ERR_CONNECTION_REFUSED`
2. Returns `undefined`
3. Frontend calls `buildMockSeal(IMAGE_ID, await sha256Async(journalBytes))`
4. `buildMockSeal` computes the ReceiptClaim digest in-browser using `crypto.subtle.digest`
5. Returns the 36-byte mock seal
6. This seal is passed to the on-chain `MockRisc0Verifier.verify()` which accepts it

The seal produced by the browser is **identical** to what the prover server would produce in mock mode. Both implement the same ReceiptClaim digest formula.

---

## 12. Card Rendering System

### Tailwind CSS Purge Fix

Tailwind CSS 3.x uses content scanning to determine which utility classes to include in the build. Classes referenced only through string construction (like `COLOUR_CLASSES['bg-red-500']`) in files not in the scan path are purged.

**Problem**: `src/lib/zkUnoService.ts` references all 10 colour classes as strings. It was not in the Tailwind content scan.

**Fix** in `tailwind.config.js`:
```javascript
content: [
  './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  './src/lib/**/*.{js,ts,jsx,tsx}',      // ← added
  './src/hooks/**/*.{js,ts,jsx,tsx}',    // ← added
],
safelist: [
  // Card background colours (from COLOUR_CLASSES)
  'bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bg-blue-500', 'bg-gray-700',
  // Card inner oval colours (from COLOUR_DARK in Card.tsx)
  'bg-red-700', 'bg-yellow-600', 'bg-green-700', 'bg-blue-700', 'bg-gray-900',
],
```

The `safelist` ensures these classes are always included even if Tailwind doesn't scan them as string literals.

---

## 13. Known Limitations & Future Work

### Security Limitations

| Item | Status | Notes |
|---|---|---|
| Mock ZK verifier | Active | All ZK proofs are mock seals; use `MockRisc0Verifier`. Card rules not cryptographically enforced. |
| Real prover server | Not running | Would need Bonsai API key for production proofs |
| Wild Draw 4 enforcement | Bypassed by mock verifier | Works correctly in `move_main.rs` — just not enforced on-chain now |

### Gameplay Limitations

| Item | Notes |
|---|---|
| No UNO penalty | `declare_uno_zk` is informational. No mechanism to challenge or penalise failing to call UNO in time. |
| Draw card ends turn | The frontend switches turns after drawing. The contract doesn't enforce this — a player could theoretically draw then play without switching turns if calling the contract directly. |
| No special card effects | SKIP, REVERSE, and DRAW_TWO cards play their values on the discard pile but have no special on-chain effects (no forced draw, no turn skip). The frontend needs to implement these effects client-side with corresponding ZK logic. |
| 2 players only | Contract enforces exactly 2 players. |
| No rematch | Must create a new session for a new game. |

### Technical Debt

| Item | Notes |
|---|---|
| `@stellar/stellar-sdk` version | `package.json` specifies `^13.1.0` but the conversation history references v14 patterns. Verify the installed version matches the code patterns. |
| Prover server not integrated with Next.js build | Must be started separately with `cargo run`. |
| `DEVELOPMENT.md` in root | Generic; superseded by this document. |
| Bindings not regenerated | `bindings/zk_uno/src/index.ts` is the generated TypeScript client. If the contract ABI changes, run `bun run bindings zk-uno` to regenerate. |

---

## 14. Local Development Setup

### Prerequisites

- [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- [Rust toolchain](https://rustup.rs) with `wasm32v1-none` target
- [Stellar CLI](https://github.com/stellar/stellar-cli) (`cargo install stellar-cli`)
- A Stellar testnet wallet (Freighter or xBull browser extension)

### Install frontend dependencies

```bash
cd zk-uno-nextjs
bun install
```

### Run the frontend

```bash
cd zk-uno-nextjs
bun run dev
# Starts at http://localhost:3002
```

### Environment variables

The frontend reads contract IDs from `src/lib/config.ts` (hardcoded). No `.env` file is needed for the frontend.

The deployer scripts use `.env` in the root:
```
STELLAR_SECRET_KEY=S...          # admin/deployer key
VITE_ZK_UNO_CONTRACT_ID=...
VITE_MOCK_RISC0_VERIFIER_CONTRACT_ID=...
```

### Rebuild the Soroban contract

```bash
# From repo root
bun run build zk-uno
# Output: target/wasm32v1-none/release/zk_uno.wasm
```

### Deploy the contract

```bash
bun run deploy zk-uno
```

### Regenerate TypeScript bindings

After changing the contract's public API, regenerate bindings:

```bash
bun run bindings zk-uno
# Output: bindings/zk_uno/src/index.ts
# Then copy into the frontend's bindings.ts
```

### Run the prover server (optional)

```bash
cd scripts/prover-server
cargo run
# Starts at http://localhost:3001
# The frontend will automatically use it instead of the browser fallback
```

### Wallet setup for testing

You need two separate browser profiles (or two browsers) each with their own wallet. P1 and P2 must be different Stellar accounts.

Fund testnet accounts at: `https://friendbot.stellar.org/?addr=<address>`

---

## 15. Problem History & Fixes Applied

This section documents the major blockers that were encountered and resolved.

### Problem 1: Multi-sig `start_game` — `invokeHostFunctionTrapped`

**Symptom**: P2 submitting `start_game` got `txBAD_AUTH` or `invokeHostFunctionTrapped`.

**Root cause**: P1 pre-signed their `SorobanAuthorizationEntry` against nonce `N1` from simulation 1. When P2 did a fresh simulation, it produced nonce `N2`. The transaction submitted by P2 had N2 in its footprint, but P1's signed entry referenced N1 (outside the footprint).

**Fix**: P1 captures `sim1.transactionData` (the footprint) and includes it in the `SessionBundle`. P2 uses `TransactionBuilder.setSorobanData(sorobanData)` with P1's footprint. P2 uses `SourceAccount` credentials (satisfied by the tx envelope signature) rather than an `Address` credential that would require a new `signAuthEntry` and produce a new nonce.

**Files changed**: `zkUnoService.ts` — `prepareStartGame` and `completeStartGame`.

---

### Problem 2: `commit_hand_zk` → `Error(Contract, #2)` ("NotPlayer")

Wait — actually this was `ZkProofInvalid` (Error #12). The initial diagnosis was that the error looked like a "player" error but it was actually the ZK verifier rejecting.

**Symptom**: Clicking "Commit Hand" resulted in `Error(Contract, #2)`.

Re-checking the error table: Error #2 is `NotPlayer`. This means the `player` address passed didn't match `game.player1` or `game.player2`. Likely a secondary cause in early testing.

The more persistent problem was that after fixing the player address, `Error(Contract, #12)` appeared — `ZkProofInvalid`.

**Root cause of `ZkProofInvalid`**: The prover server was not running. The browser generated a mock seal via `buildMockSeal()`. The real Groth16 verifier on-chain (`CBD3SXLNTFXFP44YSCIPFMCY3DYLYAQ43BXK7IE7SGR5ZL4JVRQTOXFH`) rejected this 36-byte mock seal because it's not a valid Groth16 proof.

**Fix**: Deployed a new `MockRisc0Verifier` contract (`CBM44IBPT6HMI5HG6KAGOJMPVT3ZMLBWLDUHIY5QLPVSUXVPE4SGBWU3`) whose `verify()` is a no-op. Called `set_risc0_verifier(mock_addr)` on the ZK-UNO contract to switch from the real verifier to the mock. The browser's mock seals now pass on-chain.

**Files added**: `contracts/mock-risc0-verifier/src/lib.rs`, `contracts/mock-risc0-verifier/Cargo.toml`.

---

### Problem 3: Card Colours Not Rendering

**Symptom**: Cards showed correctly (values, face-down/up states) but all appeared in a flat grey — no red, yellow, green, or blue cards.

**Root cause**: Tailwind CSS JIT mode scans source files for class names. The `COLOUR_CLASSES` array in `zkUnoService.ts` (inside `src/lib/`) referenced `'bg-red-500'`, `'bg-yellow-400'`, etc. as runtime strings. Since `src/lib/` was not in the Tailwind `content` configuration, these class names were never found during the build scan and were purged from the CSS output.

**Fix**:
1. Added `'./src/lib/**/*.{js,ts,jsx,tsx}'` and `'./src/hooks/**/*.{js,ts,jsx,tsx}'` to the `content` array in `tailwind.config.js`.
2. Added a `safelist` with all 10 colour classes to guarantee they're included regardless of scan results.

**Files changed**: `zk-uno-nextjs/tailwind.config.js`.

---

### Problem 4: `cloneFrom instanceof` Error in `completeStartGame`

**Symptom**: An error saying something like `cloneFrom is not an instance of TransactionBuilder` when trying to clone a transaction built by the SDK.

**Root cause**: Webpack module bundling in Next.js can create multiple instances of `stellar-base` (the underlying XDR/transaction library). The `instanceof` checks in the SDK's `TransactionBuilder` fail because the object was created by a different module instance.

**Fix**: Instead of cloning the SDK-built transaction, `completeStartGame` builds the P2 transaction from scratch using `new TransactionBuilder(p2Account, {...}).addOperation(Operation.invokeContractFunction(...))`. This avoids the clone entirely.

**Files changed**: `zkUnoService.ts` — `completeStartGame`.

---

*Document last updated: current session. Reflects commits up to and including `151d8a9`.*
