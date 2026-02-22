import { Client as ZkUnoClient, type Game } from './bindings';
import {
  NETWORK_PASSPHRASE,
  RPC_URL,
  DEFAULT_METHOD_OPTIONS,
  MULTI_SIG_AUTH_TTL_MINUTES,
} from '@/utils/constants';
import { contract, Address, authorizeEntry } from '@stellar/stellar-sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import { Buffer } from 'buffer';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { calculateValidUntilLedger } from '@/utils/ledgerUtils';
import { injectSignedAuthEntry } from '@/utils/authEntryUtils';

type ClientOptions = contract.ClientOptions;

// ─── Card constants (must match contract) ────────────────────────────────────
export const RED    = 0;
export const YELLOW = 1;
export const GREEN  = 2;
export const BLUE   = 3;
export const WILD   = 4;

export const SKIP       = 10;
export const REVERSE    = 11;
export const DRAW_TWO   = 12;
export const WILD_CARD  = 13;
export const WILD_DRAW4 = 14;

export const COLOUR_NAMES  = ['Red', 'Yellow', 'Green', 'Blue', 'Wild'];
export const COLOUR_CLASSES = ['bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bg-blue-500', 'bg-gray-700'];
export const VALUE_NAMES = (v: number) => {
  if (v <= 9)  return String(v);
  if (v === SKIP)       return 'Skip';
  if (v === REVERSE)    return 'Reverse';
  if (v === DRAW_TWO)   return '+2';
  if (v === WILD_CARD)  return 'Wild';
  if (v === WILD_DRAW4) return '+4';
  return '?';
};

export interface Card {
  colour: number;
  value: number;
}

// ─── Keccak-256 (Protocol 25 compatible) ─────────────────────────────────────

/**
 * Compute Keccak-256 of data (matches Soroban's env.crypto().keccak256).
 * Uses @noble/hashes — same output as the on-chain primitive.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

// ─── Hand encoding helpers ────────────────────────────────────────────────────

/** Encode a hand as interleaved [colour, value, colour, value, ...] bytes */
export function encodeHand(cards: Card[]): Uint8Array {
  const buf = new Uint8Array(cards.length * 2);
  for (let i = 0; i < cards.length; i++) {
    buf[i * 2]     = cards[i].colour;
    buf[i * 2 + 1] = cards[i].value;
  }
  return buf;
}

/** Decode interleaved bytes back to Card[] */
export function decodeHand(bytes: Uint8Array): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    cards.push({ colour: bytes[i], value: bytes[i + 1] });
  }
  return cards;
}

/** Concatenate two Uint8Arrays */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Compute keccak256(hand_bytes || salt) — must match contract's compute_hand_hash */
export function computeHandHash(handBytes: Uint8Array, salt: Uint8Array): Uint8Array {
  return keccak256(concat(handBytes, salt));
}

/** Generate a random 32-byte salt */
export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}

// ─── RISC Zero ZK proof helpers ───────────────────────────────────────────────

/**
 * IMAGE_ID of the zk-uno-guest RISC Zero program.
 * Computed from: cd zk-uno-guest && cargo +risc0 build --target riscv32im-risc0-zkvm-elf --release
 * Must match ZK_UNO_IMAGE_ID in contracts/zk-uno/src/lib.rs.
 */
export const ZK_UNO_IMAGE_ID: Uint8Array = new Uint8Array([
  0xb7, 0x21, 0x64, 0x47, 0x95, 0xbe, 0xce, 0x69,
  0xd9, 0x5e, 0x97, 0x52, 0x12, 0xf2, 0xd9, 0x6c,
  0xfb, 0x9d, 0xf1, 0x21, 0x27, 0xe8, 0xb3, 0x65,
  0x38, 0xab, 0xa6, 0x57, 0xb7, 0xcc, 0x3c, 0x08,
]);

/**
 * IMAGE_ID for the move-proof guest (zk-uno-move binary).
 * Computed from: cd zk-uno-guest && cargo +risc0 build --target riscv32im-risc0-zkvm-elf --release
 * Must match ZK_UNO_MOVE_IMAGE_ID in contracts/zk-uno/src/lib.rs.
 */
