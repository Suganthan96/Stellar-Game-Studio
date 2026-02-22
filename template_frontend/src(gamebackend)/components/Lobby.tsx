'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { ZkUnoService } from '@/lib/zkUnoService';
import { ZK_UNO_CONTRACT } from '@/lib/config';

const svc = new ZkUnoService(ZK_UNO_CONTRACT);

/** Serialise any thrown value to a readable string.
 *  Soroban SDK errors are often plain objects (sometimes circular),
 *  so we walk known properties instead of relying on JSON.stringify. */
function toErrMsg(e: unknown): string {
  console.error('[ZK-UNO] error:', e);          // always log the raw value
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;

  // Plain object — try common Stellar/Soroban SDK shapes
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    // { message: string }
    if (typeof o.message === 'string') return o.message;
    // { error: string } — SimulateTransactionErrorResponse
    if (typeof o.error === 'string') return o.error;
    // { error: Error }
    if (o.error instanceof Error) return o.error.message;
    // { cause: string | Error }
    if (typeof o.cause === 'string') return o.cause;
    if (o.cause instanceof Error) return o.cause.message;
    // { result: { error: string } }
    if (typeof o.result === 'object' && o.result) {
      const r = o.result as Record<string, unknown>;
      if (typeof r.error === 'string') return r.error;
    }
    // Last resort: safe stringify avoiding circular refs
    try {
      const seen = new WeakSet();
      return JSON.stringify(e, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return typeof v === 'bigint' ? v.toString() : v;
      });
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** Everything P2 needs to complete the start_game tx */
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

export default function Lobby() {
  const router = useRouter();
  const { address, getSigner } = useWallet();
  const [tab, setTab] = useState<'create' | 'join'>('create');

  // Create Room state
  const [p2Address, setP2Address] = useState('');
  const [p1Points, setP1Points] = useState('100');
  const [p2Points, setP2Points] = useState('100');
  const [bundle, setBundle] = useState<SessionBundle | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join Room state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const generateSessionId = () => Math.floor(Math.random() * 1_000_000);

  const handleCreate = async () => {
    if (!address) return;
    const signer = getSigner();
    if (!signer) { setCreateError('Connect your wallet first.'); return; }
    if (!p2Address.trim()) { setCreateError('Enter Player 2 address.'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const sid = generateSessionId();
      const p1Pts = BigInt(p1Points) * 10_000_000n;
      const p2Pts = BigInt(p2Points) * 10_000_000n;

      const { authXdr, simDataXdr, simAuthP2Xdr, minResourceFee } = await svc.prepareStartGame(
        sid,
        address,
        p2Address.trim(),
        p1Pts,
        p2Pts,
        signer,
      );

      setBundle({
        sessionId: sid,
        player1: address,
        player1Points: p1Pts.toString(),
        player2Points: p2Pts.toString(),
        authXdr,
        simDataXdr,
        simAuthP2Xdr,
        minResourceFee,
      });
    } catch (e) {
      setCreateError(toErrMsg(e));
    } finally {
      setCreating(false);
    }
  };

  const bundleCode = bundle ? btoa(JSON.stringify(bundle)) : '';

  const handleJoin = async () => {
    if (!address) return;
    const signer = getSigner();
    if (!signer) { setJoinError('Connect your wallet first.'); return; }
    if (!joinCode.trim()) { setJoinError('Paste the invite code from Player 1.'); return; }
    setJoining(true);
    setJoinError('');
    try {
      const parsed: SessionBundle = JSON.parse(atob(joinCode.trim()));
      await svc.completeStartGame(
        parsed.sessionId,
        parsed.player1,
        address,
        BigInt(parsed.player1Points),
        BigInt(parsed.player2Points),
        parsed.authXdr,
        parsed.simDataXdr,
        parsed.simAuthP2Xdr,
        parsed.minResourceFee,
        signer,
      );
      router.push(`/game/${parsed.sessionId}`);
    } catch (e) {
      setJoinError(toErrMsg(e));
    } finally {
      setJoining(false);
    }
  };

  const goToGame = () => {
    if (bundle) router.push(`/game/${bundle.sessionId}`);
  };

  const tabCls = (t: string) =>
    `px-5 py-2 rounded-t-lg text-sm font-medium transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`;

  return (
    <div className="w-full max-w-lg">
      <div className="flex border-b border-gray-700 mb-0">
        <button className={tabCls('create')} onClick={() => setTab('create')}>Create Room</button>
        <button className={tabCls('join')} onClick={() => setTab('join')}>Join Room</button>
      </div>

      <div className="bg-gray-800 rounded-b-xl rounded-tr-xl p-6 space-y-4">
        {tab === 'create' && (
          <>
            {!bundle ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Player 2 Address</label>
                  <input
                    type="text"
                    value={p2Address}
                    onChange={e => setP2Address(e.target.value)}
                    placeholder="G…"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">P1 Points</label>
                    <input
                      type="number"
                      value={p1Points}
                      onChange={e => setP1Points(e.target.value)}
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">P2 Points</label>
                    <input
                      type="number"
                      value={p2Points}
                      onChange={e => setP2Points(e.target.value)}
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                {createError && <p className="text-red-400 text-xs">{createError}</p>}
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {creating ? 'Creating…' : 'Create Game'}
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
                  <p className="text-green-400 text-xs font-medium mb-1">Game created!</p>
                  <p className="text-white text-lg font-bold">Session <span className="text-indigo-300">{bundle.sessionId}</span></p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Invite code for Player 2</label>
                  <textarea
                    readOnly
                    value={bundleCode}
                    rows={3}
                    className="w-full bg-gray-700 text-gray-300 text-xs px-3 py-2 rounded-lg border border-gray-600 font-mono resize-none"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(bundleCode)}
                    className="mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Copy Code
                  </button>
                </div>
                <p className="text-gray-400 text-xs">
                  Player 2 pastes this code in the &quot;Join Room&quot; tab. Once they join, click below.
                </p>
                <button
                  onClick={goToGame}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                >
                  Go to Game →
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'join' && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Invite Code from Player 1</label>
              <textarea
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="Paste the invite code here…"
                rows={3}
                className="w-full bg-gray-700 text-white text-xs px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 font-mono resize-none"
              />
            </div>
            {joinError && <p className="text-red-400 text-xs">{joinError}</p>}
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {joining ? 'Joining…' : 'Join & Start Game'}
            </button>
          </>
        )}
      </div>
    </div>
  );

}
