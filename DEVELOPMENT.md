# ZK-UNO Development Roadmap

**Hackathon deadline: February 23, 2026**
**Stack: Stellar Â· Soroban Â· RISC Zero Â· Stellar Game Studio**

---

## Architecture Overview

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  Player's Browser                    â”‚
â”‚                                                      â”‚
â”‚  ZkUnoGame.tsx  â”€â”€â–º  zkUnoService.ts                â”‚
â”‚                           â”‚                          â”‚
â”‚                    ZK Proof Builder                  â”‚
â”‚                    (TypeScript, Web Crypto)           â”‚
â”‚                     â”‚                                â”‚
â”‚          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                    â”‚
â”‚      Hand Proof  Move Proof  Draw Proof              â”‚
â”‚      (commit)   (play_card)  (draw_card)             â”‚
â”‚       seal        seal         seal                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚          â”‚          â”‚
           â–¼          â–¼          â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚           Stellar Testnet (Soroban)                  â”‚
â”‚                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚           ZK-UNO Contract                    â”‚    â”‚
â”‚  â”‚                                              â”‚    â”‚
â”‚  â”‚  commit_hand_zk(hand_hash, seal)             â”‚    â”‚
â”‚  â”‚    â””â”€â–º RISC Zero verify â”€â”€â–º store hash       â”‚    â”‚
â”‚  â”‚                                              â”‚    â”‚
â”‚  â”‚  play_card_zk(played_c, played_v,            â”‚    â”‚
â”‚  â”‚              wild_c, new_hash, seal)         â”‚    â”‚
â”‚  â”‚    â””â”€â–º RISC Zero verify â”€â”€â–º update state     â”‚    â”‚
â”‚  â”‚                             (hash, turn,     â”‚    â”‚
â”‚  â”‚                              top card, win)  â”‚    â”‚
â”‚  â”‚                                              â”‚    â”‚
â”‚  â”‚  draw_card_zk(new_hash, seal)                â”‚    â”‚
â”‚  â”‚    â””â”€â–º RISC Zero verify â”€â”€â–º update hash      â”‚    â”‚
â”‚  â”‚                             switch turn      â”‚    â”‚
â”‚  â”‚                                              â”‚    â”‚
â”‚  â”‚  On-chain state (ALWAYS PUBLIC):             â”‚    â”‚
â”‚  â”‚    hand_hash_p1  â† 32 bytes (opaque)         â”‚    â”‚
â”‚  â”‚    hand_hash_p2  â† 32 bytes (opaque)         â”‚    â”‚
â”‚  â”‚    top_colour / top_value / active_colour    â”‚    â”‚
â”‚  â”‚    current_turn / draw_count / winner        â”‚    â”‚
â”‚  â”‚                                              â”‚    â”‚
â”‚  â”‚  NEVER on-chain: cards, hand size, count     â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                 â”‚                                    â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚   RISC Zero Verifier Router                  â”‚    â”‚
â”‚  â”‚   (NethermindEth/stellar-risc0-verifier)     â”‚    â”‚
â”‚  â”‚   verify(seal, image_id, journal_sha256)     â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                 â”‚                                    â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚   Mock Game Hub                              â”‚    â”‚
â”‚  â”‚   CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3Q...       â”‚    â”‚
â”‚  â”‚   start_game() / end_game()                  â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         zk-uno-guest (RISC Zero zkVM â€” off-chain)    â”‚
â”‚                                                      â”‚
â”‚  main.rs       â†’ IMAGE_ID_HAND                       â”‚
â”‚    proves: keccak(hand||salt)==hash, 7 valid cards   â”‚
â”‚    journal: session_id || hand_hash  (36 bytes)      â”‚
â”‚                                                      â”‚
â”‚  move_main.rs  â†’ IMAGE_ID_MOVE                       â”‚
â”‚    proves: cardâˆˆhand, legal play, +4 rule,           â”‚
â”‚            new_hand = oldâˆ’card, new_hash correct,    â”‚
â”‚            is_winner / is_uno from private count     â”‚
â”‚    journal: session_id || old_hash || new_hash ||    â”‚
â”‚             played_c || played_v || wild_c ||        â”‚
â”‚             active_c || is_winner || is_uno (74 b)   â”‚
â”‚                                                      â”‚
â”‚  draw_main.rs  â†’ IMAGE_ID_DRAW                       â”‚
â”‚    proves: drawn = derive_card(session, count),      â”‚
â”‚            new_hand = old ++ drawn, new_hash correct â”‚
â”‚    journal: session_id || old_hash || new_hash ||    â”‚
â”‚             draw_count  (72 bytes)                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## ZK Guarantee Table

