# ZK-UNO Next.js — Architecture & Component Design

## Overview

ZK-UNO is a two-player UNO game running on **Stellar Testnet (Soroban)** with **RISC Zero zero-knowledge proofs**. Hand contents are never revealed on-chain — only cryptographic commitments (keccak256 hashes) and ZK seals are stored. The frontend is a **Next.js 14 App Router** application using Tailwind CSS and Zustand for state.

---

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx              # Root HTML shell, global styles
│   ├── page.tsx                # Home page — wallet gate → Lobby
│   └── game/[sessionId]/
│       └── page.tsx            # Game page — parses sessionId → GameBoard
├── components/
│   ├── WalletButton.tsx        # Mounts StellarWalletsKit button, syncs address to Zustand
│   ├── Lobby.tsx               # Create/Join room UI, multi-sig start_game flow
│   ├── GameBoard.tsx           # Main game UI, delegates all actions to useGame
│   ├── Hand.tsx                # Renders player's cards, marks playable ones
│   ├── DiscardPile.tsx         # Shows top discard card + active wild colour
│   └── Card.tsx                # Single UNO card (face-up or face-down)
├── hooks/
│   ├── useWallet.ts            # Zustand store: address + getSigner()
│   └── useGame.ts              # All game logic: polling, commitHand, playCard, drawCard, declareUno
└── lib/
    ├── config.ts               # Contract IDs, RPC URL, network passphrase
    ├── bindings.ts             # Auto-generated Soroban contract client
    ├── ledgerUtils.ts          # calculateValidUntilLedger(ttlMinutes)
    ├── wallet.ts               # Thin async wrappers around StellarWalletsKit
    └── zkUnoService.ts         # All blockchain + ZK logic (~760 lines)
```

---

## Page Routing

```
/                   → app/page.tsx        → WalletButton + Lobby
/game/[sessionId]   → app/game/.../page.tsx → WalletButton + GameBoard
```

`page.tsx` (home) checks `address` from `useWallet`. If not connected, shows a connect prompt. Once connected, renders `<Lobby />`.

`game/[sessionId]/page.tsx` parses the URL param as a number, validates it, then renders `<GameBoard sessionId={sid} />`. Navigation to this route happens after `completeStartGame` succeeds (P2's join) or after P1 clicks "Go to Game".

---

## Component Tree & Data Flow

```
app/page.tsx
├── <WalletButton />                   # reads/writes useWallet store
└── <Lobby />                          # reads useWallet.address + getSigner()
    └── calls ZkUnoService directly

