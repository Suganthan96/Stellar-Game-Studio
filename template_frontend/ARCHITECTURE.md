# template_frontend — Architecture Document

## 1. Overview

`template_frontend` is a standalone Vite + React 19 application that serves as the **reference frontend template** for Stellar Game Studio games. It bundles a fully playable **ZK-UNO** game that demonstrates the two-layer architecture used across all studio frontends:

| Layer | Tech | Responsibility |
|-------|------|----------------|
| **Blockchain layer** | ZkUnoService + Stellar SDK v14 | Session creation, multi-sig auth, on-chain start/end game |
| **Gameplay layer** | RoomService + localStorage | Real-time in-game state sync (cross-tab / same-browser) |

The UNO game itself runs entirely locally. The blockchain layer only handles *session lifecycle* (create game, record winner).

---

## 2. Tech Stack

| Concern | Package |
|---------|---------|
| Build tool | Vite 6 |
| UI framework | React 19 |
| Styling | Tailwind CSS v3 |
| Global state | Zustand (`walletSlice`) |
| Wallet integration | `@creit-tech/stellar-wallets-kit` |
| Stellar SDK | `@stellar/stellar-sdk` v14.4.2 |
| Hashing (ZK) | `@noble/hashes` (keccak256) |
| Module aliases | `@/` → `src/` (via Vite `resolve.alias`) |

---

## 3. Directory Structure

```
template_frontend/
├── index.html                      # Vite entry HTML
├── vite.config.ts                  # Vite config (alias @/ → src/)
├── public/
├── src/
│   ├── main.tsx                    # ReactDOM.createRoot → <App />
│   ├── App.tsx                     # Root component → <LandingPage />
│   ├── config.ts                   # Studio-wide contract IDs (from utils/constants)
│   ├── index.css                   # Global styles
│   │
│   ├── pages/
│   │   ├── LandingPage.tsx         # ★ Landing + game creation (blockchain calls)
│   │   └── GamePage.tsx            # ★ In-game UNO logic (localStorage only)
│   │
│   ├── lib/                        # ZK-UNO blockchain integration
│   │   ├── config.ts               # Network + contract IDs for this game
│   │   ├── bindings.ts             # Auto-generated Soroban contract client
│   │   ├── ledgerUtils.ts          # calculateValidUntilLedger()
│   │   └── zkUnoService.ts         # All ZK-UNO blockchain calls
│   │
│   ├── services/
│   │   ├── roomService.ts          # localStorage in-game state management
│   │   └── devWalletService.ts     # Dev keypair signing (from VITE_DEV_PLAYER*_SECRET)
│   │
│   ├── hooks/
│   │   ├── useWallet.ts            # Dev-mode wallet hook (WalletSwitcher, connectDev)
│   │   └── useWalletStandalone.ts  # Real-wallet hook (StellarWalletsKit)
│   │
│   ├── store/
│   │   └── walletSlice.ts          # Zustand store — wallet state
│   │
│   ├── types/
│   │   └── signer.ts               # ContractSigner interface
│   │
│   ├── components/
│   │   ├── Layout.tsx              # Dev-sandbox layout (WalletSwitcher in header)
│   │   ├── LayoutStandalone.tsx    # Production layout (WalletStandalone in header)
│   │   ├── WalletSwitcher.tsx      # Dev wallet UI — auto-connects P1, toggle P1/P2
│   │   ├── WalletSwitcher.css
│   │   ├── WalletStandalone.tsx    # Real wallet connect/disconnect button
│   │   ├── WalletStandalone.css
│   │   ├── Layout.css
│   │   └── LayoutStandalone.css
│   │
│   ├── games/
│   │   └── number-guess/           # NumberGuess reference game (bundled alongside UNO)
│   │       ├── NumberGuessGame.tsx
│   │       ├── numberGuessService.ts
│   │       └── bindings.ts
│   │
│   └── utils/
│       ├── constants.ts            # SOROBAN_RPC_URL, NETWORK_PASSPHRASE, contract ID helpers
│       ├── runtimeConfig.ts        # globalThis.__STELLAR_GAME_STUDIO_CONFIG__ reader
│       ├── authEntryUtils.ts       # injectSignedAuthEntry() — multi-sig P1/P2 auth
│       ├── ledgerUtils.ts          # calculateValidUntilLedger()
│       ├── simulationUtils.ts      # getSimulationSourceAddress() — neutral fee-source
│       ├── transactionHelper.ts    # signAndSendViaLaunchtube() wrapper
│       ├── requestCache.ts         # In-memory request deduplication cache
│       └── location.ts
```

