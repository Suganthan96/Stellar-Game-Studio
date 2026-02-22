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
  const [gameDirection, setGameDirection] = useState<'clockwise' | 'counterclockwise'>('clockwise');
  const [selectedWildColor, setSelectedWildColor] = useState<'Red' | 'Blue' | 'Green' | 'Yellow' | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

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

  // Deal cards to both players from a shuffled deck
  const dealCardsToPlayers = (cardsPerPlayer: number): { player1: Card[], player2: Card[] } => {
    // Create a full deck with duplicates (like a real UNO deck)
    const fullDeck = [...allUnoCards, ...allUnoCards];
    
    // Fisher-Yates shuffle for better randomization with timestamp seed
    const timestamp = Date.now();
    for (let i = fullDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
    }
    
    // Deal cards from the shuffled deck - ensuring they're different
    const player1Cards = fullDeck.slice(0, cardsPerPlayer).map((card, idx) => createCard(card));
    const player2Cards = fullDeck.slice(cardsPerPlayer, cardsPerPlayer * 2).map((card, idx) => createCard(card));
    
    // Detailed logging
    console.log('=== DEALING CARDS ===');
    console.log('Player 1 cards:', player1Cards.map(c => `${c.color} ${c.value}`).join(', '));
    console.log('Player 2 cards:', player2Cards.map(c => `${c.color} ${c.value}`).join(', '));
    console.log('Are they different?', JSON.stringify(player1Cards) !== JSON.stringify(player2Cards));
    
    return { player1: player1Cards, player2: player2Cards };
  };

  // UNO GAME RULES IMPLEMENTATION

  // Check if a card can be played on the current card
  const canPlayCard = (card: Card, current: Card | null): boolean => {
    if (!current) return false;
    
    // Wild cards can always be played
    if (card.color === 'Wild') return true;
    
    // Match by color
    if (card.color === current.color) return true;
    
    // Match by value (number or action)
    if (card.value === current.value) return true;
    
    return false;
  };

  // Check if player has any playable cards
  const hasPlayableCard = (hand: Card[], current: Card | null): boolean => {
    if (!current) return false;
    return hand.some(card => canPlayCard(card, current));
  };

  // Get next player number based on direction
  const getNextPlayer = (): 1 | 2 => {
    // In 2-player game, direction doesn't matter, always alternate
    return playerNumber === 1 ? 2 : 1;
  };

  // Apply card action effects
  const applyCardAction = (card: Card, nextPlayer: 1 | 2) => {
    const room = roomService?.getRoom();
    if (!room) return;

    switch (card.value) {
      case 'Reverse':
        // In 2-player game, Reverse acts like Skip
        console.log('Reverse card played - acts as Skip in 2-player game');
        // Player gets another turn
        roomService?.updateRoom({ currentTurn: playerNumber! });
        setIsMyTurn(true);
        break;

      case 'Skip':
        console.log('Skip card played - opponent loses turn');
        // Player gets another turn
        roomService?.updateRoom({ currentTurn: playerNumber! });
        setIsMyTurn(true);
        break;

      case 'Draw':
        console.log('Draw Two card played - opponent draws 2 cards');
        // Opponent draws 2 cards and loses turn
        // This will be handled in the opponent's window
        roomService?.updateRoom({ 
          currentTurn: playerNumber!,  // Player gets another turn
          pendingDraw: 2
        });
        setIsMyTurn(true);
        break;

      case 'Wild_Draw':
        console.log('Wild Draw Four played - opponent draws 4 cards');
        // Show color picker for wild card
        setShowColorPicker(true);
        break;

      case 'Wild':
        console.log('Wild card played');
        // Show color picker
        setShowColorPicker(true);
        break;

      default:
        // Normal card, switch turns
        roomService?.updateRoom({ currentTurn: nextPlayer });
        setIsMyTurn(false);
        break;
    }
  };

  // Handle wild color selection
  const selectWildColor = (color: 'Red' | 'Blue' | 'Green' | 'Yellow') => {
    if (!roomService || !currentCard) return;

    setSelectedWildColor(color);
    setShowColorPicker(false);

    // Update the current card color in the room
    const updatedCard = { ...currentCard, color };
    
    const isPlusFour = currentCard.value === 'Wild_Draw';
    
    roomService.updateRoom({ 
      currentCard: updatedCard,
      currentTurn: playerNumber!,  // Player who played wild gets another turn
      pendingDraw: isPlusFour ? 4 : 0
    });

    console.log(`Wild color selected: ${color}${isPlusFour ? ' - opponent must draw 4' : ''}`);
  };

  // Initialize game
  useEffect(() => {
    // Generate a unique player ID for this browser session
    let playerId = sessionStorage.getItem('uno_player_session_id');
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('uno_player_session_id', playerId);
    }
    
    console.log('Player ID for this session:', playerId, 'isCreator:', isCreator);
    
    let service: RoomService;

    // Clean up old rooms
    RoomService.cleanupOldRooms();

    if (isCreator) {
      // Create room
      RoomService.createRoom(roomCode, playerId, publicKey || '');
      service = new RoomService(roomCode, playerId);
      setPlayerNumber(1);
      setIsMyTurn(true);
      console.log('Created room as Player 1');
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
      console.log('Joined room as Player 2');
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
        // Deal unique cards to both players from a shuffled deck
        const { player1, player2 } = dealCardsToPlayers(7);
        
        room.players[0].hand = player1;
        room.players[1].hand = player2;

        // Set starting card
        const startingCards = allUnoCards.filter(c => 
          !['Draw', 'Reverse', 'Skip', 'Wild', 'Wild_Draw'].includes(c.value)
        );
        const randomStart = startingCards[Math.floor(Math.random() * startingCards.length)];
        const startCard = createCard(randomStart);
        
        // First update players with their hands
        service.updateRoom({ players: room.players });
        console.log('=== GAME STARTED BY PLAYER 1 ===');
        console.log('Player 1 hand being saved:', player1.map(c => `${c.color} ${c.value}`).join(', '));
        console.log('Player 2 hand being saved:', player2.map(c => `${c.color} ${c.value}`).join(', '));
        
        // Then start the game with the initial card
        service.startGame(startCard);
        setCurrentCard(startCard);
        setPlayerHand(player1);
      } else if (room.gameStarted) {
        // Load game state
        const myPlayer = room.players.find(p => p.playerNumber === myPlayerNum);
        
        // Only update hand if we don't have cards yet
        if (myPlayer && myPlayer.hand && myPlayer.hand.length > 0 && playerHand.length === 0) {
          console.log('=== LOADING HAND FOR PLAYER', myPlayerNum, '===');
          console.log('Cards loaded:', myPlayer.hand.map((c: Card) => `${c.color} ${c.value}`).join(', '));
          setPlayerHand(myPlayer.hand);
        }
        
        if (room.currentCard && !currentCard) {
          setCurrentCard(room.currentCard);
        }
        setIsMyTurn(room.currentTurn === myPlayerNum);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [roomCode, isCreator, publicKey]);

  const handleDrawCard = () => {
    if (!isMyTurn || !roomService) return;
    
    const room = roomService.getRoom();
    if (!room) return;

    // Check if there's a pending draw (from Draw Two or Wild Draw Four)
    const pendingDraw = (room as any).pendingDraw || 0;
    const cardsToDraw = pendingDraw > 0 ? pendingDraw : 1;

    // Draw the required number of cards
    const newCards = getRandomCards(cardsToDraw);
    const newHand = [...playerHand, ...newCards];
    setPlayerHand(newHand);
    setDeckCount(deckCount - cardsToDraw);
    
    console.log(`Drew ${cardsToDraw} card(s)${pendingDraw > 0 ? ' (penalty)' : ''}`);
    
    // Update room
    roomService.updatePlayerHand(playerNumber!, newHand);
    
    // If player drew due to penalty, they lose their turn
    // If normal draw and card can't be played, lose turn
    const drewCard = newCards[0];
    const canPlayDrawnCard = cardsToDraw === 1 && canPlayCard(drewCard, currentCard);
    
    if (pendingDraw > 0 || !canPlayDrawnCard) {
      // Lose turn
      const nextTurn = getNextPlayer();
      roomService.updateRoom({ 
        currentTurn: nextTurn,
        pendingDraw: 0  // Clear penalty
      });
      setIsMyTurn(false);
    } else {
      // Can play the drawn card immediately if desired
      console.log('Drew a playable card!');
    }
  };

  const handlePlayCard = (card: Card) => {
    if (!isMyTurn || !roomService || !currentCard) return;
    
    // Validate card can be played
    if (!canPlayCard(card, currentCard)) {
      alert(`Cannot play ${card.color} ${card.value} on ${currentCard.color} ${currentCard.value}`);
      return;
    }
    
    const newHand = playerHand.filter(c => c.id !== card.id);
    setCurrentCard(card);
    setPlayerHand(newHand);
    
    // Update room with new hand
    roomService.updatePlayerHand(playerNumber!, newHand);
    
    // Check for UNO
    if (newHand.length === 1) {
      console.log('UNO! One card left!');
      alert('UNO!');
    }
    
    // Check for win
    if (newHand.length === 0) {
      console.log(`Player ${playerNumber} wins!`);
      alert(`You win! 🎉`);
      roomService.updateRoom({ 
        currentCard: card,
        gameEnded: true,
        winner: playerNumber || undefined
      });
      return;
    }
    
    // Apply card action and determine next turn
    const nextPlayer = getNextPlayer();
    applyCardAction(card, nextPlayer);
    
    // Update current card in room (unless it's a wild card waiting for color selection)
    if (card.color !== 'Wild' || card.value === 'Wild' || card.value === 'Wild_Draw') {
      if (!showColorPicker) {
        roomService.updateRoom({ currentCard: card });
      }
    } else {
      roomService.updateRoom({ currentCard: card });
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

      {/* Wild Card Color Picker */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 border border-white/20">
            <h3 className="text-white font-bold text-2xl mb-6 text-center">Choose a Color</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => selectWildColor('Red')}
                className="w-32 h-32 bg-red-600 hover:bg-red-700 rounded-xl shadow-xl transform transition hover:scale-110 active:scale-95 border-4 border-white/30"
              >
                <span className="text-white font-bold text-xl">Red</span>
              </button>
              <button
                onClick={() => selectWildColor('Blue')}
                className="w-32 h-32 bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xl transform transition hover:scale-110 active:scale-95 border-4 border-white/30"
              >
                <span className="text-white font-bold text-xl">Blue</span>
              </button>
              <button
                onClick={() => selectWildColor('Green')}
                className="w-32 h-32 bg-green-600 hover:bg-green-700 rounded-xl shadow-xl transform transition hover:scale-110 active:scale-95 border-4 border-white/30"
              >
                <span className="text-white font-bold text-xl">Green</span>
              </button>
              <button
                onClick={() => selectWildColor('Yellow')}
                className="w-32 h-32 bg-yellow-500 hover:bg-yellow-600 rounded-xl shadow-xl transform transition hover:scale-110 active:scale-95 border-4 border-white/30"
              >
                <span className="text-white font-bold text-xl">Yellow</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamePage;
