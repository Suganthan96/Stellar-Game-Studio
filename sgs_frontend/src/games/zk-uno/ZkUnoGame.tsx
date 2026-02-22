import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { ZK_UNO_CONTRACT } from '@/utils/constants';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { devWalletService } from '@/services/devWalletService';
import {
  ZkUnoService,
  type Card,
  COLOUR_NAMES,
  COLOUR_CLASSES,
  VALUE_NAMES,
  encodeHand,
  computeHandHash,
  randomSalt,
  dealHand,
  removeCard,
  canPlay,
  hasMatchingColour,
  RED, YELLOW, GREEN, BLUE,
  WILD, WILD_CARD, WILD_DRAW4, DRAW_TWO, SKIP,
} from './zkUnoService';
import type { Game } from './bindings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createRandomSessionId = (): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] || 1;
};

const zkUnoService = new ZkUnoService(ZK_UNO_CONTRACT);

type Phase =
  | 'LOBBY'
  | 'WAITING_P2'
  | 'DEALING'
  | 'PLAYING'
  | 'UNO_DECLARED'
  | 'ENDED';

type ProofState = 'idle' | 'proving' | 'verified' | 'rejected';

// ─── Card display ─────────────────────────────────────────────────────────────

const COLOUR_BORDER = [
  'border-red-500',
  'border-yellow-400',
  'border-green-400',
  'border-blue-400',
  'border-gray-400',
];