---

## 4. Application Entry & Routing

There is **no router library**. Navigation is handled entirely via React state in `LandingPage`.

```
main.tsx
 └── <App />
      └── <LandingPage />
           ├── [gameStarted === false] → Shows lobby UI (connect wallet, create/join room)
           └── [gameStarted === true]  → Renders <GamePage roomCode=... isCreator=... />
```

### `main.tsx`
```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
```

### `App.tsx`
```tsx
export default function App() {
  return <LandingPage />;
}
```
`App` is intentionally minimal — no providers, no router. The `LandingPage` owns all page-level state.

---

## 5. LandingPage — Blockchain Entry Point

**File:** `src/pages/LandingPage.tsx`  
**Size:** ~450 lines  
**Purpose:** Wallet connection, game creation/join modal, animated background

### 5.1 State Machine

```
[Initial]
  │
  ├──[showRoomModal = false]── Background screen with Connect Wallet button
  │
  └──[showRoomModal = true]── Modal overlay
       │
       ├──[inviteCode = null]── Create/Join form
       │     ├── CREATE: calls prepareStartGame() → shows inviteCode + Copy button
       │     └── JOIN:   pastes inviteCode → calls completeStartGame() → enters game
       │
       └──[inviteCode ≠ null]── Invite code display view (P1 waiting for P2)
             └── "Enter Game" button → enters game as creator
```

### 5.2 Key State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `showRoomModal` | `boolean` | Toggles the create/join modal |
| `inviteCode` | `string \| null` | Base64-encoded `SessionBundle` shown to P1 after prepare |
| `sessionBundle` | `SessionBundle \| null` | P1's prepared session data (serialized into inviteCode) |
| `gameStarted` | `boolean` | Mounts `<GamePage>` when true |
| `activeSessionId` | `number \| null` | Shared session ID for both layers |
| `creating` / `joining` | `boolean` | Loading states for blockchain calls |

### 5.3 ZkUnoService Instantiation

```typescript
// Module-level singleton — one per page load
const svc = new ZkUnoService(ZK_UNO_CONTRACT);
```

### 5.4 Wallet Adapter Pattern

`LandingPage` uses `useWalletStandalone` (real wallets via StellarWalletsKit). The hook returns a `ContractSigner`; ZkUnoService expects a `WalletSigner`. An adapter bridge is used:

```typescript
// Inside LandingPage
function getWalletSigner(): WalletSigner {
  const contractSigner = walletHook.getContractSigner();
  return {
    address: publicKey!,
    signTransaction: (xdr, opts) => contractSigner.signTransaction(xdr, opts),
    signAuthEntry: (entryXdr, opts) => contractSigner.signAuthEntry!(entryXdr, opts),
  };
}
```

### 5.5 Create Room Flow (P1)

```
handleCreateRoom()
  │
  ├─ Validates publicKey is connected
  ├─ Generates sessionId = crypto.getRandomValues (u32)
  ├─ player2Placeholder = 'GAAAAAAAAAAAA...WHF'  ← P1 doesn't know P2 yet
  ├─ Calls: svc.prepareStartGame(
  │     sessionId, player1, player2Placeholder,
  │     1000n * 10_000_000n, 1000n * 10_000_000n,
  │     signer
  │  )
  ├─ Receives: SessionBundle { sessionId, player1SignedAuthXDR, unsignedTxXDR, minResourceFee, ... }
  ├─ Sets inviteCode = btoa(JSON.stringify(bundle))
  └─ UI switches to "Copy Invite Code" view
```

### 5.6 Join Room Flow (P2)

```
handleJoinRoom()
  │
  ├─ Parses inviteCode: bundle = JSON.parse(atob(roomCode))
  ├─ Validates P2 ≠ P1
  ├─ Calls: svc.completeStartGame(
  │     bundle.sessionId, bundle.player1, player2(=me),
  │     bundle.player1Points, bundle.player2Points,
  │     bundle.player1SignedAuthXDR, bundle.unsignedTxXDR,
  │     bundle.minResourceFee, signer
  │  )
  ├─ On success: setGameStarted(true), setActiveSessionId(bundle.sessionId)
  └─ UI mounts <GamePage roomCode=sessionId isCreator=false />
```

