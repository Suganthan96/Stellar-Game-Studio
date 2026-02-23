'use client';

import Link from 'next/link';
import WalletButton from '@/components/WalletButton';
import GameBoard from '@/components/GameBoard';
import { CARD_BACK } from '@/lib/cardImages';

interface PageProps {
  params: { sessionId: string };
}

export default function GamePage({ params }: PageProps) {
  const { sessionId } = params;
  const sid = Number(sessionId);

  if (isNaN(sid)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-800 via-green-700 to-green-900 text-white">
        <p className="text-red-400 text-lg font-semibold">Invalid session ID.</p>
        <Link href="/" className="mt-4 text-white/70 hover:text-white text-sm underline">
          ← Back to Lobby
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-900 overflow-hidden relative">
      {/* Game Header */}
      <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-8 z-10">
        <div className="flex items-center gap-4">
          <img
            src={CARD_BACK}
            alt="UNO"
            className="w-16 h-16 object-contain drop-shadow-lg"
          />
        </div>

        <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-xl border border-white/30">
          <p className="text-white font-bold text-xl">Session: {sessionId}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-10 h-10 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center text-white text-sm transition"
            title="Back to Lobby"
          >
            ←
          </Link>
          <WalletButton />
        </div>
      </div>

      {/* Game Board fills remaining space below header */}
      <div className="absolute inset-0 pt-24">
        <GameBoard sessionId={sid} />
      </div>
    </div>
  );
}
