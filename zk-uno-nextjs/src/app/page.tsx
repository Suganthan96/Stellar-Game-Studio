'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WalletButton from '@/components/WalletButton';
import GridMotion from '@/components/GridMotion';
import { useWallet } from '@/hooks/useWallet';
import { ZkUnoService } from '@/lib/zkUnoService';
import { ZK_UNO_CONTRACT } from '@/lib/config';
import { getRandomCardImages } from '@/lib/cardImages';

const svc = new ZkUnoService(ZK_UNO_CONTRACT);

interface SessionBundle {
  sessionId: number;
  player1: string;
  player1Points: string;
  player2Points: string;
  authXdr: string;
  simDataXdr: string;
  simAuthP2Xdr: string;
  minResourceFee: string;
}

function toErrMsg(e: unknown): string {
  console.error('[ZK-UNO] error:', e);
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string') return o.error;
    if (o.error instanceof Error) return o.error.message;
    if (typeof o.cause === 'string') return o.cause;
    if (o.cause instanceof Error) return o.cause.message;
    if (typeof o.result === 'object' && o.result) {
      const r = o.result as Record<string, unknown>;
      if (typeof r.error === 'string') return r.error;
    }
    try {
      const seen = new WeakSet();
      return JSON.stringify(e, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return typeof v === 'bigint' ? v.toString() : v;
      });
    } catch { return String(e); }
  }
  return String(e);
}

// Generate card grid once at module level (stable across renders)
const unoCardImages = getRandomCardImages(28);