Every turn, the player generates a RISC Zero proof off-chain.
The Soroban contract verifies the proof on-chain â€” hand contents and
card count **never appear on-chain**.

| Action | Private (hidden forever) | Public (journal â†’ on-chain) | ZK rule enforced |
|---|---|---|---|
| `commit_hand_zk` | hand_bytes, salt | session_id, hand_hash | 7 valid cards, honest commitment |
| `play_card_zk` | old_hand, old_salt, new_hand, new_salt | old_hash, new_hash, played card, wild_colour, active_colour, is_winner, is_uno | card âˆˆ hand Â· legal play Â· **+4 rule** Â· count decrement |
| `draw_card_zk` | old_hand, old_salt, new_hand, new_salt | old_hash, new_hash, draw_count | drawn card appended honestly |

The opponent only ever sees a changing 32-byte hash and the `is_uno` / `is_winner`
flags the proof commits to. **Hand size is never visible.**

---

## Current State (Feb 20)

| Item | Status |
|---|---|
| `commit_hand_zk` in contract | âœ… Done |
| `play_card` (keccak reveal â€” exposes hand on-chain) | âœ… Exists â€” needs ZK replacement |
| `play_card_zk` in contract | âŒ Not yet |
| `draw_card_zk` in contract | âŒ Not yet |
| `zk-uno-guest/src/main.rs` (hand proof) | âœ… Done |
| `zk-uno-guest/src/move_main.rs` (move proof) | âœ… Done |
| `zk-uno-guest/src/draw_main.rs` (draw proof) | âœ… Done |
| `rzup` + guest compiled + real IMAGE_IDs | âŒ Not yet |
| RISC Zero verifier deployed on testnet | âŒ Not yet |
| `set_risc0_verifier` called on deployed contract | âŒ Not yet |
| Frontend using ZK paths | âŒ Not yet |
| 17/17 existing tests passing | âœ… Done |
| Contract deployed | âœ… `CB2FGTH7XYWTEMXSDC2OP67MZ234I53GJOGVFAKBIPIMYHA7G5S6HD3E` |

---

## Day 1 â€” Feb 20 Â· Contract Complete

### Morning: Add `play_card_zk` to `contracts/zk-uno/src/lib.rs`

Hand bytes **never** enter the contract. Signature:

```rust
pub fn play_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    played_colour: u32,
    played_value: u32,
    wild_colour: u32,
    new_hand_hash: BytesN<32>,
    zk_seal: Bytes,
) -> Result<(), Error>
```

Contract steps:
1. `player.require_auth()`
2. Get `old_hand_hash` from stored `game.hand_hash_pN`
3. Build journal preimage (74 bytes):
   `session_id_be32 || old_hash || new_hash || played_colour || played_value || wild_colour || active_colour || is_winner || is_uno`
4. `journal_sha256 = sha256(preimage)`
5. `risc0.verify(seal, MOVE_IMAGE_ID, journal_sha256)`
6. Assert `active_colour_in_journal == game.active_colour` â†’ `ZkActiveColourMismatch`
7. Assert `can_play(played_colour, played_value, active_colour, top_value)` â†’ `InvalidCard`
8. Update `top_colour`, `top_value`, `active_colour`, `hand_hash`, `current_turn`
9. If `is_winner == 1` â†’ `finalize_win()`

### Afternoon: Add `draw_card_zk` to `contracts/zk-uno/src/lib.rs`

```rust
pub fn draw_card_zk(
    env: Env,
    session_id: u32,
    player: Address,
    new_hand_hash: BytesN<32>,
    zk_seal: Bytes,
) -> Result<(), Error>
```

Contract steps:
1. Build journal preimage (72 bytes):
   `session_id_be32 || old_hash || new_hash || draw_count_be32`
