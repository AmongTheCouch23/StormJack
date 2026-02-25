import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getDatabase, ref, set, get, query, orderByChild, equalTo, onValue, push, serverTimestamp } from 'firebase/database';

// Firebase configuration
// Replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if Firebase is configured
const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey !== "YOUR_API_KEY" && 
         firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};

// Initialize Firebase only if configured
let app, auth, database, googleProvider;

try {
  if (isFirebaseConfigured()) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    googleProvider = new GoogleAuthProvider();
  }
} catch (error) {
  console.warn('Firebase not configured:', error);
}

// Authentication functions
export const signInWithGoogle = async () => {
  if (!isFirebaseConfigured()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const signUpWithEmail = async (email, password) => {
  if (!isFirebaseConfigured()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Error signing up with email:", error);
    throw error;
  }
};

export const signInWithEmail = async (email, password) => {
  if (!isFirebaseConfigured()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Error signing in with email:", error);
    throw error;
  }
};

export const resetPassword = async (email) => {
  if (!isFirebaseConfigured()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Error sending password reset:", error);
    throw error;
  }
};

export const logOut = async () => {
  if (!isFirebaseConfigured()) {
    return;
  }
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

// Check if Firebase is configured
export { isFirebaseConfigured };

// Username functions
export const checkUsernameAvailable = async (username) => {
  const usernamesRef = ref(database, 'usernames');
  const usernameQuery = query(usernamesRef, orderByChild('username'), equalTo(username));
  const snapshot = await get(usernameQuery);
  return !snapshot.exists();
};

export const setUsername = async (userId, username) => {
  const isAvailable = await checkUsernameAvailable(username);
  if (!isAvailable) {
    throw new Error('Username already taken');
  }
  
  // Set username in usernames collection
  await set(ref(database, `usernames/${userId}`), {
    username: username,
    userId: userId,
    createdAt: serverTimestamp()
  });
  
  // Update user profile
  await set(ref(database, `users/${userId}/username`), username);
  
  return true;
};

export const getUserData = async (userId) => {
  const userRef = ref(database, `users/${userId}`);
  const snapshot = await get(userRef);
  return snapshot.val();
};

// Chat functions
export const sendMessage = async (roomId, userId, username, message, location) => {
  const messagesRef = ref(database, `messages/${roomId}`);
  const newMessageRef = push(messagesRef);
  
  await set(newMessageRef, {
    userId,
    username,
    text: message,
    location: location || null,
    timestamp: serverTimestamp()
  });
};

export const subscribeToMessages = (roomId, callback) => {
  const messagesRef = ref(database, `messages/${roomId}`);
  const messagesQuery = query(messagesRef);
  
  return onValue(messagesQuery, (snapshot) => {
    const messages = [];
    snapshot.forEach((childSnapshot) => {
      messages.push({
        id: childSnapshot.key,
        ...childSnapshot.val()
      });
    });
    callback(messages);
  });
};

// Calculate room ID based on location
export const calculateRoomId = (location, roomType) => {
  if (roomType === 'worldwide') {
    return 'worldwide';
  } else if (roomType === 'country') {
    // In production, you'd use a geocoding service to determine country
    return 'country_us'; // Default to US for now
  } else if (roomType === 'nearby') {
    // Grid-based approach: round to nearest 0.5 degrees
    const lat = Math.round(location.lat * 2) / 2;
    const lng = Math.round(location.lng * 2) / 2;
    return `nearby_${lat}_${lng}`;
  }
  return 'worldwide';
};

export { auth, database };
