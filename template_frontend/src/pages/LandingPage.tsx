import { FC, useState } from 'react';
import GridMotion from '../components/GridMotion';
import { useWalletStandalone } from '../hooks/useWalletStandalone';
import GamePage from './GamePage';
import { ZkUnoService, type WalletSigner } from '../lib/zkUnoService';
import { ZK_UNO_CONTRACT, NETWORK_PASSPHRASE } from '../lib/config';

const svc = new ZkUnoService(ZK_UNO_CONTRACT);

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

/** Serialise any thrown value to a readable string */
function toErrMsg(e: unknown): string {
  console.error('[ZK-UNO] error:', e);
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    // Check for message first
    if (typeof o.message === 'string') return o.message;
    // Check for error property
    if (typeof o.error === 'string') return o.error;
    if (o.error instanceof Error) return o.error.message;
    // Check for cause
    if (typeof o.cause === 'string') return o.cause;
    if (o.cause instanceof Error) return o.cause.message;
    // Check for result.error (Soroban SDK pattern)
    if (typeof o.result === 'object' && o.result) {
      const r = o.result as Record<string, unknown>;
      if (typeof r.error === 'string') return r.error;
    }
    // Try to stringify
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

const LandingPage: FC = () => {
  const { publicKey, connect, isConnected, getContractSigner } = useWalletStandalone();
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [sessionBundle, setSessionBundle] = useState<SessionBundle | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number>(0);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // All UNO card images from assets
  const allUnoCards = [
    // Blue cards
    'Blue_0.png', 'Blue_1.png', 'Blue_2.png', 'Blue_3.png', 'Blue_4.png',
    'Blue_5.png', 'Blue_6.png', 'Blue_7.png', 'Blue_8.png', 'Blue_9.png',
    'Blue_Draw.png', 'Blue_Reverse.png', 'Blue_Skip.png',
    // Green cards
    'Green_0.png', 'Green_1.png', 'Green_2.png', 'Green_3.png', 'Green_4.png',
    'Green_5.png', 'Green_6.png', 'Green_7.png', 'Green_8.png', 'Green_9.png',
    'Green_Draw.png', 'Green_Reverse.png', 'Green_Skip.png',
    // Red cards
    'Red_0.png', 'Red_1.png', 'Red_2.png', 'Red_3.png', 'Red_4.png',
    'Red_5.png', 'Red_6.png', 'Red_7.png', 'Red_8.png', 'Red_9.png',
    'Red_Draw.png', 'Red_Reverse.png', 'Red_Skip.png',
    // Yellow cards
    'Yellow_0.png', 'Yellow_1.png', 'Yellow_2.png', 'Yellow_3.png', 'Yellow_4.png',
    'Yellow_5.png', 'Yellow_6.png', 'Yellow_7.png', 'Yellow_8.png', 'Yellow_9.png',
    'Yellow_Draw.png', 'Yellow_Reverse.png', 'Yellow_Skip.png',
    // Wild cards
    'Wild.png', 'Wild_Draw.png'
  ];

  // Function to get random cards for the grid (28 cards needed for 4 rows x 7 cols)
  const getRandomCards = (count: number) => {
    const shuffled = [...allUnoCards].sort(() => Math.random() - 0.5);
    // Import the images using Vite's import mechanism
    return shuffled.slice(0, count).map(card => {
      try {
        // Use dynamic import for Vite
        return new URL(`../Uno Game Assets/${card}`, import.meta.url).href;
      } catch {
        return '';
      }
    });
  };

  // Generate 28 random UNO cards for the grid
  const unoCardImages = getRandomCards(28);

  const generateSessionId = () => Math.floor(Math.random() * 1_000_000);

  // Helper to convert ContractSigner to WalletSigner
  const getWalletSigner = (): WalletSigner | null => {
    if (!publicKey) return null;
    const contractSigner = getContractSigner();
    return {
      address: publicKey,
      signTransaction: async (xdr: string, opts: { networkPassphrase: string; address: string }) => {
        const result = await contractSigner.signTransaction(xdr, opts);
        if (result.error) throw result.error;
        return { signedTxXdr: result.signedTxXdr };
      },
      signAuthEntry: async (entryXdr: string, opts: { networkPassphrase: string; address: string }) => {
        const result = await contractSigner.signAuthEntry!(entryXdr, opts);
        if (result.error) {
          console.error('[signAuthEntry] wallet error:', result.error);
          throw new Error(result.error.message || 'Failed to sign auth entry');
        }
        // Return just the signedAuthEntry string, not wrapped in an object with error
        return { signedAuthEntry: result.signedAuthEntry };
      }
    };
  };

  const handleCreateRoom = async () => {
    if (!publicKey) {
      setCreateError('Connect your wallet first.');
      return;
    }
    const signer = getWalletSigner();
    if (!signer) {
      setCreateError('Connect your wallet first.');
      return;
    }
    
    // Check if wallet supports signAuthEntry
    if (!signer.signAuthEntry) {
      setCreateError('Your wallet does not support auth entry signing. Please use Freighter wallet.');
      return;
    }

    setCreating(true);
    setCreateError('');
    
    try {
      console.log('[handleCreateRoom] generating session ID...');
      const sid = generateSessionId();
      console.log('[handleCreateRoom] session ID:', sid);
      
      // Use placeholder address for player2 (will be replaced when they join)
      const player2Placeholder = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
      const p1Pts = 1000n * 10_000_000n; // 1000 points in stroops
      const p2Pts = 1000n * 10_000_000n;

      console.log('[handleCreateRoom] calling prepareStartGame...');
      const { authXdr, simDataXdr, simAuthP2Xdr, minResourceFee } = await svc.prepareStartGame(
        sid,
        publicKey,
        player2Placeholder,
        p1Pts,
        p2Pts,
        signer,
      );

      console.log('[handleCreateRoom] prepareStartGame succeeded');
      const bundle: SessionBundle = {
        sessionId: sid,
        player1: publicKey,
        player1Points: p1Pts.toString(),
        player2Points: p2Pts.toString(),
        authXdr,
        simDataXdr,
        simAuthP2Xdr,
        minResourceFee,
      };

      setSessionBundle(bundle);
      const encoded = btoa(JSON.stringify(bundle));
      setInviteCode(encoded);
    } catch (e) {
      console.error('[handleCreateRoom] error:', e);
      setCreateError(toErrMsg(e));
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!publicKey) {
      setJoinError('Connect your wallet first.');
      return;
    }
    const signer = getWalletSigner();
    if (!signer) {
      setJoinError('Connect your wallet first.');
      return;
    }
    if (!roomCode.trim()) {
      setJoinError('Paste the invite code from Player 1.');
      return;
    }

    setJoining(true);
    setJoinError('');
    
    try {
      const parsed: SessionBundle = JSON.parse(atob(roomCode.trim()));
      await svc.completeStartGame(
        parsed.sessionId,
        parsed.player1,
        publicKey,
        BigInt(parsed.player1Points),
        BigInt(parsed.player2Points),
        parsed.authXdr,
        parsed.simDataXdr,
        parsed.simAuthP2Xdr,
        parsed.minResourceFee,
        signer,
      );
      
      // Game started successfully
      setActiveSessionId(parsed.sessionId);
      setIsRoomCreator(false);
      setGameStarted(true);
      setShowRoomModal(false);
      setRoomCode('');
    } catch (e) {
      setJoinError(toErrMsg(e));
    } finally {
      setJoining(false);
    }
  };

  const handleEnterGame = () => {
    if (sessionBundle) {
      setActiveSessionId(sessionBundle.sessionId);
      setIsRoomCreator(true);
      setGameStarted(true);
      setShowRoomModal(false);
      setSessionBundle(null);
      setInviteCode(null);
    }
  };

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      // TODO: Show copied notification
    }
  };

  // If game started, show game page
  if (gameStarted && activeSessionId) {
    return <GamePage roomCode={activeSessionId.toString()} isCreator={isRoomCreator} />;
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Animated background */}
      <GridMotion items={unoCardImages} gradientColor="black" />

      {/* Content overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-center space-y-8 pointer-events-auto">
          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-7xl md:text-8xl font-black text-white drop-shadow-2xl">
              ZK-UNO
            </h1>
          </div>

          {/* Connect Wallet Button */}
          <div className="pt-4">
            {isConnected && publicKey ? (
              <div className="space-y-4">
                <div className="px-8 py-4 bg-green-600/90 backdrop-blur-md rounded-xl shadow-2xl">
                  <p className="text-white font-semibold">
                    Connected: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
                  </p>
                </div>
                <button 
                  onClick={() => setShowRoomModal(true)}
                  className="px-12 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold text-xl rounded-xl shadow-2xl transform transition hover:scale-105 active:scale-95">
                  Start Playing
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                className="px-12 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold text-xl rounded-xl shadow-2xl transform transition hover:scale-105 active:scale-95"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowRoomModal(false)}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-white/10">
            <button
              onClick={() => setShowRoomModal(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl"
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
                        <span>Creating Session...</span>
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
                          <span>Joining...</span>
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
              /* Room Created - Show Invite Code */
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
                  onClick={() => {
                    setSessionBundle(null);
                    setInviteCode(null);
                    setShowRoomModal(false);
                  }}
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
};

export default LandingPage;
