// Simple JSON Message Sync - Shared JSON file approach
// Messages stored in backend JSON, polled every 3 seconds

const SYNC_INTERVAL = 3000; // Poll every 3 seconds
const MESSAGE_CACHE_KEY = 'stormjack_messages_cache';

// Backend JSON URLs (one per room)
// For development: localhost
// For production: Replace with your deployed backend URL
const BACKEND_BASE_URL = 'http://localhost:3001/messages';

const getBackendUrl = (roomId) => {
  return `${BACKEND_BASE_URL}/${roomId}.json`;
};

// Get messages from backend JSON
export const fetchMessagesJSON = async (roomId) => {
  try {
    const url = getBackendUrl(roomId);
    console.log(`[SimpleSync] Fetching messages from ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      console.log(`[SimpleSync] Backend unavailable (${response.status}), using cache`);
      return getCachedMessages(roomId);
    }

    const data = await response.json();
    const messages = data.messages || [];
    
    // Cache messages
    cacheMessages(roomId, messages);
    
    console.log(`[SimpleSync] Fetched ${messages.length} messages from backend`);
    return messages;
  } catch (error) {
    console.error('[SimpleSync] Error fetching messages:', error);
    return getCachedMessages(roomId);
  }
};

// Send message to backend JSON
export const sendMessageJSON = async (roomId, userId, username, message, location, messageId) => {
  try {
    const newMessage = {
      id: messageId,
      userId,
      username,
      text: message,
      location,
      timestamp: Date.now()
    };

    console.log('[SimpleSync] Sending message:', newMessage);

    // Get existing messages
    const messages = await fetchMessagesJSON(roomId);
    
    // Add new message
    messages.push(newMessage);
    
    // Keep only last 100 messages
    const trimmed = messages.slice(-100);

    // Update backend JSON
    const url = getBackendUrl(roomId);
    const response = await fetch(url, {
      method: 'POST', // Or PUT depending on your backend
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        messages: trimmed,
        lastUpdate: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Cache updated messages
    cacheMessages(roomId, trimmed);

    console.log('[SimpleSync] Message sent successfully');
    return newMessage;
  } catch (error) {
    console.error('[SimpleSync] Error sending message:', error);
    
    // Fallback: Save to cache only
    const cached = getCachedMessages(roomId);
    cached.push({
      id: messageId,
      userId,
      username,
      text: message,
      location,
      timestamp: Date.now()
    });
    cacheMessages(roomId, cached.slice(-100));
    
    throw error;
  }
};

// Subscribe to messages with polling
export const subscribeToMessagesJSON = (roomId, callback) => {
  console.log(`[SimpleSync] Subscribing to ${roomId} with ${SYNC_INTERVAL}ms polling`);
  
  let lastMessageCount = 0;
  let lastTimestamp = 0;
  
  // Initial fetch
  fetchMessagesJSON(roomId).then(messages => {
    lastMessageCount = messages.length;
    lastTimestamp = Date.now();
    callback(messages);
  });
  
  // Poll for new messages
  const interval = setInterval(async () => {
    try {
      const messages = await fetchMessagesJSON(roomId);
      
      // Only callback if messages changed
      if (messages.length !== lastMessageCount || hasNewMessages(messages, lastTimestamp)) {
        console.log(`[SimpleSync] Messages updated: ${lastMessageCount} → ${messages.length}`);
        lastMessageCount = messages.length;
        lastTimestamp = Date.now();
        callback(messages);
      }
    } catch (error) {
      console.error('[SimpleSync] Polling error:', error);
    }
  }, SYNC_INTERVAL);
  
  // Return cleanup function
  return () => {
    console.log(`[SimpleSync] Unsubscribing from ${roomId}`);
    clearInterval(interval);
  };
};

// Check if there are new messages since last check
const hasNewMessages = (messages, lastTimestamp) => {
  return messages.some(msg => msg.timestamp > lastTimestamp);
};

// Cache messages in localStorage
const cacheMessages = (roomId, messages) => {
  try {
    const cache = JSON.parse(localStorage.getItem(MESSAGE_CACHE_KEY) || '{}');
    cache[roomId] = {
      messages,
      timestamp: Date.now()
    };
    localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cache));
    console.log(`[SimpleSync] Cached ${messages.length} messages for ${roomId}`);
  } catch (error) {
    console.error('[SimpleSync] Error caching messages:', error);
  }
};

// Get cached messages
const getCachedMessages = (roomId) => {
  try {
    const cache = JSON.parse(localStorage.getItem(MESSAGE_CACHE_KEY) || '{}');
    const roomCache = cache[roomId];
    
    if (roomCache && roomCache.messages) {
      console.log(`[SimpleSync] Using ${roomCache.messages.length} cached messages for ${roomId}`);
      return roomCache.messages;
    }
  } catch (error) {
    console.error('[SimpleSync] Error reading cache:', error);
  }
  
  return [];
};

// Calculate room ID
export const calculateRoomIdJSON = (location, roomType) => {
  if (roomType === 'worldwide') {
    return 'worldwide';
  } else if (roomType === 'country') {
    return 'country_us';
  } else if (roomType === 'nearby') {
    const lat = Math.round(location.lat * 2) / 2;
    const lng = Math.round(location.lng * 2) / 2;
    return `nearby_${lat}_${lng}`;
  }
  return 'worldwide';
};

// Clear cache for a room
export const clearCacheJSON = (roomId) => {
  try {
    const cache = JSON.parse(localStorage.getItem(MESSAGE_CACHE_KEY) || '{}');
    delete cache[roomId];
    localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cache));
    console.log(`[SimpleSync] Cleared cache for ${roomId}`);
  } catch (error) {
    console.error('[SimpleSync] Error clearing cache:', error);
  }
};

export default {
  fetchMessagesJSON,
  sendMessageJSON,
  subscribeToMessagesJSON,
  calculateRoomIdJSON,
  clearCacheJSON
};
