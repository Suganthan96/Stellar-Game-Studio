/**
 * ZK-UNO service for Next.js
 * Adapted from zk-uno-frontend/src/games/zk-uno/zkUnoService.ts
 * Key changes: uses process.env (Next.js), kit-compatible signer interface,
 * inline txHelper, no import.meta.env
 */

import { Buffer } from 'buffer';
import { contract, Address, authorizeEntry, xdr, TransactionBuilder, rpc, Operation, nativeToScVal } from '@stellar/stellar-sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import { Client as ZkUnoClient, type Game } from './bindings';
import {
  RPC_URL,
  NETWORK_PASSPHRASE,
  ZK_UNO_CONTRACT,
  PROVER_URL,
  DEFAULT_TIMEOUT,
  MULTI_SIG_TTL_MINUTES,
  DEFAULT_AUTH_TTL_MINUTES,
  SIMULATION_SOURCE,
} from './config';
import { calculateValidUntilLedger } from './ledgerUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { Game };

export interface Card {
  colour: number;
  value: number;
}

/** Wallet signer interface — matches what stellar-wallets-kit provides */
export interface WalletSigner {
  address: string;
  signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string }>;
  signAuthEntry?(entryXdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedAuthEntry: string; error?: Error }>;
}

// ─── Card constants ────────────────────────────────────────────────────────────

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

export const COLOUR_NAMES   = ['Red', 'Yellow', 'Green', 'Blue', 'Wild'];
export const COLOUR_CLASSES = [
  'bg-red-500',
  'bg-yellow-400',
  'bg-green-500',
  'bg-blue-500',
  'bg-gray-700',
];
export const VALUE_NAMES = (v: number) => {
  if (v <= 9)               return String(v);
  if (v === SKIP)           return 'Skip';
  if (v === REVERSE)        return 'Rev';
  if (v === DRAW_TWO)       return '+2';
  if (v === WILD_CARD)      return 'Wild';
  if (v === WILD_DRAW4)     return '+4';
  return '?';
};

// ─── Hand helpers ────────────────────────────────────────────────────────────

export function encodeHand(cards: Card[]): Uint8Array {
  const buf = new Uint8Array(cards.length * 2);
  for (let i = 0; i < cards.length; i++) {
    buf[i * 2]     = cards[i].colour;
    buf[i * 2 + 1] = cards[i].value;
  }
  return buf;
}

export function decodeHand(bytes: Uint8Array): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    cards.push({ colour: bytes[i], value: bytes[i + 1] });
  }
  return cards;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function computeHandHash(handBytes: Uint8Array, salt: Uint8Array): Uint8Array {
  return keccak256(concat(handBytes, salt));
}

export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}

// ─── IMAGE_IDs ────────────────────────────────────────────────────────────────

export const ZK_UNO_IMAGE_ID = new Uint8Array([
  0xb7, 0x21, 0x64, 0x47, 0x95, 0xbe, 0xce, 0x69,
  0xd9, 0x5e, 0x97, 0x52, 0x12, 0xf2, 0xd9, 0x6c,
  0xfb, 0x9d, 0xf1, 0x21, 0x27, 0xe8, 0xb3, 0x65,
  0x38, 0xab, 0xa6, 0x57, 0xb7, 0xcc, 0x3c, 0x08,
]);

export const ZK_UNO_MOVE_IMAGE_ID = new Uint8Array([
  0x01, 0x84, 0xe7, 0x52, 0x61, 0x29, 0xc9, 0x3e,
  0x6a, 0x6c, 0xfa, 0x22, 0xe8, 0x26, 0x95, 0x4d,
  0xe3, 0xf5, 0x98, 0x57, 0x4d, 0xd5, 0xb9, 0x27,
  0x92, 0x93, 0xdb, 0x3a, 0x7f, 0x74, 0xc9, 0x62,
]);