### 5.7 Enter Game Flow (P1 after sharing code)

```
handleEnterGame()
  │
  ├─ Sets gameStarted = true
  └─ UI mounts <GamePage roomCode=activeSessionId isCreator=true />
```

### 5.8 Animated Background

The landing page uses a custom `<GridMotion items={unoCardImages}>` component rendering 28 shuffled UNO card image URLs as an animated CSS grid background behind the modal overlay.

Card images are loaded via Vite's asset URL pattern:
```typescript
new URL('../Uno Game Assets/${filename}', import.meta.url).href
```

---

## 6. GamePage — In-Game UNO Logic

**File:** `src/pages/GamePage.tsx`  
**Size:** ~580 lines  
**Purpose:** Full UNO gameplay — **entirely via localStorage**, no blockchain calls during gameplay

### 6.1 Props

```typescript
interface GamePageProps {
  roomCode: string;   // sessionId as string — used as localStorage key
  isCreator: boolean; // true = Player 1, false = Player 2
}
```

### 6.2 State

| Variable | Type | Purpose |
|----------|------|---------|
| `playerHand` | `Card[]` | Current player's cards |
| `opponentCardCount` | `number` | Opponent's card count (read from RoomService) |
| `currentCard` | `Card \| null` | Top card of the discard pile |
| `isMyTurn` | `boolean` | Whether it's this player's turn |
| `playerNumber` | `1 \| 2` | Derived from `isCreator` |
| `bothPlayersPresent` | `boolean` | True when P2 has joined the room |
| `roomService` | `RoomService \| null` | localStorage service instance |
| `showColorPicker` | `boolean` | Wild card color selection modal |
| `waitingForPlayer` | `boolean` | Lobby waiting state before P2 joins |

### 6.3 Initialization

```
useEffect (on mount)
  │
  ├─ [isCreator] → RoomService.createRoom(roomCode) + setPlayerNumber(1)
  └─ [!isCreator] → RoomService.joinRoom(roomCode) + setPlayerNumber(2)
       └─ Starts polling interval (1000ms)
```

### 6.4 Polling Loop (1000ms interval)

Every second, `GamePage` reads the entire room state from localStorage:

```
poll()
  │
  ├─ service.getRoom()
  ├─ Sync: currentCard, isMyTurn, playerHand (my slice), opponentCardCount
  ├─ If !bothPlayersPresent && room.players.length >= 2 → setBothPlayersPresent(true)
  │     └─ [isCreator only] → dealInitialHands() + startGame(initialCard)
  ├─ If room.gameEnded → show winner overlay
  └─ Continue polling every 1s
```

### 6.5 Initial Deal (P1 only)

When P2 joins (P1 detects `room.players.length >= 2`):

```
dealInitialHands()
  │
  ├─ Creates full 108-card UNO deck (COLOR_CARDS × 4 + ACTION_CARDS × 4 + WILD_CARDS)
  ├─ Shuffles deck (Fisher-Yates)
  ├─ Deals 7 cards to P1, 7 cards to P2
  ├─ Picks a starting non-wild card
  ├─ Writes hands + starting card to RoomService
  └─ Calls service.startGame(startCard) → sets gameStarted=true in localStorage
```

### 6.6 Card Validation

```typescript
canPlayCard(card, currentCard):
  - Wild cards: always playable
  - Same colour: playable
  - Same value (for numbered cards, i.e. value ≤ 9): playable
  - Same action type (Skip, Reverse, Draw Two match by value): playable
```

### 6.7 Card Actions

| Card | Effect (2-player rules) |
|------|------------------------|
| Reverse | Acts as Skip (opponent loses turn) |
| Skip | Current player gets extra turn |
| Draw Two | Opponent draws 2; turn skips to current player |
| Wild | Current player picks color; normal turn ends |
| Wild Draw Four | Current player picks color; opponent draws 4; turn skips |

### 6.8 Win Condition

When a player plays their last card:
```
handlePlayCard() → playerHand.length === 0
  └─ service.updateRoom({ gameEnded: true, winner: playerNumber })
       └─ Polling detects gameEnded → shows winner overlay
```

---

## 7. RoomService — localStorage Multiplayer Layer

**File:** `src/services/roomService.ts`  
**Storage key:** `uno_room_${code}`  
**TTL:** 1 hour (rooms older than 1h are cleaned on `createRoom`)

### 7.1 Data Model

