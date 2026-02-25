// Local authentication service - works without Firebase
// Uses localStorage for storing users

const USERS_KEY = 'stormjack_users';
const CURRENT_USER_KEY = 'stormjack_current_user';
const MESSAGES_KEY_PREFIX = 'stormjack_messages_';

// Message event for cross-tab synchronization
const MESSAGE_EVENT = 'stormjack_new_message';

// BroadcastChannel for real-time cross-tab communication (like Twitch!)
let messageBroadcast = null;
try {
  messageBroadcast = new BroadcastChannel('stormjack_chat');
} catch (error) {
  console.log('BroadcastChannel not supported, using fallback');
}

// Get all users from localStorage
const getUsers = () => {
  try {
    const users = localStorage.getItem(USERS_KEY);
    return users ? JSON.parse(users) : {};
  } catch (error) {
    console.error('Error reading users:', error);
    return {};
  }
};

// Save users to localStorage
const saveUsers = (users) => {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Error saving users:', error);
  }
};

// Get messages for a room
const getMessages = (roomId) => {
  try {
    const messages = localStorage.getItem(MESSAGES_KEY_PREFIX + roomId);
    return messages ? JSON.parse(messages) : [];
  } catch (error) {
    console.error('Error reading messages:', error);
    return [];
  }
};

// Save messages for a room
const saveMessages = (roomId, messages) => {
  try {
    localStorage.setItem(MESSAGES_KEY_PREFIX + roomId, JSON.stringify(messages));
    
    // Broadcast to other tabs instantly (like Twitch chat!)
    if (messageBroadcast) {
      messageBroadcast.postMessage({ 
        type: 'NEW_MESSAGE',
        roomId, 
        messages 
      });
    }
    
    // Also trigger custom event for same-tab updates
    window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { 
      detail: { roomId, messages } 
    }));
  } catch (error) {
    console.error('Error saving messages:', error);
  }
};

// Sign up with email and password (local)
export const localSignUp = async (email, password) => {
  const users = getUsers();
  
  // Check if user already exists
  if (users[email]) {
    throw new Error('auth/email-already-in-use');
  }
  
  // Create new user
  const user = {
    uid: `local_${Date.now()}`,
    email: email,
    password: password, // In production, this should be hashed
    createdAt: new Date().toISOString()
  };
  
  users[email] = user;
  saveUsers(users);
  
  // Set current user
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  
  return user;
};

// Sign in with email and password (local)
export const localSignIn = async (email, password) => {
  const users = getUsers();
  
  const user = users[email];
  
  if (!user) {
    throw new Error('auth/user-not-found');
  }
  
  if (user.password !== password) {
    throw new Error('auth/wrong-password');
  }
  
  // Set current user
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  
  return user;
};

// Get current user (local)
export const localGetCurrentUser = () => {
  try {
    const user = localStorage.getItem(CURRENT_USER_KEY);
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Sign out (local)
export const localSignOut = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

// Password reset (local - just simulated)
export const localResetPassword = async (email) => {
  const users = getUsers();
  
  if (!users[email]) {
    throw new Error('auth/user-not-found');
  }
  
  // In a real app, this would send an email
  // For local mode, we just simulate success
  console.log(`Password reset email would be sent to: ${email}`);
  return true;
};

// Username management (local)
const USERNAMES_KEY = 'stormjack_usernames';

export const localCheckUsernameAvailable = async (username) => {
  try {
    const usernames = localStorage.getItem(USERNAMES_KEY);
    const usernameMap = usernames ? JSON.parse(usernames) : {};
    return !usernameMap[username.toLowerCase()];
  } catch (error) {
    console.error('Error checking username:', error);
    return true;
  }
};

export const localSetUsername = async (userId, username) => {
  try {
    // Check availability
    const isAvailable = await localCheckUsernameAvailable(username);
    if (!isAvailable) {
      throw new Error('Username already taken');
    }
    
    // Save username mapping
    const usernames = localStorage.getItem(USERNAMES_KEY);
    const usernameMap = usernames ? JSON.parse(usernames) : {};
    usernameMap[username.toLowerCase()] = userId;
    localStorage.setItem(USERNAMES_KEY, JSON.stringify(usernameMap));
    
    // Update user object
    const currentUser = localGetCurrentUser();
    if (currentUser && currentUser.uid === userId) {
      currentUser.username = username;
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    }
    
    return true;
  } catch (error) {
    console.error('Error setting username:', error);
    throw error;
  }
};

export const localGetUserData = async (userId) => {
  const currentUser = localGetCurrentUser();
  if (currentUser && currentUser.uid === userId) {
    return currentUser;
  }
  return null;
};

// Local message functions (for when Firebase is not configured)
export const localSendMessage = async (roomId, userId, username, message, location) => {
  const messages = getMessages(roomId);
  
  const newMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    username,
    text: message,
    location: location || null,
    timestamp: Date.now()
  };
  
  messages.push(newMessage);
  
  // Keep only last 100 messages per room to avoid localStorage bloat
  if (messages.length > 100) {
    messages.shift();
  }
  
  saveMessages(roomId, messages);
  
  // Force immediate localStorage read to ensure instant visual update
  // This helps mobile browsers that might delay storage events
  setTimeout(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: MESSAGES_KEY_PREFIX + roomId,
      newValue: JSON.stringify(messages),
      oldValue: null,
      storageArea: localStorage,
      url: window.location.href
    }));
  }, 0);
  
  return newMessage;
};