2. `risc0.verify(seal, DRAW_IMAGE_ID, journal_sha256)`
3. Assert `draw_count_in_journal == game.draw_count` â†’ `ZkDrawCountMismatch`
4. `game.draw_count += 1`, update hash, switch turn

### Also add to `lib.rs`

- `ZK_UNO_MOVE_IMAGE_ID: [u8; 32]` placeholder constant
- `ZK_UNO_DRAW_IMAGE_ID: [u8; 32]` placeholder constant
- `Error::ZkActiveColourMismatch = 14`
- `Error::ZkDrawCountMismatch = 15`

### Evening: Tests + Build

Add to `contracts/zk-uno/src/test.rs`:
- `test_play_card_zk_success`
- `test_illegal_wilddraw4_zk_rejected`
- `test_draw_card_zk_success`

```bash
cargo test -p zk-uno       # target: all 20+ tests green
bun run build zk-uno       # WASM builds clean
```

---

## Day 2 â€” Feb 21 Â· ZK Toolchain + Deploy

### Morning: Install rzup and compile guests

```bash
# In WSL
curl -L https://risczero.com/install | bash
rzup install
cd zk-uno-guest
cargo +risc0 build               # compiles all three guest binaries
cargo +risc0 risczero build      # prints IMAGE_IDs
```

Copy the three printed IMAGE_IDs into:
- `contracts/zk-uno/src/lib.rs` â†’ `ZK_UNO_IMAGE_ID`, `ZK_UNO_MOVE_IMAGE_ID`, `ZK_UNO_DRAW_IMAGE_ID`
- `sgs_frontend/src/games/zk-uno/zkUnoService.ts` â†’ matching three constants

### Midday: Deploy RISC Zero mock verifier on testnet

```bash
git clone https://github.com/NethermindEth/stellar-risc0-verifier
cd stellar-risc0-verifier
stellar contract deploy \
  --wasm risc0-verifier-mock.wasm \
  --source-account $ADMIN_SECRET \
  --network testnet
```

Configure the ZK-UNO contract with the verifier address:

```bash
stellar contract invoke \
  --id $ZK_UNO_CONTRACT_ID \
  --source-account $ADMIN_SECRET \
  --network testnet \
  -- set_risc0_verifier --verifier <MOCK_VERIFIER_ID>
```

Update `MOCK_RISC0_SELECTOR` in `zkUnoService.ts` with the real 4-byte selector.

### Afternoon: Redeploy + Bindings

```bash
bun run deploy zk-uno
bun run bindings zk-uno
cp bindings/zk_uno/src/index.ts sgs_frontend/src/games/zk-uno/bindings.ts
cd sgs_frontend && bun x tsc --noEmit    # must be 0 errors
```

---

## Day 3 â€” Feb 22 Â· Frontend Complete

### Morning: New service methods in `zkUnoService.ts`

```typescript
// Build and submit a ZK move proof
async playCardZk(
  sessionId,     // u32
  player,        // Stellar address
  oldHand,       // Card[]  â€” private, never leaves browser
  oldSalt,       // Uint8Array(32)
  playedCard,    // Card
  newHand,       // Card[]  â€” private
  newSalt,       // Uint8Array(32)
  wildColour,    // 0â€“3
  activeColour,  // game.active_colour
  signer
)
// Steps:
//   1. newHash     = computeHandHash(newHand, newSalt)
//   2. oldHash     = computeHandHash(oldHand, oldSalt)
//   3. isWinner    = newHand.length === 0
//   4. isUno       = newHand.length === 1
//   5. seal        = buildMoveSeal(sessionId, oldHash, newHash,
//                                  playedCard, wildColour, activeColour,
//                                  isWinner, isUno)
//   6. client.play_card_zk(...)

// Build and submit a ZK draw proof
async drawCardZk(
  sessionId, player, oldHand, oldSalt, newSalt, drawCount, signer
)
// Steps:
//   1. drawnCard   = deriveCard(sessionId, drawCount)
//   2. newHand     = [...oldHand, drawnCard]
//   3. newHash     = computeHandHash(newHand, newSalt)
//   4. seal        = buildDrawSeal(sessionId, oldHash, newHash, drawCount)
//   5. client.draw_card_zk(...)
```