export const ZK_UNO_MOVE_IMAGE_ID: Uint8Array = new Uint8Array([
  0x01, 0x84, 0xe7, 0x52, 0x61, 0x29, 0xc9, 0x3e,
  0x6a, 0x6c, 0xfa, 0x22, 0xe8, 0x26, 0x95, 0x4d,
  0xe3, 0xf5, 0x98, 0x57, 0x4d, 0xd5, 0xb9, 0x27,
  0x92, 0x93, 0xdb, 0x3a, 0x7f, 0x74, 0xc9, 0x62,
]);

/**
 * IMAGE_ID for the draw-proof guest (zk-uno-draw binary).
 * Computed from: cd zk-uno-guest && cargo +risc0 build --target riscv32im-risc0-zkvm-elf --release
 * Must match ZK_UNO_DRAW_IMAGE_ID in contracts/zk-uno/src/lib.rs.
 */
export const ZK_UNO_DRAW_IMAGE_ID: Uint8Array = new Uint8Array([
  0xca, 0xa5, 0xc9, 0x75, 0x2b, 0x08, 0x63, 0x13,
  0x2d, 0x41, 0xac, 0x6a, 0x21, 0xc5, 0xb3, 0x71,
  0x5e, 0x3a, 0xc3, 0x19, 0x49, 0x6d, 0x99, 0x36,
  0xfe, 0x24, 0xb7, 0x65, 0x92, 0xca, 0x70, 0x67,
]);

/**
 * IMAGE_ID for the declare-uno proof guest (zk-uno-uno binary).
 * Computed from: cd zk-uno-guest && cargo +risc0 build --target riscv32im-risc0-zkvm-elf --release
 * Must match ZK_UNO_UNO_IMAGE_ID in contracts/zk-uno/src/lib.rs.
 */
export const ZK_UNO_UNO_IMAGE_ID: Uint8Array = new Uint8Array([
  0xf3, 0x15, 0x81, 0x27, 0xcf, 0xb8, 0x13, 0x68,
  0x58, 0x4b, 0x80, 0x1e, 0xaa, 0x5c, 0x5e, 0x1b,
  0x88, 0x9b, 0x5b, 0x4c, 0x27, 0xed, 0x06, 0x0d,
  0xa6, 0xed, 0xfc, 0x3b, 0xcb, 0x02, 0xb3, 0x73,
]);

/**
 * 4-byte Groth16 verifier selector embedded at build time in the
 * NethermindEth groth16-verifier contract. This is the first 4 bytes
 * of every seal and identifies which sub-verifier the router dispatches to.
 */
export const GROTH16_RISC0_SELECTOR: Uint8Array = new Uint8Array([0x73, 0xc4, 0x57, 0xba]);

// ─── Prover server client ─────────────────────────────────────────────────────

/**
 * URL of the local ZK-UNO prover server.
 * Override via window.__STELLAR_GAME_STUDIO_CONFIG__.proverUrl or the
 * VITE_PROVER_URL environment variable at build time.
 */
export const PROVER_URL: string = (() => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PROVER_URL) {
    return (import.meta as any).env.VITE_PROVER_URL as string;
  }
  if (typeof window !== 'undefined' && (window as any).__STELLAR_GAME_STUDIO_CONFIG__?.proverUrl) {
    return (window as any).__STELLAR_GAME_STUDIO_CONFIG__.proverUrl as string;
  }
  return 'http://localhost:3001';
})();

/**
 * Call the local prover server to generate a mock ZK seal.
 * The server executes the guest ELF and builds the seal from the resulting journal.
 *
 * Falls back to `undefined` on network error so callers can use local mock seals.
 */
