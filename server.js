const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const gameRooms = new Map();
const playerSockets = new Map();

// Generate 6-digit game code
function generateGameCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Create standard 52-card deck
function createDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ suit, value, numericValue: getNumericValue(value) });
    }
  }
  
  return shuffleDeck(deck);
}

function getNumericValue(value) {
  switch(value) {
    case 'J': return 11;
    case 'Q': return 12;
    case 'K': return 13;
    case 'A': return 14;
    default: return parseInt(value);
  }
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Initialize game state
function createGameState(roomCode) {
  return {
    roomCode,
    players: [],
    deck: createDeck(),
    tableCards: [],
    currentPlayerIndex: 0,
    gameStarted: false,
    gameEnded: false,
    lastCardValue: 0,
    turnDirection: 1, // 1 for forward, -1 for backward
    skipNextPlayer: false,
    mustThrowAfterTaking: false, // Player must throw a card after taking table cards
    playerWhoTook: null // ID of player who took cards and must throw
  };
}

// Deal initial cards to players
function dealInitialCards(gameState) {
  gameState.players.forEach(player => {
    // Deal 3 hand cards (open/visible)
    player.handCards = gameState.deck.splice(0, 3);
    // Deal 3 blind cards (face down, hidden)
    player.blindCards = gameState.deck.splice(0, 3);
    // No visible cards initially
    player.visibleCards = [];
  });
  
  // Start discard pile with one card from deck
  if (gameState.deck.length > 0) {
    gameState.tableCards = [gameState.deck.splice(0, 1)[0]];
    gameState.lastCardValue = gameState.tableCards[0].numericValue;
  }
}

// Check if a card can be played
function canPlayCard(card, lastCardValue, tableCards) {
  // Special cards can always be played
  if (card.numericValue === 2 || card.numericValue === 7 || card.numericValue === 8 || card.numericValue === 10) {
    return true;
  }
  
  // Regular rule: same number or higher number
  return card.numericValue >= lastCardValue;
}

// Check if multiple cards can be played together
function canPlayCardCombo(cards, lastCardValue, tableCards) {
  // Single card play
  if (cards.length === 1) {
    const card = cards[0];
    // Card 2 cannot be played alone
    if (card.numericValue === 2) {
      return false;
    }
    return canPlayCard(card, lastCardValue, tableCards);
  }
  
  // Multiple cards - two types allowed:
  // 1. Same number combos (pairs, trips, quads)
  // 2. Card 2 + other valid cards
  
  const hasTwo = cards.some(card => card.numericValue === 2);
  
  if (hasTwo) {
    // Card 2 combo: Must have other valid cards
    const otherCards = cards.filter(card => card.numericValue !== 2);
    if (otherCards.length === 0) return false; // Card 2 cannot be alone
    return otherCards.every(card => card.numericValue >= lastCardValue);
  } else {
    // Same number combo: All cards must be same number and valid
    const firstCardValue = cards[0].numericValue;
    const allSameNumber = cards.every(card => card.numericValue === firstCardValue);
    if (!allSameNumber) return false;
    
    return firstCardValue >= lastCardValue;
  }
}

// Handle card play logic (can handle single or multiple cards)
function handleCardPlay(gameState, playerId, cardData) {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return { success: false, error: 'Player not found' };
  
  const lastCardValue = gameState.tableCards.length > 0 
    ? gameState.tableCards[gameState.tableCards.length - 1].numericValue 
    : 0;
  
  // Handle multiple cards (cardData.cards) or single card (cardData.card)
  const cardsToPlay = cardData.cards || [cardData.card];
  
  // Validate card combination
  if (!canPlayCardCombo(cardsToPlay, lastCardValue, gameState.tableCards)) {
    return { success: false, error: 'Invalid card combination' };
  }
  
  // Remove cards from player's hand cards first, then blind cards if hand is empty
  let cardsRemoved = 0;
  cardsToPlay.forEach(cardToRemove => {
    // Try to remove from hand cards first
    let cardIndex = player.handCards.findIndex(c => 
      c.suit === cardToRemove.suit && c.value === cardToRemove.value
    );
    if (cardIndex !== -1) {
      player.handCards.splice(cardIndex, 1);
      cardsRemoved++;
    } else {
      // If not in hand and hand is empty, try blind cards
      if (player.handCards.length === 0) {
        cardIndex = player.blindCards.findIndex(c => 
          c.suit === cardToRemove.suit && c.value === cardToRemove.value
        );
        if (cardIndex !== -1) {
          player.blindCards.splice(cardIndex, 1);
          cardsRemoved++;
        }
      }
    }
  });
  
  if (cardsRemoved !== cardsToPlay.length) {
    return { success: false, error: 'One or more cards not found in player hand' };
  }
  
  // Add cards to table
  cardsToPlay.forEach(card => {
    gameState.tableCards.push(card);
  });
  gameState.lastCardValue = cardsToPlay[cardsToPlay.length - 1].numericValue;
  
  // Handle power card effects (check all played cards for effects)
  cardsToPlay.forEach(card => {
    if (card.numericValue === 10) {
      // Card 10: Clear pile - remove all cards from discard pile
      gameState.tableCards = [];
      gameState.lastCardValue = 0; // Start new pile
    } else if (card.numericValue === 2) {
      // Card 2: Wild card - can be played with other valid cards
      // No special action needed - combo validation handled elsewhere
    } else if (card.numericValue === 7) {
      // Card 7: Turn goes to previous player (not reverse order)
      gameState.currentPlayerIndex = (gameState.currentPlayerIndex - 1 + gameState.players.length) % gameState.players.length;
      gameState.skipNextPlayer = true; // Skip normal turn advancement
    } else if (card.numericValue === 8) {
      // Card 8: Skip next player's turn
      gameState.skipNextPlayer = true;
    }
  });
  
  // Maintain minimum 3 cards in hand while deck exists
  if (gameState.deck.length > 0) {
    const currentHandSize = player.handCards.length;
    if (currentHandSize < 3) {
      const cardsNeeded = 3 - currentHandSize;
      const cardsToDraw = Math.min(cardsNeeded, gameState.deck.length);
      for (let i = 0; i < cardsToDraw; i++) {
        player.handCards.push(gameState.deck.splice(0, 1)[0]);
      }
    }
  }
  
  // When hand is empty, player must play from blind cards
  // This will be handled in the card play validation
  
  return { success: true };
}

// Move to next player
function nextPlayer(gameState) {
  if (gameState.skipNextPlayer) {
    gameState.skipNextPlayer = false;
    // Skip one additional player
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + gameState.turnDirection * 2 + gameState.players.length) % gameState.players.length;
  } else {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + gameState.turnDirection + gameState.players.length) % gameState.players.length;
  }
}

