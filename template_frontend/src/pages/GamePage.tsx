import { FC, useState, useEffect } from 'react';
import { useWalletStandalone } from '../hooks/useWalletStandalone';
import { RoomService } from '../services/roomService';

interface Card {
  id: string;
  color: 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Wild';
  value: string;
  image: string;
}

interface GamePageProps {
  roomCode: string;
  isCreator: boolean;
}

const GamePage: FC<GamePageProps> = ({ roomCode, isCreator }) => {
  const { publicKey } = useWalletStandalone();
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [opponentCardCount, setOpponentCardCount] = useState(0);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [deckCount, setDeckCount] = useState(80);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerNumber, setPlayerNumber] = useState<1 | 2 | null>(null);
  const [bothPlayersPresent, setBothPlayersPresent] = useState(false);
  const [roomService, setRoomService] = useState<RoomService | null>(null);
  const [waitingForPlayer, setWaitingForPlayer] = useState(true);

  // All available UNO cards
  const allUnoCards = [
    // Blue cards
    { color: 'Blue', value: '0', file: 'Blue_0.png' },
    { color: 'Blue', value: '1', file: 'Blue_1.png' },
    { color: 'Blue', value: '2', file: 'Blue_2.png' },
    { color: 'Blue', value: '3', file: 'Blue_3.png' },
    { color: 'Blue', value: '4', file: 'Blue_4.png' },
    { color: 'Blue', value: '5', file: 'Blue_5.png' },
    { color: 'Blue', value: '6', file: 'Blue_6.png' },
    { color: 'Blue', value: '7', file: 'Blue_7.png' },
    { color: 'Blue', value: '8', file: 'Blue_8.png' },
    { color: 'Blue', value: '9', file: 'Blue_9.png' },
    { color: 'Blue', value: 'Draw', file: 'Blue_Draw.png' },
    { color: 'Blue', value: 'Reverse', file: 'Blue_Reverse.png' },
    { color: 'Blue', value: 'Skip', file: 'Blue_Skip.png' },
    // Green cards
    { color: 'Green', value: '0', file: 'Green_0.png' },
    { color: 'Green', value: '1', file: 'Green_1.png' },
    { color: 'Green', value: '2', file: 'Green_2.png' },
    { color: 'Green', value: '3', file: 'Green_3.png' },
    { color: 'Green', value: '4', file: 'Green_4.png' },
    { color: 'Green', value: '5', file: 'Green_5.png' },
    { color: 'Green', value: '6', file: 'Green_6.png' },
    { color: 'Green', value: '7', file: 'Green_7.png' },
    { color: 'Green', value: '8', file: 'Green_8.png' },
    { color: 'Green', value: '9', file: 'Green_9.png' },
    { color: 'Green', value: 'Draw', file: 'Green_Draw.png' },
    { color: 'Green', value: 'Reverse', file: 'Green_Reverse.png' },
    { color: 'Green', value: 'Skip', file: 'Green_Skip.png' },
    // Red cards
    { color: 'Red', value: '0', file: 'Red_0.png' },
    { color: 'Red', value: '1', file: 'Red_1.png' },
    { color: 'Red', value: '2', file: 'Red_2.png' },
    { color: 'Red', value: '3', file: 'Red_3.png' },
    { color: 'Red', value: '4', file: 'Red_4.png' },
    { color: 'Red', value: '5', file: 'Red_5.png' },
    { color: 'Red', value: '6', file: 'Red_6.png' },
    { color: 'Red', value: '7', file: 'Red_7.png' },
    { color: 'Red', value: '8', file: 'Red_8.png' },
    { color: 'Red', value: '9', file: 'Red_9.png' },
    { color: 'Red', value: 'Draw', file: 'Red_Draw.png' },
    { color: 'Red', value: 'Reverse', file: 'Red_Reverse.png' },
    { color: 'Red', value: 'Skip', file: 'Red_Skip.png' },
    // Yellow cards
    { color: 'Yellow', value: '0', file: 'Yellow_0.png' },
    { color: 'Yellow', value: '1', file: 'Yellow_1.png' },
    { color: 'Yellow', value: '2', file: 'Yellow_2.png' },
    { color: 'Yellow', value: '3', file: 'Yellow_3.png' },
    { color: 'Yellow', value: '4', file: 'Yellow_4.png' },
    { color: 'Yellow', value: '5', file: 'Yellow_5.png' },
    { color: 'Yellow', value: '6', file: 'Yellow_6.png' },
    { color: 'Yellow', value: '7', file: 'Yellow_7.png' },
    { color: 'Yellow', value: '8', file: 'Yellow_8.png' },
    { color: 'Yellow', value: '9', file: 'Yellow_9.png' },
    { color: 'Yellow', value: 'Draw', file: 'Yellow_Draw.png' },
    { color: 'Yellow', value: 'Reverse', file: 'Yellow_Reverse.png' },
    { color: 'Yellow', value: 'Skip', file: 'Yellow_Skip.png' },
    // Wild cards
    { color: 'Wild', value: 'Wild', file: 'Wild.png' },
    { color: 'Wild', value: 'Wild_Draw', file: 'Wild_Draw.png' },
  ];

  const createCard = (cardData: typeof allUnoCards[0]): Card => ({
    id: `${cardData.color}-${cardData.value}-${Math.random()}`,
    color: cardData.color as any,
    value: cardData.value,
    image: new URL(`../Uno Game Assets/${cardData.file}`, import.meta.url).href,
  });

  const getRandomCards = (count: number): Card[] => {
    const shuffled = [...allUnoCards].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(createCard);
  };

  // Initialize game
  useEffect(() => {
    const playerId = publicKey || `player_${Date.now()}`;
    let service: RoomService;

    // Clean up old rooms
    RoomService.cleanupOldRooms();

    if (isCreator) {
      // Create room
      RoomService.createRoom(roomCode, playerId, publicKey || '');
      service = new RoomService(roomCode, playerId);
      setPlayerNumber(1);
      setIsMyTurn(true);
    } else {
      // Join room
      const room = RoomService.joinRoom(roomCode, playerId, publicKey || '');
      if (!room) {
        alert('Room not found or full!');
        return;
      }
      service = new RoomService(roomCode, playerId);
      setPlayerNumber(2);
      setIsMyTurn(false);
    }

    setRoomService(service);

    // Poll for room updates
    const pollInterval = setInterval(() => {
      const room = service.getRoom();
      if (!room) return;

      // Check if both players are present
      const bothPresent = room.players.length === 2;
      setBothPlayersPresent(bothPresent);
      setWaitingForPlayer(!bothPresent);

      // Update opponent card count
      const myPlayerNum = service.getPlayerNumber();
      const opponent = room.players.find(p => p.playerNumber !== myPlayerNum);
      if (opponent) {
        setOpponentCardCount(opponent.hand.length);
      }

      // Start game when both players present and not started
      if (bothPresent && !room.gameStarted && isCreator) {
        // Deal cards to both players
        const player1Hand = getRandomCards(7);
        const player2Hand = getRandomCards(7);
        
        room.players[0].hand = player1Hand;
        room.players[1].hand = player2Hand;

        // Set starting card
        const startingCards = allUnoCards.filter(c => 
          !['Draw', 'Reverse', 'Skip', 'Wild', 'Wild_Draw'].includes(c.value)
        );
        const randomStart = startingCards[Math.floor(Math.random() * startingCards.length)];
        const startCard = createCard(randomStart);
        
        service.startGame(startCard);
        setCurrentCard(startCard);
        setPlayerHand(player1Hand);
      } else if (room.gameStarted) {
        // Load game state
        const myPlayer = room.players.find(p => p.playerNumber === myPlayerNum);
        if (myPlayer && myPlayer.hand.length > 0) {
          setPlayerHand(myPlayer.hand);
        }
        if (room.currentCard) {
          setCurrentCard(room.currentCard);
        }
        setIsMyTurn(room.currentTurn === myPlayerNum);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [roomCode, isCreator, publicKey]);

  const handleDrawCard = () => {
    if (!isMyTurn || !roomService) return;
    
    const newCard = getRandomCards(1)[0];
    const newHand = [...playerHand, newCard];
    setPlayerHand(newHand);
    setDeckCount(deckCount - 1);
    
    // Update room
    roomService.updatePlayerHand(playerNumber!, newHand);
    const room = roomService.getRoom();
    if (room) {
      const nextTurn = playerNumber === 1 ? 2 : 1;
      roomService.updateRoom({ currentTurn: nextTurn as 1 | 2 });
    }
    setIsMyTurn(false);
  };

  const handlePlayCard = (card: Card) => {
    if (!isMyTurn || !roomService) return;
    
    // TODO: Add card validation logic
    const newHand = playerHand.filter(c => c.id !== card.id);
    setCurrentCard(card);
    setPlayerHand(newHand);
    
    // Update room
    roomService.updatePlayerHand(playerNumber!, newHand);
    roomService.updateRoom({ 
      currentCard: card,
      currentTurn: (playerNumber === 1 ? 2 : 1) as 1 | 2
    });
    
    setIsMyTurn(false);
    
    // Check for UNO
    if (newHand.length === 1) {
      console.log('UNO!');
    }
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-900 overflow-hidden">
      {/* Game Header */}
      <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-8">
        <div className="flex items-center gap-4">
          <img 
            src={new URL('../Uno Game Assets/Blue_0.png', import.meta.url).href} 
            alt="UNO Logo" 
            className="w-16 h-16 object-contain"
          />
        </div>
        
        <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-xl border border-white/30">
          <p className="text-white font-bold text-xl">Game Code: {roomCode}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="w-12 h-12 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center text-white text-2xl transition">
            🔊
          </button>
          <button className="w-12 h-12 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center text-white text-2xl transition">
            ⚙️
          </button>
        </div>
      </div>

      {/* Opponent's Cards */}
      <div className="absolute top-24 left-1/2 transform -translate-x-1/2 flex items-center gap-2">
        <div className="text-white font-bold text-lg bg-black/30 px-4 py-2 rounded-lg">
          Player {playerNumber === 1 ? 2 : 1}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: opponentCardCount }, (_, i) => (
            <div key={i} className="relative">
              <img 
                src={new URL('../Uno Game Assets/Blue_0.png', import.meta.url).href}
                alt="Card back"
                className="w-16 h-24 object-contain transform rotate-180"
                style={{ marginLeft: i > 0 ? '-45px' : '0' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Center Play Area */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-8">
        {/* Draw Pile */}
        <button
          onClick={handleDrawCard}
          disabled={!isMyTurn}
          className="relative group"
        >
          <div className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-3 rounded-xl text-white font-bold transition shadow-xl">
            DRAW CARD
          </div>
          <div className="text-white text-sm text-center mt-2">
            {deckCount} cards
          </div>
        </button>

        {/* Current Card */}
        {currentCard && (
          <div className="relative">
            <img 
              src={currentCard.image}
              alt={`${currentCard.color} ${currentCard.value}`}
              className="w-32 h-48 object-contain shadow-2xl rounded-xl"
            />
          </div>
        )}

        {/* UNO Button */}
        <button className="bg-yellow-500 hover:bg-yellow-600 px-8 py-4 rounded-xl text-white font-black text-2xl shadow-xl transition transform hover:scale-105">
          UNO
        </button>
      </div>

      {/* Player's Hand */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="text-white font-bold text-lg mb-2 text-center bg-black/30 px-4 py-2 rounded-lg inline-block">
          Player {playerNumber} {isMyTurn && '(Your Turn)'}
        </div>
        <div className="flex items-end justify-center gap-0">
          {playerHand.map((card, index) => (
            <button
              key={card.id}
              onClick={() => handlePlayCard(card)}
              disabled={!isMyTurn}
              className="relative group transition-all duration-200 hover:-translate-y-4 disabled:hover:translate-y-0"
              style={{ marginLeft: index > 0 ? '-60px' : '0', zIndex: index }}
            >
              <img 
                src={card.image}
                alt={`${card.color} ${card.value}`}
                className="w-24 h-36 object-contain shadow-xl rounded-lg group-hover:shadow-2xl"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Turn Indicator */}
      {waitingForPlayer ? (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md px-12 py-8 rounded-2xl border-2 border-white/30 text-center">
          <div className="text-white font-bold text-2xl mb-4">Waiting for Player {playerNumber === 1 ? 2 : 1}...</div>
          <div className="text-white/70 text-lg mb-4">Share the room code:</div>
          <div className="bg-green-600/50 px-8 py-4 rounded-xl border-2 border-green-400">
            <div className="text-green-200 font-bold text-4xl tracking-widest font-mono">{roomCode}</div>
          </div>
        </div>
      ) : !isMyTurn && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md px-8 py-4 rounded-xl border border-white/30 pointer-events-none">
          <p className="text-white font-bold text-xl">Opponent's turn...</p>
        </div>
      )}
    </div>
  );
};

export default GamePage;
