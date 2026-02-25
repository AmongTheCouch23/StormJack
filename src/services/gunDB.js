// Gun.js service for real-time P2P sync across devices
// Works on mobile AND desktop, syncs instantly across all devices!

import Gun from 'gun';

// Initialize Gun with localStorage first (works offline)
// Will attempt P2P sync when peers are available
const gun = Gun({
  peers: [], // Start with no peers - add them dynamically
  localStorage: true,
  radisk: true,
  multicast: false
});

console.log('[Gun] Initialized in localStorage mode');

// Try to connect to public peers
setTimeout(() => {
  console.log('[Gun] Attempting to connect to relay peers...');
  
  const peers = [
    'https://gun-matrix.herokuapp.com/gun',
    'https://gunjs.herokuapp.com/gun'  
  ];
  
  peers.forEach(peer => {
    gun.opt({ peers: [peer] });
    console.log(`[Gun] Attempting connection to ${peer}`);
  });
  
  // Test connection
  gun.get('_test_connection').put({ 
    test: Date.now(),
    client: 'stormjack'
  }, (ack) => {
    if (ack.err) {
      console.log('[Gun] Peer connection test failed, working in localStorage-only mode');
    } else {
      console.log('[Gun] Peer connection successful!');
    }
  });
}, 1000);

// Gun.js doesn't need separate auth - we'll use the existing local auth
// Just sync messages across devices

export const gunGetCurrentUser = () => {
  // Use existing local auth
  return null;
};

export const gunLogin = async (username, password) => {
  // Not used - use local auth instead
  return Promise.resolve(null);
};

export const gunLogout = () => {
  // Not used - use local auth instead
  return Promise.resolve();
};

export const gunCheckUsernameAvailable = async (username) => {
  return true;
};

export const gunSetUsername = async (userId, username) => {
  return Promise.resolve(true);
};

export const gunGetUserData = async (userId) => {
  return null;
};

// Real-time Chat with Gun.js

export const gunSendMessage = async (roomId, userId, username, message, location, messageId = null) => {
  const newMessage = {
    id: messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    username,
    text: message,
    location: location || null,
    timestamp: Date.now()
  };
  
  console.log('[Gun] Sending message:', newMessage);
  
  // Save to Gun.js - syncs to ALL peers!
  return new Promise((resolve, reject) => {
    gun.get('stormjack_messages')
       .get(roomId)
       .get(newMessage.id)
       .put(newMessage, (ack) => {
         if (ack.err) {
           console.error('[Gun] Error saving message:', ack.err);
           reject(new Error(ack.err));
         } else {
           console.log('[Gun] Message saved successfully:', newMessage.id);
           resolve(newMessage);
         }
       });
  });
};

export const gunSubscribeToMessages = (roomId, callback) => {
  console.log(`[Gun] Subscribing to messages in room: ${roomId}`);
  
  const messages = {};
  let updateTimeout = null;
  let callbackCount = 0;
  
  const triggerUpdate = () => {
    // Debounce updates slightly to avoid too many renders
    if (updateTimeout) clearTimeout(updateTimeout);
    
    updateTimeout = setTimeout(() => {
      // Convert to array and sort
      const messagesArray = Object.values(messages)
        .filter(m => m && m.id) // Ensure valid messages
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        .slice(-100); // Keep last 100
      
      callbackCount++;
      console.log(`[Gun] Triggering callback #${callbackCount} with ${messagesArray.length} messages:`, messagesArray.map(m => m.id));
      callback(messagesArray);
    }, 50); // 50ms debounce
  };
  
  // Listen to Gun.js room - real-time sync across ALL devices!
  const gunRef = gun.get('stormjack_messages').get(roomId).map();
  
  gunRef.on((data, id) => {
    console.log(`[Gun] .on() fired - id: ${id}, data:`, data);
    
    if (data && data.id) {
      messages[id] = data;
      console.log(`[Gun] Message stored: ${data.id}, total in memory: ${Object.keys(messages).length}`);
      triggerUpdate();
    } else if (data === null && messages[id]) {
      // Message was deleted
      delete messages[id];
      console.log(`[Gun] Message deleted: ${id}, remaining: ${Object.keys(messages).length}`);
      triggerUpdate();
    }
  });
  
  // Cleanup function
  return () => {
    console.log(`[Gun] Unsubscribing from ${roomId}, total callbacks fired: ${callbackCount}`);
    if (updateTimeout) clearTimeout(updateTimeout);
    gunRef.off();
  };
};

// Calculate room ID (same as Firebase version)
export const gunCalculateRoomId = (location, roomType) => {
  if (roomType === 'worldwide') {
    return 'worldwide';
  } else if (roomType === 'country') {
    return 'country_us'; // Default to US
  } else if (roomType === 'nearby') {
    const lat = Math.round(location.lat * 2) / 2;
    const lng = Math.round(location.lng * 2) / 2;
    return `nearby_${lat}_${lng}`;
  }
  return 'worldwide';
};

export { gun };
