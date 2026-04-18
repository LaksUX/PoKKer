# Kotta - Poker Night Manager

A mobile app for poker players to plan house games, manage buy-ins, track cashouts, and monitor chip counts.

## Features

- **Event Planning**: Create poker games with venue, time, and player list
- **Player Management**: Add/remove players and track attendance
- **Buy-In Tracking**: Record buy-ins for each player
- **Cash-Out Management**: Record final cash-outs and calculate profits/losses
- **Chip Tracking**: Monitor chip counts during the game
- **Game History**: View past games and statistics
- **Push Notifications**: Get notifications for upcoming games and important updates
- **User Authentication**: Secure login and signup with Firebase

## Tech Stack

- **Frontend**: React Native with Expo
- **Backend**: Firebase (Authentication, Firestore Database)
- **Navigation**: React Navigation
- **Development Language**: TypeScript

## Project Structure

```
src/
├── screens/            # App screens (Home, CreateGame, GameDetail, Auth)
├── services/           # Firebase and API services
├── context/            # React Context (Auth)
├── types/              # TypeScript types and interfaces
├── utils/              # Utility functions
├── components/         # Reusable components
└── assets/             # Images and assets
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication (Email/Password)
4. Create a Firestore database
5. Copy your project credentials

### 3. Set Environment Variables

```bash
cp .env.example .env.local
```

Update `.env.local` with your Firebase credentials:

```
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Run the App

**For Web:**
```bash
npm run web
```

**For iOS (macOS only):**
```bash
npm run ios
```

**For Android:**
```bash
npm run android
```

## Firebase Database Structure

### Collections

1. **games**
   - Contains all poker game documents
   - Fields: title, venue, dateTime, players, buyInAmount, status, etc.

2. **buyIns**
   - Records of player buy-ins
   - Fields: gameId, playerId, amount, timestamp

3. **cashOuts**
   - Records of player cash-outs and profits
   - Fields: gameId, playerId, amount, profit, timestamp

4. **users**
   - User profiles
   - Fields: displayName, email, avatar, stats

## Usage

### Creating a Game

1. Tap "New Game" on the home screen
2. Fill in game details (title, venue, buy-in amount, date/time)
3. Add description (optional)
4. Tap "Create Game"

### Managing Players

1. Go to game details
2. Tap "Players" tab
3. Add players by email (if you're the host)

### Recording Transactions

1. Go to game details
2. For buy-ins: Tap "Buy-Ins" tab → Select player → Enter amount
3. For cash-outs: Tap "Cash-Out" tab → Select player → Enter final amount (profit/loss calculated automatically)

## API Reference

### Game Service

```typescript
// Create game
gameService.createGame(gameData: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>

// Get game
gameService.getGame(gameId: string): Promise<Game | null>

// Get user's games
gameService.getUserGames(userId: string): Promise<Game[]>

// Update game
gameService.updateGame(gameId: string, updates: Partial<Game>): Promise<void>

// Delete game
gameService.deleteGame(gameId: string): Promise<void>

// Add buy-in
gameService.addBuyIn(buyIn: BuyInEntry): Promise<void>

// Get game buy-ins
gameService.getGameBuyIns(gameId: string): Promise<BuyInEntry[]>

// Add cash-out
gameService.addCashOut(cashOut: CashOutEntry): Promise<void>

// Get game cash-outs
gameService.getGameCashOuts(gameId: string): Promise<CashOutEntry[]>
```

## Key Types

```typescript
interface Game {
  id: string;
  hostId: string;
  title: string;
  venue: string;
  dateTime: Date;
  players: Player[];
  buyInAmount: number;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

interface Player {
  id: string;
  name: string;
  email: string;
}

interface BuyInEntry {
  gameId: string;
  playerId: string;
  amount: number;
  timestamp: Date;
}

interface CashOutEntry {
  gameId: string;
  playerId: string;
  amount: number;
  profit: number;
  timestamp: Date;
}
```

## Future Enhancements

- [ ] Game statistics and player rankings
- [ ] Chip stack visualization
- [ ] In-game timer (for tournament mode)
- [ ] Multiple game formats (cash, tournament, SNG)
- [ ] Leaderboards and player stats
- [ ] Social features (friend list, game invitations)
- [ ] Photo profiles
- [ ] Game replay/hand history
- [ ] Payout settlement calculator
- [ ] Dark/Light theme toggle

## Troubleshooting

### Firebase Connection Issues
- Verify your Firebase credentials are correct
- Check that Firestore Security Rules allow read/write access
- Ensure your Firebase project has authentication enabled

### Build Errors
- Run `npm install` again to ensure all dependencies are installed
- Clear cache: `npx expo start --clear`
- Update Expo: `npm install -g expo-cli@latest`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please open an issue on GitHub.

---

**Happy Poker!** ♠♥♦♣