```typescript
interface Room {
  code: string;
  players: Player[];          // [0] = P1, [1] = P2
  currentCard: Card | null;   // Top of discard pile
  currentTurn: number;        // playerNumber whose turn it is (1 or 2)
  deckCards: Card[];          // Remaining draw pile
  gameStarted: boolean;
  pendingDraw: { playerNumber: number; count: number } | null;
  gameEnded: boolean;
  winner: number | null;
}

interface Player {
  id: string;           // UUID
  publicKey: string;    // Stellar address
  playerNumber: 1 | 2;
  hand: Card[];
}
```

### 7.2 Key Methods

| Method | Description |
|--------|-------------|
| `static createRoom(code)` | Creates new room in localStorage; cleans old rooms |
| `static joinRoom(code)` | Reads existing room; adds P2 to players array |
| `getRoom()` | Reads + parses room from localStorage |
| `updateRoom(partial)` | Merges partial update, writes back |
| `updatePlayerHand(playerNum, hand)` | Updates only one player's hand |
| `startGame(initialCard)` | Sets `gameStarted=true`, `currentCard`, `currentTurn=1` |
| `static cleanupOldRooms()` | Removes rooms older than 1 hour |

---

## 8. ZkUnoService — Blockchain Integration

**File:** `src/lib/zkUnoService.ts`  
**Size:** ~789 lines  
**Purpose:** All Soroban contract interactions for ZK-UNO game session management

### 8.1 Constructor

```typescript
const svc = new ZkUnoService(contractId: string)
```

Internally creates a `ZkUnoClient` (from `bindings.ts`) configured with:
- `contractId`
- `networkPassphrase` (from `lib/config.ts`)
- `rpcUrl`

### 8.2 Key Public Methods

| Method | Role |
|--------|------|
| `prepareStartGame(sessionId, p1, p2, p1Points, p2Points, signer)` | P1: builds + simulates tx, exports signed auth entry + unsigned TX XDR → `SessionBundle` |
| `completeStartGame(sessionId, p1, p2, p1Points, p2Points, p1AuthXDR, unsignedTxXDR, minFee, signer)` | P2: injects P1's auth, signs for P2, sends tx on-chain |
| `getGame(sessionId)` | Read-only: fetches on-chain `Game` struct |
| `playCard(sessionId, card, signer)` | Submits a card play move |
| `drawCard(sessionId, signer)` | Submits a draw card action |
| `endGame(sessionId, winner, signer)` | Records final winner on-chain |

### 8.3 SessionBundle (Invite Code Data Structure)

```typescript
interface SessionBundle {
  sessionId: number;
  player1: string;
  player2: string;            // placeholder GAAA...WHFF when prepared
  player1Points: bigint;
  player2Points: bigint;
  player1SignedAuthXDR: string; // P1's pre-signed SorobanAuthorizationEntry (base64)
  unsignedTxXDR: string;      // The assembled TX XDR (base64), not yet submitted
  minResourceFee: string;     // Fee string for P2 to use when submitting
}
```

This bundle is **JSON-serialized + base64-encoded** to form the invite code string.

### 8.4 Multi-Sig Flow (Two-Party Game Start)

```
P1: prepareStartGame()
  ├─ Simulates tx with SIMULATION_SOURCE as fee-payer
  │   (neutral address so both players appear as Address credentials)
  ├─ Finds P1's auth entry in simulation result
  ├─ Signs P1's auth entry via signer.signAuthEntry()
  ├─ Returns SessionBundle { p1SignedAuthXDR, unsignedTxXDR, minResourceFee }
  └─ P1 encodes this as invite code (btoa(JSON.stringify(bundle)))

P2: completeStartGame(bundle)
  ├─ Parses unsignedTxXDR back into AssembledTransaction
  ├─ Calls injectSignedAuthEntry(tx, p1SignedAuthXDR, p2Address, p2Signer)
  │   ├─ Replaces P1's stub entry with P1's pre-signed entry
  │   └─ Signs P2's auth entry inline
  └─ Calls tx.signAndSend({ signTransaction: p2Signer.signTransaction })
       └─ Polls for confirmation → tx SUCCESS or throws
```

### 8.5 Card Encoding

Cards are encoded as 2-byte pairs `[colour, value]` packed into a `Uint8Array`:

```typescript
encodeHand(cards: Card[]): Uint8Array  // [[colour,value], ...] → flat bytes
decodeHand(bytes: Uint8Array): Card[]  // flat bytes → Card[]
```