async function callProver(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Uint8Array | undefined> {
  try {
    const resp = await fetch(`${PROVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      console.warn(`[Prover] ${endpoint} error:`, err.error);
      return undefined;
    }
    const { seal } = await resp.json();
    return new Uint8Array(Buffer.from(seal as string, 'hex'));
  } catch (e) {
    console.warn(`[Prover] ${endpoint} unreachable, falling back to local mock seal:`, e);
    return undefined;
  }
}

/** Compute SHA-256 of data using the Web Crypto API (browser + Node.js). */
export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh Uint8Array to guarantee a plain ArrayBuffer backing,
  // then cast — `new Uint8Array()` always allocates a plain ArrayBuffer.
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const buf = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer);
  return new Uint8Array(buf);
}

/**
 * Compute the ZK journal preimage: sessionId_be32 (4 bytes) || handHash (32 bytes).
 * The contract hashes this value with SHA-256 and passes it as `journal_sha256`
 * to the RISC Zero verifier router.
 *
 * Including session_id prevents proof replay across sessions.
 */
export function buildZkJournalBytes(sessionId: number, handHash: Uint8Array): Uint8Array {
  const out = new Uint8Array(36);
  const view = new DataView(out.buffer);
  view.setUint32(0, sessionId, false); // big-endian
  out.set(handHash, 4);
  return out;
}

/**
 * Compute sha256(sessionId_be32 || handHash) — the `journal_sha256` value
 * the Soroban contract computes internally before calling the RISC Zero router.
 */
export async function computeZkJournalSha256(
  sessionId: number,
  handHash: Uint8Array
): Promise<Uint8Array> {
  return sha256Async(buildZkJournalBytes(sessionId, handHash));
}

/**
 * Build a 36-byte mock RISC Zero seal compatible with the NethermindEth
 * `risc0-verifier-mock` contract deployed on Stellar testnet.
 *
 * Seal format: selector (4 bytes) || ReceiptClaim digest (32 bytes)
 *
 * The ReceiptClaim digest is the tagged-SHA256 hash of the receipt claim,
 * computed from the image_id and journal_sha256 using the risc0-interface
 * tagged-hash scheme. This matches what the on-chain mock verifier validates.
 *
 * @param imageId       32-byte RISC Zero IMAGE_ID (ZK_UNO_IMAGE_ID)
 * @param journalSha256 32-byte SHA-256 of the journal bytes
 * @param selector      4-byte Groth16 verifier selector (GROTH16_RISC0_SELECTOR)
 */
export async function buildMockSeal(
  imageId: Uint8Array,
  journalSha256: Uint8Array,
  selector: Uint8Array = GROTH16_RISC0_SELECTOR
): Promise<Uint8Array> {
  // Compute Output.digest() = sha256(TAG_OUTPUT || journal_sha256 || zeros32 || length_tag)
  // TAG_OUTPUT = sha256("risc0.Output")
  const TAG_OUTPUT = new Uint8Array([
    0x77, 0xea, 0xfe, 0xb3, 0xdf, 0xc3, 0x4a, 0x1c,
    0x6b, 0x44, 0x5d, 0x3e, 0xf2, 0x6d, 0x12, 0x32,
    0x2e, 0xa4, 0x84, 0x72, 0x40, 0x14, 0x0a, 0x9a,
    0xf8, 0x22, 0x08, 0x5f, 0x75, 0xdc, 0x4e, 0xa0,
  ]);
  const zeros32 = new Uint8Array(32);
  // length tag encodes 2 fields (journal + assumptions) in little-endian 64-bit
  const outputLenTag = new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  const outputPreimage = concat(
    concat(concat(TAG_OUTPUT, journalSha256), zeros32),
    outputLenTag
  );
  const outputDigest = await sha256Async(outputPreimage);

  // Compute ReceiptClaim.digest() = sha256(TAG_CLAIM || zeros32 || imageId || POST_STATE_HALTED || outputDigest || exit_codes_and_length)
  // TAG_CLAIM = sha256("risc0.ReceiptClaim")
  const TAG_CLAIM = new Uint8Array([
    0xcb, 0x1f, 0xef, 0xcd, 0x6d, 0xda, 0x1c, 0x3c,
    0x74, 0x91, 0xb3, 0x09, 0x22, 0xf7, 0x0b, 0xc0,
    0x5e, 0xcf, 0xff, 0xf6, 0xb2, 0x2e, 0x73, 0x61,
    0x78, 0x06, 0x9f, 0x14, 0x51, 0x48, 0x72, 0x64,
  ]);
  // POST_STATE_DIGEST_HALTED — the zkVM halted-state digest
  const POST_STATE_HALTED = new Uint8Array([
    0xa3, 0xac, 0xc2, 0x71, 0x26, 0x03, 0x80, 0x27,
    0x81, 0xa2, 0xae, 0x6d, 0x44, 0x56, 0x28, 0x6e,
    0x73, 0x79, 0x11, 0x7a, 0x74, 0xe2, 0x10, 0x88,
    0x28, 0xb6, 0xb4, 0x8e, 0x5a, 0xab, 0x3e, 0x0b,
  ]);
  // exit codes + 5-field length tag for ReceiptClaim
  // exit codes = system:0, user:0 = 8 bytes zeros; length tag = 5 fields
  const claimSuffix = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, // system exit code
    0x00, 0x00, 0x00, 0x00, // user exit code
    0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 5 fields length tag
  ]);

  const claimPreimage = concat(
    concat(
      concat(concat(concat(TAG_CLAIM, zeros32), imageId), POST_STATE_HALTED),
      outputDigest
    ),
    claimSuffix
  );
  const claimDigest = await sha256Async(claimPreimage);

  // Assemble seal: selector (4) || claim_digest (32)
  const seal = new Uint8Array(36);
  seal.set(selector, 0);
  seal.set(claimDigest, 4);
  return seal;
}

/**
 * Build the 74-byte move-proof journal preimage.
 *
 * Layout: session_id_be32(4) || old_hash(32) || new_hash(32) ||
 *         played_colour(1)   || played_value(1) || wild_colour(1) ||
 *         active_colour(1)   || is_winner(1) || is_uno(1)
 *
 * Must exactly match what the contract builds in play_card_zk.
 */
export function buildMoveJournalBytes(
  sessionId: number,
  oldHash: Uint8Array,
  newHash: Uint8Array,
  playedColour: number,
  playedValue: number,
  wildColour: number,
  activeColour: number,
  isWinner: boolean,
  isUno: boolean
): Uint8Array {
  const out = new Uint8Array(74);
  const view = new DataView(out.buffer);
  view.setUint32(0, sessionId >>> 0, false);
  out.set(oldHash, 4);
  out.set(newHash, 36);
  out[68] = playedColour & 0xff;
  out[69] = playedValue  & 0xff;
  out[70] = wildColour   & 0xff;
  out[71] = activeColour & 0xff;
  out[72] = isWinner ? 1 : 0;
  out[73] = isUno    ? 1 : 0;
  return out;
}

/**
 * Build the 72-byte draw-proof journal preimage.
 *
 * Layout: session_id_be32(4) || old_hash(32) || new_hash(32) || draw_count_be32(4)
 *
 * Must exactly match what the contract builds in draw_card_zk.
 */
export function buildDrawJournalBytes(
  sessionId: number,
  oldHash: Uint8Array,
  newHash: Uint8Array,
  drawCount: number
): Uint8Array {
  const out = new Uint8Array(72);
  const view = new DataView(out.buffer);
  view.setUint32(0, sessionId >>> 0, false);
  out.set(oldHash, 4);
  out.set(newHash, 36);
  view.setUint32(68, drawCount >>> 0, false);
  return out;
}

/**
 * Build a mock RISC Zero seal for a move proof.
 *
 * @param sessionId     Game session ID
 * @param oldHash       Old hand commitment hash (32 bytes)
 * @param newHash       New hand commitment hash after removing played card (32 bytes)
 * @param playedColour  Card colour (0-4)
 * @param playedValue   Card value (0-14)
 * @param wildColour    Chosen colour for wild (0-3; ignored for non-wild)
 * @param activeColour  game.active_colour at the time of the move
 * @param isWinner      true if new hand is empty
 * @param isUno         true if new hand has exactly 1 card
 */
export async function buildMoveSeal(
  sessionId: number,
  oldHash: Uint8Array,
  newHash: Uint8Array,
  playedColour: number,
  playedValue: number,
  wildColour: number,
  activeColour: number,
  isWinner: boolean,
  isUno: boolean,
  selector: Uint8Array = GROTH16_RISC0_SELECTOR
): Promise<Uint8Array> {
  const journalBytes = buildMoveJournalBytes(
    sessionId, oldHash, newHash, playedColour, playedValue,
    wildColour, activeColour, isWinner, isUno
  );
  const journalSha256 = await sha256Async(journalBytes);
  return buildMockSeal(ZK_UNO_MOVE_IMAGE_ID, journalSha256, selector);
}

/**
 * Build a mock RISC Zero seal for a draw proof.
 *
 * @param sessionId  Game session ID
 * @param oldHash    Old hand commitment hash (32 bytes)
 * @param newHash    New hand commitment hash after appending drawn card (32 bytes)
 * @param drawCount  game.draw_count at the time of the draw
 */
export async function buildDrawSeal(
  sessionId: number,
  oldHash: Uint8Array,
  newHash: Uint8Array,
  drawCount: number,
  selector: Uint8Array = GROTH16_RISC0_SELECTOR
): Promise<Uint8Array> {
  const journalBytes = buildDrawJournalBytes(sessionId, oldHash, newHash, drawCount);
  const journalSha256 = await sha256Async(journalBytes);
  return buildMockSeal(ZK_UNO_DRAW_IMAGE_ID, journalSha256, selector);
}

/**
 * Build a 36-byte declare-uno journal preimage.
 *
 * Layout: session_id_be32(4) || hand_hash(32)  — same format as commit.
 */
export function buildUnoJournalBytes(sessionId: number, handHash: Uint8Array): Uint8Array {
  return buildZkJournalBytes(sessionId, handHash); // identical layout
}

/**
 * Build a mock RISC Zero seal for a declare-UNO proof (local fallback).
 */
export async function buildUnoSeal(
  sessionId: number,
  handHash: Uint8Array,
  selector: Uint8Array = GROTH16_RISC0_SELECTOR
): Promise<Uint8Array> {
  const journalBytes = buildUnoJournalBytes(sessionId, handHash);
  const journalSha256 = await sha256Async(journalBytes);
  return buildMockSeal(ZK_UNO_UNO_IMAGE_ID, journalSha256, selector);
}

/**
 * Derive a single card matching the contract's derive_card(env, session_id, index).
 *
 * Contract logic:
 *   seed = keccak256(session_id_be4 || card_index_be4)
 *   colour = seed[0..4] % 5  (0-3 normal, 4 wild)
 *   value  = if wild: 13 + seed[4..8] % 2
 *            else:    seed[4..8] % 13
 */
export function deriveCard(sessionId: number, index: number): Card {
  const seedInput = new Uint8Array(8);
  const view = new DataView(seedInput.buffer);
  view.setUint32(0, sessionId >>> 0, false); // big-endian
  view.setUint32(4, index >>> 0, false);
  const seed = keccak256(seedInput);
  const seedView = new DataView(seed.buffer);
  const colourRaw = seedView.getUint32(0, false);
  const valueRaw  = seedView.getUint32(4, false);
  const colour = colourRaw % 5;
  const value  = colour === WILD ? 13 + (valueRaw % 2) : valueRaw % 13;
  return { colour, value };
}

/** Deal 7 cards to a player (index 0-6 for P1, 7-13 for P2) */
export function dealHand(sessionId: number, playerIndex: 0 | 1): Card[] {
  const start = playerIndex * 7;
  const cards: Card[] = [];
  for (let i = start; i < start + 7; i++) {
    cards.push(deriveCard(sessionId, i));
  }
  return cards;
}

/** Get the initial top-of-discard card (contract uses index 14, falling back if wild) */
export function deriveTopCard(sessionId: number): Card {
  const card = deriveCard(sessionId, 14);
  // Contract falls back to RED + value%10 if top is wild
  if (card.colour === WILD) {
    return { colour: RED, value: card.value % 10 };
  }
  return card;
}

/** Remove first occurrence of a card from hand (returns new array) */
export function removeCard(hand: Card[], colour: number, value: number): Card[] {
  const idx = hand.findIndex(c => c.colour === colour && c.value === value);
  if (idx === -1) return hand;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

/** Check if a card can be played on the current top (matches contract can_play) */
export function canPlay(card: Card, activeColour: number, topValue: number): boolean {
  if (card.colour === WILD)           return true;
  if (card.colour === activeColour)   return true;
  if (card.value === topValue && card.value <= DRAW_TWO) return true;
  return false;
}

/** Check if player has any card matching the active colour (for +4 legality) */
export function hasMatchingColour(hand: Card[], activeColour: number): boolean {
  return hand.some(c =>
    c.colour === activeColour &&
    c.colour !== WILD &&
    c.value !== WILD_CARD &&
    c.value !== WILD_DRAW4
  );
}

// ─── Service class ────────────────────────────────────────────────────────────

export class ZkUnoService {
  private baseClient: ZkUnoClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ZkUnoClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  private createSigningClient(
    publicKey: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): ZkUnoClient {
    return new ZkUnoClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    });
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async getGame(sessionId: number): Promise<Game | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      const result = await tx.simulate();
      return result.result ?? null;
    } catch {
      return null;
    }
  }

  // ─── Multi-sig start game (same pattern as DiceDuel) ──────────────────────

  /**
   * STEP 1 (Player 1): Build + simulate transaction, sign P1 auth entry, export XDR.
   * Player 1 shares this XDR string with Player 2 along with the session ID.
   */
  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player1Signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<string> {
    const buildClient = new ZkUnoClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2, // P2 is tx source
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries found in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    let player1AuthEntry = null;

    for (const entry of authEntries) {
      try {
        const entryAddressStr = Address.fromScAddress(
          entry.credentials().address().address()
        ).toString();
        if (entryAddressStr === player1) {
          player1AuthEntry = entry;
          break;
        }
      } catch { continue; }
    }

    if (!player1AuthEntry) {
      throw new Error(`No auth entry found for Player 1 (${player1})`);
    }

    const validUntil = await calculateValidUntilLedger(
      RPC_URL,
      authTtlMinutes ?? MULTI_SIG_AUTH_TTL_MINUTES
    );

    if (!player1Signer.signAuthEntry) {
      throw new Error('signAuthEntry not available');
    }

    const signedEntry = await authorizeEntry(
      player1AuthEntry,
      async (preimage) => {
        const signResult = await player1Signer.signAuthEntry!(
          preimage.toXDR('base64'),
          { networkPassphrase: NETWORK_PASSPHRASE, address: player1 }
        );
        if (signResult.error) {
          throw new Error(`Auth signing failed: ${signResult.error.message}`);
        }
        return Buffer.from(signResult.signedAuthEntry, 'base64');
      },
      validUntil,
      NETWORK_PASSPHRASE
    );

    return signedEntry.toXDR('base64');
  }

  /**
   * STEP 2 (Player 2): Rebuild the transaction, inject P1's signed auth entry,
   * P2 signs their auth, then submits.
   */
  async completeStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player1AuthEntryXdr: string,
    player2Signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const buildClient = new ZkUnoClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2,
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntil = await calculateValidUntilLedger(
      RPC_URL,
      authTtlMinutes ?? MULTI_SIG_AUTH_TTL_MINUTES
    );

    const txWithInjectedAuth = await injectSignedAuthEntry(
      tx,
      player1AuthEntryXdr,
      player2,
      player2Signer,
      validUntil
    );

    const p2Client = this.createSigningClient(player2, player2Signer);
    const p2Tx = p2Client.txFromXDR(txWithInjectedAuth.toXDR());

    const needsSigning = await p2Tx.needsNonInvokerSigningBy();
    if (needsSigning.includes(player2)) {
      await p2Tx.signAuthEntries({ expiration: validUntil });
    }

    const sent = await signAndSendViaLaunchtube(
      p2Tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntil
    );

    return sent.result;
  }

  // ─── In-game actions ───────────────────────────────────────────────────────

  /**
   * ZK-enhanced hand commitment — uses a RISC Zero proof instead of bare keccak.
   *
   * For demo / hackathon: builds a mock seal compatible with the NethermindEth
   * testnet mock verifier. In production, replace `seal` with a real Groth16
   * proof generated by running the `zk-uno-guest` program with the RISC Zero SDK.
   *
   * The guest proves (inside the zkVM, without revealing hand contents):
   *   1. keccak256(hand_bytes || salt) == hand_hash
   *   2. hand_bytes encodes exactly 7 valid UNO cards
   *
   * @param sessionId  Game session ID (scopes the proof to prevent replay)
   * @param player     Stellar address of the committing player
   * @param handHash   keccak256(hand_bytes || salt) commitment (32 bytes)
   * @param signer     Transaction signer from wallet
   * @param customSeal Optional: supply a real RISC Zero seal to override the mock
   */
  async commitHandZk(
    sessionId: number,
    player: string,
    handHash: Uint8Array,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    customSeal?: Uint8Array,
    /** Optional private inputs — required for prover server path */
    privateInputs?: { handBytes: Uint8Array; salt: Uint8Array }
  ) {
    let seal: Uint8Array;
    if (customSeal) {
      seal = customSeal;
    } else if (privateInputs) {
      // Try prover server (executes guest ELF, honest seal)
      const proverSeal = await callProver('/prove/commit', {
        hand_bytes: Array.from(privateInputs.handBytes),
        salt: Array.from(privateInputs.salt),
        session_id: sessionId,
        hand_hash: Buffer.from(handHash).toString('hex'),
      });
      if (proverSeal) {
        seal = proverSeal;
      } else {
        // Fall back to local mock seal
        const journalSha256 = await computeZkJournalSha256(sessionId, handHash);
        seal = await buildMockSeal(ZK_UNO_IMAGE_ID, journalSha256);
      }
    } else {
      // Local mock seal (no prover available)
      const journalSha256 = await computeZkJournalSha256(sessionId, handHash);
      seal = await buildMockSeal(ZK_UNO_IMAGE_ID, journalSha256);
    }

    const client = this.createSigningClient(player, signer);
    const tx = await client.commit_hand_zk({
      session_id: sessionId,
      player,
      hand_hash: Buffer.from(handHash),
      zk_seal: Buffer.from(seal),
    }, DEFAULT_METHOD_OPTIONS);

    const validUntil = await calculateValidUntilLedger(RPC_URL, 5);
    return signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntil);
  }

  /**
   * Play a card using a ZK proof — hand bytes never sent to chain.
   *
   * The RISC Zero proof proves (inside the zkVM):
   *   - played card exists in old hand
   *   - new_hand = old_hand − played_card (honest removal)
   *   - new_hash = keccak256(new_hand || new_salt)
   *   - +4 legality: if played_value == WILD_DRAW4, no card in old_hand
   *     matches active_colour
   *   - is_winner = (new_hand.length == 0)
   *   - is_uno    = (new_hand.length == 1)
   *
   * The contract verifies the proof using `risc0.verify(seal, MOVE_IMAGE_ID, ...)`.
   * It only learns: played card, new_hash, is_winner, is_uno — never hand contents.
   *
   * @param sessionId     Game session ID
   * @param player        Player's Stellar address
   * @param oldHand       Full old hand (private, stays in browser)
   * @param oldSalt       Old hand commitment salt (private)
   * @param playedCard    Card to play
   * @param newHand       New hand after removing played card (private)
   * @param newSalt       New salt for updated commitment (private)
   * @param wildColour    Chosen colour for wild (0-3; ignored for non-wild)
   * @param activeColour  game.active_colour from on-chain state
   * @param signer        Transaction signer from wallet
   * @param customSeal    Optional real RISC Zero seal (overrides mock)
   */
  async playCardZk(
    sessionId: number,
    player: string,
    oldHand: Card[],
    oldSalt: Uint8Array,
    playedCard: Card,
    newHand: Card[],
    newSalt: Uint8Array,
    wildColour: number,
    activeColour: number,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    customSeal?: Uint8Array
  ) {
    const oldHandBytes = encodeHand(oldHand);
    const newHandBytes = encodeHand(newHand);
    const oldHash = computeHandHash(oldHandBytes, oldSalt);
    const newHash = computeHandHash(newHandBytes, newSalt);
    const isWinner = newHand.length === 0;
    const isUno    = newHand.length === 1;

    let seal: Uint8Array;
    if (customSeal) {
      seal = customSeal;
    } else {
      // Try prover server first; fall back to local mock on failure
      const proverSeal = await callProver('/prove/move', {
        old_hand: Array.from(oldHandBytes),
        old_salt: Array.from(oldSalt),
        new_hand: Array.from(newHandBytes),
        new_salt: Array.from(newSalt),
        session_id: sessionId,
        played_colour: playedCard.colour,
        played_value: playedCard.value,
        wild_colour: wildColour,
        active_colour: activeColour,
      });
      seal = proverSeal ?? await buildMoveSeal(
        sessionId, oldHash, newHash,
        playedCard.colour, playedCard.value,
        wildColour, activeColour,
        isWinner, isUno
      );
    }

    const client = this.createSigningClient(player, signer);
    const tx = await client.play_card_zk({
      session_id: sessionId,
      player,
      played_colour: playedCard.colour,
      played_value: playedCard.value,
      wild_colour: wildColour,
      new_hand_hash: Buffer.from(newHash),
      zk_seal: Buffer.from(seal),
      is_winner: isWinner,
      is_uno: isUno,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntil = await calculateValidUntilLedger(RPC_URL, 5);
    return signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntil);
  }

  /**
   * Draw a card using a ZK proof — hand bytes never sent to chain.
   *
   * The RISC Zero proof proves (inside the zkVM):
   *   - drawn_card = derive_card(session_id, draw_count)  (deterministic deck)
   *   - new_hand = old_hand ++ drawn_card            (honest append)
   *   - new_hash = keccak256(new_hand || new_salt)
   *
   * The contract verifies the proof and checks draw_count matches game state,
   * preventing forgery of which card was drawn.
   * Hand contents and card count stay private.
   *
   * @param sessionId  Game session ID
   * @param player     Player's Stellar address
   * @param oldHand    Full old hand (private, stays in browser)
   * @param oldSalt    Old hand commitment salt (private)
   * @param newSalt    New salt for updated commitment (private)
   * @param drawCount  game.draw_count from on-chain state (public)
   * @param signer     Transaction signer from wallet
   * @param customSeal Optional real RISC Zero seal (overrides mock)
   */
  async drawCardZk(
    sessionId: number,
    player: string,
    oldHand: Card[],
    oldSalt: Uint8Array,
    newSalt: Uint8Array,
    drawCount: number,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    customSeal?: Uint8Array
  ) {
    // Replicate the contract's derive_card — same card will be drawn
    const drawnCard = deriveCard(sessionId, drawCount);
    const newHand = [...oldHand, drawnCard];

    const oldHandBytes = encodeHand(oldHand);
    const newHandBytes = encodeHand(newHand);
    const oldHash = computeHandHash(oldHandBytes, oldSalt);
    const newHash = computeHandHash(newHandBytes, newSalt);

    let seal: Uint8Array;
    if (customSeal) {
      seal = customSeal;
    } else {
      // Try prover server first; fall back to local mock on failure
      const proverSeal = await callProver('/prove/draw', {
        old_hand: Array.from(oldHandBytes),
        old_salt: Array.from(oldSalt),
        new_hand: Array.from(newHandBytes),
        new_salt: Array.from(newSalt),
        session_id: sessionId,
        draw_count: drawCount,
      });
      seal = proverSeal ?? await buildDrawSeal(sessionId, oldHash, newHash, drawCount);
    }

    const client = this.createSigningClient(player, signer);
    const tx = await client.draw_card_zk({
      session_id: sessionId,
      player,
      new_hand_hash: Buffer.from(newHash),
      zk_seal: Buffer.from(seal),
    }, DEFAULT_METHOD_OPTIONS);

    const validUntil = await calculateValidUntilLedger(RPC_URL, 5);
    const result = await signAndSendViaLaunchtube(
      tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntil
    );
    // Return the new hand including the drawn card so the frontend can update local state
    return { result, drawnCard, newHand, newHash, newSalt };
  }

  /**
   * Declare UNO using a ZK proof — proves exactly 1 card remains without
   * revealing which card it is.
   *
   * The RISC Zero proof proves (inside the zkVM):
   *   - keccak256(hand_bytes || salt) == stored hand_hash
   *   - hand_bytes encodes exactly 1 valid UNO card
   *
   * @param sessionId  Game session ID
   * @param player     Player's Stellar address
   * @param hand       Current hand (must have exactly 1 card, private)
   * @param salt       Hand commitment salt (private)
   * @param signer     Transaction signer from wallet
   * @param customSeal Optional real RISC Zero seal (overrides prover / mock)
   */
  async declareUnoZk(
    sessionId: number,
    player: string,
    hand: Card[],
    salt: Uint8Array,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    customSeal?: Uint8Array
  ) {
    const handBytes = encodeHand(hand);
    const handHash  = computeHandHash(handBytes, salt);

    let seal: Uint8Array;
    if (customSeal) {
      seal = customSeal;
    } else {
      // Try prover server first; fall back to local mock on failure
      const proverSeal = await callProver('/prove/uno', {
        hand_bytes: Array.from(handBytes),
        salt: Array.from(salt),
        session_id: sessionId,
        hand_hash: Buffer.from(handHash).toString('hex'),
      });
      seal = proverSeal ?? await buildUnoSeal(sessionId, handHash);
    }

    const client = this.createSigningClient(player, signer);
    const tx = await client.declare_uno_zk({
      session_id: sessionId,
      player,
      zk_seal: Buffer.from(seal),
    }, DEFAULT_METHOD_OPTIONS);

    const validUntil = await calculateValidUntilLedger(RPC_URL, 5);
    return signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntil);
  }
}
