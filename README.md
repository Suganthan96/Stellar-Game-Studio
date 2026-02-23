# ZK-UNO — Zero-Knowledge UNO on Stellar

> A two-player UNO card game where **every hand is secret** and **every move is cryptographically proven**.  
> Built on **Stellar Testnet** using **Soroban smart contracts** + **RISC Zero zero-knowledge proofs**.

---

## Table of Contents

1. [What is ZK-UNO?](#what-is-zk-uno)
2. [Live Demo](#live-demo)
3. [Deployed Contracts](#deployed-contracts)
4. [Repository Structure](#repository-structure)
5. [Architecture](#architecture)
6. [ZK Proof System](#zk-proof-system)
7. [Multi-Sig Game Start](#multi-sig-game-start)
8. [Smart Contract Reference](#smart-contract-reference)
9. [Frontend (Next.js)](#frontend-nextjs)
10. [Prover Server](#prover-server)
11. [Running Locally](#running-locally)
12. [Environment Variables](#environment-variables)
13. [Card Encoding](#card-encoding)
14. [Key Design Decisions](#key-design-decisions)
15. [Common Errors & Fixes](#common-errors--fixes)
16. [Testing](#testing)
17. [Redeploying Contracts](#redeploying-contracts)

---

## What is ZK-UNO?

ZK-UNO is a fully on-chain two-player UNO card game. The twist: **nobody can see your cards** — not your opponent, not the blockchain, not even the contract. Yet the contract can still verify that every move you make is legal.

This is possible through **Zero-Knowledge Proofs (ZK proofs)**. When you play a card, you submit a mathematical proof that says:

> *"I have this card in my hand and it's legal to play"* — without revealing any other card in your hand.

### What makes this special?

| Feature | Traditional On-chain Game | ZK-UNO |
|---------|--------------------------|--------|
| Hand visibility | Cards stored on-chain (cheatable) | Only a hash stored — cards invisible |
| Move validation | Contract sees everything | Contract validates without seeing hand |
| Cheat prevention | Trust-based | Mathematically impossible to cheat |
| Wild Draw 4 rule | Unenforceable | Cryptographically enforced |

---

## Live Demo

**Frontend:** `http://localhost:3002` (run locally — see [Running Locally](#running-locally))

**Network:** Stellar Testnet (`Test SDF Network ; September 2015`)

**Testnet Friendbot:** [https://friendbot.stellar.org](https://friendbot.stellar.org) — fund wallets for free

---

## Deployed Contracts

All contracts are live on **Stellar Testnet**:

| Contract | Address | Purpose |
|----------|---------|---------|
| **ZK-UNO Game** | `CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE` | Core game logic |
| **RISC Zero Router** | `CBD3SXLNTFXFP44YSCIPFMCY3DYLYAQ43BXK7IE7SGR5ZL4JVRQTOXFH` | Routes proof verification |
| **Groth16 Verifier** | `CDPYUZG24HLDN7GJRKIQLN6L4PFDPWKU44TNYRF24WR2YWLN2KWTQUNN` | Verifies ZK seals on-chain |
| **Mock Game Hub** | `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG` | Lifecycle: `start_game` / `end_game` |

> ⚠️ The testnet verifier accepts **mock seals** (no GPU required). See [Prover Server](#prover-server) for details.

---

## Repository Structure

```
Stellar-Game-Studio/
│
├── zk-uno-nextjs/                   ← Next.js 14 frontend (main UI)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             ← Home page — wallet gate + lobby
│   │   │   └── game/[sessionId]/
│   │   │       └── page.tsx         ← In-game page
│   │   ├── components/
│   │   │   ├── Lobby.tsx            ← Create/Join room, multi-sig flow
│   │   │   ├── GameBoard.tsx        ← Main game UI
│   │   │   ├── Hand.tsx             ← Player hand renderer
│   │   │   ├── DiscardPile.tsx      ← Top card + active colour
│   │   │   ├── Card.tsx             ← Single card component
│   │   │   └── WalletButton.tsx     ← Stellar wallet connector
│   │   ├── hooks/
│   │   │   ├── useWallet.ts         ← Zustand wallet store + getSigner()
│   │   │   └── useGame.ts           ← All game logic (poll, commit, play, draw, uno)
│   │   └── lib/
│   │       ├── config.ts            ← Contract IDs, RPC URL, env vars
│   │       ├── bindings.ts          ← Auto-generated Soroban contract client
│   │       ├── zkUnoService.ts      ← ZK proof generation + all on-chain calls
│   │       └── ledgerUtils.ts       ← Auth TTL helpers
│   ├── .env.local                   ← Local env overrides (gitignored)
│   ├── next.config.js               ← Webpack polyfills for stellar-sdk
│   └── package.json
│
├── contracts/
│   └── zk-uno/
│       └── src/
│           ├── lib.rs               ← Smart contract (all game logic, ~700 lines)
│           └── test.rs              ← 11 unit tests
│
├── zk-uno-guest/                    ← RISC Zero ZK guest programs (RISC-V)
│   └── src/
│       ├── main.rs                  ← Guest: commit_hand proof
│       ├── move_main.rs             ← Guest: play_card proof
│       ├── draw_main.rs             ← Guest: draw_card proof
│       └── uno_main.rs              ← Guest: declare_uno proof
│
├── scripts/
│   └── prover-server/
│       └── src/main.rs              ← Local HTTP prover server (Rust/Axum)
│
├── bindings/
│   └── zk_uno/src/index.ts         ← Auto-generated TypeScript contract bindings
│
├── ZK_UNO_DEVELOPMENT.md           ← Full technical development log
└── AGENTS.md                       ← AI agent guide for this repo
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Player's Browser                          │
│                                                                    │
│   Lobby.tsx / GameBoard.tsx                                        │
│        │                                                           │
│        ▼                                                           │
│   useGame.ts (hook)  ──►  zkUnoService.ts                         │
│        │                       │                                   │
│        │                       ├── callProver()  ──►  localhost:3001│
│        │                       │   (optional ZK prover server)     │
│        │                       │                                   │
│        │                       └── buildMockSeal()                 │
│        │                           (browser fallback)              │
│        ▼                                                           │
│   Stellar Wallets Kit  ──►  signTransaction() / signAuthEntry()   │
└──────────────────────────────┬───────────────────────────────────┘
                               │  Signed Soroban transaction
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Stellar Testnet                             │
│                                                                    │
│  ZK-UNO Contract                                                   │
│    ├── start_game()    ──►  Mock Game Hub (lifecycle events)       │
│    ├── commit_hand_zk() ─►  RISC Zero Router  ──►  Verifier       │
│    ├── play_card_zk()  ──►  RISC Zero Router  ──►  Verifier       │
│    ├── draw_card_zk()  ──►  RISC Zero Router  ──►  Verifier       │
│    └── declare_uno_zk() ─►  RISC Zero Router  ──►  Verifier       │
│                                                                    │
│  Game state stored in temporary storage (30-day TTL)              │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow for a Card Play

```
1. Player clicks a card in Hand.tsx
2. useGame.ts → zkUnoService.playCardZk()
3. zkUnoService builds the MOVE journal (74 bytes):
     [session_id | old_hand_hash | new_hand_hash | card | flags]
4. Tries prover server POST /prove/move → gets seal
   (if offline: computes mock ReceiptClaim seal locally in browser)
5. Submits Soroban tx: play_card_zk(session_id, player, colour, value, ...)
6. Contract calls RISC Zero Router → verifies seal against journal SHA-256
7. On success: updates top card, hand hash, turn, active colour on-chain
8. useGame.ts polls getGame() every 4s → UI updates
```

---

## ZK Proof System

The game uses **4 separate ZK guest programs**, each compiled to a RISC-V ELF and identified by an `IMAGE_ID` embedded in the smart contract.

### IMAGE IDs (embedded in contract)

| Program | IMAGE_ID |
|---------|---------|
| Commit Hand | `b72164479...3c08` |
| Play Card | `0184e75261...c962` |
| Draw Card | `caa5c9752b...7067` |
| Declare UNO | `f3158127cf...b373` |

---

### 1. Commit Hand — `commit_hand_zk`

**What it proves:** "I have 7 valid UNO cards dealt from the shared deterministic deck."

**Private inputs (never leave the browser):**
- `hand_bytes` — 14 bytes (7 cards × 2 bytes each)
- `salt` — 32 random bytes chosen at game start

**Journal output (36 bytes — public, goes on-chain):**
```
[0..4]   session_id        (u32 big-endian)
[4..36]  keccak256(hand_bytes || salt)   ← the "hand commitment"
```

**Contract stores:** `hand_hash_p1` or `hand_hash_p2`

---

### 2. Play Card — `play_card_zk`

**What it proves:** "I had this card in my committed hand, and I'm legally allowed to play it."

**Private inputs:**
- `old_hand` — full hand before playing (never on-chain)
- `old_salt` — current salt
- `new_hand` — hand after removing the played card
- `new_salt` — fresh random salt (rotated every move)

**Journal output (74 bytes):**
```
[0..4]   session_id
[4..36]  old_hand_hash    ← must match on-chain value
[36..68] new_hand_hash    ← stored on-chain after verification
[68]     played_colour
[69]     played_value
[70]     wild_colour       ← chosen colour when playing Wild/+4
[71]     active_colour     ← game's current colour (for +4 legality)
[72]     is_winner         ← 1 if new hand is empty
[73]     is_uno            ← 1 if new hand has exactly 1 card
```

**Special: Wild Draw 4 legality** — the guest program cryptographically proves the player has NO card matching the active colour, making illegal +4 plays mathematically impossible.

---

### 3. Draw Card — `draw_card_zk`

**What it proves:** "I drew the correct card from the deterministic deck."

**Private inputs:** old hand, old salt, new hand (with drawn card appended), new salt

**Journal output (72 bytes):**
```
[0..4]   session_id
[4..36]  old_hand_hash
[36..68] new_hand_hash
[68..72] draw_count        ← which position in deck was drawn
```

The drawn card is `derive_card(session_id, draw_count)` — deterministic from the session ID alone, making deck manipulation impossible.

---

### 4. Declare UNO — `declare_uno_zk`

**What it proves:** "I genuinely have exactly 1 card remaining."

**Private inputs:** the single remaining card + salt

**Journal output (36 bytes):**
```
[0..4]   session_id
[4..36]  hand_hash          ← must match on-chain hand_hash
```

The contract requires this to be called before the final card play to prevent UNO-sneaking.

---

### Mock Seal Format

When the prover server is offline, the browser computes a 36-byte **mock seal** using the ReceiptClaim digest formula:

```
seal = selector[4] || sha256(TAG_CLAIM || zeros32 || imageId || POST_STATE_HALTED || outputDigest || suffix)[32]
```

This is accepted by the testnet contract which uses the **mock verifier** (not the real Groth16 verifier). The computation is logged in full detail to the browser console.

---

## Multi-Sig Game Start

`start_game` requires **both players to authorize** spending their points. This is handled with a multi-sig pattern:

```
1. Player 1 (Create):
   ─ Simulates start_game with neutral fee-source address
   ─ Extracts P1's auth entry from simulation
   ─ Signs P1's auth entry with signAuthEntry()
   ─ Encodes: { sessionId, player1, authXdr, simDataXdr, simAuthP2Xdr, minResourceFee }
   ─ Base64-encodes this as the "invite code"

2. Player 2 (Join):
   ─ Decodes the invite code
   ─ Reconstructs the transaction using P1's simulation footprint (same nonce!)
   ─ Injects P1's signed auth entry + P2's SourceAccount auth
   ─ Signs the full transaction envelope
   ─ Submits to network — game starts on-chain
```

**Why use P1's simulation footprint?** Soroban auth entries are bound to a specific nonce. If P2 re-simulated the transaction, a different nonce would be generated, causing `"nonce outside of footprint"` errors. The invite bundle includes `simDataXdr` (the original SorobanTransactionData) so P2 uses exactly the footprint P1 signed against.

---

## Smart Contract Reference

### `start_game`
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
Requires auth from both players. Calls `game_hub.start_game()`. Initializes game state in temporary storage with 30-day TTL.

### `commit_hand_zk`
```rust
fn commit_hand_zk(
    env: Env,
    session_id: u32,
    player: Address,
    hand_hash: Bytes,   // keccak256 commitment
    zk_seal: Bytes,     // 36-byte seal
)
```
Verifies the ZK seal, stores `hand_hash` for the player. Both players must commit before play begins.

### `play_card_zk`
```rust
fn play_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    played_colour: u32,
    played_value: u32,
    wild_colour: u32,
    new_hand_hash: Bytes,
    zk_seal: Bytes,
    is_winner: bool,
    is_uno: bool,
)
```
Verifies the move proof. Updates top card, active colour, hand hash. If `is_winner`, calls `game_hub.end_game()`.

### `draw_card_zk`
```rust
fn draw_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    new_hand_hash: Bytes,
    zk_seal: Bytes,
)
```
Verifies the draw proof. Increments `draw_count`, updates hand hash. Passes the turn.

### `declare_uno_zk`
```rust
fn declare_uno_zk(
    env: Env,
    session_id: u32,
    player: Address,
    zk_seal: Bytes,
)
```
Verifies the player has exactly 1 card. Sets `uno_declared_p1` or `uno_declared_p2`.

### `get_game`
```rust
fn get_game(env: Env, session_id: u32) -> Game
```
Returns the full `Game` struct for UI polling.

---

## Frontend (Next.js)

### Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| Next.js | 14.2.29 | App Router, SSR, routing |
| React | 18.3.1 | UI components |
| Tailwind CSS | 3.4.17 | Styling |
| Zustand | 5.0.3 | Wallet state management |
| `@stellar/stellar-sdk` | 13.1.0 | Soroban transactions + XDR |
| `@noble/hashes` | 1.7.2 | keccak256 for hand commitments |
| `@jsr/creit-tech__stellar-wallets-kit` | 2.0.0-beta.9 | Wallet connector (Freighter, xBull, etc.) |

### Key Files

#### `src/lib/zkUnoService.ts`
The central service class. Handles:
- `prepareStartGame()` — P1 signs auth entry
- `completeStartGame()` — P2 submits transaction
- `commitHandZk()` — generate commit proof + submit tx
- `playCardZk()` — generate move proof + submit tx
- `drawCardZk()` — generate draw proof + submit tx
- `declareUnoZk()` — generate UNO proof + submit tx
- `getGame()` — fetch current game state

Every ZK operation logs detailed output to the browser console in purple/green.

#### `src/hooks/useGame.ts`
React hook encapsulating all game state:
```typescript
const {
  game,           // on-chain Game struct
  myHand,         // Card[] (local, never sent on-chain)
  isMyTurn,       // boolean
  handCommitted,  // boolean
  commitHand,     // () => Promise<void>
  playCard,       // (card, wildColour?) => Promise<void>
  drawCard,       // () => Promise<void>
  declareUno,     // () => Promise<void>
  loading,        // string | null — e.g. "Committing hand..."
  error,          // string | null
} = useGame(sessionId, address, signer);
```

Polls `getGame()` every 4 seconds. Handles turn enforcement, hand initialization, and error humanization.

#### `src/components/Lobby.tsx`
- **Create tab:** Calls `prepareStartGame()` → encodes invite bundle as base64 → displays invite code
- **Join tab:** Decodes invite bundle → calls `completeStartGame()` → redirects to `/game/[sessionId]`

---

## Prover Server

Located at `scripts/prover-server/src/main.rs`. An Axum HTTP server that:

1. Receives private ZK inputs via POST
2. Runs the RISC Zero zkVM executor with the guest ELF
3. Returns a seal + journal

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check → `"ok"` |
| `POST` | `/prove/commit` | Prove initial 7-card hand |
| `POST` | `/prove/move` | Prove card play |
| `POST` | `/prove/draw` | Prove card draw |
| `POST` | `/prove/uno` | Prove 1-card UNO declaration |

### Request Example (`/prove/commit`)
```json
{
  "hand_bytes": [0, 3, 1, 5, 2, 9, 3, 2, 0, 7, 1, 11, 2, 12],
  "salt": [44, 18, 200, ...],
  "session_id": 340696,
  "hand_hash": "a3f1c2..."
}
```

### Response
```json
{
  "seal": "73c457ba9f44ee...",
  "journal": "00053288...",
  "is_mock": true
}
```

### Mock vs Real Seals

| Mode | How to activate | Seal type | Accepted by contract |
|------|----------------|-----------|---------------------|
| **Browser mock** | Always (prover offline) | 36-byte ReceiptClaim digest | ✅ Testnet mock verifier |
| **Server mock** | `cargo run` (no GPU needed) | Same 36-byte format | ✅ Testnet mock verifier |
| **Real Groth16** | Requires NVIDIA GPU or Boundless | 256-byte proof | ✅ Production verifier |

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ or [Bun](https://bun.sh/) v1.3+
- [npm](https://www.npmjs.com/) v9+
- A Stellar-compatible wallet: [Freighter](https://www.freighter.app/) or [xBull](https://xbull.app/)
- Testnet XLM: [https://friendbot.stellar.org/?addr=YOUR_ADDRESS](https://friendbot.stellar.org/)

### Step 1 — Clone & install

```bash
git clone https://github.com/Suganthan96/Stellar-Game-Studio.git
cd Stellar-Game-Studio/zk-uno-nextjs
npm install
```

### Step 2 — Configure environment

Create `.env.local` in `zk-uno-nextjs/`:

```bash
# All values have safe defaults — this file is optional
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_ZK_UNO_CONTRACT_ID=CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE
NEXT_PUBLIC_MOCK_GAME_HUB_CONTRACT_ID=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NEXT_PUBLIC_PROVER_URL=http://localhost:3001
```

### Step 3 — Start the frontend

```bash
npm run dev
# Starts on http://localhost:3002
```

### Step 4 — (Optional) Start the prover server

The game works without it — falls back to browser mock seals. To use server-side proof generation:

```bash
cd ../scripts/prover-server
cargo run --release
# Listens on http://localhost:3001
```

> **Note:** The prover server requires the guest ELFs to be built first:
> ```bash
> # Requires RISC Zero toolchain (rzup install)
> cd ../../zk-uno-guest
> cargo +risc0 risczero build
> ```

---

## Playing a Game

You need **two browser windows** (or two different browsers) with different wallets.

### Window 1 — Player 1 (Create)

1. Open `http://localhost:3002`
2. Click **Connect Wallet** → connect your wallet
3. Fund with testnet XLM via [Friendbot](https://friendbot.stellar.org/)
4. Click **Create Game**
5. Wait for wallet popup → **Approve** (signs P1's auth entry)
6. Copy the **invite code** shown on screen

### Window 2 — Player 2 (Join)

1. Open `http://localhost:3002` in a second window/browser
2. Connect a **different wallet**
3. Paste the invite code into **Join Game**
4. Click **Join** → wallet popup → **Approve** (submits the transaction)
5. Both players are now in-game at `/game/[sessionId]`

### In-Game

1. **Both players:** Click **"Commit My Hand"** → approve wallet popup
   - This submits a ZK proof that you have 7 valid cards
   - Check the browser console to see the full ZK proof construction log
2. **Active player:** Click a highlighted card to play it (or **"Draw Card"**)
3. When you have 1 card left: click **"Declare UNO"** before playing
4. Play your last card with `is_winner: true` → game ends on-chain

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Stellar RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network identifier |
| `NEXT_PUBLIC_ZK_UNO_CONTRACT_ID` | `CDWRYMMESDY3...RUTGYE` | ZK-UNO game contract |
| `NEXT_PUBLIC_MOCK_GAME_HUB_CONTRACT_ID` | `CB4VZAT2U3...EMYG` | Game Hub contract |
| `NEXT_PUBLIC_PROVER_URL` | `http://localhost:3001` | ZK prover server URL |
| `NEXT_PUBLIC_DEV_ADMIN_ADDRESS` | `GBUZBZ7...LS` | Neutral simulation fee-source |

---

## Card Encoding

Cards are encoded as **2 bytes per card**: `[colour, value]`

### Colours
| Code | Colour |
|------|--------|
| `0` | Red |
| `1` | Yellow |
| `2` | Green |
| `3` | Blue |
| `4` | Wild |

### Values
| Code | Card |
|------|------|
| `0–9` | Number cards |
| `10` | Skip |
| `11` | Reverse |
| `12` | Draw Two (+2) |
| `13` | Wild (colour = 4 only) |
| `14` | Wild Draw Four (+4, colour = 4 only) |

### Deterministic Deck
Cards are derived deterministically:
```typescript
deriveCard(sessionId, index) → Card
// Uses keccak256(sessionId || index) as entropy
// Player 1 gets indices 0–6, Player 2 gets indices 7–13
// Top card = index 14
// Draw pile = indices 15+
```

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| **ZK proofs for all moves** | Hand contents never exposed on-chain — mathematically private |
| **Deterministic deck via session ID** | No oracle, no timestamp manipulation, both parties agree on deck order |
| **keccak256 for hand commitments** | Same hash used in ZK guest (via `tiny-keccak`) and frontend (via `@noble/hashes`) |
| **Mock seal fallback in browser** | Playable on testnet without running a prover server or owning a GPU |
| **Multi-sig via pre-signed auth** | Both players authorize point spending without needing to be online simultaneously |
| **Simulation footprint preserved in invite** | Prevents nonce mismatch errors when P2 completes the transaction |
| **Temporary storage + 30-day TTL** | Efficient testnet storage, auto-cleans abandoned games |
| **Game Hub for lifecycle** | Standardizes scoring/leaderboard across all Stellar Game Studio games |
| **Session ID as u32** | Compact storage key, human-readable as a 6-digit room code |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `UnreachableCodeReached` in `start_game` | Player 1 and Player 2 are the same address | Use two different wallets |
| `GameNotFound` | Wrong session ID pasted | Copy the full invite code from Player 1 |
| `ZkVerifierNotSet` | RISC Zero verifier not configured on contract | Contact admin to run `set_risc0_verifier` |
| `NotYourTurn` | Wrong wallet active | Switch to the correct player's wallet |
| `HandAlreadyCommitted` | `commit_hand_zk` called twice for same player | Refresh the page |
| `nonce outside of footprint` | Invite code expired or tampered | Player 1 must re-create the game |
| `Invalid auth entry` | Auth entry expired (TTL = 60 minutes) | Player 1 must re-create the game |
| Wallet popup doesn't appear | Wallet extension not installed | Install [Freighter](https://www.freighter.app/) |
| `Bad union switch` error in console | XDR parse error on void return (harmless) | Transaction succeeded — ignore |

---

## Testing

Run the smart contract tests (requires Rust + WSL on Windows):

```bash
# From repo root in WSL/Linux/macOS:
cargo test -p zk-uno -- --nocapture
```

### Test Coverage (11 tests)

| Test | What it covers |
|------|---------------|
| `test_start_game` | Basic game creation |
| `test_self_play_rejected` | Cannot play against yourself |
| `test_session_collision` | Cannot reuse a session ID |
| `test_commit_hand_zk` | Valid hand commitment with mock seal |
| `test_commit_hand_invalid_seal` | Rejects tampered seal |
| `test_play_card_zk` | Card play with valid proof |
| `test_not_your_turn` | Turn enforcement |
| `test_draw_card_zk` | Draw card flow |
| `test_declare_uno_zk` | UNO declaration |
| `test_finalize_win_timeout` | Win by opponent timeout |
| `test_full_game` | End-to-end game with winner detection |

---

## Redeploying Contracts

```bash
# 1. Build the Soroban WASM (requires WSL/Linux)
cargo build --target wasm32v1-none --release -p zk-uno

# 2. Deploy to testnet
bun run deploy zk-uno

# 3. Regenerate TypeScript bindings
bun run bindings zk-uno

# 4. Copy new bindings into frontend
cp bindings/zk_uno/src/index.ts zk-uno-nextjs/src/lib/bindings.ts

# 5. Update contract ID in .env.local
NEXT_PUBLIC_ZK_UNO_CONTRACT_ID=<new contract address>
```

---

## Console Logging Guide

ZK-UNO logs every proof step to the browser console in color-coded groups. To see them:

1. Open DevTools → **Console** tab
2. Play a card or commit your hand
3. Look for purple `[ZK-UNO PROOF]` groups:

```
[ZK-UNO] 🎴 playCardZk
  session_id    : 340696
  played_card   : Red 7
  old_hand_hash : a3f1c2d9...
  new_hand_hash : 7b44e801...
  is_winner     : false   is_uno: false

[ZK-UNO] 🌐 Calling prover server... http://localhost:3001/prove/move
[ZK-UNO] ⚠️  Prover server unreachable — falling back to browser mock seal

[ZK-UNO] 🔐 Building Mock ZK Seal (ReceiptClaim digest)
  📌 ImageID      : 0184e752...
  📌 JournalSHA256: 7f3a91...
  🔷 Step 1 — Output.digest : ab12cd...
  🔷 Step 2 — ReceiptClaim.digest : 9f44ee...
  ✅ Step 3 — Final Seal (36 bytes): 73c457ba9f44ee...
  📦 Seal size: 36 bytes — accepted by testnet mock verifier

  📡 Submitting play_card_zk transaction...
  ✅ play_card_zk tx result: { ... }
```

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Links

- [Stellar Developers](https://developers.stellar.org/)
- [Soroban Contract SDK](https://docs.rs/soroban-sdk/)
- [RISC Zero Documentation](https://dev.risczero.com/)
- [NethermindEth Stellar RISC Zero Verifier](https://github.com/NethermindEth/stellar-risc0-verifier)
- [Stellar Wallets Kit](https://github.com/creit-tech/stellar-wallets-kit)
- [Freighter Wallet](https://www.freighter.app/)

---

*Built for the Stellar Hackathon 2026 · Deadline: February 23, 2026*


> A two-player UNO card game where every hand is secret and every move is cryptographically proven.  
> Built with **Soroban smart contracts** + **RISC Zero zero-knowledge proofs** on the Stellar testnet.

---

## What is ZK-UNO?

ZK-UNO is a fully on-chain card game. The twist: **nobody can see your cards** — not your opponent, not the blockchain, not even the contract. Yet the contract can still verify that every move you make is legal.

This is possible through **Zero-Knowledge Proofs (ZK proofs)**. When you play a card, you submit a mathematical proof that says *"I have this card in my hand"* without revealing the rest of your hand.

---

## How It Works (Simple Version)

```
1. Game starts      → Both players lock in their points on-chain
2. Commit hand      → Each player proves they have 7 valid cards (ZK proof)
3. Play cards       → Each move submits a ZK proof: "I held this card"
4. Draw a card      → ZK proof: "I drew legitimately from the deck"
5. Declare UNO      → ZK proof: "I only have 1 card left"
6. Win              → Play last card with is_winner=true → game ends on-chain
```

The blockchain never sees your actual cards — only commitments (hashes) and proofs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Player's Browser                      │
│                                                              │
│  ZkUnoGame.tsx  ──► zkUnoService.ts  ──► Prover Server      │
│     (UI)              (business         (generates ZK        │
│                        logic)            proof locally)      │
└───────────────────────────────┬─────────────────────────────┘
                                │  Stellar transaction
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                     Stellar Testnet                          │
│                                                              │
│  ZK-UNO Contract   ──► RISC Zero Router  ──► Groth16        │
│  (game logic)           (proof routing)       Verifier      │
│                                                              │
│  Mock Game Hub (lifecycle: start_game / end_game)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployed Contracts (Testnet)

| Contract | Address |
|---|---|
| ZK-UNO Game | `CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE` |
| RISC Zero Router | `CBD3SXLNTFXFP44YSCIPFMCY3DYLYAQ43BXK7IE7SGR5ZL4JVRQTOXFH` |
| Groth16 Verifier | `CDPYUZG24HLDN7GJRKIQLN6L4PFDPWKU44TNYRF24WR2YWLN2KWTQUNN` |
| Mock Game Hub | `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG` |

---

## ZK Proof System — Deep Dive

The game uses **4 separate ZK programs** (guest binaries), each compiled to RISC-V ELF and identified by their IMAGE_ID hash embedded in the contract.

### 1. Commit Hand (`ZK_UNO_IMAGE_ID`)

**Purpose:** Prove you have 7 valid cards dealt from the shared deck.

**Private inputs:**
- Your 7 cards (hand bytes)
- A random salt (32 bytes)

**Journal output (36 bytes):**
```
session_id (4 bytes big-endian) || keccak256(hand_bytes || salt) (32 bytes)
```

**What the contract checks:**
- `journal[0..4]` matches the session ID
- `journal[4..36]` is stored as `hand_hash_p1` or `hand_hash_p2`

---

### 2. Play Card (`ZK_UNO_MOVE_IMAGE_ID`)

**Purpose:** Prove you played a legal card from your hand.

**Private inputs:**
- Old hand (before playing)
- Old salt
- Card played (colour + value)
- New salt
- Is winner flag
- Is UNO flag

**Journal output (74 bytes):**
```
session_id (4)
old_hand_hash (32)
new_hand_hash (32)
colour (1)
value (1)
is_winner (1)
is_uno (1)
top_of_discard_colour (1)
top_of_discard_value (1)
```

**What the contract checks:**
- Old hash matches what's stored on-chain for the player
- Card colour/value matches the top of the discard pile (or is wild)
- New hash is stored for next turn

---

### 3. Draw Card (`ZK_UNO_DRAW_IMAGE_ID`)

**Purpose:** Prove you drew a legitimate card from the deck.

**Private inputs:**
- Current hand
- Current salt
- Drawn card (from deterministic deck)
- New salt

**Journal output (72 bytes):**
```
session_id (4)
old_hand_hash (32)
new_hand_hash (32)
drawn_card_colour (1)
drawn_card_value (1)
draw_count (2)
```

**What the contract checks:**
- Old hash matches on-chain
- Drawn card matches `derive_card(session_id, draw_count)` (deterministic — no cheating possible)

---

### 4. Declare UNO (`ZK_UNO_UNO_IMAGE_ID`)

**Purpose:** Prove you genuinely have only 1 card remaining.

**Private inputs:**
- Your remaining 1-card hand
- Salt

**Journal output (36 bytes):**
```
session_id (4) || hand_hash (32)
```

**What the contract checks:**
- The journal hash matches the stored `hand_hash` for the calling player
- This confirms they have exactly 1 card before their final play

---

## Deterministic Deck

Cards are derived deterministically using the contract's `derive_card` function:

```rust
pub fn derive_card(env: &Env, session_id: u32, card_index: u32) -> (u32, u32) {
    // Uses env.prng() seeded with session_id + card_index
    // Returns (colour, value)
}
```

This means both the contract and the client can independently compute what card is at position `N` in the deck — no oracle needed, no randomness cheating possible.

---

## Smart Contract Functions

| Function | Caller | Description |
|---|---|---|
| `__constructor(admin, game_hub)` | Deploy | Sets admin and Game Hub address |
| `start_game(session_id, p1, p2, p1_pts, p2_pts)` | Player 2 | Starts game, requires both player auth |
| `commit_hand_zk(session_id, seal, journal)` | Each player | Commits hand via ZK proof |
| `play_card_zk(session_id, seal, journal)` | Active player | Plays a card via ZK proof |
| `draw_card_zk(session_id, seal, journal)` | Active player | Draws a card via ZK proof |
| `declare_uno_zk(session_id, seal, journal)` | Active player | Declares UNO (1 card left) via ZK proof |
| `get_game(session_id)` | Anyone | Returns full game state |
| `set_risc0_verifier(verifier)` | Admin | Sets the RISC Zero router address |
| `finalize_win(session_id)` | Winner | Finalizes winner if opponent timed out |

---

## Card System

| Colour | Value | Code |
|---|---|---|
| Red | 0–9, Skip, Reverse, +2 | colours 0–3 |
| Green | 0–9, Skip, Reverse, +2 | values 0–12 |
| Blue | 0–9, Skip, Reverse, +2 | Wild = 13 |
| Yellow | 0–9, Skip, Reverse, +2 | Wild+4 = 14 |

54 total cards (standard UNO deck minus duplicates for the 2-player format).

---

## Project Structure

```
Stellar-Game-Studio/
├── contracts/
│   └── zk-uno/
│       └── src/
│           ├── lib.rs          ← Smart contract (all game logic)
│           └── test.rs         ← 11 unit tests
├── zk-uno-guest/
│   └── src/
│       ├── main.rs             ← Guest: commit hand proof
│       ├── move_main.rs        ← Guest: play card proof
│       ├── draw_main.rs        ← Guest: draw card proof
│       └── uno_main.rs         ← Guest: declare UNO proof
├── scripts/
│   └── prover-server/
│       └── src/main.rs         ← Local HTTP prover (axum)
├── bindings/
│   └── zk_uno/src/index.ts    ← Auto-generated TypeScript bindings
├── sgs_frontend/
│   └── src/games/zk-uno/
│       ├── ZkUnoGame.tsx       ← Game UI component
│       └── zkUnoService.ts     ← All on-chain interactions
└── zk-uno-frontend/            ← Standalone version of the frontend
```

---

## Running Locally

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Rust + Cargo](https://rustup.rs/)
- WSL (on Windows) or Linux/macOS

### 1. Install dependencies

```bash
git clone https://github.com/jamesbachini/Stellar-Game-Studio
cd Stellar-Game-Studio
bun install
cd sgs_frontend && bun install
```

### 2. Start the frontend

```bash
cd sgs_frontend
bun run dev
```

Open `http://localhost:3000` — ZK-UNO is in the Games Library.

### 3. (Optional) Start the prover server

The game works without it (falls back to mock proofs). To use real proofs:

```bash
cd scripts/prover-server
cargo run --release
```

The prover listens on `http://localhost:3001` with endpoints:
- `POST /prove/commit` — generate commit hand proof
- `POST /prove/move` — generate play card proof
- `POST /prove/draw` — generate draw card proof
- `POST /prove/uno` — generate declare UNO proof

---

## Playing a Game (Two Windows)

**Window 1 — Player 1:**
1. Open `http://localhost:3000` → Games Library → ZK-UNO
2. Select **"🎮 I'm Player 1 — Create"** tab
3. Enter Player 2's address: `GCVG6IQPUAKT56F7XEG2T63ECVECMIZTZOWCSHNJ2YXPNN22IMJ5BQWY`
4. Click **"Create Game"** → copy the Session ID and Auth XDR

**Window 2 — Player 2:**
1. Open `http://localhost:3000` → Games Library → ZK-UNO
2. Click **"Switch to Player 2"** in the top bar
3. Select **"🔗 I'm Player 2 — Join"** tab
4. Paste the Session ID and XDR from Window 1
5. Click **"Join Game"**

**Both windows:**
- Each player clicks **"Commit My Hand"** (submits ZK proof of 7 cards)
- Players take turns clicking cards to play or **"Draw Card"**
- When 1 card remains: click **"Declare UNO"** then play the final card

---

## Running Contract Tests

```bash
# All 11 ZK-UNO tests
wsl bash -c "cd /mnt/d/Projects/Stellar-Game-Studio && cargo test -p zk-uno"
```

Tests cover:
- `start_game` lifecycle
- `commit_hand_zk` with valid/invalid proofs
- `play_card_zk` turn enforcement
- `draw_card_zk` deck derivation
- `declare_uno_zk` with and without verifier set
- Self-play rejection
- Session collision rejection

---

## Re-deploying

```bash
# Rebuild WASM
wsl bash -c "cd /mnt/d/Projects/Stellar-Game-Studio && /home/rohit/.cargo/bin/cargo build --target wasm32v1-none --release -p zk-uno"

# Deploy to testnet
bun run deploy zk-uno

# Regenerate TypeScript bindings
bun run bindings zk-uno

# Re-wire verifier
bun run scripts/setup-verifier.ts
```

---

## Environment Variables

Managed in `.env` (auto-generated by `bun run setup`):

```bash
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_ZK_UNO_CONTRACT_ID=CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE
VITE_GROTH16_VERIFIER_CONTRACT_ID=CDPYUZG24HLDN7GJRKIQLN6L4PFDPWKU44TNYRF24WR2YWLN2KWTQUNN
VITE_RISC0_ROUTER_CONTRACT_ID=CBD3SXLNTFXFP44YSCIPFMCY3DYLYAQ43BXK7IE7SGR5ZL4JVRQTOXFH
VITE_MOCK_GAME_HUB_CONTRACT_ID=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
VITE_DEV_PLAYER1_ADDRESS=GBEV2ZHVG2AKQ7VR2BLGVIDYYVAMS55AYZ3PLVGCCJCBRTVXH7YWKXXL
VITE_DEV_PLAYER2_ADDRESS=GCVG6IQPUAKT56F7XEG2T63ECVECMIZTZOWCSHNJ2YXPNN22IMJ5BQWY
```

> ⚠️ `.env` also contains secret keys. Never commit it to git.

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| ZK proofs for all moves | Cards never exposed on-chain |
| Deterministic deck via `env.prng()` | No oracle, no timestamp manipulation |
| Mock seal fallback in frontend | Playable without running a prover server |
| Temporary storage + 30-day TTL | Efficient testnet storage, auto-cleans |
| Game Hub for lifecycle | Standardizes scoring across all SGS games |
| Session ID as `u32` | Fits in Soroban's compact storage keys |

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `UnreachableCodeReached` in `start_game` | Player 1 and Player 2 are the same address | Switch wallet before creating |
| `GameNotFound` | Wrong session ID pasted | Copy again from Player 1's screen |
| `ZkVerifierNotSet` | Verifier contract not configured | Run `bun run scripts/setup-verifier.ts` |
| `NotYourTurn` | Wrong wallet connected | Switch to the correct player |
| `HandAlreadyCommitted` | `commit_hand_zk` called twice | Refresh and join the game |

---

## Links

- [Stellar Developers](https://developers.stellar.org/)
- [RISC Zero Documentation](https://dev.risczero.com/)
- [Soroban Contract SDK](https://docs.rs/soroban-sdk/)
- [NethermindEth Stellar RISC Zero Verifier](https://github.com/NethermindEth/stellar-risc0-verifier)

---

## License

MIT — see [LICENSE](./LICENSE)

---

**Built with ❤️ for Stellar developers**