export const localSubscribeToMessages = (roomId, callback) => {
  // Initial load
  const initialMessages = getMessages(roomId);
  callback(initialMessages);
  
  // Detect mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  console.log(`[Chat] Subscribing to ${roomId} on ${isMobile ? 'mobile' : 'desktop'}`);
  
  // Listen for BroadcastChannel messages (INSTANT cross-tab sync like Twitch!)
  let broadcastHandler = null;
  if (messageBroadcast) {
    broadcastHandler = (event) => {
      if (event.data.type === 'NEW_MESSAGE' && event.data.roomId === roomId) {
        console.log('[Chat] BroadcastChannel update received');
        callback(event.data.messages);
      }
    };
    messageBroadcast.addEventListener('message', broadcastHandler);
  } else {
    console.log('[Chat] BroadcastChannel not supported, using fallbacks');
  }
  
  // Listen for storage events (cross-tab sync fallback)
  const handleStorage = (e) => {
    if (e.key === MESSAGES_KEY_PREFIX + roomId) {
      console.log('[Chat] Storage event update');
      const messages = e.newValue ? JSON.parse(e.newValue) : [];
      callback(messages);
    }
  };
  
  // Listen for custom events (same-tab updates)
  const handleCustomEvent = (e) => {
    if (e.detail.roomId === roomId) {
      console.log('[Chat] Custom event update');
      callback(e.detail.messages);
    }
  };
  
  // Listen for visibility changes (mobile apps coming back to foreground)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[Chat] App became visible, force refresh');
      // Force refresh when app becomes visible again
      const messages = getMessages(roomId);
      callback(messages);
    }
  };
  
  // Force refresh on focus (helps mobile)
  const handleFocus = () => {
    console.log('[Chat] Window focused, force refresh');
    const messages = getMessages(roomId);
    callback(messages);
  };
  
  // Force refresh on touch (mobile interaction)
  const handleTouch = () => {
    const messages = getMessages(roomId);
    callback(messages);
  };
  
  window.addEventListener('storage', handleStorage);
  window.addEventListener(MESSAGE_EVENT, handleCustomEvent);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  
  // Add touch listener for mobile
  if (isMobile) {
    document.addEventListener('touchstart', handleTouch, { passive: true, once: true });
  }
  
  // VERY aggressive polling on mobile (50ms - checks 20 times per second!)
  // Mobile browsers throttle background tabs, so we need frequent checks
  const pollInterval = setInterval(() => {
    const messages = getMessages(roomId);
    callback(messages);
  }, isMobile ? 50 : 500);
  
  console.log(`[Chat] Polling interval: ${isMobile ? '50ms (20 FPS)' : '500ms (2 FPS)'}`);
  
  // Return cleanup function
  return () => {
    console.log(`[Chat] Unsubscribing from ${roomId}`);
    if (broadcastHandler && messageBroadcast) {
      messageBroadcast.removeEventListener('message', broadcastHandler);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(MESSAGE_EVENT, handleCustomEvent);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
    if (isMobile) {
      document.removeEventListener('touchstart', handleTouch);
    }
    clearInterval(pollInterval);
  };
};