app/game/[sessionId]/page.tsx
├── <WalletButton />
└── <GameBoard sessionId={n} />
    ├── useWallet()  → address, getSigner()
    ├── useGame()    → game state + actions
    ├── <DiscardPile topColour topValue activeColour />
    ├── <Hand cards selectedCard ... onCardClick />
    │   └── <Card /> × N
    ├── <Card faceDown />  (opponent's hidden hand)
    └── modals: loading overlay, winner overlay, wild colour picker
```

---

## Wallet Layer (`lib/wallet.ts` + `hooks/useWallet.ts`)

### `lib/wallet.ts`
Pure async functions, lazy-import StellarWalletsKit to avoid SSR issues:

| Function | Purpose |
|---|---|
| `initKit()` | Initialises the kit singleton once in browser |
| `mountButton(container)` | Injects the kit's built-in connect button into a DOM element |
| `subscribeToKit(onStateUpdate, onDisconnect)` | Listens to kit events, returns unsubscribe fn |
| `signTransaction(xdr, passphrase, address)` | Signs a tx envelope, returns `signedTxXdr` |
| `signAuthEntry(entryXdr, passphrase, address)` | Signs a Soroban auth entry preimage, returns `signedAuthEntry` |

### `hooks/useWallet.ts`
Zustand store (not a React hook — it's a `create()` store, so usable outside components):

```
WalletState {
  address: string | null
  setAddress(address)     ← called by WalletButton on STATE_UPDATED
  clearAddress()          ← called by WalletButton on DISCONNECT
  getSigner() → WalletSigner | null
}
```

`getSigner()` returns a `WalletSigner` object that lazily imports `lib/wallet.ts` functions:
- `signTransaction` → calls `wallet.signTransaction()`
- `signAuthEntry` → calls `wallet.signAuthEntry()`, wraps errors into `{ signedAuthEntry: '', error }`

### `WalletSigner` Interface
Defined in `zkUnoService.ts`, consumed throughout:

```typescript
interface WalletSigner {
  address: string;
  signTransaction(xdr, opts): Promise<{ signedTxXdr: string }>;
  signAuthEntry?(entryXdr, opts): Promise<{ signedAuthEntry: string; error?: Error }>;
}
```

---

## `WalletButton` Component

- Uses a `ref` + `useEffect` to mount the kit's button into a `<div>` exactly once (`initialisedRef`)
- Subscribes to kit events to keep the Zustand `address` in sync
- Shows a short address badge (`G…XXXX`) alongside the kit button when connected
- Has no props — reads/writes directly to `useWallet` store

---

## `Lobby` Component — Multi-Sig Game Creation Flow

This is the most complex frontend component. It implements a **2-phase multi-signature** protocol to start a game without either player needing to know the other's wallet at tx submission time (P1 signs their auth entry offline, P2 submits).

### Create Room (Player 1)

```
User fills: P2 address, P1 points, P2 points
                    ↓
handleCreate()
  1. getSigner() → WalletSigner
  2. generateSessionId() → random u32
  3. svc.prepareStartGame(sid, p1, p2, p1pts, p2pts, signer)
        ├── Simulate start_game with SIMULATION_SOURCE as fee-source
        │   (ensures both P1 and P2 get Address credentials, not SourceAccount)
        ├── Find P1's SorobanAuthorizationEntry in simulation auth list
        ├── calculateValidUntilLedger(60 min TTL)
        ├── authorizeEntry(p1Entry, callback, validUntil)
        │   callback: wallet.signAuthEntry(preimage XDR) → raw 64-byte sig
        └── Returns: { authXdr, simDataXdr, simAuthP2Xdr, minResourceFee }
  4. Store bundle in state
  5. bundleCode = btoa(JSON.stringify(bundle))  ← shown in textarea
```

P1 shares `bundleCode` (base64 JSON) with P2 out of band.

### Join Room (Player 2)

```
User pastes bundleCode into textarea
                    ↓
handleJoin()
  1. Parse: JSON.parse(atob(joinCode)) → SessionBundle
  2. getSigner() → WalletSigner
  3. svc.completeStartGame(sid, p1, p2Addr, p1pts, p2pts, authXdr,
                            simDataXdr, simAuthP2Xdr, minResourceFee, signer)
        ├── Reconstruct P1 signed entry from authXdr
        ├── Reconstruct P2 auth stub from simAuthP2Xdr
        ├── Reconstruct sorobanData footprint from simDataXdr
        ├── server.getAccount(player2) → sequence number
        ├── Build raw TransactionBuilder with SAME footprint (setSorobanData)
        ├── Inject: P1 Address creds (signed) + P2 SourceAccount creds
        ├── wallet.signTransaction(envelope) → P2 signs envelope
        ├── server.sendTransaction(signedTx)
        └── Poll via raw JSON-RPC (avoids SDK XDR parse error on FAILED txs)
  4. router.push(`/game/${sessionId}`)
```

### `SessionBundle` Shape

```typescript
interface SessionBundle {
  sessionId: number;        // u32 random session ID
  player1: string;          // G... address
  player1Points: string;    // bigint as string (stroops)
  player2Points: string;    // bigint as string (stroops)
  authXdr: string;          // P1's signed SorobanAuthorizationEntry (base64)
  simDataXdr: string;       // SorobanTransactionData footprint from sim (base64)
  simAuthP2Xdr: string;     // P2's unsigned auth stub from sim (base64)
  minResourceFee: string;   // resource fee from simulation
}
```

---

## `useGame` Hook — In-Game State & Actions

Manages all in-game logic. Receives `sessionId`, `address`, and `signer` as params.

### State

| Field | Type | Description |
|---|---|---|
| `game` | `Game \| null` | On-chain game state, polled every 4s |
| `myHand` | `Card[]` | Locally derived hand (never on-chain) |
| `mySalt` | `Uint8Array` | Random 32-byte salt for hand hash |
| `playerIndex` | `0 \| 1 \| null` | Derived from `game.player1 === address` |
| `isMyTurn` | `boolean` | `game.current_turn === playerIndex` |
| `handCommitted` | `boolean` | Whether `commit_hand_zk` succeeded |
| `unoDeclaimed` | `boolean` | Whether `declare_uno_zk` succeeded |
| `loading` | `string \| null` | Loading message string (shown in overlay) |
| `error` | `string \| null` | Human-readable error message |

### Initialisation Flow

```
useEffect [sessionId]
  → poll() every 4s → svc.getGame(sessionId) → setGame(g)
  → if 5 consecutive failures with no game → stop polling, set error

useEffect [sessionId, playerIndex]
  → dealHand(sessionId, playerIndex)  ← deterministic from sessionId
  → randomSalt()
  → setMyHand, setMySalt
```

Cards are dealt **deterministically** from `sessionId` using `keccak256(sessionId_be32 || cardIndex_be32)`. The contract uses the same derivation, so no card distribution is ever transmitted.

### Actions

#### `commitHand()`
```
encodeHand(myHand) → handBytes
computeHandHash(handBytes, mySalt) → keccak256(handBytes || salt)
svc.commitHandZk(sessionId, address, handHash, signer, { handBytes, salt })
  ├── Try callProver('/prove/commit', ...) → real RISC Zero seal
  └── fallback: buildMockSeal(ZK_UNO_IMAGE_ID, sha256(journal))
  → client.commit_hand_zk({ session_id, player, hand_hash, zk_seal })
setHandCommitted(true)
```

#### `playCard(card, wildColour)`
```
newHand = removeCard(myHand, card.colour, card.value)
newSalt = randomSalt()
oldHash = computeHandHash(oldHand, oldSalt)
newHash = computeHandHash(newHand, newSalt)
isWinner = newHand.length === 0
isUno    = newHand.length === 1
svc.playCardZk(...)
  ├── Try callProver('/prove/move', ...) → real seal
  └── fallback: buildMoveSeal(session, oldHash, newHash, played, wild, active, isWinner, isUno)
  → client.play_card_zk({ session_id, player, played_colour, played_value,
                          wild_colour, new_hand_hash, zk_seal, is_winner, is_uno })
setMyHand(newHand); setMySalt(newSalt)
```

#### `drawCard()`
```
drawnCard = deriveCard(sessionId, game.draw_count)  ← same determinism as contract
newHand = [...oldHand, drawnCard]
svc.drawCardZk(...)
  ├── Try callProver('/prove/draw', ...)
  └── fallback: buildDrawSeal(session, oldHash, newHash, drawCount)
  → client.draw_card_zk({ session_id, player, new_hand_hash, zk_seal })
setMyHand(newHand)
```

#### `declareUno()`
```
handHash = computeHandHash(encodeHand(hand), salt)
svc.declareUnoZk(...)
  ├── Try callProver('/prove/uno', ...)
  └── fallback: buildUnoSeal(sessionId, handHash)
  → client.declare_uno_zk({ session_id, player, zk_seal })
setUnoDeclaimed(true)
```

---

## `GameBoard` Component

Receives `sessionId: number`. Calls `useWallet` and `useGame` at the top.

### UI Regions

| Region | Condition | Description |
|---|---|---|
| Loading overlay | `loading !== null` | Full-screen spinner with message string |
| Winner overlay | `game.winner != null` | Shows 🎉 or 😞 + winner address + back button |
| Wild colour picker modal | `showColourPicker` | 2×2 grid of colour buttons |
| Error banner | `error !== null` | Red banner with dismiss button |
| Header | always | Session ID + Your Turn / Opponent's Turn badge |
| Opponent panel | always | 7 face-down cards + committed/awaiting status |
| Draw + Discard | always | `<Card faceDown>` + `<DiscardPile>` |
| My hand | `myHandHash` set | `<Hand>` with `commitHand` / UNO! buttons |

### Card Interaction (double-click pattern)
```
first click  → setSelectedCard(card)           (card lifts up visually)
second click → if wild: setShowColourPicker(true)
             → else: handlePlayCard(card, card.colour)

colour picker → handlePlayCard(selectedCard, chosenColour)
draw pile click → drawCard() (only when isMyTurn)
```

---

## `Hand` Component

- Maps `cards[]` to `<Card>` instances
- Calls `canPlay(card, activeColour, topValue)` for each card to set `playable` prop
- `canPlay` logic: wild always playable; same colour playable; same value (≤ DRAW_TWO) playable
- `onClick` only set when `playable || isSelected` — prevents clicking unplayable cards

---

## `Card` Component

Pure display component. Props:

| Prop | Effect |
|---|---|
| `faceDown` | Renders a `UNO` back instead of colour/value |
| `selected` | `scale-110`, `-translate-y-3`, white border, glow shadow |
| `playable` | `hover:-translate-y-2`, hover border, cursor-pointer |
| `!playable && onClick` | `opacity-50 cursor-not-allowed` |
| `size` | `sm` / `md` / `lg` → different `w-*` / `h-*` classes |

---

## ZK Proof System

### RISC Zero Image IDs
Each action type has a dedicated verifier image ID:

| Action | Constant |
|---|---|
| Commit hand | `ZK_UNO_IMAGE_ID` |
| Play card | `ZK_UNO_MOVE_IMAGE_ID` |
| Draw card | `ZK_UNO_DRAW_IMAGE_ID` |
| Declare UNO | `ZK_UNO_UNO_IMAGE_ID` |

### Prover Flow (with fallback)
```
callProver(endpoint, inputs) → POST http://localhost:3001/prove/...
  if prover running: returns real Groth16 seal (36 bytes: selector + claim digest)
  if prover down:    returns undefined → buildMockSeal() used instead
```

Mock seals reproduce the exact 36-byte structure the contract expects:
`selector(4) || sha256(TAG_CLAIM || zeros || imageId || POST_STATE_HALTED || outputDigest || claimSuffix)(32)`

### Journal Formats (bytes the ZK proof commits to)

| Action | Journal |
|---|---|
| Commit | `sessionId_be32(4) \|\| handHash(32)` = 36 bytes |
| Play | `sessionId(4) \|\| oldHash(32) \|\| newHash(32) \|\| played_colour(1) \|\| played_value(1) \|\| wild_colour(1) \|\| active_colour(1) \|\| is_winner(1) \|\| is_uno(1)` = 74 bytes |
| Draw | `sessionId(4) \|\| oldHash(32) \|\| newHash(32) \|\| draw_count_be32(4)` = 72 bytes |
| UNO | `sessionId_be32(4) \|\| handHash(32)` = 36 bytes |

---

## `ZkUnoService` Class

Single service instance created at module level in `Lobby.tsx` and `useGame.ts`:
```typescript
const svc = new ZkUnoService(ZK_UNO_CONTRACT);
```

### Public Methods

| Method | Called from | Description |
|---|---|---|
| `getGame(sessionId)` | `useGame` (poll) | Read-only, returns `Game \| null` |
| `prepareStartGame(...)` | `Lobby.handleCreate` | P1 signs auth entry, returns bundle |
| `completeStartGame(...)` | `Lobby.handleJoin` | P2 builds+signs+submits tx, polls for confirmation |
| `commitHandZk(...)` | `useGame.commitHand` | Submits hand hash + ZK seal |
| `playCardZk(...)` | `useGame.playCard` | Submits played card proof |
| `drawCardZk(...)` | `useGame.drawCard` | Submits draw proof, returns new card |
| `declareUnoZk(...)` | `useGame.declareUno` | Submits UNO declaration proof |

### `sdkSigner` Adapter
Bridges `WalletSigner` (frontend interface) to what the Stellar SDK expects:
- `signTransaction`: passes through, returns `{ signedTxXdr }`
- `signAuthEntry`: calls wallet, throws on error, returns raw `signedAuthEntry` string

---

## Contract Interface (`bindings.ts`)

The `Game` struct on-chain:

```typescript
interface Game {
  active_colour: u32;       // current active colour (may differ from top card after Wild)
  current_turn: u32;        // 0 = player1's turn, 1 = player2's turn
  draw_count: u32;          // index of next card in deterministic deck
  hand_hash_p1: Option<Buffer>;  // keccak256(hand_bytes || salt) for P1
  hand_hash_p2: Option<Buffer>;  // keccak256(hand_bytes || salt) for P2
  player1: string;
  player1_points: i128;
  player2: string;
  player2_points: i128;
  top_colour: u32;
  top_value: u32;
  winner: Option<string>;   // null until game over
}
```

Contract errors (mapped to human messages in `useGame.humanizeError`):
`GameNotFound`, `NotPlayer`, `GameAlreadyEnded`, `NotYourTurn`, `HandNotCommitted`, `InvalidHandHash`, `CardNotInHand`, `InvalidCard`, `IllegalWildDraw4`, `InvalidHandSize`, `HandAlreadyCommitted`, `ZkProofInvalid`, `ZkVerifierNotSet`, `ZkActiveColourMismatch`, `ZkDrawCountMismatch`

---

## Configuration (`lib/config.ts`)

| Constant | Default | Purpose |
|---|---|---|
| `RPC_URL` | `https://soroban-testnet.stellar.org` | Stellar RPC endpoint |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Testnet passphrase |
| `ZK_UNO_CONTRACT` | `CDWRYMMESDY3G...` | ZK-UNO Soroban contract |
| `MOCK_GAME_HUB_CONTRACT` | `CB4VZAT2U3UC6...` | Game Hub contract |
| `PROVER_URL` | `http://localhost:3001` | RISC Zero prover server |
| `SIMULATION_SOURCE` | `GBUZBZ7NGZ...` | Neutral fee-source for tx simulation |
| `DEFAULT_TIMEOUT` | `30` | Tx timeout in seconds |
| `MULTI_SIG_TTL_MINUTES` | `60` | Auth entry validity for P1's pre-signed entry |
| `DEFAULT_AUTH_TTL_MINUTES` | `5` | Auth TTL for regular game moves |

---

## Full Call Chain: Game Start to Card Play

```
[P1 Connect Wallet]
  WalletButton useEffect → initKit() → mountButton() → subscribeToKit()
  kit STATE_UPDATED → useWallet.setAddress(addr)

[P1 Create Room]
  Lobby.handleCreate()
  → svc.prepareStartGame()
      → buildClient.start_game() [simulates with SIMULATION_SOURCE]
      → find P1 auth entry in sim result
      → calculateValidUntilLedger(60 min)
      → authorizeEntry(p1Entry, signerCallback, validUntil)
          → wallet.signAuthEntry(preimageXdr)
              → StellarWalletsKit.signAuthEntry()
              → returns signedAuthEntry (raw sig base64)
          → returns Buffer(sig)
      → returns { authXdr, simDataXdr, simAuthP2Xdr, minResourceFee }
  → btoa(JSON.stringify(bundle)) → shown in UI

[P2 Join Room]
  Lobby.handleJoin()
  → JSON.parse(atob(joinCode)) → bundle
  → svc.completeStartGame()
      → reconstruct signedP1, simAuthP2, sorobanData from XDR strings
      → server.getAccount(player2) → sequence
      → TransactionBuilder + setSorobanData(P1's footprint)
      → inject [P1 Address creds, P2 SourceAccount creds] into op auth
      → wallet.signTransaction(envelopeXdr) → P2 signs
      → server.sendTransaction(signedTx)
      → raw JSON-RPC poll until SUCCESS / timeout
  → router.push('/game/{sessionId}')

[Both players navigate to /game/{sessionId}]
  GameBoard → useGame(sessionId, address, signer)
  useEffect → poll svc.getGame(sessionId) every 4s → setGame(g)
  useEffect [playerIndex] → dealHand(sessionId, idx) → setMyHand, setMySalt

[P1 Commit Hand]
  GameBoard "Commit Hand" button → commitHand()
  → encodeHand + computeHandHash
  → callProver('/prove/commit') or buildMockSeal
  → client.commit_hand_zk({ hand_hash, zk_seal })
  → poll() → setGame(updated)

[P1 Play Card]
  Hand card click (×2) → handleCardClick → handlePlayCard(card, colour)
  → GameBoard.playCard()
  → useGame.playCard(card, wildColour)
  → removeCard, computeHandHash(newHand, newSalt)
  → callProver('/prove/move') or buildMoveSeal
  → client.play_card_zk({ played_colour, new_hand_hash, zk_seal, is_winner, is_uno })
  → if is_winner: contract calls game_hub.end_game → game.winner set
  → poll() → game.winner !== null → winner overlay shown
```