Hand hashes are computed with keccak256:
```typescript
computeHandHash(handBytes, salt): Uint8Array  // keccak256(hand || salt)
randomSalt(): Uint8Array                       // 32 crypto random bytes
```

### 8.6 ZK Image ID

```typescript
export const ZK_UNO_IMAGE_ID = new Uint8Array([0xb7, 0x21, 0x64, ...])
```
Used to verify RISC Zero ZK proof receipts on-chain.

---

## 9. Wallet System

### 9.1 Two Wallet Modes

| Mode | Hook | Component | Use Case |
|------|------|-----------|----------|
| **Standalone** (production) | `useWalletStandalone` | `WalletStandalone` | Real wallets via StellarWalletsKit |
| **Dev** (testing) | `useWallet` | `WalletSwitcher` | Local secret keys from `.env` |

`LandingPage` uses **Standalone mode** exclusively (real wallet flow).  
`NumberGuessGame` uses **Dev mode** (WalletSwitcher, two dev players).

### 9.2 `useWalletStandalone` Hook

**File:** `src/hooks/useWalletStandalone.ts`

- Module-level `StellarWalletsKit` singleton (initialized once via `let kitInitialized = false` guard)
- `ensureKitInitialized()` called before every kit operation
- On mount: attempts `kit.getAddress()` to restore prior session
- Returns:

| Property | Type | Description |
|----------|------|-------------|
| `publicKey` | `string \| null` | Connected wallet address |
| `isConnected` | `boolean` | Connection state |
| `isConnecting` | `boolean` | Loading state |
| `isWalletAvailable` | `boolean` | Browser check |
| `network` | `string` | `'testnet'` or `'mainnet'` |
| `connect()` | `async fn` | Opens StellarWalletsKit modal |
| `disconnect()` | `async fn` | Clears session |
| `getContractSigner()` | `fn → ContractSigner` | Returns signing interface for SDK |
| `connectDev()` | throws | Not supported in standalone mode |
| `switchPlayer()` | throws | Not supported in standalone mode |

**`getContractSigner()` detail:**
```typescript
getContractSigner(): ContractSigner {
  return {
    signTransaction: (xdr, opts) => kit.signTransaction(xdr, opts),
    signAuthEntry: (entryXdr, opts) => kit.signAuthEntry(entryXdr, opts),
  };
}
```

### 9.3 `useWallet` Hook (Dev Mode)

**File:** `src/hooks/useWallet.ts`

- Reads/writes Zustand `walletSlice` store
- Delegates signing to `devWalletService` singleton
- Supports `connectDev(1|2)`, `switchPlayer(1|2)`, `getContractSigner()`

### 9.4 `DevWalletService`

**File:** `src/services/devWalletService.ts`

- Reads secret keys from `VITE_DEV_PLAYER1_SECRET` / `VITE_DEV_PLAYER2_SECRET`
- Holds `Record<string, Keypair>` map — keys: `'player1'`, `'player2'`
- `signTransaction`: `TransactionBuilder.fromXDR(xdr) → tx.sign(keypair) → tx.toXDR()`
- `signAuthEntry`: `hash(Buffer.from(preimageXdr, 'base64')) → keypair.sign(payload) → base64`
  - Matches the `authorizeEntry` behavior in Stellar SDK

### 9.5 Zustand Store (`walletSlice`)

**File:** `src/store/walletSlice.ts`

```typescript
interface WalletState {
  publicKey: string | null;
  walletId: string | null;
  walletType: 'dev' | 'wallet' | null;
  isConnected: boolean;
  isConnecting: boolean;
  network: string | null;
  networkPassphrase: string | null;
  error: string | null;
  // Actions:
  setWallet(publicKey, walletId, walletType): void;
  setPublicKey(publicKey): void;
  setConnected(connected): void;
  setConnecting(connecting): void;
  setNetwork(network, passphrase): void;
  setError(error): void;
  disconnect(): void;
  reset(): void;
}
```

Used by `useWallet` (dev mode) only. `useWalletStandalone` manages its own local React state.

---

## 10. Configuration System

### 10.1 Config Layers (Priority Order)

```
1. globalThis.__STELLAR_GAME_STUDIO_CONFIG__   ← runtime inject (public/game-studio-config.js)
2. import.meta.env (VITE_*)                     ← .env file at build time
3. Hardcoded fallbacks                          ← testnet defaults
```

