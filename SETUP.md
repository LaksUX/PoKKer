# Kotta - Setup & Deployment Guide

## 📋 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- Git
- A text editor (VS Code recommended)

### Installation Steps

1. **Navigate to project**
   ```bash
   cd /Users/laks_pro/Documents/Projects/Claude/Kotta
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Email/Password authentication
   - Create a Firestore database (start in test mode for development)
   - Get your project credentials from Project Settings

4. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your Firebase credentials

5. **Run the app**
   ```bash
   npm run web        # Web browser
   npm run ios        # iOS simulator (macOS)
   npm run android    # Android emulator
   ```

## 🏗️ Project Architecture

### Directory Structure
```
Kotta/
├── src/
│   ├── screens/           # UI screens
│   │   ├── HomeScreen.tsx
│   │   ├── CreateGameScreen.tsx
│   │   ├── GameDetailScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── SignupScreen.tsx
│   │   └── AuthStack.tsx
│   ├── services/          # Business logic & API calls
│   │   ├── firebase.ts
│   │   └── gameService.ts
│   ├── context/           # React Context
│   │   └── AuthContext.tsx
│   ├── types/             # TypeScript definitions
│   │   └── index.ts
│   ├── utils/             # Helper functions
│   └── components/        # Reusable components
├── App.tsx                # Main app entry point
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── README.md             # Documentation
└── .env.example          # Environment template
```

## 🔥 Firebase Setup Details

### Database Collections

**1. games** - Poker game documents
```javascript
{
  id: "abc123",
  hostId: "user123",
  title: "Friday Night Poker",
  venue: "John's House",
  dateTime: Timestamp(2024-04-20),
  players: [
    { id: "user1", name: "John", email: "john@example.com" }
  ],
  buyInAmount: 20,
  status: "scheduled",
  cashOutData: [],
  createdAt: Timestamp(2024-04-14),
  updatedAt: Timestamp(2024-04-14)
}
```

**2. buyIns** - Player buy-in records
```javascript
{
  gameId: "abc123",
  playerId: "user1",
  amount: 50,
  timestamp: Timestamp(2024-04-20)
}
```

**3. cashOuts** - Player cash-out records
```javascript
{
  gameId: "abc123",
  playerId: "user1",
  amount: 120,
  profit: 70,
  timestamp: Timestamp(2024-04-20)
}
```

### Security Rules (for development)

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow read, write: if request.auth != null;
    }
    
    match /buyIns/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    match /cashOuts/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 🎨 App Features

### Core Screens

1. **Authentication**
   - Login with email/password
   - Sign up with display name
   - Firebase-backed persistence

2. **Home Screen**
   - View list of your games
   - See game status, venue, date/time
   - Quick access to player count and buy-in amount
   - Create new game button

3. **Create Game**
   - Input game details (title, venue, buy-in amount)
   - Set date and time with pickers
   - Optional game description
   - Host automatically added as first player

4. **Game Details**
   - Overview tab: Game info and status
   - Players tab: List of players, add new players (host only)
   - Buy-Ins tab: Record player buy-ins (host only)
   - Cash-Out tab: Record cash-outs and calculate profits (host only)

## 🚀 Development Workflow

### Running in Development

```bash
# Start dev server
npm start

# Choose platform:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Press 'w' for web browser
```

### Hot Reload
- Save files to auto-reload
- Changes to styles apply instantly
- For logic changes, may need to refresh manually (Cmd+R or Cmd+Shift+R)

### TypeScript Checking
```bash
npx tsc --noEmit
```

### Debugging
- Use React Native Debugger
- Open DevTools in browser dev tools (web)
- Check console for errors

## 📦 Building for Production

### iOS Build
```bash
eas build --platform ios
```

### Android Build
```bash
eas build --platform android
```

### Web Deployment
```bash
npm run build
# Deploy the build folder to your hosting service
```

## 🐛 Troubleshooting

### Common Issues

**Firebase connection fails**
- Verify your .env.local is correct
- Check Firebase credentials match your project
- Ensure Firestore security rules allow access

**Port already in use**
```bash
# Find and kill process on port 8081
lsof -i :8081
kill -9 <PID>
```

**Module not found errors**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start --clear
```

**TypeScript errors**
```bash
npx tsc --noEmit
# Check output for specific errors
```

**Blank white screen**
- Clear Expo cache: `expo start --clear`
- Check console for errors
- Verify Firebase config is loaded

## 💡 Best Practices

1. **Environment Variables**
   - Never commit `.env.local`
   - Use `.env.example` as template
   - Keep credentials secure

2. **Code Organization**
   - Keep screens focused on UI
   - Move business logic to services
   - Use TypeScript for type safety

3. **Performance**
   - Use loading states
   - Implement error boundaries
   - Optimize re-renders with useCallback/useMemo

4. **Security**
   - Use Firebase security rules
   - Never expose sensitive data in frontend
   - Validate user input

## 📚 Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Native](https://reactnative.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and test
3. Commit: `git commit -m 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Open Pull Request

## 📄 License

MIT License - Free for personal and commercial use

---

**Need Help?**
- Check README.md for feature documentation
- Review error messages in console
- Check Firebase Documentation
- Ask for assistance in issues

**Happy Coding! ♠♥♦♣**
