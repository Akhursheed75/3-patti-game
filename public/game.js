// Game Client - Main JavaScript File
class CardGame {
    constructor() {
        console.log('Initializing CardGame');
        this.socket = io();
        this.currentScreen = 'mainMenu';
        this.playerName = '';
        this.roomCode = '';
        this.playerId = '';
        this.isRoomCreator = false;
        this.gameState = {
            players: [],
            currentPlayer: '',
            tableCards: [],
            deckCount: 52,
            mustThrowAfterTaking: false,
            playerWhoTook: null
        };
        this.selectedCards = [];
        
        console.log('Socket connected:', this.socket.connected);
        this.socket.on('connect', () => {
            console.log('Socket connected successfully');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
        
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.showScreen('mainMenu');
    }

    // Initialize DOM event listeners
    initializeEventListeners() {
        console.log('Setting up event listeners');
        // Main Menu
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            console.log('Create room button clicked');
            this.createRoom();
        });
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        
        // Lobby
        document.getElementById('readyBtn').addEventListener('click', () => this.playerReady());
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('leaveLobbyBtn').addEventListener('click', () => this.leaveLobby());
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());
        
        // Game
        document.getElementById('takeCardsBtn').addEventListener('click', () => this.takeTableCards());
        document.getElementById('playCardsBtn').addEventListener('click', () => this.playSelectedCards());
        
        // Modals
        document.getElementById('closeErrorBtn').addEventListener('click', () => this.closeModal('errorModal'));
        document.getElementById('closeRulesBtn').addEventListener('click', () => this.closeModal('rulesModal'));
        document.getElementById('rulesBtn').addEventListener('click', () => this.showModal('rulesModal'));
        
