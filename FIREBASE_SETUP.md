# Firebase Setup Guide for Kotta

## Step-by-Step Firebase Configuration

### 1. Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Enter project name: `Kotta` (or your preferred name)
4. Accept terms and click **"Continue"**
5. Keep Google Analytics disabled (optional for testing)
6. Click **"Create project"**
7. Wait for project initialization (2-3 minutes)

### 2. Enable Email/Password Authentication

1. In Firebase Console, click **"Authentication"** (left menu)
2. Click **"Get started"**
3. Click **"Email/Password"** provider
4. Toggle **"Enable"** to ON
5. Toggle **"Enable email link (passwordless sign-in)"** to OFF (optional)
6. Click **"Save"**

### 3. Create Firestore Database

1. Click **"Firestore Database"** (left menu under "Build")
2. Click **"Create database"**
3. Select **"Start in test mode"** (for development)
4. Click **"Next"**
5. Select region: **"us-central1"** (or closest to you)
6. Click **"Enable"**
7. Wait for database to initialize

### 4. Get Your Firebase Config

1. Click the **Settings icon** (⚙️) at top left
2. Click **"Project settings"**
3. Click the **"General"** tab
4. Scroll down to find your Firebase config
5. Copy these values exactly:
   ```
   API Key: EXPO_PUBLIC_FIREBASE_API_KEY
   Auth Domain: EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
   Project ID: EXPO_PUBLIC_FIREBASE_PROJECT_ID
   Storage Bucket: EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
   Messaging Sender ID: EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   App ID: EXPO_PUBLIC_FIREBASE_APP_ID
   ```

### 5. Set Up Database Collections

#### Option A: Let App Create Them (Easiest)
- Collections are created automatically when you first use the app
- Just run the app and it will create `games`, `buyIns`, `cashOuts` on first use

#### Option B: Manual Setup (Optional)

1. In Firestore, click **"+ Start collection"**

**Collection 1: games**
```
Document ID: (auto-generated)
Fields:
  - hostId: string
  - title: string
  - venue: string
  - dateTime: timestamp
  - players: array
  - buyInAmount: number
  - status: string
  - createdAt: timestamp
  - updatedAt: timestamp
```

**Collection 2: buyIns**
```
Document ID: (auto-generated)
Fields:
  - gameId: string
  - playerId: string
  - amount: number
  - timestamp: timestamp
```

**Collection 3: cashOuts**
```
Document ID: (auto-generated)
Fields:
  - gameId: string
  - playerId: string
  - amount: number
  - profit: number
  - timestamp: timestamp
```

### 6. Configure Security Rules

1. In Firestore, click **"Rules"** tab
2. Replace the default rules with:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their games
    match /games/{gameId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow authenticated users to read/write buy-ins
    match /buyIns/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Allow authenticated users to read/write cash-outs
    match /cashOuts/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

**⚠️ Production Rules** (later, when deploying):
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      // Only host can write, anyone can read if authenticated
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.hostId;
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

### 7. Update Your App

1. Go to your app folder:
   ```bash
   cd /Users/laks_pro/Documents/Projects/Claude/Kotta
   ```

2. Update `.env.local`:
   ```bash
   EXPO_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
   EXPO_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
   ```

3. Run the app:
   ```bash
   npm run web
   ```

### 8. Test Firebase Connection

1. Open app in browser
2. Create a test account
3. Create a test game
4. Go to Firebase Console → Firestore
5. Check if `games` collection was created
6. You should see your test game document

## 📊 Firebase Dashboard Overview

### Usage Monitoring
- **Firestore**: Shows reads/writes/deletes
- **Authentication**: Shows sign-ups and active users
- **Storage**: Shows data usage

### Important Links
- **Project Settings**: https://console.firebase.google.com/project/PROJECT-ID/settings/general
- **Firestore**: https://console.firebase.google.com/project/PROJECT-ID/firestore
- **Auth**: https://console.firebase.google.com/project/PROJECT-ID/authentication/users

## 🆘 Troubleshooting

### "Cannot find Firebase config"
- Check `.env.local` exists in project root
- Verify all keys start with `EXPO_PUBLIC_`
- Run `npx expo start --clear`

### "Permission denied" error
- Go to Firestore → Rules → Check rules are published
- Make sure you're logged in with test account
- Try switching to test mode (less restrictive)

### Firebase not initializing
- Check API key is correct
- Verify Firebase project is created
- Check internet connection
- Restart the app: `npx expo start --clear`

### Firestore empty after testing
- Firestore is working! Collections and documents created on first use
- Check Firebase Console to verify data is there

## 🔒 Security Tips

1. **Never commit `.env.local`** - It has your credentials
2. **Use environment variables** - Kotta stores keys in `.env.local` (git-ignored)
3. **Update rules before production** - Use restrictive rules for live apps
4. **Enable backups** - In Firestore settings, enable automatic backups
5. **Monitor usage** - Check Firebase billing to avoid surprises

## 📈 Firebase Pricing

**Free Tier (Spark)** - Great for development:
- 1GB Firestore storage
- 50,000 reads/day
- 20,000 writes/day
- Unlimited authentication

**Recommended for production**:
- Switch to Blaze plan (pay-as-you-go)
- Set up budget alerts
- Monitor usage regularly

## 🎯 Next Steps

1. ✅ Create Firebase project
2. ✅ Enable authentication
3. ✅ Create Firestore database
4. ✅ Copy credentials to `.env.local`
5. ✅ Test the app with `npm run web`
6. ☑️ Create your first poker game!
7. ☑️ Invite friends to test
8. ☑️ Add more features from NEXT_STEPS.md

## 📞 Getting Help

If you get stuck:

1. Check Firebase error messages in browser console
2. Verify `.env.local` credentials are exact
3. Make sure Email/Password auth is enabled
4. Ensure Firestore database is created
5. Check security rules are published

**Firebase Documentation**: https://firebase.google.com/docs

---

**You're all set! Start the app with `npm run web` 🚀**

Happy Poker! ♠♥♦♣
