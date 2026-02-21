# ZK-UNO — Zero-Knowledge UNO on Stellar

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
