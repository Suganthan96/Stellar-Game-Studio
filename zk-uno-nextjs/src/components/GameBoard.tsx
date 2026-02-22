'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useGame } from '@/hooks/useGame';
import { type CardData } from './Card';
import { type Card as SvcCard } from '@/lib/zkUnoService';
import { getCardImage, CARD_BACK } from '@/lib/cardImages';

const COLOUR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
const WILD_COLOUR_CLASSES = [
  'bg-red-600 hover:bg-red-700',
  'bg-yellow-500 hover:bg-yellow-600',
  'bg-green-600 hover:bg-green-700',
  'bg-blue-600 hover:bg-blue-700',
];

interface GameBoardProps {
  sessionId: number;
}

export default function GameBoard({ sessionId }: GameBoardProps) {
  const { address, getSigner } = useWallet();
  const signer = getSigner();
  const {
    game, myHand, playerIndex, isMyTurn, handCommitted,
    unoDeclaimed, loading, error,
    commitHand, playCard, drawCard, declareUno, clearError,
  } = useGame(sessionId, address, signer);

  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [showColourPicker, setShowColourPicker] = useState(false);

  const handleCardClick = (card: CardData) => {
    if (selectedCard?.colour === card.colour && selectedCard?.value === card.value) {
      if (card.colour === 4) {
        setShowColourPicker(true);
      } else {
        handlePlayCard(card, card.colour);
      }
    } else {
      setSelectedCard(card);
    }
  };

  const handlePlayCard = async (card: CardData, wildColour: number) => {
    setSelectedCard(null);
    setShowColourPicker(false);
    await playCard(card as SvcCard, wildColour);
  };

  if (!address) {
    return (
      <div className="flex items-center justify-center h-full text-white/60 text-lg">
        Connect your wallet to play.
      </div>
    );
  }

  if (!game && error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-300 text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => (window.location.href = '/')}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-bold transition"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center h-full text-white/60 animate-pulse text-lg">
        Loading game…
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponentAddress = opponentIndex === 0 ? game.player1 : game.player2;
  const opponentHandHash = opponentIndex === 0 ? game.hand_hash_p1 : game.hand_hash_p2;
  const myHandHash = playerIndex === 0 ? game.hand_hash_p1 : game.hand_hash_p2;
  const hasWinner = game.winner != null;

  // Opponent card count — use draw_count as a rough proxy; default to 7 until committed
  const opponentCardCount = opponentHandHash ? 7 : 0;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl px-10 py-6 text-white border border-white/10 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <span className="font-semibold">{loading}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Winner overlay ── */}
      {hasWinner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl px-12 py-10 text-center space-y-4 border border-white/10 shadow-2xl">
            <div className="text-6xl">{game.winner === address ? '🎉' : '😞'}</div>
            <h2 className="text-3xl font-black text-white">
              {game.winner === address ? 'You Won!' : 'You Lost!'}
            </h2>
            <p className="text-white/50 text-xs font-mono">{game.winner}</p>
            <button
              onClick={() => (window.location.href = '/')}
              className="mt-4 px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-bold text-lg transition transform hover:scale-105"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* ── Wild colour picker ── */}
      {showColourPicker && selectedCard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 border border-white/20">
            <h3 className="text-white font-bold text-2xl mb-6 text-center">Choose a Color</h3>
            <div className="grid grid-cols-2 gap-4">
              {COLOUR_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => handlePlayCard(selectedCard, i)}
                  className={`${WILD_COLOUR_CLASSES[i]} w-32 h-32 rounded-xl shadow-xl transform transition hover:scale-110 active:scale-95 border-4 border-white/30`}
                >
                  <span className="text-white font-bold text-xl">{name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowColourPicker(false); setSelectedCard(null); }}
              className="w-full mt-4 py-2 text-white/60 hover:text-white text-sm transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-red-900/80 border border-red-500/60 rounded-xl px-5 py-2 flex items-center gap-3 shadow-xl">
          <p className="text-red-200 text-sm">{error}</p>
          <button onClick={clearError} className="text-red-400 hover:text-red-200 text-lg leading-none">✕</button>
        </div>
      )}

      {/* ── Opponent area (top) ── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-3 pt-2">
        <div className="text-white font-bold text-lg bg-black/30 px-4 py-2 rounded-lg">
          Player {opponentIndex + 1}
          <span className="ml-2 text-white/50 text-xs font-mono">
            {opponentAddress.slice(0, 6)}…{opponentAddress.slice(-4)}
          </span>
        </div>
        <div className="flex">
          {Array.from({ length: Math.max(opponentCardCount, opponentHandHash ? 7 : 0) }, (_, i) => (
            <img
              key={i}
              src={CARD_BACK}
              alt="Card back"
              className="w-16 h-24 object-contain transform rotate-180"
              style={{ marginLeft: i > 0 ? '-45px' : '0' }}
            />
          ))}
          {!opponentHandHash && (
            <span className="text-yellow-300 text-xs ml-3 self-center">awaiting commit…</span>
          )}
        </div>
      </div>

      {/* ── Centre play area ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-10">
        {/* Draw pile */}
        <button
          onClick={isMyTurn ? drawCard : undefined}
          disabled={!isMyTurn}
          className="flex flex-col items-center gap-2 group"
        >
          <span className="text-white/60 text-xs uppercase tracking-widest">Draw</span>
          <img
            src={CARD_BACK}
            alt="Draw pile"
            className={`w-28 h-40 object-contain rounded-xl shadow-2xl transition-transform ${
              isMyTurn ? 'group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] cursor-pointer' : 'opacity-60'
            }`}
          />
        </button>

        {/* Discard pile (current card) */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-white/60 text-xs uppercase tracking-widest">Discard</span>
          <img
            src={getCardImage(game.top_colour, game.top_value)}
            alt="Current card"
            className="w-32 h-48 object-contain rounded-xl shadow-2xl"
          />
          {game.top_colour === 4 && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-white/60 text-xs">Active:</span>
              <span className={`px-3 py-0.5 rounded-full text-xs font-bold text-white ${
                ['bg-red-600','bg-yellow-500','bg-green-600','bg-blue-600'][game.active_colour] ?? 'bg-gray-600'
              }`}>
                {COLOUR_NAMES[game.active_colour] ?? '?'}
              </span>
            </div>
          )}
        </div>

        {/* UNO button */}
        {handCommitted && myHand.length === 1 && !unoDeclaimed && (
          <button
            onClick={declareUno}
            disabled={!!loading}
            className="bg-yellow-500 hover:bg-yellow-400 px-8 py-4 rounded-xl text-black font-black text-2xl shadow-xl transition transform hover:scale-105 active:scale-95 animate-pulse disabled:opacity-50"
          >
            UNO!
          </button>
        )}
      </div>

      {/* ── Waiting overlay (no hand committed yet) ── */}
      {!handCommitted && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md px-12 py-8 rounded-2xl border-2 border-white/30 text-center z-20">
          <div className="text-white font-bold text-2xl mb-4">
            {myHandHash ? 'Waiting for opponent…' : 'Commit your hand to start'}
          </div>
          {!myHandHash && (
            <button
              onClick={commitHand}
              disabled={!!loading}
              className="px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold text-lg rounded-xl shadow-xl transition transform hover:scale-105 disabled:opacity-50"
            >
              Commit Hand
            </button>
          )}
          <div className="text-white/50 text-sm mt-3">Session: {sessionId}</div>
        </div>
      )}

      {/* ── Opponent turn overlay ── */}
      {handCommitted && !isMyTurn && !hasWinner && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md px-8 py-4 rounded-xl border border-white/30 pointer-events-none z-10">
          <p className="text-white font-bold text-xl">Opponent&apos;s turn…</p>
        </div>
      )}

      {/* ── Player hand (bottom) ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="text-white font-bold text-lg bg-black/30 px-4 py-2 rounded-lg inline-block">
            Player {(playerIndex ?? 0) + 1}
            {isMyTurn && <span className="ml-2 text-green-300">(Your Turn)</span>}
          </div>
          {/* Commit hand button — shown inline if not yet committed */}
          {!handCommitted && myHand.length > 0 && (
            <button
              onClick={commitHand}
              disabled={!!loading}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm rounded-lg font-semibold disabled:opacity-50 transition"
            >
              Commit Hand
            </button>
          )}
        </div>

        <div className="flex items-end justify-center">
          {myHand.map((card, index) => {
            const isSelected =
              selectedCard?.colour === card.colour && selectedCard?.value === card.value;
            const imgSrc = getCardImage(card.colour, card.value);
            return (
              <button
                key={`${card.colour}-${card.value}-${index}`}
                onClick={() => handCommitted && isMyTurn ? handleCardClick(card) : undefined}
                disabled={!handCommitted || !isMyTurn}
                className={`relative transition-all duration-200 disabled:cursor-default ${
                  isSelected ? '-translate-y-8' : 'hover:-translate-y-4'
                } ${!handCommitted || !isMyTurn ? 'opacity-80' : 'cursor-pointer'}`}
                style={{ marginLeft: index > 0 ? '-60px' : '0', zIndex: isSelected ? 50 : index }}
              >
                <img
                  src={imgSrc}
                  alt={`card-${card.colour}-${card.value}`}
                  className={`w-24 h-36 object-contain rounded-lg shadow-xl transition-shadow ${
                    isSelected ? 'shadow-white/50 ring-2 ring-white' : 'hover:shadow-2xl'
                  }`}
                />
              </button>
            );
          })}
          {myHand.length === 0 && handCommitted && (
            <div className="text-white/60 text-lg py-8">No cards in hand.</div>
          )}
        </div>
      </div>
    </div>
  );
}

