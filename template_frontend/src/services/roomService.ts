// Room management service using localStorage for demo
// In production, this would use WebSockets or a backend API

export interface Player {
  id: string;
  publicKey: string;
  playerNumber: 1 | 2;
  hand: any[];
  joinedAt: number;
}

export interface Room {
  code: string;
  createdAt: number;
  players: Player[];
  currentCard: any | null;
  currentTurn: 1 | 2;
  deckCards: number;
  gameStarted: boolean;
  lastUpdate: number;
}

const ROOM_PREFIX = 'uno_room_';
const ROOM_EXPIRY = 1000 * 60 * 60; // 1 hour

export class RoomService {
  private roomCode: string;
  private playerId: string;

  constructor(roomCode: string, playerId: string) {
    this.roomCode = roomCode;
    this.playerId = playerId;
  }

  // Create a new room
  static createRoom(code: string, creatorId: string, creatorPublicKey: string): Room {
    const room: Room = {
      code,
      createdAt: Date.now(),
      players: [{
        id: creatorId,
        publicKey: creatorPublicKey,
        playerNumber: 1,
        hand: [],
        joinedAt: Date.now(),
      }],
      currentCard: null,
      currentTurn: 1,
      deckCards: 80,
      gameStarted: false,
      lastUpdate: Date.now(),
    };

    localStorage.setItem(`${ROOM_PREFIX}${code}`, JSON.stringify(room));
    return room;
  }

  // Join an existing room
  static joinRoom(code: string, playerId: string, publicKey: string): Room | null {
    const roomData = localStorage.getItem(`${ROOM_PREFIX}${code}`);
    if (!roomData) {
      return null;
    }

    const room: Room = JSON.parse(roomData);
    
    // Check if room is full
    if (room.players.length >= 2) {
      // Check if this player is already in the room
      const existingPlayer = room.players.find(p => p.id === playerId);
      if (existingPlayer) {
        return room;
      }
      return null;
    }

    // Add player 2
    room.players.push({
      id: playerId,
      publicKey: publicKey,
      playerNumber: 2,
      hand: [],
      joinedAt: Date.now(),
    });

    room.lastUpdate = Date.now();
    localStorage.setItem(`${ROOM_PREFIX}${code}`, JSON.stringify(room));
    
    return room;
  }

  // Get room state
  getRoom(): Room | null {
    const roomData = localStorage.getItem(`${ROOM_PREFIX}${this.roomCode}`);
    if (!roomData) {
      return null;
    }

    const room: Room = JSON.parse(roomData);
    
    // Check if room expired
    if (Date.now() - room.createdAt > ROOM_EXPIRY) {
      this.deleteRoom();
      return null;
    }

    return room;
  }

  // Update room state
  updateRoom(updates: Partial<Room>): void {
    const room = this.getRoom();
    if (!room) return;

    const updatedRoom = {
      ...room,
      ...updates,
      lastUpdate: Date.now(),
    };

    localStorage.setItem(`${ROOM_PREFIX}${this.roomCode}`, JSON.stringify(updatedRoom));
  }

  // Update player hand
  updatePlayerHand(playerNumber: 1 | 2, hand: any[]): void {
    const room = this.getRoom();
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.playerNumber === playerNumber);
    if (playerIndex !== -1) {
      room.players[playerIndex].hand = hand;
      this.updateRoom({ players: room.players });
    }
  }

  // Get player number for current user
  getPlayerNumber(): 1 | 2 | null {
    const room = this.getRoom();
    if (!room) return null;

    const player = room.players.find(p => p.id === this.playerId);
    return player?.playerNumber || null;
  }

  // Check if both players are present
  isBothPlayersPresent(): boolean {
    const room = this.getRoom();
    return room ? room.players.length === 2 : false;
  }

  // Start the game
  startGame(initialCard: any): void {
    this.updateRoom({
      gameStarted: true,
      currentCard: initialCard,
      currentTurn: 1,
    });
  }

  // Delete room
  deleteRoom(): void {
    localStorage.removeItem(`${ROOM_PREFIX}${this.roomCode}`);
  }

  // Clean up old rooms
  static cleanupOldRooms(): void {
    const now = Date.now();
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith(ROOM_PREFIX)) {
        const roomData = localStorage.getItem(key);
        if (roomData) {
          const room: Room = JSON.parse(roomData);
          if (now - room.createdAt > ROOM_EXPIRY) {
            localStorage.removeItem(key);
          }
        }
      }
    });
  }
}
