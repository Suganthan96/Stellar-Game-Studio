'use client';

import Link from 'next/link';
import WalletButton from '@/components/WalletButton';
import GameBoard from '@/components/GameBoard';

interface PageProps {
  params: { sessionId: string };
}

export default function GamePage({ params }: PageProps) {
  const { sessionId } = params;
  const sid = Number(sessionId);

  if (isNaN(sid)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white">
        <p className="text-red-400">Invalid session ID.</p>
        <Link href="/" className="mt-4 text-indigo-400 hover:underline text-sm">Back to lobby</Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 flex flex-col">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← Lobby</Link>
          <span className="text-gray-600">|</span>
          <h1 className="text-lg font-bold text-white">ZK-UNO</h1>
        </div>
        <WalletButton />
      </header>

      <div className="flex-1 flex items-start justify-center pt-4">
        <GameBoard sessionId={sid} />
      </div>
    </main>
  );
}