function CardTile({
  card,
  playable = false,
  selected = false,
  onClick,
}: {
  card: Card;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const bg = COLOUR_CLASSES[card.colour] ?? 'bg-gray-700';
  const border = selected
    ? 'border-white border-4 scale-110'
    : playable
    ? `${COLOUR_BORDER[card.colour]} border-2 hover:scale-105`
    : 'border-white/20 border opacity-60';

  return (
    <button
      className={`relative w-12 h-18 sm:w-14 sm:h-20 rounded-xl ${bg} ${border} transition-transform flex flex-col items-center justify-center shadow-lg cursor-${playable ? 'pointer' : 'default'} select-none`}
      onClick={playable ? onClick : undefined}
      disabled={!playable}
      title={`${COLOUR_NAMES[card.colour]} ${VALUE_NAMES(card.value)}`}
    >
      <span className="text-white font-black text-xs leading-tight">
        {COLOUR_NAMES[card.colour][0]}
      </span>
      <span className="text-white font-black text-lg leading-tight">
        {VALUE_NAMES(card.value)}
      </span>
    </button>
  );
}

function HiddenCardTile() {
  return (
    <div className="w-12 h-18 sm:w-14 sm:h-20 rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-white/20 flex items-center justify-center shadow-lg">
      <span className="text-white/60 text-xl">?</span>
    </div>
  );
}

// ─── ZK badge ─────────────────────────────────────────────────────────────────

function ZkBadge({ state }: { state: ProofState }) {
  if (state === 'idle') return null;
  const map: Record<ProofState, { label: string; cls: string }> = {
    idle:     { label: '',               cls: '' },
    proving:  { label: '⏳ Generating ZK proof…', cls: 'text-yellow-400' },
    verified: { label: '✓ Proof verified on-chain', cls: 'text-green-400' },
    rejected: { label: '✗ Proof rejected',          cls: 'text-red-400' },
  };
  const { label, cls } = map[state];
  return (
    <div className={`text-xs font-mono mt-1 ${cls}`}>{label}</div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ZkUnoGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onBack: () => void;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ZkUnoGame({
  userAddress,
  availablePoints,
  initialXDR,
  initialSessionId,
  onBack,
  onStandingsRefresh,
  onGameComplete,
}: ZkUnoGameProps) {
  const DEFAULT_POINTS = '100';

  const { getContractSigner, walletType } = useWallet();

  // ── Lobby state ──
  const [lobbyTab, setLobbyTab]         = useState<'create' | 'join'>('create');
  const [sessionId, setSessionId]       = useState<number | null>(initialSessionId ?? null);
  const [pointsInput, setPointsInput]   = useState(DEFAULT_POINTS);
  const [p2Address, setP2Address]       = useState('');
  const [sharedXdr, setSharedXdr]       = useState(initialXDR ?? '');
  const [p1XdrForP2, setP1XdrForP2]     = useState('');

  // ── Game state ──
  const [phase, setPhase]               = useState<Phase>(initialXDR ? 'WAITING_P2' : 'LOBBY');
  const [game, setGame]                 = useState<Game | null>(null);
  const [hand, setHand]                 = useState<Card[]>([]);
  const [salt, setSalt]                 = useState<Uint8Array>(new Uint8Array(32));
  const [opponentCardCount, setOpponentCardCount] = useState<number>(7);

  // ── UI state ──
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [wildColour, setWildColour]     = useState<number>(RED);
  const [showWildPicker, setShowWildPicker] = useState(false);
  const [proofState, setProofState]     = useState<ProofState>('idle');
  const [error, setError]               = useState('');
  const [status, setStatus]             = useState('');
  const [isBusy, setIsBusy]             = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayer1 = game ? game.player1 === userAddress : false;

  // ── Humanize contract errors ─────────────────────────────────────────────
  function humanizeError(raw: unknown): string {
    const msg = String(raw);
    if (msg.includes('UnreachableCodeReached') && msg.includes('start_game'))
      return 'Self-play not allowed — Player 1 and Player 2 must be different addresses. Make sure you switched wallets before clicking Create.';
    if (msg.includes('SelfPlay') || msg.includes('self-play'))
      return 'Self-play not allowed — use different wallets for Player 1 and Player 2.';
    if (msg.includes('GameAlreadyExists'))
      return 'A game with this session ID already exists. Click "Start Over" and create a new session.';
    if (msg.includes('GameNotFound'))
      return 'Game not found. Make sure you pasted the correct Session ID.';
    if (msg.includes('NotYourTurn'))
      return "It's not your turn. Switch to the correct player wallet.";
    return msg;
  }

  // ── Poll ─────────────────────────────────────────────────────────────────

  const refreshGame = useCallback(async () => {
    if (!sessionId) return;
    const key = createCacheKey('zk-uno:game', sessionId);
    const fresh = await requestCache.dedupe(key, () => zkUnoService.getGame(sessionId), 3000);
    if (fresh) {
      setGame(fresh);
      // Infer opponent card count from draw_count heuristic (contract doesn't expose it directly).
      // We track it locally; start at 7.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || phase === 'LOBBY' || phase === 'WAITING_P2') return;
    refreshGame();
    pollRef.current = setInterval(refreshGame, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, phase, refreshGame]);

  // Detect game end
  useEffect(() => {
    if (!game) return;
    if (game.winner) {
      setPhase('ENDED');
      if (pollRef.current) clearInterval(pollRef.current);
      onStandingsRefresh();
    }
  }, [game, onStandingsRefresh]);

  // Detect both hands committed → move to PLAYING
  useEffect(() => {
    if (!game) return;
    if (phase === 'DEALING' && game.hand_hash_p1 && game.hand_hash_p2) {
      setPhase('PLAYING');
      setStatus('');
    }
  }, [game, phase]);

  // ── Signer ───────────────────────────────────────────────────────────────

  function getSigner() {
    const signer = getContractSigner();
    if (!signer) throw new Error('Wallet not connected');
    return signer;
  }

  // ── Lobby: Player 1 creates session ──────────────────────────────────────

  async function handlePrepareGame() {
    setError(''); setIsBusy(true);
    try {
      const sid = createRandomSessionId();
      const points = BigInt(Math.round(parseFloat(pointsInput) * 10_000_000));
      if (points <= 0n) throw new Error('Points must be positive');
      if (!p2Address.trim()) throw new Error('Enter Player 2 address');

      setStatus('Requesting P1 wallet signature…');
      const signer = getSigner();

      const xdr = await zkUnoService.prepareStartGame(
        sid, userAddress, p2Address.trim(),
        points, points, signer
      );

      setSessionId(sid);
      setP1XdrForP2(xdr);
      setPhase('WAITING_P2');
      setStatus('Share the XDR + Session ID with Player 2');
    } catch (e: unknown) {
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
    }
  }

  // ── Lobby: Player 2 completes start ────────────────────────────────────

  async function handleCompleteGame() {
    setError(''); setIsBusy(true);
    try {
      if (!sessionId) throw new Error('Enter Session ID');
      if (!sharedXdr.trim()) throw new Error('Paste Player 1 XDR');

      const points = BigInt(Math.round(parseFloat(pointsInput) * 10_000_000));
      setStatus('Requesting P2 wallet signature…');
      const signer = getSigner();

      await zkUnoService.completeStartGame(
        sessionId, p2Address.trim() || userAddress, userAddress,
        points, points, sharedXdr.trim(), signer
      );

      setStatus('Game started! Committing hand…');
      await doCommitHand(sessionId, signer);
      setPhase('DEALING');
    } catch (e: unknown) {
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
    }
  }

  // ── After start_game: Player 1 also commits ────────────────────────────

  async function handleCommitAsPlayer1() {
    if (!sessionId) return;
    setError(''); setIsBusy(true);
    try {
      setStatus('Committing hand hash…');
      const signer = getSigner();
      await doCommitHand(sessionId, signer);
      setPhase('DEALING');
      setStatus('Waiting for Player 2 to commit…');
    } catch (e: unknown) {
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
    }
  }

  // ── Shared commit helper ────────────────────────────────────────────────

  async function doCommitHand(sid: number, signer: Awaited<ReturnType<typeof getSigner>>) {
    const playerIdx = isPlayer1 ? 0 : 1;
    const dealtHand = dealHand(sid, playerIdx as 0 | 1);
    const newSalt = randomSalt();
    const handBytes = encodeHand(dealtHand);
    const hash = computeHandHash(handBytes, newSalt);

    setHand(dealtHand);
    setSalt(newSalt);

    await zkUnoService.commitHandZk(sid, userAddress, hash, signer);
  }

  // ── Play card ───────────────────────────────────────────────────────────

  async function handlePlayCard(card: Card) {
    if (!sessionId || !game || isBusy) return;

    // +4 legality: cannot play if holding matching colour
    if (card.value === WILD_DRAW4 && hasMatchingColour(hand, game.active_colour)) {
      setError('Illegal +4: you hold a card matching the active colour.');
      return;
    }

    if (card.colour === WILD || card.value === WILD_CARD || card.value === WILD_DRAW4) {
      setSelectedCard(card);
      setShowWildPicker(true);
      return;
    }

    await submitPlayCard(card, card.colour);
  }

  async function submitPlayCard(card: Card, chosenColour: number) {
    if (!sessionId || !game) return;
    setShowWildPicker(false);
    setError(''); setIsBusy(true); setProofState('proving');
    try {
      const signer = getSigner();
      const oldHand = hand;
      const oldSalt = salt;
      const newHand = removeCard(hand, card.colour, card.value);
      const newSalt = randomSalt();

      await zkUnoService.playCardZk(
        sessionId, userAddress,
        oldHand, oldSalt,
        card,
        newHand, newSalt,
        chosenColour,
        game!.active_colour,
        signer
      );

      setHand(newHand);
      setSalt(newSalt);
      setSelectedCard(null);
      setProofState('verified');

      if (newHand.length === 0) {
        setPhase('ENDED');
      }
      await refreshGame();
    } catch (e: unknown) {
      setProofState('rejected');
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
      setTimeout(() => setProofState('idle'), 3000);
    }
  }

  // ── Draw card ───────────────────────────────────────────────────────────

  async function handleDrawCard() {
    if (!sessionId || !game || isBusy) return;
    setError(''); setIsBusy(true); setProofState('proving');
    try {
      const signer = getSigner();
      const newSalt = randomSalt();

      const zkResult = await zkUnoService.drawCardZk(
        sessionId, userAddress, hand, salt, newSalt,
        game.draw_count, signer
      );

      // drawCardZk returns { drawnCard, newHand, newHash, newSalt, result }
      if (zkResult.drawnCard) {
        setHand(zkResult.newHand);
      }
      setSalt(newSalt);
      setProofState('verified');
      await refreshGame();
    } catch (e: unknown) {
      setProofState('rejected');
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
      setTimeout(() => setProofState('idle'), 3000);
    }
  }

  // ── Declare UNO ─────────────────────────────────────────────────────────

  async function handleDeclareUno() {
    if (!sessionId || hand.length !== 1 || isBusy) return;
    setError(''); setIsBusy(true); setProofState('proving');
    try {
      const signer = getSigner();
      await zkUnoService.declareUnoZk(sessionId, userAddress, hand, salt, signer);
      setPhase('UNO_DECLARED');
      setProofState('verified');
    } catch (e: unknown) {
      setProofState('rejected');
      setError(humanizeError(e));
    } finally {
      setIsBusy(false);
      setTimeout(() => setProofState('idle'), 3000);
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  const isMyTurn = game ? (
    (game.current_turn === 0 && game.player1 === userAddress) ||
    (game.current_turn === 1 && game.player2 === userAddress)
  ) : false;

  const topCard: Card | null = game
    ? { colour: game.top_colour, value: game.top_value }
    : null;

  const playableCards = hand.filter(c =>
    topCard ? canPlay(c, game!.active_colour, topCard.value) : false
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button className="btn-secondary text-sm" onClick={onBack}>← Back</button>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ZK-UNO
          </h1>
          <span className="text-xs text-purple-400 border border-purple-700 rounded px-1">ZK</span>
        </div>
        <div className="w-20 text-right text-xs text-gray-400 truncate">{userAddress.slice(0, 8)}…</div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Error / Status */}
        {error && (
          <div className="bg-red-900/40 border border-red-500 rounded p-3 text-sm text-red-300">{error}</div>
        )}
        {status && !error && (
          <div className="bg-blue-900/30 border border-blue-500 rounded p-3 text-sm text-blue-300">{status}</div>
        )}

        {/* ── LOBBY ─────────────────────────────────────────────────────── */}
        {phase === 'LOBBY' && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  lobbyTab === 'create'
                    ? 'bg-purple-700 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                onClick={() => { setLobbyTab('create'); setError(''); }}
              >
                🎮 I'm Player 1 — Create
              </button>
              <button
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  lobbyTab === 'join'
                    ? 'bg-purple-700 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
                onClick={() => { setLobbyTab('join'); setSessionId(null); setSharedXdr(''); setError(''); }}
              >
                🔗 I'm Player 2 — Join
              </button>
            </div>

            <div className="bg-white/5 rounded-xl p-4 space-y-3">
              {lobbyTab === 'create' ? (
                <>
                  <h2 className="text-lg font-semibold">Create a Game <span className="text-xs text-gray-400 font-normal">(you are Player 1)</span></h2>
                  <p className="text-xs text-gray-400">Fill in Player 2's address, then share the Session ID + XDR with them.</p>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Player 2 address</label>
                    <input
                      className="w-full bg-white/10 rounded px-3 py-2 text-sm font-mono"
                      placeholder="G… (must be different from your address)"
                      value={p2Address}
                      onChange={e => setP2Address(e.target.value)}
                    />
                    <label className="text-xs text-gray-400">Wager (points)</label>
                    <input
                      className="w-full bg-white/10 rounded px-3 py-2 text-sm"
                      type="number"
                      min="1"
                      value={pointsInput}
                      onChange={e => setPointsInput(e.target.value)}
                    />
                    <button
                      className="btn-primary w-full mt-2"
                      onClick={handlePrepareGame}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Preparing…' : 'Create Game'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">Join a Game <span className="text-xs text-gray-400 font-normal">(you are Player 2)</span></h2>
                  <p className="text-xs text-gray-400">Paste the Session ID and Auth XDR that Player 1 shared with you.</p>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400">Session ID (from Player 1)</label>
                    <input
                      className="w-full bg-white/10 rounded px-3 py-2 text-sm font-mono"
                      type="number"
                      placeholder="1234567890"
                      value={sessionId ?? ''}
                      onChange={e => setSessionId(parseInt(e.target.value) || null)}
                    />
                    <label className="text-xs text-gray-400">Auth XDR (from Player 1)</label>
                    <textarea
                      className="w-full bg-white/10 rounded px-3 py-2 text-xs font-mono h-20 resize-none"
                      placeholder="Paste XDR here…"
                      value={sharedXdr}
                      onChange={e => setSharedXdr(e.target.value)}
                    />
                    <button
                      className="btn-primary w-full"
                      onClick={handleCompleteGame}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Joining…' : 'Join Game'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ZK explanation */}
            <div className="bg-purple-900/20 border border-purple-700/40 rounded-xl p-4 text-sm text-gray-400 space-y-1">
              <p className="text-purple-300 font-semibold">🔐 How the ZK proof works</p>
              <p>Your hand is kept completely secret. A ZK proof cryptographically proves each move is valid — that you held the card you played, drew legitimately, or truly have only 1 card left — without ever revealing your hand to anyone, including the blockchain.</p>
            </div>
          </div>
        )}

        {/* ── WAITING FOR P2 ────────────────────────────────────────────── */}
        {phase === 'WAITING_P2' && (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-xl p-4 space-y-3">
              <h2 className="text-lg font-semibold">Share with Player 2</h2>
              <div>
                <label className="text-xs text-gray-400">Session ID</label>
                <div className="font-mono text-purple-300 text-lg">{sessionId}</div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Auth XDR (copy and send to Player 2)</label>
                <textarea
                  className="w-full bg-white/10 rounded px-3 py-2 text-xs font-mono h-24 resize-none"
                  readOnly
                  value={p1XdrForP2}
                />
                <button
                  className="btn-secondary text-xs mt-1"
                  onClick={() => navigator.clipboard.writeText(p1XdrForP2)}
                >
                  Copy XDR
                </button>
              </div>
              <p className="text-sm text-gray-400">Once Player 2 joins and the game starts, click below to commit your hand.</p>
              <button
                className="btn-primary w-full"
                onClick={handleCommitAsPlayer1}
                disabled={isBusy}
              >
                {isBusy ? 'Committing…' : 'Commit My Hand'}
              </button>
              <button
                className="btn-secondary w-full text-xs mt-2"
                onClick={() => { setPhase('LOBBY'); setP1XdrForP2(''); setSessionId(null); }}
                disabled={isBusy}
              >
                ← Start Over (create a new session)
              </button>
            </div>
          </div>
        )}

        {/* ── DEALING ───────────────────────────────────────────────────── */}
        {phase === 'DEALING' && (
          <div className="text-center py-12 space-y-2">
            <div className="text-4xl animate-bounce">🃏</div>
            <p className="text-gray-300">Waiting for both players to commit hands…</p>
            {game && (
              <p className="text-xs text-gray-500">
                P1: {game.hand_hash_p1 ? '✓ committed' : '⏳ pending'}&nbsp;|&nbsp;
                P2: {game.hand_hash_p2 ? '✓ committed' : '⏳ pending'}
              </p>
            )}
          </div>
        )}

        {/* ── PLAYING / UNO_DECLARED ────────────────────────────────────── */}
        {(phase === 'PLAYING' || phase === 'UNO_DECLARED') && game && (
          <div className="space-y-4">
            {/* Turn indicator */}
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
              isMyTurn ? 'bg-green-700/30 text-green-300 border border-green-600' : 'bg-gray-700/30 text-gray-400'
            }`}>
              {isMyTurn ? '✅ Your turn' : '⏳ Opponent\'s turn'}
              {phase === 'UNO_DECLARED' && ' — UNO declared!'}
            </div>

            {/* Discard pile + active colour */}
            <div className="flex items-center gap-4 justify-center">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Discard</p>
                {topCard && <CardTile card={topCard} />}
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Active colour</p>
                <div className={`w-12 h-12 rounded-full ${COLOUR_CLASSES[game.active_colour]} border-4 border-white/30 shadow-xl`} />
                <p className="text-xs text-gray-300 mt-1">{COLOUR_NAMES[game.active_colour]}</p>
              </div>
              {game.draw_count > 0 && (
                <div className="text-center">
                  <p className="text-xs text-red-400">Draw</p>
                  <p className="text-2xl font-black text-red-400">+{game.draw_count}</p>
                </div>
              )}
            </div>

            {/* Opponent hand (hidden) */}
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Opponent's hand ({opponentCardCount} cards, hidden)</p>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: opponentCardCount }).map((_, i) => (
                  <HiddenCardTile key={i} />
                ))}
              </div>
            </div>

            {/* Your hand */}
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Your hand ({hand.length} cards)</p>
              <div className="flex flex-wrap gap-2">
                {hand.map((card, i) => (
                  <CardTile
                    key={`${card.colour}-${card.value}-${i}`}
                    card={card}
                    playable={isMyTurn && canPlay(card, game.active_colour, game.top_value)}
                    selected={selectedCard?.colour === card.colour && selectedCard?.value === card.value}
                    onClick={() => handlePlayCard(card)}
                  />
                ))}
              </div>
            </div>

            {/* ZK proof status */}
            <ZkBadge state={proofState} />

            {/* Action buttons */}
            {isMyTurn && (
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex-1"
                  onClick={handleDrawCard}
                  disabled={isBusy}
                >
                  {isBusy ? '…' : '🃏 Draw card'}
                </button>
                {hand.length === 1 && (
                  <button
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded"
                    onClick={handleDeclareUno}
                    disabled={isBusy}
                  >
                    UNO!
                  </button>
                )}
              </div>
            )}

            {/* Wild colour picker */}
            {showWildPicker && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                <div className="bg-gray-900 rounded-xl p-6 space-y-4 w-72">
                  <h3 className="text-lg font-bold text-center">Choose a colour</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[RED, YELLOW, GREEN, BLUE].map(c => (
                      <button
                        key={c}
                        className={`h-14 rounded-lg ${COLOUR_CLASSES[c]} font-bold text-white hover:scale-105 transition-transform`}
                        onClick={() => {
                          setWildColour(c);
                          if (selectedCard) submitPlayCard(selectedCard, c);
                        }}
                      >
                        {COLOUR_NAMES[c]}
                      </button>
                    ))}
                  </div>
                  <button className="btn-secondary w-full text-sm" onClick={() => setShowWildPicker(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ENDED ─────────────────────────────────────────────────────── */}
        {phase === 'ENDED' && game && (
          <div className="text-center py-12 space-y-4">
            <div className="text-6xl">{game.winner === userAddress ? '🏆' : '😞'}</div>
            <h2 className="text-2xl font-bold">
              {game.winner === userAddress ? 'You win!' : 'Opponent wins!'}
            </h2>
            <p className="text-gray-400 text-sm">Session #{sessionId}</p>
            <div className="flex gap-3 justify-center pt-4">
              <button className="btn-secondary" onClick={onBack}>Back to library</button>
              <button className="btn-primary" onClick={() => { setPhase('LOBBY'); setGame(null); setHand([]); setSessionId(null); }}>
                Play again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
