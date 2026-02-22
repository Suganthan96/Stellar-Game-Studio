'use client';

import WalletButton from '@/components/WalletButton';
import Lobby from '@/components/Lobby';
import { useWallet } from '@/hooks/useWallet';

export default function HomePage() {
  const { address } = useWallet();

  return (
    <main className="min-h-screen p-6 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold text-white">ZK-UNO</h1>
          <p className="text-xs text-gray-400">Zero-Knowledge UNO on Stellar</p>
        </div>
        <WalletButton />
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {!address ? (
          <div className="text-center space-y-4">
            <div className="text-6xl">🃏</div>
            <h2 className="text-xl font-semibold text-white">Play UNO with Zero-Knowledge proofs</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Your hand is private. Cards are played with ZK proofs on Stellar Soroban. Connect your wallet to start.
            </p>
            <p className="text-indigo-400 text-xs">
              ↑ Use the Connect Wallet button in the top-right corner
            </p>
          </div>
        ) : (
          <div className="w-full max-w-lg space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-medium text-white">Ready to play!</h2>
              <p className="text-gray-400 text-sm mt-1">Create a new game room or join an existing one.</p>
            </div>
            <Lobby />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-10 text-center text-xs text-gray-600">
        ZK-UNO · Stellar Testnet · RISC Zero
      </footer>
    </main>
  );
}