The `runtimeConfig.ts` module reads layer 1; `constants.ts` merges all three.

### 10.2 `src/config.ts` (Studio-wide)

```typescript
export const config = {
  rpcUrl: ...,
  networkPassphrase: ...,
  contractIds: getAllContractIds(),   // all VITE_*_CONTRACT_ID vars merged
  mockGameHubId: getContractId('mock-game-hub'),
  numberGuessId: getContractId('number-guess'),
  diceDuelId: getContractId('dice-duel'),
  // ...
};
```

### 10.3 `src/lib/config.ts` (ZK-UNO specific)

```typescript
export const RPC_URL = '...'
export const NETWORK_PASSPHRASE = '...'
export const ZK_UNO_CONTRACT = 'CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE'
export const MOCK_GAME_HUB_CONTRACT = 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG'
export const PROVER_URL = 'http://localhost:3001'
export const SIMULATION_SOURCE = 'GBUZBZ7NGZC4DIKFWQKP7CPM3634M4ITAUJJGF77LY6LC32PXHIA34LS'
export const DEFAULT_TIMEOUT = 30
export const MULTI_SIG_TTL_MINUTES = 60
export const DEFAULT_AUTH_TTL_MINUTES = 5
```

`SIMULATION_SOURCE` is the neutral fee-payer account used so both players appear as `Address` credentials (not `SourceAccount`) in the simulation auth list.

---

## 11. Utility Modules

### 11.1 `authEntryUtils.ts` — `injectSignedAuthEntry()`

Used in multi-sig flows to merge P1's pre-signed auth entry with P2's live signature:

```
injectSignedAuthEntry(tx, p1AuthXDR, p2Address, p2Signer, validUntilLedger?)
  │
  ├─ Parses p1AuthXDR → SorobanAuthorizationEntry
  ├─ Iterates tx.simulationData.result.auth entries
  ├─ Finds P1's stub (by address match) → replaces with P1's signed entry
  ├─ Finds P2's entry (by address match) → signs via p2Signer.signAuthEntry()
  │   └─ Uses authorizeEntry() from Stellar SDK with TTL
  └─ Mutates tx.simulationData.result.auth in place, returns tx
```

### 11.2 `ledgerUtils.ts` — `calculateValidUntilLedger()`

```typescript
// Stellar: ~12 ledgers/minute (1 ledger ≈ 5s)
return latestLedger.sequence + Math.ceil(ttlMinutes * 12);
```

Also exists as `src/lib/ledgerUtils.ts` (same content, used by ZkUnoService).

### 11.3 `simulationUtils.ts` — `getSimulationSourceAddress()`

Picks a funded account to use as the transaction fee-payer for simulation:
- Priority: `RUNTIME_SIMULATION_SOURCE` → `DEV_ADMIN_ADDRESS` → `DEV_PLAYER2_ADDRESS` → `DEV_PLAYER1_ADDRESS`
- Skips addresses in the `avoidAddresses` array (i.e., the actual players)
- `getFundedSimulationSourceAddress()`: also calls Friendbot if account doesn't exist on testnet

### 11.4 `transactionHelper.ts` — `signAndSendViaLaunchtube()`

Handles `NoSignatureNeededError` from SDK (some contracts mark state-changing methods as "read calls"):
```
simulate() → signAndSend()
  └─ On NoSignatureNeededError → signAndSend({ force: true })
       └─ If still NoSignatureNeededError → return simulation result as final result
```

### 11.5 `requestCache.ts` — `RequestCache` singleton

Deduplicate concurrent requests with configurable TTL:
```typescript
cache.dedupe(key, fetcher, ttl = 5000)  // returns cached or deduped promise
cache.invalidate(key)
cache.invalidatePattern(pattern)        // regex pattern match
cache.clear()
```

### 11.6 `runtimeConfig.ts` — `getRuntimeConfig()`

Reads `globalThis.__STELLAR_GAME_STUDIO_CONFIG__` (type `RuntimeConfig`):
```typescript
interface RuntimeConfig {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractIds?: Record<string, string>;
  simulationSourceAddress?: string;
}
```
Set by `public/game-studio-config.js` in standalone deployments.

---

## 12. Component Tree

### 12.1 Landing Page (Full)

