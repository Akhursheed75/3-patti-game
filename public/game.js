// Voice Chat Class using WebRTC
class VoiceChat {
    constructor(socket) {
        this.socket = socket;
        this.localStream = null;
        this.peerConnections = new Map();
        this.isMuted = false;
        this.isConnected = false;
        this.roomCode = null;
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.initializeSocketListeners();
    }
    
    async checkMicrophonePermission() {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            console.log('Microphone permission state:', result.state);
            
            if (result.state === 'granted') {
                this.showToast('Microphone access already granted!', 'success');
                return true; // Permission granted
            } else if (result.state === 'denied') {
                this.showToast('Microphone access denied. Please enable it in browser settings.', 'error');
                return false; // Permission denied
            } else {
                // Permission state is 'prompt'
                return null; // Need to prompt user
            }
        } catch (error) {
            console.log('Permission API not supported, will prompt user');
            return null; // Permission state unknown
        }
    }
    
    async initialize() {
        try {
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showToast('Your browser does not support microphone access. Please use a modern browser like Chrome, Firefox, or Edge.', 'error');
                return false;
            }

            // Check if we're on HTTPS or localhost (required for getUserMedia)
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                this.showToast('Microphone access requires HTTPS or localhost. Please use HTTPS or run locally.', 'error');
                return false;
            }

            // Check current permission state
            const permissionState = await this.checkMicrophonePermission();
            if (permissionState === false) {
                return false; // Permission denied
            }

            // Request microphone access with better error handling
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            this.isConnected = true;
            console.log('Voice chat initialized successfully');
            this.showToast('Microphone access granted! Voice chat is now active.', 'success');
            
            // Update UI to show mute/unmute buttons
            this.updateMuteButton();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize voice chat:', error);
            
            // Provide specific error messages for common issues
            let errorMessage = 'Microphone access denied. ';
            
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow microphone access in your browser settings and refresh the page.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found. Please connect a microphone and try again.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Microphone is already in use by another application.';
            } else if (error.name === 'SecurityError') {
                errorMessage += 'Microphone access blocked due to security restrictions. Try using HTTPS.';
            } else {
                errorMessage += 'Please check your microphone permissions and try again.';
            }
            
            this.showToast(errorMessage, 'error');
            return false;
        }
    }
    
    joinRoom(roomCode) {
        this.roomCode = roomCode;
        this.socket.emit('voice:join-room', { roomCode });
        console.log('Joined voice room:', roomCode);
    }
    
    leaveRoom() {
        if (this.roomCode) {
            this.socket.emit('voice:leave-room', { roomCode: this.roomCode });
            this.roomCode = null;
        }
        
        // Close all peer connections
        this.peerConnections.forEach(connection => {
            connection.close();
        });
        this.peerConnections.clear();
        
        this.isConnected = false;
        console.log('Left voice room');
    }
    
    toggleMute() {
        if (!this.localStream) return;
        
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        
        // Update UI
        this.updateMuteButton();
        
        console.log('Microphone:', this.isMuted ? 'Muted' : 'Unmuted');
    }
    
    updateMuteButton() {
        const lobbyBtn = document.getElementById('toggleMicBtn');
        const gameBtn = document.getElementById('gameToggleMicBtn');
        const lobbyRequestBtn = document.getElementById('requestMicBtn');
        const gameRequestBtn = document.getElementById('gameRequestMicBtn');
        
        if (this.isConnected && this.localStream) {
            // Show mute/unmute buttons, hide request buttons
            if (lobbyBtn) {
                lobbyBtn.style.display = 'inline-flex';
                lobbyBtn.textContent = this.isMuted ? '🔇 Unmute' : '🎤 Mute';
                lobbyBtn.classList.toggle('muted', this.isMuted);
            }
            if (gameBtn) {
                gameBtn.style.display = 'inline-flex';
                gameBtn.textContent = this.isMuted ? '🔇 Unmute' : '🎤 Mute';
                gameBtn.classList.toggle('muted', this.isMuted);
            }
            if (lobbyRequestBtn) lobbyRequestBtn.style.display = 'none';
            if (gameRequestBtn) gameRequestBtn.style.display = 'none';
        } else {
            // Show request buttons, hide mute/unmute buttons
            if (lobbyBtn) lobbyBtn.style.display = 'none';
            if (gameBtn) gameBtn.style.display = 'none';
            if (lobbyRequestBtn) lobbyRequestBtn.style.display = 'inline-flex';
            if (gameRequestBtn) gameRequestBtn.style.display = 'inline-flex';
        }
    }
    
    async createPeerConnection(peerSocketId) {
        if (this.peerConnections.has(peerSocketId)) {
            return this.peerConnections.get(peerSocketId);
        }
        
        const peerConnection = new RTCPeerConnection(this.rtcConfig);
        
        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Handle incoming audio
        peerConnection.ontrack = (event) => {
            const audioElement = document.createElement('audio');
            audioElement.srcObject = event.streams[0];
            audioElement.autoplay = true;
            audioElement.volume = 0.7; // Set volume to 70%
            
            // Store audio element for cleanup
            peerConnection.audioElement = audioElement;
            
            // Add to DOM (hidden)
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
            
            console.log('Audio stream received from peer:', peerSocketId);
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('voice:ice-candidate', {
                    targetSocketId: peerSocketId,
                    candidate: event.candidate
                });
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('Peer connection state:', peerSocketId, peerConnection.connectionState);
        };
        
        this.peerConnections.set(peerSocketId, peerConnection);
        return peerConnection;
    }
    
    async handleOffer(offer, fromSocketId) {
        try {
            const peerConnection = await this.createPeerConnection(fromSocketId);
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.socket.emit('voice:answer', {
                targetSocketId: fromSocketId,
                answer: answer
            });
            
            console.log('Handled offer from:', fromSocketId);
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }
    
    async handleAnswer(answer, fromSocketId) {
        try {
            const peerConnection = this.peerConnections.get(fromSocketId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Handled answer from:', fromSocketId);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
    
    async handleIceCandidate(candidate, fromSocketId) {
        try {
            const peerConnection = this.peerConnections.get(fromSocketId);
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added ICE candidate from:', fromSocketId);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }
    
    async connectToPeer(peerSocketId) {
        try {
            const peerConnection = await this.createPeerConnection(peerSocketId);
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('voice:offer', {
                targetSocketId: peerSocketId,
                offer: offer
            });
            
            console.log('Sent offer to peer:', peerSocketId);
        } catch (error) {
            console.error('Error connecting to peer:', error);
        }
    }
    
    updateParticipantsCount(count) {
        const lobbyCount = document.getElementById('voiceParticipantsCount');
        const gameCount = document.getElementById('gameVoiceParticipantsCount');
        
        if (lobbyCount) {
            lobbyCount.textContent = count;
        }
        
        if (gameCount) {
            gameCount.textContent = count;
        }
    }
    
    showToast(message, type = 'info') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        
        // Base classes
        let baseClasses = 'fixed top-8 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-2xl text-white font-semibold shadow-2xl transition-all duration-300 transform translate-y-0';
        
        // Type-specific classes
        switch(type) {
            case 'success':
                baseClasses += ' bg-gradient-to-r from-green-500 to-emerald-600 border-2 border-green-400';
                break;
            case 'error':
                baseClasses += ' bg-gradient-to-r from-red-500 to-pink-600 border-2 border-red-400';
                break;
            case 'warning':
                baseClasses += ' bg-gradient-to-r from-yellow-500 to-orange-600 border-2 border-yellow-400';
                break;
            default:
                baseClasses += ' bg-gradient-to-r from-blue-500 to-purple-600 border-2 border-blue-400';
        }
        
        toast.className = baseClasses;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateY(-20px)';
            toast.style.opacity = '0';
        }, 2500);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }
    
    initializeSocketListeners() {
        // Handle incoming offers
        this.socket.on('voice:offer', (data) => {
            this.handleOffer(data.offer, data.fromSocketId);
        });
        
        // Handle incoming answers
        this.socket.on('voice:answer', (data) => {
            this.handleAnswer(data.answer, data.fromSocketId);
        });
        
        // Handle incoming ICE candidates
        this.socket.on('voice:ice-candidate', (data) => {
            this.handleIceCandidate(data.candidate, data.fromSocketId);
        });
        
        // Handle new voice participants
        this.socket.on('voice:user-joined', (data) => {
            console.log('New voice participant joined:', data.socketId);
            this.connectToPeer(data.socketId);
        });
        
        // Handle existing participants when joining
        this.socket.on('voice:existing-participants', (data) => {
            console.log('Existing voice participants:', data.participants);
            data.participants.forEach(peerSocketId => {
                this.connectToPeer(peerSocketId);
            });
            this.updateParticipantsCount(data.participants.length + 1);
        });
        
        // Handle participants leaving
        this.socket.on('voice:user-left', (data) => {
            console.log('Voice participant left:', data.socketId);
            const peerConnection = this.peerConnections.get(data.socketId);
            if (peerConnection) {
                peerConnection.close();
                this.peerConnections.delete(data.socketId);
                
                // Remove audio element
                if (peerConnection.audioElement) {
                    peerConnection.audioElement.remove();
                }
            }
            
            // Update count
            const currentCount = Math.max(0, this.peerConnections.size + 1);
            this.updateParticipantsCount(currentCount);
        });
    }
}

// Game Client - Main JavaScript File
class CardGame {
    constructor() {
        console.log('Initializing CardGame');
        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
            timeout: 20000
        });
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
        this.isSelectingBlindForCard2 = false;
        this.selectedBlindCardIndex = null;
        
        // Initialize voice chat
        this.voiceChat = new VoiceChat(this.socket);
        
        console.log('Socket connected:', this.socket.connected);
        this.socket.on('connect', () => {
            console.log('Socket connected successfully');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
        
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.initializePageVisibilityHandling();
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
        // Play cards button - dynamic onclick handler set in updatePlayCardsButton()
        
        // Voice Chat
        document.getElementById('toggleMicBtn').addEventListener('click', () => this.voiceChat.toggleMute());
        document.getElementById('gameToggleMicBtn').addEventListener('click', () => this.voiceChat.toggleMute());
        document.getElementById('requestMicBtn').addEventListener('click', () => this.voiceChat.initialize());
        document.getElementById('gameRequestMicBtn').addEventListener('click', () => this.voiceChat.initialize());
        
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
        this.socket.on('roomCreated', async (data) => {
            console.log('Room created event received:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.player.id;
            this.playerName = data.player.name;
            this.isRoomCreator = true;
            
            // Initialize voice chat when room is created
            await this.initializeVoiceChat();
            
            this.updateLobby(data);
            this.showScreen('lobby');
        });

        this.socket.on('roomJoined', async (data) => {
            console.log('Room joined event received:', data);
            this.roomCode = data.roomCode;
            
            // Initialize voice chat when joining a room
            await this.initializeVoiceChat();
            this.playerId = data.player.id;
            this.playerName = data.player.name;
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
            this.updateStartGameButton(); // Fix start button not appearing after reconnection
        });

        this.socket.on('gameStarted', (data) => {
            this.gameState.players = data.players;
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.deckCount = data.deckCount;
            if (data.initialDiscard) {
                this.gameState.tableCards = [data.initialDiscard];
            }
            
            // Ensure voice chat is active when game starts
            if (this.voiceChat && !this.voiceChat.isConnected) {
                this.voiceChat.initialize().then(() => {
                    this.voiceChat.joinRoom(this.roomCode);
                });
            }
            
            this.updateGameScreen();
            this.showScreen('gameScreen');
        });

        // No longer need handCards event since players use visible cards

        this.socket.on('cardPlayed', (data) => {
            console.log('cardPlayed event received:', data);
            this.gameState.tableCards = data.tableCards;
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.players = data.players;
            this.gameState.deckCount = data.deckCount;
            this.gameState.mustThrowAfterTaking = data.mustThrowAfterTaking;
            this.gameState.playerWhoTook = data.playerWhoTook;
            
            // Reset Card 2 selection state after any card play
            this.isSelectingBlindForCard2 = false;
            this.selectedBlindCardIndex = null;
            this.selectedCards = [];
            
            this.updateGameScreen();
            this.updateTableCardsInCenter();
            this.updateOtherPlayers();
            this.updateCurrentPlayerDisplay();
            this.updateTakeCardsButton();
            
            // Only show toast for multi-card plays, not routine single cards
            if (data.playedBy !== this.playerId && data.cardsPlayed && data.cardsPlayed.length > 1) {
                const player = this.gameState.players.find(p => p.id === data.playedBy);
                this.showToast(`${player?.name || 'Player'} played ${data.cardsPlayed.length} cards`, 'info');
            }
        });

        this.socket.on('tableCardsTaken', (data) => {
            this.gameState.tableCards = [];
            this.gameState.currentPlayer = data.currentPlayer;
            this.gameState.players = data.players;
            this.gameState.deckCount = data.deckCount;
            this.gameState.mustThrowAfterTaking = data.mustThrowAfterTaking;
            this.gameState.playerWhoTook = data.playerWhoTook;
            this.updateGameScreen();
            this.updateTableCardsInCenter();
            this.updateOtherPlayers();
            this.updateCurrentPlayerDisplay();
            this.updateTakeCardsButton();
            
            // Show toast only for current player picking up pile
            if (data.takenBy === this.playerId) {
                this.showToast('You picked up the pile', 'warning');
            }
        });

        this.socket.on('gameEnded', (data) => {
            // Leave voice chat room when game ends
            this.voiceChat.leaveRoom();
            
            document.getElementById('winnerName').textContent = data.winner;
            this.showScreen('gameOverScreen');
        });
        
        this.socket.on('blindCardRevealed', (data) => {
            console.log('Blind card revealed:', data);
            this.gameState.players = data.players;
            this.updateGameScreen();
            
            if (data.playerId === this.playerId) {
                this.showToast(`Revealed: ${data.revealedCard.value}${data.revealedCard.suit}`, 'success');
                if (data.canRevealAnother) {
                    this.showToast('Card 2 revealed! You can reveal another blind card.', 'success');
                }
            }
            // Removed unnecessary toast for other players revealing blind cards
        });

        this.socket.on('error', (message) => {
            this.showToast(message, 'error');
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.hideReconnectingMessage();
            
            // Improved reconnection with retry logic
            
            // Try to rejoin room if we were in one
            if (this.roomCode && this.playerName) {
                console.log('Attempting to rejoin room:', this.roomCode);
                this.socket.emit('rejoinRoom', {
                    roomCode: this.roomCode,
                    playerName: this.playerName,
                    playerId: this.playerId
                });
                
                // Reinitialize voice chat on reconnection
                if (this.voiceChat) {
                    this.voiceChat.initialize().then(() => {
                        this.voiceChat.joinRoom(this.roomCode);
                    });
                }
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showReconnectingMessage();
        });
        
        this.socket.on('connect_error', (error) => {
            console.log('Connection error:', error);
            this.showReconnectingMessage();
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
        this.showToast(message, 'error');
    }
    
    // Enhanced error handling for better UX
    handleGameError(error) {
        console.error('Game error:', error);
        if (error.includes('not found') || error.includes('disconnect')) {
            this.showToast('Connection lost. Reconnecting...', 'warning');
        } else {
            this.showToast(error, 'error');
        }
    }
    
    showToast(message, type = 'info') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        
        // Base classes
        let baseClasses = 'fixed top-8 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-2xl text-white font-semibold shadow-2xl transition-all duration-300 transform translate-y-0';
        
        // Type-specific classes
        switch(type) {
            case 'success':
                baseClasses += ' bg-gradient-to-r from-green-500 to-emerald-600 border-2 border-green-400';
                break;
            case 'error':
                baseClasses += ' bg-gradient-to-r from-red-500 to-pink-600 border-2 border-red-400';
                break;
            case 'warning':
                baseClasses += ' bg-gradient-to-r from-yellow-500 to-orange-600 border-2 border-yellow-400';
                break;
            default:
                baseClasses += ' bg-gradient-to-r from-blue-500 to-purple-600 border-2 border-blue-400';
        }
        
        toast.className = baseClasses;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateY(-20px)';
            toast.style.opacity = '0';
        }, 2500);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }
    
    showReconnectingMessage() {
        // Show persistent reconnecting message
        const existingMsg = document.getElementById('reconnectingMessage');
        if (existingMsg) return;
        
        const reconnectMsg = document.createElement('div');
        reconnectMsg.id = 'reconnectingMessage';
        reconnectMsg.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-semibold rounded-2xl shadow-2xl border-2 border-yellow-400 animate-pulse';
        reconnectMsg.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="text-xl">🔄</div>
                <div>Reconnecting to server...</div>
            </div>
        `;
        
        document.body.appendChild(reconnectMsg);
    }
    
    hideReconnectingMessage() {
        const reconnectMsg = document.getElementById('reconnectingMessage');
        if (reconnectMsg) {
            reconnectMsg.remove();
        }
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
            playerDiv.className = 'bg-gray-700 bg-opacity-50 rounded-2xl p-4 border-2 border-gray-600 hover:border-blue-500 transition-all duration-300';
            playerDiv.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                            ${player.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-semibold text-white">${player.name}${player.id === this.playerId ? ' (You)' : ''}</div>
                            <div class="text-sm text-gray-400">Player ID: ${player.id.slice(-4)}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="inline-block px-3 py-1 rounded-full text-sm font-semibold ${player.isReady ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}">
                            ${player.isReady ? '✅ Ready' : '⏳ Waiting'}
                        </span>
                    </div>
                </div>
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
        
        const allReady = players.length >= 2 && players.every(p => p.isReady);
        
        if (allReady) {
            // Anyone can start when all are ready
            startGameBtn.style.display = 'block';
            readyBtn.style.display = 'none';
            waitingMessage.style.display = 'none';
            startGameBtn.textContent = 'Start Game';
        } else {
            startGameBtn.style.display = 'none';
            readyBtn.style.display = 'block';
            waitingMessage.style.display = 'block';
            waitingMessage.textContent = players.length < 2 
                ? 'Waiting for more players to join...' 
                : 'Waiting for all players to be ready...';
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
        console.log('Starting game (anyone can start when all ready)');
        this.socket.emit('startGame');
    }

    async initializeVoiceChat() {
        try {
            const success = await this.voiceChat.initialize();
            if (success) {
                this.voiceChat.joinRoom(this.roomCode);
                console.log('Voice chat joined room:', this.roomCode);
            }
        } catch (error) {
            console.error('Failed to initialize voice chat:', error);
        }
    }
    
    initializePageVisibilityHandling() {
        // Handle page visibility changes to pause/resume voice chat
        document.addEventListener('visibilitychange', () => {
            if (this.voiceChat && this.voiceChat.localStream) {
                if (document.hidden) {
                    // Page is hidden, pause voice chat
                    this.voiceChat.localStream.getAudioTracks().forEach(track => {
                        track.enabled = false;
                    });
                } else {
                    // Page is visible, resume voice chat if not muted
                    if (!this.voiceChat.isMuted) {
                        this.voiceChat.localStream.getAudioTracks().forEach(track => {
                            track.enabled = true;
                        });
                    }
                }
            }
        });
    }
    
    leaveLobby() {
        // Leave voice chat room
        this.voiceChat.leaveRoom();
        
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
        this.updateTableCardsInCenter();
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
        const playerPositionsDiv = document.getElementById('playerPositions');
        playerPositionsDiv.innerHTML = '';
        
        // Calculate positions around the circle
        const radius = 200; // Adjust based on table size
        const centerX = 300; // Half of table width
        const centerY = 300; // Half of table height
        
        this.gameState.players.forEach((player, index) => {
            if (player.id !== this.playerId) {
                // Calculate position around the circle
                const angle = (index * (360 / this.gameState.players.length)) * (Math.PI / 180);
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                
                const playerDiv = document.createElement('div');
                playerDiv.className = `absolute transform -translate-x-1/2 -translate-y-1/2 z-10`;
                playerDiv.style.left = `${x}px`;
                playerDiv.style.top = `${y}px`;
                
                playerDiv.innerHTML = `
                    <div class="text-center">
                        <!-- Player Avatar -->
                        <div class="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl mx-auto mb-2 border-4 ${player.id === this.gameState.currentPlayer ? 'border-yellow-400 animate-pulse' : 'border-gray-600'} shadow-2xl">
                            ${player.name.charAt(0).toUpperCase()}
                        </div>
                        
                        <!-- Player Name -->
                        <div class="text-sm md:text-base font-semibold text-white mb-1 bg-gray-800 bg-opacity-75 px-2 py-1 rounded-lg">
                            ${player.name}
                        </div>
                        
                        <!-- Player Cards Info -->
                        <div class="text-xs md:text-sm text-blue-300 bg-gray-800 bg-opacity-75 px-2 py-1 rounded-lg">
                            H:${player.handCards.length} B:${player.blindCount}
                        </div>
                        
                        <!-- Current Turn Indicator -->
                        ${player.id === this.gameState.currentPlayer ? 
                            '<div class="mt-2 text-yellow-400 text-lg animate-pulse">🎯</div>' : 
                            ''
                        }
                    </div>
                `;
                
                playerPositionsDiv.appendChild(playerDiv);
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

    // Update table cards in the center of the circular table
    updateTableCardsInCenter() {
        const tableCardsDiv = document.getElementById('tableCards');
        
        if (this.gameState.tableCards.length === 0) {
            tableCardsDiv.innerHTML = `
                <div class="text-center text-gray-400 text-lg md:text-xl font-semibold">
                    <div class="text-4xl mb-2">🎴</div>
                    <div>Discard Pile</div>
                    <div class="text-sm text-gray-500 mt-1">Throw your first card!</div>
                </div>
            `;
        } else {
            tableCardsDiv.innerHTML = '';
            this.gameState.tableCards.forEach((card, index) => {
                const cardDiv = this.createCardElement(card);
                // Add stagger animation for multiple cards
                cardDiv.style.animationDelay = `${index * 0.1}s`;
                tableCardsDiv.appendChild(cardDiv);
            });
        }
    }
    
    updateTableCards() {
        const tableCardsDiv = document.getElementById('tableCards');
        
        if (this.gameState.tableCards.length === 0) {
            tableCardsDiv.innerHTML = `
                <div class="text-center text-gray-400 text-lg md:text-xl font-semibold">
                    <div class="text-4xl mb-2">🎴</div>
                    <div>Discard Pile</div>
                    <div class="text-sm text-gray-500 mt-1">Throw your first card!</div>
                </div>
            `;
        } else {
            tableCardsDiv.innerHTML = '';
            this.gameState.tableCards.forEach((card, index) => {
                const cardDiv = this.createCardElement(card);
                // Add stagger animation for multiple cards
                cardDiv.style.animationDelay = `${index * 0.1}s`;
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
        
        // Clear selection when updating hand (but preserve Card 2 blind selection if active)
        if (!this.isSelectingBlindForCard2) {
            this.selectedCards = [];
        }
        
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
                    const cardDiv = this.createBlindCardElement(i);
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
        cardDiv.className = `w-16 h-24 md:w-20 md:h-28 bg-white rounded-xl border-2 border-gray-300 shadow-lg transform transition-all duration-300 cursor-pointer hover:scale-110 hover:shadow-2xl hover:-translate-y-2 ${clickable ? 'hover:border-blue-500' : ''} ${this.selectedCards.some(c => c.suit === card.suit && c.value === card.value) ? 'ring-4 ring-blue-500 ring-opacity-75 scale-110 -translate-y-2' : ''}`;
        
        // Card content with suit colors
        const suitColor = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black';
        const suitSymbol = this.getSuitSymbol(card.suit);
        
        cardDiv.innerHTML = `
            <div class="flex flex-col h-full p-2">
                <div class="text-left">
                    <div class="text-sm md:text-base font-bold ${suitColor}">${card.value}</div>
                    <div class="text-xs md:text-sm ${suitColor}">${suitSymbol}</div>
                </div>
                <div class="flex-1 flex items-center justify-center">
                    <div class="text-2xl md:text-3xl ${suitColor}">${suitSymbol}</div>
                </div>
                <div class="text-right transform rotate-180">
                    <div class="text-sm md:text-base font-bold ${suitColor}">${card.value}</div>
                    <div class="text-xs md:text-sm ${suitColor}">${suitSymbol}</div>
                </div>
            </div>
        `;
        
        if (clickable) {
            cardDiv.addEventListener('click', () => this.toggleCardSelection(card, cardDiv));
        }
        
        // Add deal animation
        cardDiv.style.animation = 'deal 0.5s ease-out';
        
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
            
            // If we deselected Card 2, exit blind selection mode
            if (card.numericValue === 2) {
                this.isSelectingBlindForCard2 = false;
                this.selectedBlindCardIndex = null;
                this.updateBlindCardSelection();
            }
        } else {
            // Select card
            this.selectedCards.push(card);
            cardElement.classList.add('selected');
            console.log('Card selected. Selected cards:', this.selectedCards.length);
            
            // Check if this enables Card 2 + blind combo
            const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
            if (card.numericValue === 2 && currentPlayer.blindCount > 0) {
                // Check if all selected cards are Card 2s
                const allSelectedAre2s = this.selectedCards.every(c => c.numericValue === 2);
                const totalCards = currentPlayer.handCards.length;
                const selectedCard2s = this.selectedCards.filter(c => c.numericValue === 2).length;
                
                if (allSelectedAre2s && (totalCards === selectedCard2s || selectedCard2s > 0)) {
                    console.log('Card 2(s) selected - enabling blind card selection');
                    this.isSelectingBlindForCard2 = true;
                    this.showToast(`Select a blind card to play with ${selectedCard2s} Card 2${selectedCard2s > 1 ? 's' : ''}`, 'info');
                }
            }
        }
        
        this.updatePlayCardsButton();
    }

    createBlindCardElement(index) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `w-16 h-24 md:w-20 md:h-28 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl border-2 border-purple-400 shadow-lg transform transition-all duration-300 cursor-pointer hover:scale-110 hover:shadow-2xl hover:-translate-y-2 ${this.selectedBlindCardIndex === index ? 'ring-4 ring-yellow-400 ring-opacity-75 scale-110 -translate-y-2' : ''}`;
        cardDiv.dataset.blindIndex = index;
        
        cardDiv.innerHTML = `
            <div class="flex flex-col h-full p-2 items-center justify-center">
                <div class="text-center">
                    <div class="text-2xl md:text-3xl text-white font-bold mb-1">?</div>
                    <div class="text-xs md:text-sm text-purple-200">Blind</div>
                </div>
            </div>
        `;
        
        // Add click handler for blind card reveal
        cardDiv.addEventListener('click', () => {
            console.log('Blind card clicked, index:', index);
            this.revealBlindCard(index);
        });
        
        // Add reveal animation
        cardDiv.style.animation = 'reveal 0.6s ease-out';
        
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
        
        // Only Card 10 can bypass hierarchy when played alone
        if (card.numericValue === 10) {
            return true;
        }
        
        // Cards 7 and 8 have special effects but must follow hierarchy
        // Regular rule: same number or higher number
        return card.numericValue >= lastCardValue;
    }
    
    canPlayCardCombo(cards, lastCardValue) {
        if (cards.length === 1) {
            return this.canPlayCard(cards[0], lastCardValue);
        }
        
        const hasTwo = cards.some(card => card.numericValue === 2);
        
        if (hasTwo) {
            // Card 2 combo: Card 2 bypasses hierarchy completely
            const otherCards = cards.filter(card => card.numericValue !== 2);
            if (otherCards.length === 0) return false;
            
            // When Card 2 is played with other cards, it bypasses ALL hierarchy
            // ANY card can be played with Card 2, regardless of table card
            return true;
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
        
        // Special case: Card 2s + blind card combo
        if (this.isSelectingBlindForCard2 && this.selectedCards.length > 0 && this.selectedBlindCardIndex !== null) {
            playCardsBtn.style.display = 'block';
            const card2Count = this.selectedCards.length;
            playCardsBtn.textContent = `Play ${card2Count} Card 2${card2Count > 1 ? 's' : ''} + Blind Card`;
            playCardsBtn.onclick = () => this.playCard2WithBlindCard();
            console.log('Card 2s + blind combo button shown');
            return;
        }
        
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
                playCardsBtn.onclick = () => this.playSelectedCards();
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
        // Button should only be visible when cards are properly selected and valid
        if (this.selectedCards.length === 0) {
            console.log('No cards selected - this should not happen if button logic is correct');
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
    
    revealBlindCard(blindIndex) {
        console.log('Revealing blind card at index:', blindIndex);
        
        // Check if it's this player's turn
        const isMyTurn = this.gameState.currentPlayer === this.playerId;
        const mustThrowAfterTaking = this.gameState.mustThrowAfterTaking && this.gameState.playerWhoTook === this.playerId;
        
        if (!isMyTurn && !mustThrowAfterTaking) {
            this.showError("It's not your turn!");
            return;
        }
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (!currentPlayer) {
            this.showError("Player not found!");
            return;
        }
        
        // Check conditions for revealing blind cards
        const allHandCardsAre2s = currentPlayer.handCards.length > 0 && 
                                  currentPlayer.handCards.every(c => c.numericValue === 2);
        const noHandCards = currentPlayer.handCards.length === 0;
        
        if (!allHandCardsAre2s && !noHandCards) {
            this.showError("Can only reveal blind cards when hand is empty or all hand cards are 2s!");
            return;
        }
        
        // Emit blind card reveal
        this.socket.emit('revealBlindCard', { blindIndex: blindIndex });
    }
    
    selectBlindCardForCard2(blindIndex) {
        console.log('Selecting blind card for Card 2 combo:', blindIndex);
        
        // Store the selected blind card index
        this.selectedBlindCardIndex = blindIndex;
        
        // Highlight the selected blind card
        this.updateBlindCardSelection();
        
        // Update the play button
        this.updatePlayCardsButton();
    }
    
    updateBlindCardSelection() {
        const blindCards = document.querySelectorAll('#blindCards .card');
        blindCards.forEach((cardElement, index) => {
            if (index === this.selectedBlindCardIndex) {
                cardElement.classList.add('selected');
            } else {
                cardElement.classList.remove('selected');
            }
        });
    }
    
    playCard2WithBlindCard() {
        if (this.selectedBlindCardIndex === null) {
            this.showError("Please select a blind card to play with Card 2s!");
            return;
        }
        
        if (this.selectedCards.length === 0 || !this.selectedCards.every(c => c.numericValue === 2)) {
            this.showError("Must select Card 2s to play with blind card!");
            return;
        }
        
        // Emit special combo play with all selected Card 2s
        this.socket.emit('playCard2WithBlind', { 
            card2s: this.selectedCards, 
            blindIndex: this.selectedBlindCardIndex 
        });
        
        // Reset selection state
        this.isSelectingBlindForCard2 = false;
        this.selectedBlindCardIndex = null;
        this.selectedCards = [];
        this.updateBlindCardSelection();
        this.updateHandCards();
    }

    newGame() {
        // Leave voice chat room
        this.voiceChat.leaveRoom();
        
        this.socket.disconnect();
        location.reload();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CardGame();
});