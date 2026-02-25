# Firebase Setup Guide for StormJack

This guide walks you through setting up Firebase for StormJack from scratch.

## Step 1: Create Firebase Project (5 minutes)

1. **Go to Firebase Console**
   - Visit https://console.firebase.google.com
   - Sign in with your Google account

2. **Create New Project**
   - Click "Add project"
   - Project name: `StormJack` (or your preferred name)
   - Google Analytics: Optional (recommended for monitoring)
   - Click "Create project" and wait ~30 seconds

## Step 2: Enable Google Authentication (2 minutes)

1. **Open Authentication**
   - In left sidebar, click "Authentication"
   - Click "Get started"

2. **Enable Google Sign-In**
   - Click "Sign-in method" tab
   - Click "Google" in the providers list
   - Toggle the "Enable" switch
   - Project support email: Use your email
   - Click "Save"

3. **Configure OAuth (Important!)**
   - Go to Google Cloud Console (link in warning message)
   - Configure OAuth consent screen:
     - User Type: External
     - App name: StormJack
     - User support email: Your email
     - Developer contact: Your email
     - Add scopes: email, profile, openid
     - Add test users (your email) if in development
   - Save and continue

## Step 3: Setup Realtime Database (3 minutes)

1. **Create Database**
   - In left sidebar, click "Realtime Database"
   - Click "Create Database"
   - Location: Choose closest to your users (e.g., us-central1)
   - Security rules: Start in **test mode**
   - Click "Enable"

2. **Configure Security Rules**
   - Go to "Rules" tab
   - Replace with the following rules:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "usernames": {
      ".read": true,
      "$uid": {
        ".write": "$uid === auth.uid && !data.exists()",
        ".validate": "newData.hasChildren(['username', 'userId', 'createdAt']) && newData.child('username').isString() && newData.child('username').val().length >= 3 && newData.child('username').val().length <= 20"
      }
    },
    "messages": {
      ".read": true,
      "$roomId": {
        "$messageId": {
          ".write": "auth != null",
          ".validate": "newData.hasChildren(['userId', 'username', 'text', 'timestamp']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 1000"
        }
      }
    }
  }
}
```

   - Click "Publish"

**What these rules do:**
- `users`: Only you can read/write your own user data
- `usernames`: Anyone can check if username exists, but can't change once set
- `messages`: Anyone authenticated can post; everyone can read

## Step 4: Get Configuration Values (2 minutes)

1. **Project Settings**
   - Click gear icon (⚙️) next to "Project Overview"
   - Click "Project settings"

2. **Add Web App**
   - Scroll to "Your apps" section
   - Click web icon `</>`
   - App nickname: `StormJack Web`
   - Don't check "Firebase Hosting"
   - Click "Register app"

3. **Copy Config**
   - You'll see `firebaseConfig` object
   - Copy these values:

```javascript
apiKey: "AIza..."
authDomain: "stormjack-xxxxx.firebaseapp.com"
databaseURL: "https://stormjack-xxxxx-default-rtdb.firebaseio.com"
projectId: "stormjack-xxxxx"
storageBucket: "stormjack-xxxxx.appspot.com"
messagingSenderId: "123456789"
appId: "1:123456789:web:xxxxx"
```

## Step 5: Configure StormJack (3 minutes)

### Option A: Direct Code Update

Edit `src/services/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxxx"
};
```

### Option B: Environment Variables (Recommended)

1. **Create `.env` file** in project root:

```bash
REACT_APP_FIREBASE_API_KEY=AIza...
REACT_APP_FIREBASE_AUTH_DOMAIN=stormjack-xxxxx.firebaseapp.com
REACT_APP_FIREBASE_DATABASE_URL=https://stormjack-xxxxx-default-rtdb.firebaseio.com
REACT_APP_FIREBASE_PROJECT_ID=stormjack-xxxxx
REACT_APP_FIREBASE_STORAGE_BUCKET=stormjack-xxxxx.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:xxxxx
```

2. **Update `firebase.js`**:

```javascript
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};
```

## Step 6: Test Locally (2 minutes)

```bash
npm install
npm start
```

1. Open http://localhost:3000
2. Click "Sign in with Google"
3. If you see username screen = SUCCESS! ✅
4. Choose a username and test chat

## Step 7: Add Authorized Domains (Production)

**For Netlify Deployment:**

1. Deploy to Netlify first
2. Note your URL: `https://your-app.netlify.app`
3. Go to Firebase Console → Authentication → Settings
4. Under "Authorized domains", click "Add domain"
5. Add: `your-app.netlify.app`
6. Click "Add"

**For Custom Domain:**
- Add your custom domain (e.g., `stormjack.app`)
- Firebase automatically authorizes common domains

## Troubleshooting

### "This app is blocked" OAuth Error
- Configure OAuth consent screen in Google Cloud Console
- Add your email as test user
- Eventually submit for verification (production)

### "Permission denied" Database Errors
- Check database rules are published
- Verify user is authenticated (check console)
- Check rule syntax (JSON is valid)

### Authentication Not Working
- Verify authorized domains include your domain
- Check OAuth consent screen is configured
- Clear browser cache and try again

### Username Already Taken (But It's Not)
- Check database rules syntax
- Clear browser data
- Check Firebase Console → Database for actual usernames

## Security Best Practices

1. **Production Rules**
   - Never use test mode in production
   - Validate all data with `.validate`
   - Rate limit with `.indexOn` and client checks

2. **API Keys**
   - Firebase API keys are meant to be public
   - Security comes from database rules, not hiding keys
   - Still, use environment variables for cleaner code

3. **OAuth Consent**
   - Submit for verification for public apps
   - Keep scopes minimal (email, profile only)
   - Follow Google's branding guidelines

## Cost Estimation

**Firebase Free Tier (Spark Plan):**
- Authentication: Unlimited (phone auth has limits)
- Realtime Database: 1GB storage, 10GB/month download
- Good for: ~1000 active users/day

**Typical Usage:**
- Each message: ~200 bytes
- 10,000 messages/day = ~2MB/day = 60MB/month
- Well within free tier!

**When to Upgrade:**
- 10,000+ monthly active users
- Need 99.95% SLA
- More than 1GB database storage

## Next Steps

Once Firebase is configured:
1. ✅ Test authentication locally
2. ✅ Test chat functionality
3. ✅ Deploy to Netlify
4. ✅ Add production domain to authorized domains
5. ✅ Monitor usage in Firebase Console
6. ✅ Set up budget alerts (optional)

## Support Resources

- **Firebase Docs**: https://firebase.google.com/docs
- **Firebase Console**: https://console.firebase.google.com
- **Community**: Stack Overflow (tag: firebase)
- **Status**: https://status.firebase.google.com

---

**Setup complete! You're ready to deploy StormJack! ⚡**