export const ZK_UNO_DRAW_IMAGE_ID = new Uint8Array([
  0xca, 0xa5, 0xc9, 0x75, 0x2b, 0x08, 0x63, 0x13,
  0x2d, 0x41, 0xac, 0x6a, 0x21, 0xc5, 0xb3, 0x71,
  0x5e, 0x3a, 0xc3, 0x19, 0x49, 0x6d, 0x99, 0x36,
  0xfe, 0x24, 0xb7, 0x65, 0x92, 0xca, 0x70, 0x67,
]);

export const ZK_UNO_UNO_IMAGE_ID = new Uint8Array([
  0xf3, 0x15, 0x81, 0x27, 0xcf, 0xb8, 0x13, 0x68,
  0x58, 0x4b, 0x80, 0x1e, 0xaa, 0x5c, 0x5e, 0x1b,
  0x88, 0x9b, 0x5b, 0x4c, 0x27, 0xed, 0x06, 0x0d,
  0xa6, 0xed, 0xfc, 0x3b, 0xcb, 0x02, 0xb3, 0x73,
]);

export const GROTH16_RISC0_SELECTOR = new Uint8Array([0x73, 0xc4, 0x57, 0xba]);

// ─── SHA-256 / ZK seal helpers ─────────────────────────────────────────────────

export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const buf = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer);
  return new Uint8Array(buf);
}

export function buildZkJournalBytes(sessionId: number, handHash: Uint8Array): Uint8Array {
  const out = new Uint8Array(36);
  new DataView(out.buffer).setUint32(0, sessionId, false);
  out.set(handHash, 4);
  return out;
}

export async function buildMockSeal(
  imageId: Uint8Array,
  journalSha256: Uint8Array,
  selector: Uint8Array = GROTH16_RISC0_SELECTOR
): Promise<Uint8Array> {
  const TAG_OUTPUT = new Uint8Array([
    0x77, 0xea, 0xfe, 0xb3, 0xdf, 0xc3, 0x4a, 0x1c,
    0x6b, 0x44, 0x5d, 0x3e, 0xf2, 0x6d, 0x12, 0x32,
    0x2e, 0xa4, 0x84, 0x72, 0x40, 0x14, 0x0a, 0x9a,
    0xf8, 0x22, 0x08, 0x5f, 0x75, 0xdc, 0x4e, 0xa0,
  ]);
  const zeros32 = new Uint8Array(32);
  const outputLenTag = new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const outputDigest = await sha256Async(concat(concat(concat(TAG_OUTPUT, journalSha256), zeros32), outputLenTag));

  const TAG_CLAIM = new Uint8Array([
    0xcb, 0x1f, 0xef, 0xcd, 0x6d, 0xda, 0x1c, 0x3c,
    0x74, 0x91, 0xb3, 0x09, 0x22, 0xf7, 0x0b, 0xc0,
    0x5e, 0xcf, 0xff, 0xf6, 0xb2, 0x2e, 0x73, 0x61,
    0x78, 0x06, 0x9f, 0x14, 0x51, 0x48, 0x72, 0x64,
  ]);
  const POST_STATE_HALTED = new Uint8Array([
    0xa3, 0xac, 0xc2, 0x71, 0x26, 0x03, 0x80, 0x27,
    0x81, 0xa2, 0xae, 0x6d, 0x44, 0x56, 0x28, 0x6e,
    0x73, 0x79, 0x11, 0x7a, 0x74, 0xe2, 0x10, 0x88,
    0x28, 0xb6, 0xb4, 0x8e, 0x5a, 0xab, 0x3e, 0x0b,
  ]);
  const claimSuffix = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const claimDigest = await sha256Async(
    concat(concat(concat(concat(concat(TAG_CLAIM, zeros32), imageId), POST_STATE_HALTED), outputDigest), claimSuffix)
  );

  const seal = new Uint8Array(36);
  seal.set(selector, 0);
  seal.set(claimDigest, 4);
  return seal;
}

// ─── Journal builders ─────────────────────────────────────────────────────────

