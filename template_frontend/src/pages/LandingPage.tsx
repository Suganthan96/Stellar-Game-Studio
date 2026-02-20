import { FC, useState } from 'react';
import GridMotion from '../components/GridMotion';
import { useWalletStandalone } from '../hooks/useWalletStandalone';
import GamePage from './GamePage';

const LandingPage: FC = () => {
  const { publicKey, connect, isConnected } = useWalletStandalone();
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [activeRoomCode, setActiveRoomCode] = useState<string>('');
  const [isRoomCreator, setIsRoomCreator] = useState(false);

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

  const handleCreateRoom = () => {
    // Generate a random room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('Creating room with code:', code);
    setCreatedRoomCode(code);
    // TODO: Implement room creation logic with backend
  };

  const handleJoinRoom = () => {
    if (roomCode.trim()) {
      console.log('Joining room:', roomCode);
      setActiveRoomCode(roomCode);
      setIsRoomCreator(false);
      setGameStarted(true);
      setShowRoomModal(false);
      setRoomCode('');
    }
  };

  const handleEnterGame = () => {
    if (createdRoomCode) {
      console.log('Entering game with room code:', createdRoomCode);
      setActiveRoomCode(createdRoomCode);
      setIsRoomCreator(true);
      setGameStarted(true);
      setShowRoomModal(false);
      setCreatedRoomCode(null);
    }
  };

  const copyRoomCode = () => {
    if (createdRoomCode) {
      navigator.clipboard.writeText(createdRoomCode);
      // TODO: Show copied notification
    }
  };

  // If game started, show game page
  if (gameStarted && activeRoomCode) {
    return <GamePage roomCode={activeRoomCode} isCreator={isRoomCreator} />;
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
            
            {!createdRoomCode ? (
              <div className="space-y-4">
                {/* Create Room */}
                <button
                  onClick={handleCreateRoom}
                  className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-lg rounded-xl shadow-xl transform transition hover:scale-105 active:scale-95"
                >
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-2xl">➕</span>
                    <span>Create New Room</span>
                  </div>
                </button>
                
                {/* Join Room */}
                <div className="space-y-3">
                  <div className="text-center text-white/60 text-sm">OR</div>
                  <input
                    type="text"
                    placeholder="Enter Room Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-500 text-center text-lg font-mono"
                    maxLength={6}
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={!roomCode.trim()}
                    className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-xl transform transition hover:scale-105 active:scale-95 disabled:scale-100"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl">🚪</span>
                      <span>Join Existing Room</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              /* Room Created - Show Code */
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <p className="text-white/80 text-sm">Room Created! Share this code:</p>
                  <div className="bg-black/40 border-2 border-green-500/50 rounded-xl p-6">
                    <div className="text-5xl font-bold text-green-400 tracking-widest font-mono">
                      {createdRoomCode}
                    </div>
                  </div>
                  <button
                    onClick={copyRoomCode}
                    className="text-white/60 hover:text-white text-sm flex items-center justify-center gap-2 mx-auto transition"
                  >
                    <span>📋</span>
                    <span>Copy Code</span>
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
                    setCreatedRoomCode(null);
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
