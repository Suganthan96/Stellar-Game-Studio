import { FC } from 'react';
import GridMotion from '../components/GridMotion';
import { useWalletStandalone } from '../hooks/useWalletStandalone';

const LandingPage: FC = () => {
  const { publicKey, connect, isConnected } = useWalletStandalone();

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
            <p className="text-2xl md:text-3xl font-bold text-white/90 drop-shadow-lg">
              Invisible Hands, Provable Fairness
            </p>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto px-4 drop-shadow-lg">
              Play UNO with zero-knowledge proofs on Stellar. 
              Hidden hand counts. Verified moves. Cryptographically fair gameplay.
            </p>
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
                <button className="px-12 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold text-xl rounded-xl shadow-2xl transform transition hover:scale-105 active:scale-95">
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

          {/* Features */}
          <div className="pt-8 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto px-4">
            <div className="bg-black/40 backdrop-blur-md p-6 rounded-xl shadow-xl border border-white/10">
              <div className="text-4xl mb-2">🔒</div>
              <h3 className="text-white font-bold text-lg mb-2">Hidden Hand Count</h3>
              <p className="text-white/70 text-sm">No one knows your card count. No targeting.</p>
            </div>
            <div className="bg-black/40 backdrop-blur-md p-6 rounded-xl shadow-xl border border-white/10">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-white font-bold text-lg mb-2">Provable Moves</h3>
              <p className="text-white/70 text-sm">Every move is ZK-verified. No cheating possible.</p>
            </div>
            <div className="bg-black/40 backdrop-blur-md p-6 rounded-xl shadow-xl border border-white/10">
              <div className="text-4xl mb-2">🎯</div>
              <h3 className="text-white font-bold text-lg mb-2">Fair +4 Rules</h3>
              <p className="text-white/70 text-sm">Wild Draw 4 legality cryptographically enforced.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