export function buildMoveJournalBytes(
  sessionId: number, oldHash: Uint8Array, newHash: Uint8Array,
  playedColour: number, playedValue: number, wildColour: number,
  activeColour: number, isWinner: boolean, isUno: boolean
): Uint8Array {
  const out = new Uint8Array(74);
  const v = new DataView(out.buffer);
  v.setUint32(0, sessionId >>> 0, false);
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

export function buildDrawJournalBytes(
  sessionId: number, oldHash: Uint8Array, newHash: Uint8Array, drawCount: number
): Uint8Array {
  const out = new Uint8Array(72);
  const v = new DataView(out.buffer);
  v.setUint32(0, sessionId >>> 0, false);
  out.set(oldHash, 4);
  out.set(newHash, 36);
  v.setUint32(68, drawCount >>> 0, false);
  return out;
}

export async function buildMoveSeal(
  sessionId: number, oldHash: Uint8Array, newHash: Uint8Array,
  playedColour: number, playedValue: number, wildColour: number,
  activeColour: number, isWinner: boolean, isUno: boolean
): Promise<Uint8Array> {
  const j = buildMoveJournalBytes(sessionId, oldHash, newHash, playedColour, playedValue, wildColour, activeColour, isWinner, isUno);
  return buildMockSeal(ZK_UNO_MOVE_IMAGE_ID, await sha256Async(j));
}

export async function buildDrawSeal(
  sessionId: number, oldHash: Uint8Array, newHash: Uint8Array, drawCount: number
): Promise<Uint8Array> {
  const j = buildDrawJournalBytes(sessionId, oldHash, newHash, drawCount);
  return buildMockSeal(ZK_UNO_DRAW_IMAGE_ID, await sha256Async(j));
}

export async function buildUnoSeal(sessionId: number, handHash: Uint8Array): Promise<Uint8Array> {
  const j = buildZkJournalBytes(sessionId, handHash);
  return buildMockSeal(ZK_UNO_UNO_IMAGE_ID, await sha256Async(j));
}

// ─── Card derivation ──────────────────────────────────────────────────────────

export function deriveCard(sessionId: number, index: number): Card {
  const input = new Uint8Array(8);
  const v = new DataView(input.buffer);
  v.setUint32(0, sessionId >>> 0, false);
  v.setUint32(4, index >>> 0, false);
  const seed = keccak256(input);
  const sv = new DataView(seed.buffer);
  const colour = sv.getUint32(0, false) % 5;
  const value  = colour === WILD ? 13 + (sv.getUint32(4, false) % 2) : sv.getUint32(4, false) % 13;
  return { colour, value };
}

export function dealHand(sessionId: number, playerIndex: 0 | 1): Card[] {
  const start = playerIndex * 7;
  return Array.from({ length: 7 }, (_, i) => deriveCard(sessionId, start + i));
}

export function deriveTopCard(sessionId: number): Card {
  const card = deriveCard(sessionId, 14);
  return card.colour === WILD ? { colour: RED, value: card.value % 10 } : card;
}

export function removeCard(hand: Card[], colour: number, value: number): Card[] {
  const idx = hand.findIndex(c => c.colour === colour && c.value === value);
  return idx === -1 ? hand : [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

export function canPlay(card: Card, activeColour: number, topValue: number): boolean {
  if (card.colour === WILD) return true;
  if (card.colour === activeColour) return true;
  if (card.value === topValue && card.value <= DRAW_TWO) return true;
  return false;
}

export function hasMatchingColour(hand: Card[], activeColour: number): boolean {
  return hand.some(c => c.colour === activeColour && c.colour !== WILD);
}

// ─── Prover server ────────────────────────────────────────────────────────────

async function callProver(endpoint: string, body: Record<string, unknown>): Promise<Uint8Array | undefined> {
  try {
    const resp = await fetch(`${PROVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return undefined;
    const { seal } = await resp.json();
    return new Uint8Array(Buffer.from(seal as string, 'hex'));
  } catch {
    return undefined;
  }
}

// ─── TX helper ────────────────────────────────────────────────────────────────

async function sendTx(tx: contract.AssembledTransaction<any>) {
  // SDK v14: tx is already simulated after construction; no .simulate() method.
  try {
    return await tx.signAndSend();
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NoSignatureNeededError') || msg.includes('This is a read call')) {
      try {
        return await tx.signAndSend({ force: true });
      } catch {
        return { result: (tx as any).result } as any;
      }
    }
    throw err;
  }
}

// ─── SDK signer adapter ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sdkSigner(walletSigner: WalletSigner): any {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signTransaction: (async (txXdr: string, opts?: { networkPassphrase?: string }) => {
      const { signedTxXdr } = await walletSigner.signTransaction(txXdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: walletSigner.address,
      });
      return { signedTxXdr };  // SDK expects { signedTxXdr }, not a bare string
    }) as any,
    signAuthEntry: walletSigner.signAuthEntry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (async (entryXdr: string, opts?: { networkPassphrase?: string }) => {
          const result = await walletSigner.signAuthEntry!(entryXdr, {
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
            address: walletSigner.address,
          });
          if (result.error) throw result.error;
          return result.signedAuthEntry;
        }) as any
      : undefined,
  };
}

// ─── Service class ────────────────────────────────────────────────────────────

export class ZkUnoService {
  private baseClient: ZkUnoClient;

  constructor(contractId: string = ZK_UNO_CONTRACT) {
    this.baseClient = new ZkUnoClient({
      contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: SIMULATION_SOURCE,
    });
  }

  private signingClient(walletSigner: WalletSigner): ZkUnoClient {
    return new ZkUnoClient({
      contractId: this.baseClient.options.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: walletSigner.address,
      ...sdkSigner(walletSigner),
    });
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async getGame(sessionId: number): Promise<Game | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      // SDK v14: get_game is a read-only call; result is available immediately
      // after construction (which internally simulates). No .simulate() method.
      return tx.result ?? null;
    } catch (e) {
      console.error('[getGame] error fetching session', sessionId, e);
      return null;
    }
  }

  // ─── Multi-sig start_game (P1 signs auth → P2 submits) ────────────────────

  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    p1Signer: WalletSigner
  ): Promise<{ authXdr: string; simDataXdr: string; simAuthP2Xdr: string; minResourceFee: string; }> {
    // Use a neutral dev/admin address as the simulation fee-source so that
    // BOTH player1 and player2 receive Address credentials in the auth list.
    // If we use player1 as publicKey, that player gets SourceAccount creds
    // (satisfied by the tx signature) rather than an Address entry we can sign.
    const buildClient = new ZkUnoClient({
      contractId: this.baseClient.options.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: SIMULATION_SOURCE,
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, { timeoutInSeconds: DEFAULT_TIMEOUT });

    if (!tx.simulationData?.result?.auth) throw new Error('No auth entries found');

    let p1Entry: xdr.SorobanAuthorizationEntry | null = null;
    for (const entry of tx.simulationData.result.auth) {
      try {
        const addr = Address.fromScAddress(entry.credentials().address().address()).toString();
        if (addr === player1) { p1Entry = entry; break; }
      } catch { continue; }
    }
    if (!p1Entry) throw new Error(`No auth entry found for Player 1 (${player1})`);

    const validUntil = await calculateValidUntilLedger(MULTI_SIG_TTL_MINUTES);
    const p1Sdk = sdkSigner(p1Signer);
    if (!p1Sdk.signAuthEntry) throw new Error('Wallet does not support signAuthEntry');

    // authorizeEntry calls the signer callback with the HashIdPreimage object.
    // The callback must return the raw 64-byte Ed25519 signature bytes.
    // Wallets (Freighter via StellarWalletsKit) accept the preimage XDR,
    // hash it with SHA-256, sign it, and return the raw 64-byte signature
    // (base64-encoded) as signedAuthEntry.
    console.log('[prepareStartGame] signing P1 auth entry, valid_until:', validUntil);
    const signedEntry = await authorizeEntry(
      p1Entry,
      async (preimage) => {
        // preimage is xdr.HashIdPreimage — pass its XDR to the wallet
        const signed = await p1Sdk.signAuthEntry!(
          preimage.toXDR('base64'),
          { networkPassphrase: NETWORK_PASSPHRASE }
        );
        // signed is base64-encoded raw 64-byte Ed25519 signature
        return Buffer.from(signed, 'base64');
      },
      validUntil,
      NETWORK_PASSPHRASE
    );
    console.log('[prepareStartGame] signed entry expiration:', signedEntry.credentials().address().signatureExpirationLedger());

    // Capture the simulation footprint (SorobanTransactionData) so that
    // completeStartGame can use the SAME nonce key P1 signed against.
    // Without this, a fresh simulation in completeStartGame produces a
    // different nonce, and the on-chain nonce access traps with
    // "nonce outside of footprint".
    const simResult = tx.simulationData;
    const simDataXdr = simResult.transactionData.toXDR('base64');
    const minResourceFee: string = (tx as any).simulation?.minResourceFee ?? '0';
    const p2AuthStub = (simResult.result!.auth as xdr.SorobanAuthorizationEntry[]).find(e => {
      try {
        return Address.fromScAddress(e.credentials().address().address()).toString() === player2;
      } catch { return false; }
    });
    if (!p2AuthStub) throw new Error('No auth stub found for Player 2 in simulation');

    return {
      authXdr: signedEntry.toXDR('base64'),
      simDataXdr,
      simAuthP2Xdr: p2AuthStub.toXDR('base64'),
      minResourceFee,
    };
  }

  async completeStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player1AuthXdr: string,
    simDataXdr: string,
    simAuthP2Xdr: string,
    minResourceFee: string,
    p2Signer: WalletSigner
  ) {
    // ── Root cause fix: nonce footprint ──────────────────────────────────────
    // P1 pre-signed their auth entry against a nonce N1 produced by sim1.
    // Any fresh re-simulation in this function would produce a DIFFERENT nonce
    // N2.  If we assemble from that new sim, the footprint only contains N2's
    // ledger key; P1's actual nonce N1 is outside the footprint, causing
    // "invokeHostFunctionTrapped: nonce outside of footprint".
    //
    // Fix: P1 includes their sim's SorobanTransactionData (footprint+resources)
    // and P2's auth stub in the invite bundle.  We bake that footprint directly
    // into the P2 transaction via TransactionBuilder.setSorobanData(), then
    // inject P1's signed auth entry + a SourceAccount entry for P2 (P2 is the
    // tx source, so the envelope signature satisfies their auth automatically).
    const server = new rpc.Server(RPC_URL);
    const signedP1 = xdr.SorobanAuthorizationEntry.fromXDR(player1AuthXdr, 'base64');
    const simAuthP2 = xdr.SorobanAuthorizationEntry.fromXDR(simAuthP2Xdr, 'base64');
    const sorobanData = xdr.SorobanTransactionData.fromXDR(simDataXdr, 'base64');

    // Build P2's transaction with the correct footprint from sim1
    const p2Acct = await server.getAccount(player2);
    const fee = (500_000 + Number(minResourceFee)).toString();
    const p2Tx = new TransactionBuilder(p2Acct, { fee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.invokeContractFunction({
        contract: ZK_UNO_CONTRACT,
        function: 'start_game',
        args: [
          nativeToScVal(sessionId, { type: 'u32' }),
          new Address(player1).toScVal(),
          new Address(player2).toScVal(),
          nativeToScVal(player1Points, { type: 'i128' }),
          nativeToScVal(player2Points, { type: 'i128' }),
        ],
      }))
      .setTimeout(60)
      .setSorobanData(sorobanData)
      .build();

    // Inject auth entries into the raw XDR operation
    const rawAuth = (p2Tx as any)._tx.operations()[0].body().invokeHostFunctionOp().auth() as xdr.SorobanAuthorizationEntry[];
    rawAuth.push(signedP1);
    // P2 uses SourceAccount credentials — satisfied by P2 signing the envelope
    rawAuth.push(new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: simAuthP2.rootInvocation(),
    }));
    console.log('[completeStartGame] auth injected: P1=Address, P2=SourceAccount');

    // Sign the envelope with P2's wallet
    console.log('[completeStartGame] signing envelope as P2…');
    const signerFn = sdkSigner(p2Signer);
    const envelopeXdr: string = p2Tx.toEnvelope().toXDR('base64');
    const { signedTxXdr } = await signerFn.signTransaction(envelopeXdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    // Submit the signed transaction
    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
    console.log('[completeStartGame] submitting tx…');
    const sendResult = await server.sendTransaction(signedTx);
    console.log('[completeStartGame] sendTransaction status:', sendResult.status);

    if (sendResult.status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    // Poll for confirmation
    const hash = sendResult.hash;
    let getResult = await server.getTransaction(hash);
    const start = Date.now();
    while (getResult.status === 'NOT_FOUND' && Date.now() - start < 30_000) {
      await new Promise(r => setTimeout(r, 2000));
      getResult = await server.getTransaction(hash);
    }
    console.log('[completeStartGame] tx status:', getResult.status);
    if (getResult.status !== 'SUCCESS') {
      // Decode the Soroban result for a useful error message
      // In SDK v14, resultXdr and resultMetaXdr are already parsed XDR objects
      const resultXdr = (getResult as any).resultXdr as xdr.TransactionResult | undefined;
      const metaXdr   = (getResult as any).resultMetaXdr as xdr.TransactionMeta | undefined;
      let detail = '';
      try {
        if (resultXdr) {
          const results = (resultXdr as any).result?.()?.results?.() ?? [];
          const names = results.map((r: any) => {
            try { return r.tr().invokeHostFunctionResult().switch().name; } catch { return String(r); }
          });
          detail += ` | invokeResult: ${JSON.stringify(names)}`;
        }
      } catch (decodeErr) {
        detail += ` | resultXdr err: ${decodeErr}`;
      }
      try {
        if (metaXdr) {
          // TransactionMeta varies: v3 has diagnosticEvents, v2/v1 don't.
          // v3() throws (not returns undefined) when the meta isn't v3 format.
          let sorobanMeta: any = null;
          try { sorobanMeta = (metaXdr as any).v3().sorobanMeta(); } catch { /* not v3 */ }
          if (sorobanMeta) {
            const retVal = sorobanMeta.returnValue?.();
            detail += ` | returnValue: ${retVal?.switch?.()?.name}`;
            const events = sorobanMeta.diagnosticEvents?.() ?? [];
            events.forEach((ev: any, idx: number) => {
              try {
                const d = ev.event().body().v0();
                const topics = d.topics().map((t: any) => { try { return t.switch().name + ':' + JSON.stringify(t.value()); } catch { return '?'; } });
                detail += ` | diag[${idx}]: ${topics.join(',')}`;
              } catch { /* skip */ }
            });
          } else {
            detail += ` | (meta not v3, no diagnostic events available)`;
          }
        }
      } catch (metaErr) { detail += ` | metaXdr err: ${metaErr}`; }
      console.error('[completeStartGame] FAILED detail:', detail);
      throw new Error(`Transaction failed: ${getResult.status}${detail}`);
    }
    return getResult;
  }

  // ─── Commit hand ──────────────────────────────────────────────────────────

  async commitHandZk(
    sessionId: number,
    player: string,
    handHash: Uint8Array,
    p: WalletSigner,
    privateInputs?: { handBytes: Uint8Array; salt: Uint8Array }
  ) {
    let seal: Uint8Array;
    if (privateInputs) {
      const proverSeal = await callProver('/prove/commit', {
        hand_bytes: Array.from(privateInputs.handBytes),
        salt: Array.from(privateInputs.salt),
        session_id: sessionId,
        hand_hash: Buffer.from(handHash).toString('hex'),
      });
      seal = proverSeal ?? await buildMockSeal(ZK_UNO_IMAGE_ID, await sha256Async(buildZkJournalBytes(sessionId, handHash)));
    } else {
      seal = await buildMockSeal(ZK_UNO_IMAGE_ID, await sha256Async(buildZkJournalBytes(sessionId, handHash)));
    }

    const client = this.signingClient(p);
    const tx = await client.commit_hand_zk({
      session_id: sessionId,
      player,
      hand_hash: Buffer.from(handHash),
      zk_seal: Buffer.from(seal),
    }, { timeoutInSeconds: DEFAULT_TIMEOUT });
    return sendTx(tx);
  }

  // ─── Play card ────────────────────────────────────────────────────────────

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
    p: WalletSigner
  ) {
    const oldHandBytes = encodeHand(oldHand);
    const newHandBytes = encodeHand(newHand);
    const oldHash = computeHandHash(oldHandBytes, oldSalt);
    const newHash = computeHandHash(newHandBytes, newSalt);
    const isWinner = newHand.length === 0;
    const isUno    = newHand.length === 1;

    const proverSeal = await callProver('/prove/move', {
      old_hand: Array.from(oldHandBytes), old_salt: Array.from(oldSalt),
      new_hand: Array.from(newHandBytes), new_salt: Array.from(newSalt),
      session_id: sessionId,
      played_colour: playedCard.colour, played_value: playedCard.value,
      wild_colour: wildColour, active_colour: activeColour,
    });
    const seal = proverSeal ?? await buildMoveSeal(
      sessionId, oldHash, newHash,
      playedCard.colour, playedCard.value, wildColour, activeColour,
      isWinner, isUno
    );

    const client = this.signingClient(p);
    const tx = await client.play_card_zk({
      session_id: sessionId, player,
      played_colour: playedCard.colour, played_value: playedCard.value,
      wild_colour: wildColour, new_hand_hash: Buffer.from(newHash),
      zk_seal: Buffer.from(seal), is_winner: isWinner, is_uno: isUno,
    }, { timeoutInSeconds: DEFAULT_TIMEOUT });
    return sendTx(tx);
  }

  // ─── Draw card ────────────────────────────────────────────────────────────

  async drawCardZk(
    sessionId: number,
    player: string,
    oldHand: Card[],
    oldSalt: Uint8Array,
    newSalt: Uint8Array,
    drawCount: number,
    p: WalletSigner
  ) {
    const drawnCard = deriveCard(sessionId, drawCount);
    const newHand = [...oldHand, drawnCard];
    const oldHandBytes = encodeHand(oldHand);
    const newHandBytes = encodeHand(newHand);
    const oldHash = computeHandHash(oldHandBytes, oldSalt);
    const newHash = computeHandHash(newHandBytes, newSalt);

    const proverSeal = await callProver('/prove/draw', {
      old_hand: Array.from(oldHandBytes), old_salt: Array.from(oldSalt),
      new_hand: Array.from(newHandBytes), new_salt: Array.from(newSalt),
      session_id: sessionId, draw_count: drawCount,
    });
    const seal = proverSeal ?? await buildDrawSeal(sessionId, oldHash, newHash, drawCount);

    const client = this.signingClient(p);
    const tx = await client.draw_card_zk({
      session_id: sessionId, player,
      new_hand_hash: Buffer.from(newHash),
      zk_seal: Buffer.from(seal),
    }, { timeoutInSeconds: DEFAULT_TIMEOUT });
    const result = await sendTx(tx);
    return { result, drawnCard, newHand, newHash, newSalt };
  }

  // ─── Declare UNO ─────────────────────────────────────────────────────────

  async declareUnoZk(
    sessionId: number,
    player: string,
    hand: Card[],
    salt: Uint8Array,
    p: WalletSigner
  ) {
    const handBytes = encodeHand(hand);
    const handHash  = computeHandHash(handBytes, salt);

    const proverSeal = await callProver('/prove/uno', {
      hand_bytes: Array.from(handBytes), salt: Array.from(salt),
      session_id: sessionId, hand_hash: Buffer.from(handHash).toString('hex'),
    });
    const seal = proverSeal ?? await buildUnoSeal(sessionId, handHash);

    const client = this.signingClient(p);
    const tx = await client.declare_uno_zk({
      session_id: sessionId, player, zk_seal: Buffer.from(seal),
    }, { timeoutInSeconds: DEFAULT_TIMEOUT });
    return sendTx(tx);
  }
}