### Afternoon: Wire `ZkUnoGame.tsx`

| Old call | New call | What changes |
|---|---|---|
| `commitHand(hash)` | `commitHandZk(hash, seal)` | Proof of valid 7-card hand |
| `playCard(oldHand, oldSalt, ...)` | `playCardZk(oldHand, oldSalt, ...)` | Hand bytes never sent to chain |
| `drawCard(oldHand, oldSalt, ...)` | `drawCardZk(oldHand, oldSalt, ...)` | Drawn card stays private |

**Opponent panel â€” show only:**
```
Opponent:  [â– â– â– â– â– â– â– ]    â† never a number
           ACTIVE / UNO âœ“ / FINISHED
```

**Your panel** â€” cards in local component state (`localStorage`), never on-chain.

### Evening: Two-browser integration test

```bash
bun run dev:game zk-uno
```

Open two windows, use the built-in wallet switcher:
- [ ] Game starts, both hands committed with ZK proof
- [ ] Normal card play accepted â†’ hash updates
- [ ] Illegal Wild +4 rejected â€” player has matching colour
- [ ] Legal Wild +4 accepted â€” opponent hand count still hidden
- [ ] UNO declared â€” `is_uno` committed on-chain, badge shown
- [ ] Win â†’ `finalize_win()` â†’ `end_game()` called on Game Hub

---

## Day 4 â€” Feb 23 Â· Demo + Submit

| Task | Time |
|---|---|
| Fix last-minute bugs | Morning |
| Record 3â€“5 min demo video | Midday |
| Final `bun x tsc --noEmit` clean run | Midday |
| Submit | Afternoon |

### Demo script

1. **Normal move** â€” player plays a valid card, opponent hash updates, count hidden
2. **Illegal +4** â€” attempt Wild Draw 4 with matching colour â†’ contract rejects on-chain
3. **Legal +4** â€” no matching colour â†’ accepted, opponent draws 4, count stays hidden
4. **UNO** â€” player at 1 card declares UNO, `is_uno` flag committed on-chain
5. **Win** â€” empty hand â†’ `finalize_win()` â†’ `end_game()` called â†’ Game Hub records result

---

## Quick Reference Commands

```bash
# Build contract after changes
bun run build zk-uno

# Deploy to testnet
bun run deploy zk-uno

# Regenerate TypeScript bindings after deploy
bun run bindings zk-uno
cp bindings/zk_uno/src/index.ts sgs_frontend/src/games/zk-uno/bindings.ts

# Run dev frontend with built-in player switcher
bun run dev:game zk-uno

# Run all contract tests
cargo test -p zk-uno

# Type-check frontend
cd sgs_frontend && bun x tsc --noEmit

# Compile ZK guest programs (requires rzup)
cd zk-uno-guest && cargo +risc0 risczero build
```

---

## File Map

```
contracts/zk-uno/src/
  lib.rs          â† commit_hand_zk âœ…  play_card_zk âŒ  draw_card_zk âŒ
  test.rs         â† 17 passing âœ…  + ZK move/draw tests âŒ

zk-uno-guest/src/
  main.rs         â† hand commitment proof âœ…
  move_main.rs    â† move proof (cardâˆˆhand, +4 rule, count) âœ…
  draw_main.rs    â† draw proof (drawn card honest) âœ…

sgs_frontend/src/games/zk-uno/
  ZkUnoGame.tsx   â† UI (needs ZK wiring) âŒ
  zkUnoService.ts â† commitHandZk âœ…  playCardZk âŒ  drawCardZk âŒ
  bindings.ts     â† regenerate after Day 1 deploy âŒ
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `rzup` install fails in WSL | Medium | Mock seal already implemented â€” use for demo, design still demonstrated |
| NethermindEth verifier selector unknown | Low | Read selector from deployed contract; mock router in tests ignores it |
| Gas limit on `play_card_zk` | Medium | Contract is minimal â€” only verify + state update; prover contract is separate |
| Wrong `active_colour` order in journal | Low | `ZkActiveColourMismatch` error surfaces immediately in tests |
| Time overrun | Medium | `declare_uno` keccak fallback already works; ZK for commit/play/draw is the core claim |

