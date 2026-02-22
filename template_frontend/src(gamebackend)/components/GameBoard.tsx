'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useGame } from '@/hooks/useGame';
import DiscardPile from './DiscardPile';
import Hand from './Hand';
import Card, { type CardData } from './Card';
import { COLOUR_CLASSES, type Card as SvcCard } from '@/lib/zkUnoService';

const COLOUR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];

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
      // Second click on same card → play it (show colour picker for wilds)
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
      <div className="flex items-center justify-center h-64 text-gray-400">
        Connect your wallet to play.
      </div>
    );
  }

  if (!game && error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-400 text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => window.location.href = '/'}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">
        Loading game…
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponentAddress = opponentIndex === 0 ? game.player1 : game.player2;
  const opponentHandHash = opponentIndex === 0 ? game.hand_hash_p1 : game.hand_hash_p2;
  const myHandHash = playerIndex === 0 ? game.hand_hash_p1 : game.hand_hash_p2;

  const hasWinner = game.winner != null;

  return (
    <div className="relative w-full max-w-2xl mx-auto space-y-6">
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl px-8 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              {loading}
            </div>
          </div>
        </div>
      )}

      {/* Winner overlay */}
      {hasWinner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl px-12 py-10 text-center space-y-4">
            <div className="text-5xl">{game.winner === address ? '🎉' : '😞'}</div>
            <h2 className="text-2xl font-bold text-white">
              {game.winner === address ? 'You Won!' : 'You Lost!'}
            </h2>
            <p className="text-gray-400 text-sm font-mono">{game.winner}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Wild colour picker modal */}
      {showColourPicker && selectedCard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40">
          <div className="bg-gray-800 rounded-xl p-6 space-y-3">
            <p className="text-white text-sm font-medium mb-2">Choose a colour</p>
            <div className="grid grid-cols-2 gap-3">
              {COLOUR_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => handlePlayCard(selectedCard, i)}
                  className={`${COLOUR_CLASSES[i]} px-6 py-3 rounded-lg text-white font-bold`}
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowColourPicker(false); setSelectedCard(null); }}
              className="w-full mt-2 py-2 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2 flex items-center justify-between">
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={clearError} className="text-red-400 hover:text-red-200 text-xs ml-4">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div className="text-sm text-gray-400">Session <span className="text-white font-mono">{sessionId}</span></div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded text-xs font-medium ${isMyTurn ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
            {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
        </div>
      </div>

      {/* Opponent */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Opponent</span>
          <span className="text-xs font-mono text-gray-300">{`${opponentAddress.slice(0, 6)}…${opponentAddress.slice(-4)}`}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Show 7 face-down cards as placeholder */}
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} card={{ colour: 0, value: 0 }} faceDown size="sm" />
          ))}
          {opponentHandHash ? (
            <span className="text-xs text-green-400 ml-2">✓ committed</span>
          ) : (
            <span className="text-xs text-yellow-400 ml-2">awaiting commit</span>
          )}
        </div>
      </div>

      {/* Middle: Deck + Discard */}
      <div className="flex items-center justify-center gap-10 py-2">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={isMyTurn ? drawCard : undefined}>
          <span className="text-xs text-gray-400 uppercase tracking-wider">Draw</span>
          <div className={`transition-all ${isMyTurn ? 'hover:-translate-y-1 hover:shadow-lg' : 'opacity-60'}`}>
            <Card card={{ colour: 0, value: 0 }} faceDown size="lg" />
          </div>
        </div>

        {/* Discard pile */}
        <DiscardPile
          topColour={game.top_colour}
          topValue={game.top_value}
          activeColour={game.active_colour}
        />
      </div>

      {/* My hand */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-300 font-medium">Your Hand ({myHand.length} cards)</span>
          <div className="flex gap-2">
            {!handCommitted && (
              <button
                onClick={commitHand}
                disabled={!!loading}
                className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs rounded-lg disabled:opacity-50"
              >
                Commit Hand
              </button>
            )}
            {handCommitted && myHand.length === 1 && !unoDeclaimed && (
              <button
                onClick={declareUno}
                disabled={!!loading}
                className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs rounded-lg font-bold disabled:opacity-50 animate-pulse"
              >
                UNO!
              </button>
            )}
          </div>
        </div>
        {myHandHash ? (
          <Hand
            cards={myHand}
            selectedCard={selectedCard}
            topColour={game.top_colour}
            topValue={game.top_value}
            activeColour={game.active_colour}
            isMyTurn={isMyTurn}
            onCardClick={handleCardClick}
          />
        ) : (
          <div className="text-center py-4 text-gray-400 text-sm">
            Commit your hand to start playing.
          </div>
        )}
      </div>

      {/* Status hint */}
      {handCommitted && !isMyTurn && (
        <p className="text-center text-gray-500 text-xs">Waiting for opponent…</p>
      )}
      {isMyTurn && !selectedCard && (
        <p className="text-center text-indigo-300 text-xs">
          Click a highlighted card to select it, then click again to play. Or click the draw pile.
        </p>
      )}
      {isMyTurn && selectedCard && (
        <p className="text-center text-yellow-300 text-xs">
          Click the same card again to play it, or click another card to select it instead.
        </p>
      )}
    </div>
  );
}