export default function HomePage() {
  const router = useRouter();
  const { address, getSigner } = useWallet();

  const [showModal, setShowModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [sessionBundle, setSessionBundle] = useState<SessionBundle | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const generateSessionId = () => Math.floor(Math.random() * 1_000_000);

  const handleCreateRoom = async () => {
    if (!address) { setCreateError('Connect your wallet first.'); return; }
    const signer = getSigner();
    if (!signer) { setCreateError('Connect your wallet first.'); return; }
    if (!signer.signAuthEntry) { setCreateError('Your wallet does not support auth entry signing. Please use Freighter.'); return; }

    setCreating(true);
    setCreateError('');
    try {
      const sid = generateSessionId();
      const player2Placeholder = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const p1Pts = 1000n * 10_000_000n;
      const p2Pts = 1000n * 10_000_000n;

      const { authXdr, simDataXdr, simAuthP2Xdr, minResourceFee } = await svc.prepareStartGame(
        sid, address, player2Placeholder, p1Pts, p2Pts, signer,
      );

      const bundle: SessionBundle = {
        sessionId: sid,
        player1: address,
        player1Points: p1Pts.toString(),
        player2Points: p2Pts.toString(),
        authXdr, simDataXdr, simAuthP2Xdr, minResourceFee,
      };
      setSessionBundle(bundle);
      setInviteCode(btoa(JSON.stringify(bundle)));
    } catch (e) {
      setCreateError(toErrMsg(e));
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!address) { setJoinError('Connect your wallet first.'); return; }
    const signer = getSigner();
    if (!signer) { setJoinError('Connect your wallet first.'); return; }
    if (!roomCode.trim()) { setJoinError('Paste the invite code from Player 1.'); return; }

    setJoining(true);
    setJoinError('');
    try {
      const parsed: SessionBundle = JSON.parse(atob(roomCode.trim()));
      await svc.completeStartGame(
        parsed.sessionId, parsed.player1, address,
        BigInt(parsed.player1Points), BigInt(parsed.player2Points),
        parsed.authXdr, parsed.simDataXdr, parsed.simAuthP2Xdr, parsed.minResourceFee,
        signer,
      );
      router.push(`/game/${parsed.sessionId}`);
    } catch (e) {
      setJoinError(toErrMsg(e));
    } finally {
      setJoining(false);
    }
  };

  const handleEnterGame = () => {
    if (sessionBundle) {
      router.push(`/game/${sessionBundle.sessionId}`);
    }
  };

  const copyInviteCode = () => {
    if (inviteCode) navigator.clipboard.writeText(inviteCode);
  };

  const closeModal = () => {
    setShowModal(false);
    setSessionBundle(null);
    setInviteCode(null);
    setCreateError('');
    setJoinError('');
    setRoomCode('');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Animated background */}
      <GridMotion items={unoCardImages} gradientColor="black" />

      {/* Top-right wallet button */}
      <div className="absolute top-6 right-6 z-20">
        <WalletButton />
      </div>

      {/* Centre overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-center space-y-8 pointer-events-auto">
          <h1 className="text-7xl md:text-8xl font-black text-white drop-shadow-2xl tracking-tight">
            ZK-UNO
          </h1>
          <p className="text-white/60 text-lg font-medium tracking-wide">
            Zero-Knowledge UNO on Stellar
          </p>

          <div className="pt-4">
            {address ? (
              <div className="space-y-4">
                <div className="px-8 py-4 bg-green-600/90 backdrop-blur-md rounded-xl shadow-2xl">
                  <p className="text-white font-semibold">
                    Connected: {address.slice(0, 6)}…{address.slice(-4)}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="px-12 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold text-xl rounded-xl shadow-2xl transform transition hover:scale-105 active:scale-95"
                >
                  Start Playing
                </button>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-white/70 text-sm">Connect your wallet to start</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Room Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-white/10">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl leading-none"
            >
              ×
            </button>

            <h2 className="text-3xl font-bold text-white mb-6 text-center">Choose Game Mode</h2>

            {!inviteCode ? (
              <div className="space-y-4">
                {/* Create Room */}
                <button
                  onClick={handleCreateRoom}
                  disabled={creating}
                  className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-xl transform transition hover:scale-105 active:scale-95 disabled:scale-100"
                >
                  <div className="flex items-center justify-center gap-3">
                    {creating ? (
                      <>
                        <span className="animate-spin text-2xl">⏳</span>
                        <span>Creating Session…</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl">➕</span>
                        <span>Create New Room</span>
                      </>
                    )}
                  </div>
                </button>

                {createError && (
                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                    {createError}
                  </div>
                )}

                {/* Join Room */}
                <div className="space-y-3">
                  <div className="text-center text-white/60 text-sm">OR</div>
                  <input
                    type="text"
                    placeholder="Paste Invite Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-500 text-center text-sm font-mono"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={!roomCode.trim() || joining}
                    className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-xl transform transition hover:scale-105 active:scale-95 disabled:scale-100"
                  >
                    <div className="flex items-center justify-center gap-3">
                      {joining ? (
                        <>
                          <span className="animate-spin text-2xl">⏳</span>
                          <span>Joining…</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl">🚪</span>
                          <span>Join Existing Room</span>
                        </>
                      )}
                    </div>
                  </button>

                  {joinError && (
                    <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                      {joinError}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Invite code display */
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <p className="text-white/80 text-sm">Session Created! Share this invite code:</p>
                  <div className="bg-black/40 border-2 border-green-500/50 rounded-xl p-4">
                    <div className="text-xs font-mono text-green-400 break-all max-h-32 overflow-y-auto">
                      {inviteCode}
                    </div>
                  </div>
                  <div className="text-white/60 text-xs">
                    Session ID: {sessionBundle?.sessionId}
                  </div>
                  <button
                    onClick={copyInviteCode}
                    className="text-white/60 hover:text-white text-sm flex items-center justify-center gap-2 mx-auto transition"
                  >
                    <span>📋</span>
                    <span>Copy Invite Code</span>
                  </button>
                </div>

                <button
                  onClick={handleEnterGame}
                  className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-lg rounded-xl shadow-xl transform transition hover:scale-105 active:scale-95"
                >
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl">🎮</span>
                    <span>Enter Game</span>
                  </div>
                </button>

                <button
                  onClick={closeModal}
                  className="w-full px-4 py-2 text-white/60 hover:text-white text-sm transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