        // Game Over
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());

        // Enter key handling for inputs
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        
        document.getElementById('roomCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Auto-uppercase room code input
        document.getElementById('roomCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Initialize Socket.IO event listeners
    initializeSocketListeners() {
        console.log('Setting up socket listeners');
        this.socket.on('roomCreated', (data) => {
            console.log('Room created event received:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.player.id;
            this.isRoomCreator = true;
            this.updateLobby(data);
            this.showScreen('lobby');
        });

        this.socket.on('roomJoined', (data) => {
            console.log('Room joined event received:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.player.id;
            this.isRoomCreator = false;
            this.updateLobby(data);
            this.showScreen('lobby');
        });

        this.socket.on('playerJoined', (data) => {
            this.updateLobby(data);
        });

        this.socket.on('playerLeft', (data) => {
            this.updateLobby(data);
        });

        this.socket.on('playerReady', (data) => {
            this.updatePlayerStatus(data.playerId, 'ready');
        });

        this.socket.on('gameStarted', (data) => {
            this.gameState.players = data.players;
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.deckCount = data.deckCount;
            if (data.initialDiscard) {
                this.gameState.tableCards = [data.initialDiscard];
            }
            this.updateGameScreen();
            this.showScreen('gameScreen');
        });

        // No longer need handCards event since players use visible cards

        this.socket.on('cardPlayed', (data) => {
            this.gameState.tableCards = data.tableCards;
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.players = data.players;
            this.gameState.deckCount = data.deckCount;
            this.gameState.mustThrowAfterTaking = data.mustThrowAfterTaking;
            this.gameState.playerWhoTook = data.playerWhoTook;
            this.updateGameScreen();
            this.updateTableCards();
            this.updateOtherPlayers();
            this.updateCurrentPlayerDisplay();
            this.updateTakeCardsButton();
        });

        this.socket.on('tableCardsTaken', (data) => {
            this.gameState.tableCards = [];
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.players = data.players;
            this.gameState.mustThrowAfterTaking = data.mustThrowAfterTaking;
            this.gameState.playerWhoTook = data.playerWhoTook;
            this.updateGameScreen();
            this.updateTableCards();
            this.updateOtherPlayers();
            this.updateCurrentPlayerDisplay();
            this.updateTakeCardsButton();
        });

        this.socket.on('gameEnded', (data) => {
            document.getElementById('winnerName').textContent = data.winner;
            this.showScreen('gameOverScreen');
        });

        this.socket.on('error', (message) => {
            this.showError(message);
        });

        this.socket.on('disconnect', () => {
            this.showError('Connection lost. Please refresh the page.');
        });
    }

    // Screen management
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');
        this.currentScreen = screenName;
    }

    // Modal management
    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    // Error handling
    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.showModal('errorModal');
    }

    // Main menu actions
    createRoom() {
        console.log('CreateRoom button clicked');
        const playerName = document.getElementById('playerName').value.trim();
        console.log('Player name:', playerName);
        
        if (!playerName) {
            this.showError('Please enter your name');
            return;
        }
        
        this.playerName = playerName;
        console.log('Emitting createRoom event');
        this.socket.emit('createRoom', playerName);
    }

    joinRoom() {
        const playerName = document.getElementById('playerName').value.trim();
        const roomCode = document.getElementById('roomCode').value.trim();
        
        if (!playerName) {
            this.showError('Please enter your name');
            return;
        }
        
        if (!roomCode || roomCode.length !== 6) {
            this.showError('Please enter a valid 6-character game code');
            return;
        }
        
        this.playerName = playerName;
        this.socket.emit('joinRoom', { roomCode, playerName });
    }

    // Lobby actions
    updateLobby(data) {
        document.getElementById('currentRoomCode').textContent = this.roomCode;
        document.getElementById('playerCount').textContent = data.players.length;
        
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        data.players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `
                <span class="player-name">${player.name}${player.id === this.playerId ? ' (You)' : ''}</span>
                <span class="player-status ${player.isReady ? 'status-ready' : 'status-waiting'}">
                    ${player.isReady ? 'Ready' : 'Waiting'}
                </span>
            `;
            playersList.appendChild(playerDiv);
        });
        
        // Handle Start Game button visibility for room creator
        this.updateStartGameButton(data.players);
    }
    
    updateStartGameButton(players) {
        const startGameBtn = document.getElementById('startGameBtn');
        const readyBtn = document.getElementById('readyBtn');
        const waitingMessage = document.getElementById('waitingMessage');
        
        if (this.isRoomCreator) {
            const allReady = players.length >= 2 && players.every(p => p.isReady);
            
            if (allReady) {
                startGameBtn.style.display = 'block';
                readyBtn.style.display = 'none';
                waitingMessage.style.display = 'none';
            } else {
                startGameBtn.style.display = 'none';
                readyBtn.style.display = 'block';
                waitingMessage.style.display = 'block';
                waitingMessage.textContent = players.length < 2 
                    ? 'Waiting for more players to join...' 
                    : 'Waiting for all players to be ready...';
            }
        } else {
            startGameBtn.style.display = 'none';
            readyBtn.style.display = 'block';
        }
    }

    updatePlayerStatus(playerId, status) {
        const playerItems = document.querySelectorAll('.player-item');
        playerItems.forEach(item => {
            const playerName = item.querySelector('.player-name').textContent;
            if (playerName.includes('(You)') && playerId === this.playerId) {
                const statusSpan = item.querySelector('.player-status');
                statusSpan.textContent = status === 'ready' ? 'Ready' : 'Waiting';
                statusSpan.className = `player-status ${status === 'ready' ? 'status-ready' : 'status-waiting'}`;
            }
        });
    }

    playerReady() {
        this.socket.emit('playerReady');
        document.getElementById('readyBtn').disabled = true;
        document.getElementById('waitingMessage').style.display = 'block';
    }
    
    startGame() {
        console.log('Starting game as room creator');
        this.socket.emit('startGame');
    }

    leaveLobby() {
        this.socket.disconnect();
        location.reload();
    }

    copyRoomCode() {
        navigator.clipboard.writeText(this.roomCode).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }

    // Game screen updates
    updateGameScreen() {
        this.updateOtherPlayers();
        this.updateCurrentPlayerDisplay();
        this.updateDeckCount();
        this.updateTableCards();
        this.updateMyCards();
        this.updateTakeCardsButton();
    }
    
    updateMyCards() {
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            this.updateHandCards();
            this.updateBlindCards();
            this.updatePlayCardsButton();
        }
    }

    updateOtherPlayers() {
        const otherPlayersDiv = document.getElementById('otherPlayers');
        otherPlayersDiv.innerHTML = '';
        
        this.gameState.players.forEach(player => {
            if (player.id !== this.playerId) {
                const playerDiv = document.createElement('div');
                playerDiv.className = `other-player ${player.id === this.gameState.currentPlayer ? 'current-turn' : ''}`;
                playerDiv.innerHTML = `
                    <div class="other-player-name">${player.name}</div>
                    <div class="other-player-cards">
                        H:${player.handCards.length} B:${player.blindCount}
                    </div>
                `;
                otherPlayersDiv.appendChild(playerDiv);
            }
        });
    }

    updateCurrentPlayerDisplay() {
        let displayText = "";
        
        if (this.gameState.mustThrowAfterTaking) {
            const playerWhoTook = this.gameState.players.find(p => p.id === this.gameState.playerWhoTook);
            if (playerWhoTook) {
                displayText = playerWhoTook.id === this.playerId 
                    ? "You must throw a card after picking up pile" 
                    : `${playerWhoTook.name} must throw after picking up`;
            }
        } else {
            const currentPlayer = this.gameState.players.find(p => p.id === this.gameState.currentPlayer);
            if (currentPlayer) {
                displayText = currentPlayer.id === this.playerId ? "Your Turn" : `${currentPlayer.name}'s Turn`;
            }
        }
        
        document.getElementById('currentPlayerName').textContent = displayText;
    }

    updateDeckCount() {
        document.getElementById('deckCount').textContent = this.gameState.deckCount;
    }

    updateTableCards() {
        const tableCardsDiv = document.getElementById('tableCards');
        
        if (this.gameState.tableCards.length === 0) {
            tableCardsDiv.innerHTML = '<div class="empty-table">Throw your first card!</div>';
        } else {
            tableCardsDiv.innerHTML = '';
            this.gameState.tableCards.forEach(card => {
                const cardDiv = this.createCardElement(card);
                tableCardsDiv.appendChild(cardDiv);
            });
        }
    }

    updateVisibleCards() {
        const visibleCardsDiv = document.getElementById('visibleCards');
        const visibleCardsSection = document.getElementById('visibleCardsSection');
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (currentPlayer && currentPlayer.visibleCards) {
            visibleCardsSection.style.display = 'block';
            visibleCardsDiv.innerHTML = '';
            
            currentPlayer.visibleCards.forEach(card => {
                const cardDiv = this.createCardElement(card, true);
                visibleCardsDiv.appendChild(cardDiv);
            });
            
            // Update playable cards after updating visible cards
            this.updatePlayableCards();
        } else {
            visibleCardsSection.style.display = 'none';
        }
    }

    updateHandCards() {
        const handCardsDiv = document.getElementById('handCards');
        handCardsDiv.innerHTML = '';
        
        // Clear selection when updating hand
        this.selectedCards = [];
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (currentPlayer && currentPlayer.handCards) {
            currentPlayer.handCards.forEach(card => {
                const cardDiv = this.createCardElement(card, true);
                handCardsDiv.appendChild(cardDiv);
            });
        }
        
        this.updatePlayableCards();
        this.updatePlayCardsButton();
    }

    updateBlindCards() {
        const blindCardsDiv = document.getElementById('blindCards');
        const blindCardsSection = document.getElementById('blindCardsSection');
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        
        if (currentPlayer) {
            document.getElementById('blindCount').textContent = currentPlayer.blindCount;
            
            // Show blind cards section only if there are blind cards
            if (currentPlayer.blindCount > 0) {
                blindCardsSection.style.display = 'block';
                blindCardsDiv.innerHTML = '';
                for (let i = 0; i < currentPlayer.blindCount; i++) {
                    const cardDiv = this.createBlindCardElement();
                    blindCardsDiv.appendChild(cardDiv);
                }
            } else {
                blindCardsSection.style.display = 'none';
            }
        }
    }

    updateTakeCardsButton() {
        const takeCardsBtn = document.getElementById('takeCardsBtn');
        const isMyTurn = this.gameState.currentPlayer === this.playerId;
        const hasTableCards = this.gameState.tableCards.length > 0;
        const mustThrowAfterTaking = this.gameState.mustThrowAfterTaking;
        
        // Don't show take cards button if someone must throw after taking
        if (mustThrowAfterTaking) {
            takeCardsBtn.style.display = 'none';
        } else if (isMyTurn && hasTableCards) {
            takeCardsBtn.style.display = 'block';
        } else {
            takeCardsBtn.style.display = 'none';
        }
    }

    // Card creation and management
    createCardElement(card, clickable = false) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${card.suit}`;
        cardDiv.innerHTML = `
            <div class="card-value">${card.value}</div>
            <div class="card-suit">${this.getSuitSymbol(card.suit)}</div>
        `;
        
        if (clickable) {
            cardDiv.addEventListener('click', () => this.toggleCardSelection(card, cardDiv));
        }
        
        return cardDiv;
    }
    
    toggleCardSelection(card, cardElement) {
        console.log('Card clicked:', card.value, card.suit);
        
        const cardIndex = this.selectedCards.findIndex(c => 
            c.suit === card.suit && c.value === card.value
        );
        
        if (cardIndex !== -1) {
            // Deselect card
            this.selectedCards.splice(cardIndex, 1);
            cardElement.classList.remove('selected');
            console.log('Card deselected. Selected cards:', this.selectedCards.length);
        } else {
            // Select card
            this.selectedCards.push(card);
            cardElement.classList.add('selected');
            console.log('Card selected. Selected cards:', this.selectedCards.length);
        }
        
        this.updatePlayCardsButton();
    }

    createBlindCardElement() {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card blind';
        cardDiv.innerHTML = `
            <div class="card-value">?</div>
            <div class="card-suit">?</div>
        `;
        return cardDiv;
    }

    getSuitSymbol(suit) {
        const symbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        return symbols[suit] || suit;
    }

    // Game logic
    updatePlayableCards() {
        const handCards = document.querySelectorAll('#handCards .card');
        const blindCards = document.querySelectorAll('#blindCards .card');
        
        handCards.forEach(cardElement => {
            cardElement.classList.remove('playable');
        });
        blindCards.forEach(cardElement => {
            cardElement.classList.remove('playable');
        });
        
        // Check if it's this player's turn (either normal turn or mandatory throw)
        const isMyTurn = this.gameState.currentPlayer === this.playerId;
        const mustThrowAfterTaking = this.gameState.mustThrowAfterTaking && this.gameState.playerWhoTook === this.playerId;
        
        if (isMyTurn || mustThrowAfterTaking) {
            const lastCardValue = this.gameState.tableCards.length > 0 
                ? this.gameState.tableCards[this.gameState.tableCards.length - 1].numericValue 
                : 0;
            
            const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
            if (currentPlayer) {
                // If player has hand cards, make them playable
                if (currentPlayer.handCards && currentPlayer.handCards.length > 0) {
                    currentPlayer.handCards.forEach((card, index) => {
                        if (this.canPlayCard(card, lastCardValue)) {
                            handCards[index]?.classList.add('playable');
                        }
                    });
                } else if (currentPlayer.blindCount > 0) {
                    // If no hand cards, blind cards become playable (played without looking)
                    blindCards.forEach(cardElement => {
                        cardElement.classList.add('playable');
                    });
                }
            }
        }
    }

    canPlayCard(card, lastCardValue) {
        // Card 2 cannot be played alone
        if (card.numericValue === 2) return false;
        
        // Other special cards can be played alone
        if (card.numericValue === 7 || card.numericValue === 8 || card.numericValue === 10) {
            return true;
        }
        
        // Regular rule: same number or higher number
        return card.numericValue >= lastCardValue;
    }
    
    canPlayCardCombo(cards, lastCardValue) {
        if (cards.length === 1) {
            return this.canPlayCard(cards[0], lastCardValue);
        }
        
        const hasTwo = cards.some(card => card.numericValue === 2);
        
        if (hasTwo) {
            // Card 2 combo: Must have other valid cards
            const otherCards = cards.filter(card => card.numericValue !== 2);
            if (otherCards.length === 0) return false;
            return otherCards.every(card => card.numericValue >= lastCardValue);
        } else {
            // Same number combo: All cards must be same number and valid
            const firstCardValue = cards[0].numericValue;
            const allSameNumber = cards.every(card => card.numericValue === firstCardValue);
            if (!allSameNumber) return false;
            
            return firstCardValue >= lastCardValue;
        }
    }

    // Legacy function - now using playSelectedCards instead
    playCard(card) {
        console.log('Legacy playCard called, redirecting to selection system');
        // For single card plays, just select and play immediately
        this.selectedCards = [card];
        this.playSelectedCards();
    }

    takeTableCards() {
        if (this.gameState.currentPlayer !== this.playerId) {
            this.showError("It's not your turn!");
            return;
        }
        
        this.socket.emit('takeTableCards');
    }

    // Game over actions
    updatePlayCardsButton() {
        const playCardsBtn = document.getElementById('playCardsBtn');
        const isMyTurn = this.gameState.currentPlayer === this.playerId;
        const mustThrowAfterTaking = this.gameState.mustThrowAfterTaking && this.gameState.playerWhoTook === this.playerId;
        
        console.log('Updating play button. My turn:', isMyTurn, 'Must throw:', mustThrowAfterTaking, 'Selected:', this.selectedCards.length);
        
        if ((isMyTurn || mustThrowAfterTaking) && this.selectedCards.length > 0) {
            const lastCardValue = this.gameState.tableCards.length > 0 
                ? this.gameState.tableCards[this.gameState.tableCards.length - 1].numericValue 
                : 0;
            
            console.log('Checking combo validity. Last card value:', lastCardValue);
            const canPlay = this.canPlayCardCombo(this.selectedCards, lastCardValue);
            console.log('Can play combo:', canPlay);
            
            if (canPlay) {
                playCardsBtn.style.display = 'block';
                playCardsBtn.textContent = `Play ${this.selectedCards.length} Card${this.selectedCards.length > 1 ? 's' : ''}`;
                console.log('Play button shown');
            } else {
                playCardsBtn.style.display = 'none';
                console.log('Play button hidden - invalid combo');
            }
        } else {
            playCardsBtn.style.display = 'none';
            console.log('Play button hidden - not my turn or no cards selected');
        }
    }
    
    playSelectedCards() {
        if (this.selectedCards.length === 0) {
            this.showError("No cards selected!");
            return;
        }
        
        const lastCardValue = this.gameState.tableCards.length > 0 
            ? this.gameState.tableCards[this.gameState.tableCards.length - 1].numericValue 
            : 0;
        
        if (!this.canPlayCardCombo(this.selectedCards, lastCardValue)) {
            this.showError("Invalid card combination!");
            return;
        }
        
        // Send cards to server
        if (this.selectedCards.length === 1) {
            this.socket.emit('playCard', { card: this.selectedCards[0] });
        } else {
            this.socket.emit('playCard', { cards: this.selectedCards });
        }
        
        // Clear selection
        this.selectedCards = [];
        this.updateHandCards();
    }

    newGame() {
        this.socket.disconnect();
        location.reload();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CardGame();
});