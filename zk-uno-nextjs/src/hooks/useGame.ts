'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ZkUnoService,
  dealHand,
  deriveCard,
  computeHandHash,
  encodeHand,
  randomSalt,
  removeCard,
  canPlay,
  DRAW_TWO,
  WILD_DRAW4,
  type Card,
  type Game,
  type WalletSigner,
} from '@/lib/zkUnoService';
import { ZK_UNO_CONTRACT } from '@/lib/config';

const svc = new ZkUnoService(ZK_UNO_CONTRACT);

export interface GameState {
  game: Game | null;
  myHand: Card[];
  mySalt: Uint8Array | null;
  playerIndex: 0 | 1 | null;
  isMyTurn: boolean;
  handCommitted: boolean;
  unoDeclaimed: boolean;
  pendingDraws: number;
  loading: string | null;
  error: string | null;
  commitHand: () => Promise<void>;
  playCard: (card: Card, wildColour?: number) => Promise<void>;
  drawCard: () => Promise<void>;
  declareUno: () => Promise<void>;
  clearError: () => void;
}

export function useGame(sessionId: number | null, address: string | null, signer: WalletSigner | null): GameState {
  const [game, setGame] = useState<Game | null>(null);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [mySalt, setMySalt] = useState<Uint8Array | null>(null);
  const [handCommitted, setHandCommitted] = useState(false);
  const [unoDeclaimed, setUnoDeclaimed] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);
  const MAX_POLL_FAILURES = 5;
  // Stable ref so poll() never becomes stale without triggering re-subscriptions
  const gameRef = useRef<Game | null>(null);
  // Track whether the local hand has been dealt — never re-deal once initialized
  const handInitializedRef = useRef(false);

  const playerIndex: 0 | 1 | null = !game || !address
    ? null
    : game.player1 === address ? 0 : game.player2 === address ? 1 : null;

  const isMyTurn = game !== null && playerIndex !== null && game.current_turn === playerIndex;

  // Keep gameRef in sync so poll() can read latest game without a dep
  useEffect(() => { gameRef.current = game; }, [game]);

  // Sync handCommitted from on-chain state whenever game is fetched.
  // This ensures that after a refresh/remount the "Commit Hand" button
  // does NOT reappear if the hash is already on-chain (prevents error #11).
  useEffect(() => {
    if (!game || !address) return;
    const myHash = address === game.player1 ? game.hand_hash_p1 : game.hand_hash_p2;
    if (myHash && (myHash as any) !== null) {
      setHandCommitted(true);
    }
  }, [game, address]);

  // Poll game state every 4 seconds
  const poll = useCallback(async () => {
    if (!sessionId) return;
    const g = await svc.getGame(sessionId);
    if (g) {
      failCountRef.current = 0;
      setGame(g);
    } else {
      failCountRef.current += 1;
      if (failCountRef.current >= MAX_POLL_FAILURES && !gameRef.current) {
        setError(`Game session ${sessionId} not found on-chain. The start_game transaction may have failed or expired.`);
        // Stop polling
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }
  }, [sessionId]); // removed `game` dep — use gameRef.current instead

  useEffect(() => {
    if (!sessionId) return;
    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [sessionId, poll]); // poll is now stable (no `game` dep), so this only runs once per sessionId

  // Derive local hand ONCE we know the session and player — never re-deal
  useEffect(() => {
    if (!sessionId || playerIndex === null || handInitializedRef.current) return;
    handInitializedRef.current = true;
    const hand = dealHand(sessionId, playerIndex);
    const salt = randomSalt();
    setMyHand(hand);
    setMySalt(salt);
  }, [sessionId, playerIndex]);

  const humanizeError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    // "Bad union switch: 4" = contract error code 4 = NotYourTurn
    if (msg.includes('Bad union switch')) {
      const match = msg.match(/Bad union switch:\s*(\d+)/);
      const code = match ? parseInt(match[1]) : -1;
      const contractErrors: Record<number, string> = {
        1: 'Game not found. Check the session ID.',
        2: "You are not a player in this game.",
        3: 'Game has already ended.',
        4: "It's not your turn yet.",
        5: 'Hand not committed yet.',
        6: 'Invalid hand hash.',
        7: 'Card not in hand.',
        8: 'That card cannot be played now.',
        9: 'Illegal Wild Draw 4.',
        10: 'Invalid hand size.',
        11: 'Hand already committed for this session.',
        12: 'ZK proof invalid.',
        13: 'ZK verifier not set.',
        14: 'ZK active colour mismatch.',
        15: 'ZK draw count mismatch.',
      };
      return contractErrors[code] ?? `Contract error (code ${code})`;
    }
    if (msg.includes('UnreachableCodeReached') || msg.includes('unreachable')) {
      if (msg.includes('self-play')) return 'Self-play not allowed — use two different wallets.';
      if (msg.includes('start_game')) return 'Failed to start game. Make sure both players are different addresses.';
      return 'Contract error — check the game state and try again.';
    }
    if (msg.includes('NotYourTurn')) return "It's not your turn yet.";
    if (msg.includes('HandAlreadyCommitted')) return 'Hand already committed for this session.';
    if (msg.includes('GameNotFound')) return 'Game not found. Check the session ID.';
    if (msg.includes('InvalidCard')) return 'That card cannot be played now.';
    return msg;
  };

  const commitHand = useCallback(async () => {
    if (!sessionId || !address || !signer || !mySalt || myHand.length === 0) return;
    setLoading('Committing hand…');
    setError(null);
    try {
      // Guard: check on-chain state before sending to avoid HandAlreadyCommitted (error #11)
      const latest = await svc.getGame(sessionId);
      if (latest) {
        const onChainHash = address === latest.player1 ? latest.hand_hash_p1 : latest.hand_hash_p2;
        if (onChainHash && (onChainHash as any) !== null) {
          setHandCommitted(true);
          setGame(latest);
          return; // Already committed on-chain, skip
        }
      }
      const handBytes = encodeHand(myHand);
      const handHash = computeHandHash(handBytes, mySalt);
      await svc.commitHandZk(sessionId, address, handHash, signer, { handBytes, salt: mySalt });
      setHandCommitted(true);
      await poll();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(null);
    }
  }, [sessionId, address, signer, myHand, mySalt, poll]);

  const playCard = useCallback(async (card: Card, wildColour: number = 0) => {
    if (!sessionId || !address || !signer || !mySalt || !game) return;
    setLoading('Playing card…');
    setError(null);
    const newSalt = randomSalt();
    const newHand = removeCard(myHand, card.colour, card.value);
    // Optimistically update the hand immediately so the card disappears at once
    setMyHand(newHand);
    setMySalt(newSalt);
    try {
      await svc.playCardZk(
        sessionId, address, myHand, mySalt, card, newHand, newSalt,
        wildColour, game.active_colour, signer
      );
      await poll();
    } catch (e) {
      // Revert hand on failure
      setMyHand(myHand);
      setMySalt(mySalt);
      setError(humanizeError(e));
    } finally {
      setLoading(null);
    }
  }, [sessionId, address, signer, myHand, mySalt, game, poll]);

  const drawCard = useCallback(async () => {
    if (!sessionId || !address || !signer || !mySalt || !game) return;
    setLoading('Drawing card…');
    setError(null);

    // Optimistically add the drawn card immediately using the same deterministic logic
    const drawnCard = deriveCard(sessionId, game.draw_count);
    const optimisticHand = [...myHand, drawnCard];
    const newSalt = randomSalt();
    setMyHand(optimisticHand);
    setMySalt(newSalt);

    try {
      await svc.drawCardZk(
        sessionId, address, myHand, mySalt, newSalt, game.draw_count, signer
      );
      await poll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // "Bad union switch" after a successful draw tx — the card was drawn, keep optimistic state
      if (msg.includes('Bad union switch')) {
        await poll();
        return;
      }
      // Real error — revert the optimistic hand update
      setMyHand(myHand);
      setMySalt(mySalt);
      setError(humanizeError(e));
    } finally {
      setLoading(null);
    }
  }, [sessionId, address, signer, myHand, mySalt, game, poll]);

  const declareUno = useCallback(async () => {
    if (!sessionId || !address || !signer || !mySalt) return;
    setLoading('Declaring UNO!');
    setError(null);
    try {
      await svc.declareUnoZk(sessionId, address, myHand, mySalt, signer);
      setUnoDeclaimed(true);
      await poll();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(null);
    }
  }, [sessionId, address, signer, myHand, mySalt, poll]);

  return {
    game, myHand, mySalt, playerIndex, isMyTurn, handCommitted,
    unoDeclaimed, pendingDraws: 0, loading, error,
    commitHand, playCard, drawCard, declareUno,
    clearError: () => setError(null),
  };
}