```
<LandingPage>
  ├─ <GridMotion items={unoCardImages} />       ← Animated UNO card grid background
  └─ Overlay div
       ├─ [!connected] → "Connect Wallet" button
       ├─ [connected] → "Create Room" + "Join Room" buttons
       └─ [showRoomModal]
            ├─ [inviteCode === null] → Create/Join Form
            │    ├─ "Create Room" tab
            │    │    └─ Wallet address display + Create button
            │    └─ "Join Room" tab
            │         └─ Invite code input + Join button
            └─ [inviteCode !== null] → Invite Code Display
                 ├─ Code textarea (read-only)
                 ├─ Copy button (copies inviteCode to clipboard)
                 └─ "Enter Game" button → mounts <GamePage>
```

### 12.2 Game Page (Full)

```
<GamePage roomCode isCreator>
  ├─ [waitingForPlayer] → Waiting overlay ("Waiting for opponent...")
  ├─ [!bothPlayersPresent] → Room code display
  └─ [bothPlayersPresent] → Game board
       ├─ Opponent area (card back images × opponentCardCount)
       ├─ Play area
       │    ├─ Draw pile button (styled card back)
       │    └─ Discard pile (current card display)
       ├─ Action area
       │    ├─ [isMyTurn] → "Play Card" or "Draw Card" buttons
       │    └─ [!isMyTurn] → "Opponent's Turn" indicator
       ├─ Player hand (card images, clickable when isMyTurn)
       └─ [showColorPicker] → Color picker overlay (Red/Yellow/Green/Blue)
```

### 12.3 Layout Components

**`Layout`** — Dev sandbox mode:
```
<Layout title subtitle>
  ├─ Background (orbs + CSS grid)
  ├─ <header>
  │    ├─ Brand (title + subtitle)
  │    └─ <WalletSwitcher />   ← auto-connects P1, toggle P1↔P2
  └─ <main>{children}</main>
```

**`LayoutStandalone`** — Production mode:
```
<LayoutStandalone title subtitle>
  ├─ <header>
  │    ├─ Brand (title + subtitle)
  │    └─ <WalletStandalone />  ← Connect/disconnect real wallet
  └─ <main>{children}</main>
```

### 12.4 `WalletSwitcher` Component

- Auto-connects to Player 1 on mount via `useEffect` (calls `connectDev(1)` once)
- Shows "Switch to Player 2 / 1" button for dev testing
- Uses `useWallet` hook (dev mode)

### 12.5 `WalletStandalone` Component

- "Connect Wallet" → triggers StellarWalletsKit modal
- Shows truncated address when connected: `GABCD...1234`
- Shows network label below
- Uses `useWalletStandalone` hook

---

## 13. Bindings (`src/lib/bindings.ts`)

Auto-generated TypeScript client for the ZK-UNO Soroban contract. **Do not edit manually.**

Key exports:
```typescript
export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CDWRYMMESDY3GQYANCSYKJF4MCR7CI72D2326BDZ73ATR26U42RUTGYE',
  }
};

export interface Game {
  active_colour: u32;
  current_turn: u32;
  draw_count: u32;
  hand_hash_p1: Option<Buffer>;
  hand_hash_p2: Option<Buffer>;
  player1: string;
  player1_points: i128;
  player2: string;
  player2_points: i128;
  top_colour: u32;
  top_value: u32;
  winner: Option<string>;
}

export class Client extends ContractClient { ... }
```

Regenerate after contract changes:
```bash
bun run bindings zk-uno
# Then copy bindings/zk_uno/src/index.ts → src/lib/bindings.ts
```

---

## 14. NumberGuess Game (Bundled Reference)

**Dir:** `src/games/number-guess/`

A second game bundled in `template_frontend` as a reference implementation showing the full studio pattern with dev wallets:

| File | Role |
|------|------|
| `NumberGuessGame.tsx` | ~1400-line React component; handles create/import/load flows, multi-sig auth entry XDR export/import, game guess, reveal |
| `numberGuessService.ts` | Blockchain service for `number-guess` contract |
| `bindings.ts` | Auto-generated bindings for `number-guess` contract |

`NumberGuessGame` uses:
- `useWallet` (dev mode) — not `useWalletStandalone`
- `requestCache.dedupe()` for polling game state
- `getFundedSimulationSourceAddress()` for tx simulation
- `devWalletService.getSigner()` directly for P2 signing in quickstart mode

---

## 15. Data Flow Summary

### Full Session Create → Play → End Flow