// Check win condition
function checkWinCondition(player) {
  return player.handCards.length === 0 && 
         player.blindCards.length === 0;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('createRoom', (playerName) => {
    console.log('CreateRoom event received:', playerName);
    const roomCode = generateGameCode();
    console.log('Generated room code:', roomCode);
    const gameState = createGameState(roomCode);
    
    const player = {
      id: socket.id,
      name: playerName,
      handCards: [],
      visibleCards: [],
      blindCards: [],
      isReady: false
    };
    
    gameState.players.push(player);
    gameRooms.set(roomCode, gameState);
    playerSockets.set(socket.id, roomCode);
    
    socket.join(roomCode);
    console.log('Emitting roomCreated event');
    socket.emit('roomCreated', { roomCode, player, players: gameState.players });
    io.to(roomCode).emit('playerJoined', { players: gameState.players });
  });
  
  socket.on('joinRoom', (data) => {
    const { roomCode, playerName } = data;
    const gameState = gameRooms.get(roomCode);
    
    if (!gameState) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (gameState.players.length >= 6) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    if (gameState.gameStarted) {
      socket.emit('error', 'Game already started');
      return;
    }
    
    const player = {
      id: socket.id,
      name: playerName,
      handCards: [],
      visibleCards: [],
      blindCards: [],
      isReady: false
    };
    
    gameState.players.push(player);
    playerSockets.set(socket.id, roomCode);
    
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, player, players: gameState.players });
    io.to(roomCode).emit('playerJoined', { players: gameState.players });
  });
  
  socket.on('playerReady', () => {
    const roomCode = playerSockets.get(socket.id);
    const gameState = gameRooms.get(roomCode);
    
    if (gameState) {
      const player = gameState.players.find(p => p.id === socket.id);
      if (player) {
        player.isReady = true;
        
        // Send updated player list to all players in room
        io.to(roomCode).emit('playerJoined', { players: gameState.players });
      }
    }
  });
  
  socket.on('startGame', () => {
    const roomCode = playerSockets.get(socket.id);
    const gameState = gameRooms.get(roomCode);
    
    if (gameState && !gameState.gameStarted) {
      // Check if the player is the room creator (first player in the room)
      const isCreator = gameState.players[0].id === socket.id;
      
      if (!isCreator) {
        socket.emit('error', 'Only room creator can start the game');
        return;
      }
      
      // Check if minimum players and all ready
      const allReady = gameState.players.length >= 2 && gameState.players.every(p => p.isReady);
      
      if (!allReady) {
        socket.emit('error', 'All players must be ready to start');
        return;
      }
      
      console.log('Starting game in room:', roomCode);
      gameState.gameStarted = true;
      dealInitialCards(gameState);
      
      io.to(roomCode).emit('gameStarted', {
        players: gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          handCards: p.handCards,
          blindCount: p.blindCards.length,
          totalCards: p.handCards.length + p.blindCards.length
        })),
        currentPlayer: gameState.players[gameState.currentPlayerIndex].id,
        deckCount: gameState.deck.length,
        initialDiscard: gameState.tableCards[0] // Send the starting card
      });
      
      // Players now have visible cards instead of hand cards
      // No need to send private hand cards
    }
  });
  
  socket.on('playCard', (cardData) => {
    const roomCode = playerSockets.get(socket.id);
    const gameState = gameRooms.get(roomCode);
    
    if (!gameState || !gameState.gameStarted) {
      socket.emit('error', 'Game not started');
      return;
    }
    
    // Check if player must throw after taking cards
    if (gameState.mustThrowAfterTaking && gameState.playerWhoTook !== socket.id) {
      socket.emit('error', 'Player who took cards must throw first');
      return;
    }
    
    if (!gameState.mustThrowAfterTaking && gameState.players[gameState.currentPlayerIndex].id !== socket.id) {
      socket.emit('error', 'Not your turn');
      return;
    }
    
    const result = handleCardPlay(gameState, socket.id, cardData);
    
    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }
    
    const currentPlayer = gameState.players.find(p => p.id === socket.id);
    
    // Check if this was a mandatory throw after taking cards
    const wasMandatoryThrow = gameState.mustThrowAfterTaking && gameState.playerWhoTook === socket.id;
    
    // Clear the must-throw-after-taking flag
    if (wasMandatoryThrow) {
      gameState.mustThrowAfterTaking = false;
      gameState.playerWhoTook = null;
    }
    
    // Check win condition
    if (checkWinCondition(currentPlayer)) {
      gameState.gameEnded = true;
      io.to(roomCode).emit('gameEnded', { winner: currentPlayer.name });
      return;
    }
    
    // Move to next player
    nextPlayer(gameState);
    
    // Get the cards that were played
    const cardsPlayed = cardData.cards || [cardData.card];
    
    // Broadcast game state
    io.to(roomCode).emit('cardPlayed', {
      playerId: socket.id,
      cards: cardsPlayed,
      tableCards: gameState.tableCards,
      currentPlayer: gameState.players[gameState.currentPlayerIndex].id,
      mustThrowAfterTaking: gameState.mustThrowAfterTaking,
      playerWhoTook: gameState.playerWhoTook,
              players: gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          handCards: p.handCards,
          blindCount: p.blindCards.length,
          totalCards: p.handCards.length + p.blindCards.length
        })),
      deckCount: gameState.deck.length
    });
    
    // No hand cards to send - visible cards are already sent in gameState
  });
  
  socket.on('takeTableCards', () => {
    const roomCode = playerSockets.get(socket.id);
    const gameState = gameRooms.get(roomCode);
    
    if (!gameState || !gameState.gameStarted) return;
    
    if (gameState.players[gameState.currentPlayerIndex].id !== socket.id) {
      socket.emit('error', 'Not your turn');
      return;
    }
    
    const player = gameState.players.find(p => p.id === socket.id);
    
    // Add all discard pile cards to player's hand
    player.handCards.push(...gameState.tableCards);
    gameState.tableCards = [];
    gameState.lastCardValue = 0;
    
    // Player who picked up pile must throw next
    gameState.mustThrowAfterTaking = true;
    gameState.playerWhoTook = socket.id;
    
    // Don't move to next player - same player must throw a card
    
    // Broadcast update
    io.to(roomCode).emit('tableCardsTaken', {
      playerId: socket.id,
      currentPlayer: gameState.players[gameState.currentPlayerIndex].id,
      mustThrowAfterTaking: gameState.mustThrowAfterTaking,
      playerWhoTook: gameState.playerWhoTook,
              players: gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          handCards: p.handCards,
          blindCount: p.blindCards.length,
          totalCards: p.handCards.length + p.blindCards.length
        }))
    });
    
    // No hand cards to send - visible cards are already sent in gameState
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const roomCode = playerSockets.get(socket.id);
    if (roomCode) {
      const gameState = gameRooms.get(roomCode);
      if (gameState) {
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        
        if (gameState.players.length === 0) {
          gameRooms.delete(roomCode);
        } else {
          io.to(roomCode).emit('playerLeft', { 
            playerId: socket.id,
            players: gameState.players 
          });
        }
      }
      playerSockets.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});