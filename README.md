# Multiplayer Card Game

A strategic multiplayer online card game that works on mobile browsers. Players can create and join game tables using shared access codes for an engaging card-throwing experience.

## Features

- **2-6 Players**: Supports multiplayer games with 2 to 6 players
- **Mobile-First**: Responsive web design optimized for mobile browsers
- **Real-time Multiplayer**: Uses Socket.IO for real-time synchronization
- **Strategic Gameplay**: Complex card mechanics with power cards and special rules
- **Anonymous Play**: No registration required, just enter a name and play

## Game Rules

### Basic Rules
- Each player starts with 3 blind cards (face down), 3 visible cards (face up), and 3 hand cards
- Players must throw a card higher than the previous card on the table
- If you can't play a higher card, you must take all cards from the table
- Players must maintain at least 3 cards in hand while the deck lasts
- When the deck is empty and hand is empty, blind cards are revealed one by one

### Power Cards
- **Card 2**: Can bypass any card (can be played on any card)
- **Card 7**: Can be played on 7 or lower, reverses turn order
- **Card 8**: Can be played on 8 or lower, skips the next player's turn
- **Card 10**: Removes all previously thrown cards from the table

### Winning
First player to use all their cards (hand, visible, and blind) wins!

## Setup and Installation

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone or download the project files
2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

### For Development
To run with auto-restart on file changes:
```bash
npm run dev
```

## How to Play

1. **Create a Game**:
   - Enter your name
   - Click "Create New Game"
   - Share the 6-digit game code with friends

2. **Join a Game**:
   - Enter your name
   - Enter the game code provided by a friend
   - Click "Join Game"

3. **Start Playing**:
   - Wait for all players to join (2-6 players)
   - Click "Ready" when you're prepared to start
   - Game begins when all players are ready

4. **Gameplay**:
   - Cards highlighted in gold can be played
   - Tap a card to play it
   - If you cannot play, use "Take All Cards" button
   - Follow the turn order and special card rules

## Technical Architecture

### Backend
- **Node.js** with Express.js for web server
- **Socket.IO** for real-time multiplayer communication
- **UUID** for unique game code generation
- In-memory game state management

### Frontend
- **Vanilla JavaScript** with modern ES6+ features
- **CSS3** with responsive design and mobile optimization
- **Socket.IO Client** for real-time communication
- Progressive Web App (PWA) ready

### File Structure
```
Game/
├── server.js          # Main server file with game logic
├── package.json       # Dependencies and scripts
├── README.md         # This file
└── public/           # Frontend files
    ├── index.html    # Main HTML structure
    ├── styles.css    # Responsive CSS styling
    └── game.js       # Client-side JavaScript
```

## Mobile Optimization

- Touch-friendly interface with 48px minimum touch targets
- Responsive design that works on screens from 320px to 1200px+
- Optimized card layouts for portrait and landscape orientations
- Fast tap responses with touch-action optimization
- No external dependencies for faster loading

## Browser Compatibility

- Chrome/Safari Mobile (iOS 12+)
- Chrome Mobile (Android 6+)
- Samsung Internet
- Firefox Mobile
- Desktop browsers (Chrome, Firefox, Safari, Edge)

## Deployment

The game can be deployed to any Node.js hosting platform:

### Heroku
```bash
# Install Heroku CLI and login
heroku create your-card-game
git add .
git commit -m "Initial commit"
git push heroku main
```

### Railway/Render/DigitalOcean
1. Connect your Git repository
2. Set the start command to: `node server.js`
3. Deploy

### Environment Variables
- `PORT`: Server port (default: 3000)

## Game Balance and Strategy

The game rewards strategic thinking:
- **Hand Management**: Deciding when to play power cards vs. save them
- **Turn Manipulation**: Using cards 7 and 8 to control game flow
- **Risk Assessment**: Choosing between playing safe vs. aggressive moves
- **Card Counting**: Tracking what cards have been played

## Future Enhancements

Potential features for future versions:
- Player statistics and leaderboards
- Custom game rules variations
- Spectator mode
- In-game chat system
- Tournament bracket system
- Card animations and sound effects

## License

MIT License - Feel free to modify and distribute as needed.

## Support

For issues or questions, create an issue in the project repository or contact the development team.