```
[P1 connects wallet via StellarWalletsKit]
         │
         ▼
[P1 clicks "Create Room"]
  LandingPage.handleCreateRoom()
    → ZkUnoService.prepareStartGame(sessionId, p1, placeholder, points, signer)
      → Simulates TX with SIMULATION_SOURCE as fee-payer
      → Signs P1's auth entry (signAuthEntry via kit)
      → Returns SessionBundle
    → inviteCode = btoa(JSON.stringify(bundle))
         │
         ▼
[P1 copies invite code → shares with P2 out-of-band]
         │
         ▼
[P2 pastes invite code, clicks "Join Room"]
  LandingPage.handleJoinRoom()
    → ZkUnoService.completeStartGame(bundle, p2, signer)
      → injectSignedAuthEntry(tx, p1AuthXDR, p2Address, p2Signer)
      → tx.signAndSend() → on-chain start_game called
    → setGameStarted(true)
         │
         ▼
[Both players enter <GamePage>]
  GamePage mounts → RoomService.createRoom / joinRoom
  Polling starts (1000ms)
         │
         ▼
[P1 detects P2 joined → dealInitialHands() → RoomService.startGame()]
         │
         ▼
[Players take turns: handlePlayCard / handleDrawCard]
  → Each call → RoomService.updateRoom() → localStorage
  → Opponent polling picks up changes within 1s
         │
         ▼
[A player plays last card]
  handlePlayCard() → playerHand.length === 0
    → RoomService.updateRoom({ gameEnded: true, winner })
    → [Optional] ZkUnoService.endGame(sessionId, winner, signer)
    → Winner overlay shown
```

---

## 16. Environment Variables

| Variable | Used In | Purpose |
|----------|---------|---------|
| `VITE_SOROBAN_RPC_URL` | `lib/config.ts`, `utils/constants.ts` | Soroban RPC endpoint |
| `VITE_NETWORK_PASSPHRASE` | Both configs | Network passphrase |
| `VITE_ZK_UNO_CONTRACT_ID` | `lib/config.ts` | ZK-UNO contract address |
| `VITE_MOCK_GAME_HUB_CONTRACT_ID` | `lib/config.ts` | Mock Game Hub address |
| `VITE_PROVER_URL` | `lib/config.ts` | ZK prover server URL |
| `VITE_DEV_ADMIN_ADDRESS` | `lib/config.ts` → SIMULATION_SOURCE | Neutral simulation fee-payer |
| `VITE_DEV_PLAYER1_SECRET` | `devWalletService.ts` | P1 dev keypair secret |
| `VITE_DEV_PLAYER2_SECRET` | `devWalletService.ts` | P2 dev keypair secret |
| `VITE_DEV_PLAYER1_ADDRESS` | `utils/constants.ts` | P1 dev public key |
| `VITE_DEV_PLAYER2_ADDRESS` | `utils/constants.ts` | P2 dev public key |
| `VITE_GAME_TITLE` | `Layout`, `LayoutStandalone` | Game display title |
| `VITE_GAME_TAGLINE` | `Layout`, `LayoutStandalone` | Game display tagline |

Populated by `bun run setup` (writes `.env` from deployed contract IDs).

---

## 17. Key Design Decisions

1. **No router**: Navigation is pure React state. `LandingPage` renders either itself or `<GamePage>` — no URL changes. Simplifies standalone deployment.

2. **Two-layer multiplayer**: Blockchain = session creation only. Gameplay = localStorage. This avoids per-move transaction costs and the blockchain latency (5s+ per move) while still recording game outcomes on-chain.

3. **Invite code = serialized bundle**: P1 doesn't know P2's address when preparing. The `player2Placeholder` (all-zero address) is used at prepare time; P2 replaces it when completing. The whole signed bundle travels out-of-band (copy/paste).

4. **Module-level ZkUnoService instance**: `const svc = new ZkUnoService(...)` at module level in `LandingPage.tsx`. One instance per page session.

5. **StellarWalletsKit singleton**: `useWalletStandalone` uses a module-level `let kit` reference with a `kitInitialized` guard to prevent re-initialization across React re-renders.

6. **SIMULATION_SOURCE pattern**: Using a neutral funded address as the fee-payer during simulation ensures both `player1` and `player2` appear as `sorobanCredentialsAddress` entries (not `sorobanCredentialsSourceAccount`) in the auth list, making it possible to pre-sign P1's entry before P2 knows about the transaction.
