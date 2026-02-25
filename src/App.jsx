/* global L */
import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Users, Globe, MapPin, Send, Settings, LogOut, Layers, Zap, Target, Wind, Droplets, ChevronLeft, ChevronRight, Play, Pause, Menu, X, ChevronDown, Archive } from 'lucide-react';
import { auth, logOut, sendMessage, subscribeToMessages, calculateRoomId, isFirebaseConfigured } from './services/firebase';
import { localGetCurrentUser, localSignOut, localGetUserData, localSendMessage, localSubscribeToMessages } from './services/localAuth';
import { gunGetCurrentUser, gunLogout, gunSendMessage, gunSubscribeToMessages, gunCalculateRoomId } from './services/gunDB';
import { sendMessageJSON, subscribeToMessagesJSON, calculateRoomIdJSON } from './services/simpleSync';
import { censorText, initFilterAutoUpdate } from './services/profanityFilter';
import { formatDistanceToNow } from 'date-fns';
import AuthScreen from './components/AuthScreen';

const App = () => {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState('worldwide'); // Default to global chat
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [location, setLocation] = useState(null);
  const [radarLayer, setRadarLayer] = useState(null);
  const [radarProduct, setRadarProduct] = useState('reflectivity');
  const [showLightning, setShowLightning] = useState(false);
  const [showStormTracks, setShowStormTracks] = useState(false);
  const [showStormCells, setShowStormCells] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [baseLayer, setBaseLayer] = useState('dark');
  const baseLayersRef = useRef({});
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  
  // Radar animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [radarFrames, setRadarFrames] = useState([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [timeRange, setTimeRange] = useState(30); // Reduced to 30 minutes default to avoid rate limits
  const animationIntervalRef = useRef(null);
  
  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  
  // Sync mode: 'gun' (real-time P2P) or 'local' (localStorage only)
  const [syncMode, setSyncMode] = useState('json'); // Default to JSON for backend file sync
  
  // Weather warnings state
  const [activeWarnings, setActiveWarnings] = useState([]);
  const [selectedWarning, setSelectedWarning] = useState(null);
  
  // Chat archive state
  const [archivedMessages, setArchivedMessages] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  
  // Device orientation state
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [showHeadingCone, setShowHeadingCone] = useState(false);
  const headingConeRef = useRef(null);
  
  // Messages auto-scroll ref
  const messagesEndRef = useRef(null);
  
  // Track last message update time (for mobile debugging)
  const [lastMessageUpdate, setLastMessageUpdate] = useState(Date.now());
  
  const mapRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Monitor auth state
  useEffect(() => {
    // Check if Firebase is configured
    if (!isFirebaseConfigured()) {
      // Firebase not configured, check local auth
      const localUser = localGetCurrentUser();
      if (localUser && localUser.username) {
        setUser(localUser);
        setUsername(localUser.username);
      }
      setLoading(false);
      return;
    }

    // Firebase is configured, set up auth listener
    import('firebase/auth').then(({ onAuthStateChanged }) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          // User is signed in, fetch username from database
          import('./services/firebase').then(({ getUserData }) => {
            getUserData(user.uid).then(userData => {
              if (userData && userData.username) {
                setUser(user);
                setUsername(userData.username);
                setLoading(false);
              } else {
                // User signed in but no username set
                setUser(null);
                setLoading(false);
              }
            }).catch(err => {
              console.error('Error getting user data:', err);
              setLoading(false);
            });
          });
        } else {
          setUser(null);
          setLoading(false);
        }
      });

      return () => unsubscribe();
    }).catch(err => {
      console.error('Error setting up auth listener:', err);
      setLoading(false);
    });
  }, []);

  // Initialize profanity filter
  useEffect(() => {
    try {
      console.log('[App] Initializing profanity filter...');
      initFilterAutoUpdate();
    } catch (error) {
      console.error('[App] Error initializing profanity filter:', error);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!user) return;

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      console.log('Leaflet loaded');
      setLeafletLoaded(true);
    };
    document.body.appendChild(script);

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {
          setLocation({ lat: 39.8283, lng: -98.5795 });
        }
      );
    } else {
      setLocation({ lat: 39.8283, lng: -98.5795 });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [user]);

  // Subscribe to chat messages
  useEffect(() => {
    if (!user || !location) return;

    console.log(`[Chat] Current sync mode: ${syncMode}`);

    // JSON mode - Backend JSON file sync
    if (syncMode === 'json') {
      const roomId = calculateRoomIdJSON(location, activeRoom);
      console.log(`[JSON] Subscribing to room: ${roomId}`);
      
      const unsubscribe = subscribeToMessagesJSON(roomId, (msgs) => {
        console.log(`[JSON] Messages updated: ${msgs.length} messages`);
        setMessages(msgs);
        setLastMessageUpdate(Date.now());
      });
      
      return () => {
        unsubscribe();
      };
    }

    // Local mode (default) - Fast and reliable, cross-tab sync
    else if (syncMode === 'local' || !syncMode) {
      const roomId = `local_${activeRoom}`;
      console.log(`[Local] Subscribing to room: ${roomId}`);
      
      const unsubscribe = localSubscribeToMessages(roomId, (msgs) => {
        console.log(`[Local] Messages updated: ${msgs.length} messages`);
        setMessages(msgs);
        setLastMessageUpdate(Date.now());
      });
      
      return () => {
        unsubscribe();
      };
    }

    // Gun.js mode - P2P sync (optional)
    else if (syncMode === 'gun') {
      const roomId = gunCalculateRoomId(location, activeRoom);
      console.log(`[Gun] Subscribing to room: ${roomId}`);
      
      const unsubscribe = gunSubscribeToMessages(roomId, (msgs) => {
        console.log(`[Gun] Subscription callback fired with ${msgs.length} messages`);
        
        // Filter messages - only show last 5 hours
        const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000);
        const recentMessages = msgs.filter(m => m.timestamp > fiveHoursAgo);
        const oldMessages = msgs.filter(m => m.timestamp <= fiveHoursAgo);
        
        // Merge with any optimistic messages (keep optimistic if not yet in Gun.js)
        setMessages(prevMessages => {
          const optimisticMessages = prevMessages.filter(m => m.optimistic);
          const gunMessageIds = new Set(recentMessages.map(m => m.id));
          
          // Remove optimistic messages that are now in Gun.js
          const stillOptimistic = optimisticMessages.filter(m => !gunMessageIds.has(m.id));
          
          // Combine Gun.js messages with remaining optimistic ones
          const combined = [...recentMessages, ...stillOptimistic]
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          
          console.log(`[Gun] Setting ${combined.length} messages (${recentMessages.length} from Gun, ${stillOptimistic.length} optimistic)`);
          return combined;
        });
        
        // Archive old messages (5+ hours old)
        if (oldMessages.length > 0) {
          setArchivedMessages(prev => {
            const combined = [...prev, ...oldMessages];
            // Remove duplicates
            const unique = combined.filter((msg, idx, arr) => 
              arr.findIndex(m => m.id === msg.id) === idx
            );
            // Keep only messages less than 30 days old
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            return unique.filter(m => m.timestamp > thirtyDaysAgo);
          });
        }
        
        setLastMessageUpdate(Date.now());
      });
      
      return () => {
        unsubscribe();
      };
    }

    // Local mode - Fast but device-only
    else if (syncMode === 'local') {
      const roomId = `local_${activeRoom}`;
      console.log(`[Local] Subscribing to room: ${roomId}`);
      
      const unsubscribe = localSubscribeToMessages(roomId, (msgs) => {
        console.log(`[Local] Messages updated: ${msgs.length} messages`);
        setMessages(msgs);
        setLastMessageUpdate(Date.now());
      });
      
      return () => {
        unsubscribe();
      };
    }

    // Firebase mode (if configured)
    else if (isFirebaseConfigured()) {
      const roomId = calculateRoomId(location, activeRoom);
      console.log(`[Firebase] Subscribing to room: ${roomId}`);
      
      // Unsubscribe from previous room
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      // Subscribe to new room
      unsubscribeRef.current = subscribeToMessages(roomId, (msgs) => {
        setMessages(msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
        setLastMessageUpdate(Date.now());
      });

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [user, location, activeRoom, syncMode]);

  // Auto-scroll to bottom when new messages arrive (Twitch-style)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Initialize map when both Leaflet is loaded and location is available
  useEffect(() => {
    if (leafletLoaded && location && !mapRef.current) {
      console.log('Both Leaflet and location ready, initializing map...');
      initMap();
    }
  }, [leafletLoaded, location]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth < 768;
      setIsMobile(isMobileDevice);
      if (isMobileDevice) {
        setControlsCollapsed(true);
        setChatCollapsed(true);
      }
    };
    
    checkMobile();
    
    // Only listen to actual window resize, not visualViewport
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkMobile, 150);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Keyboard detection for mobile (prevent chat collapse when keyboard opens)
  useEffect(() => {
    if (!isMobile) return;

    // Store the initial viewport height
    const initialViewportHeight = window.innerHeight;
    
    const handleViewportResize = () => {
      // visualViewport is more reliable for keyboard detection
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;
        const heightDifference = initialViewportHeight - currentHeight;
        
        // If height decreased by more than 150px, keyboard is open
        const keyboardOpen = heightDifference > 150;
        setIsKeyboardOpen(keyboardOpen);
        
        console.log(`[Mobile] Keyboard ${keyboardOpen ? 'open' : 'closed'}, height diff: ${heightDifference}px`);
      }
    };

    if (window.visualViewport) {
      // Use visualViewport for keyboard detection (doesn't trigger layout resize)
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
      
      return () => {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      };
    }
  }, [isMobile]);

  // Resize map when chat is toggled (so it fills the new space)
  // But NOT when keyboard opens (isKeyboardOpen)
  useEffect(() => {
    if (mapRef.current && !isKeyboardOpen) {
      // Delay to let CSS transition complete
      setTimeout(() => {
        mapRef.current.invalidateSize();
        console.log('Map resized after chat toggle');
      }, 350); // Slightly longer than 300ms transition
    }
  }, [chatCollapsed, isKeyboardOpen]);

  // Device orientation tracking (mobile) and mouse heading (desktop)
  useEffect(() => {
    const handleOrientation = (event) => {
      // Get compass heading (0 = North, 90 = East, 180 = South, 270 = West)
      let heading = event.webkitCompassHeading || event.alpha;
      
      if (heading !== null) {
        // Normalize heading to 0-360
        if (event.webkitCompassHeading === undefined) {
          // Android uses alpha, need to convert
          heading = 360 - heading;
        }
        
        setDeviceHeading(heading);
        
        // Update heading cone on map
        if (mapRef.current && showHeadingCone && location) {
          updateHeadingCone(mapRef.current, location, heading);
        }
      }
    };

    // Desktop: Use mouse position relative to location marker
    const handleMouseMove = (event) => {
      if (!isMobile && showHeadingCone && mapRef.current && location) {
        const map = mapRef.current;
        const centerPoint = map.latLngToContainerPoint([location.lat, location.lng]);
        
        // Calculate angle from center to mouse
        const dx = event.clientX - centerPoint.x;
        const dy = centerPoint.y - event.clientY; // Inverted Y axis
        
        // Calculate heading (0 = North, clockwise)
        let heading = (Math.atan2(dx, dy) * 180 / Math.PI);
        if (heading < 0) heading += 360;
        
        setDeviceHeading(heading);
        updateHeadingCone(map, location, heading);
      }
    };

    // Request permission for iOS 13+
    const requestOrientationPermission = async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' && 
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            setShowHeadingCone(true);
          }
        } catch (error) {
          console.log('Orientation permission denied:', error);
        }
      } else {
        // Non-iOS or older iOS
        window.addEventListener('deviceorientation', handleOrientation);
        setShowHeadingCone(true);
      }
    };

    // Auto-enable on mobile
    if (isMobile) {
      requestOrientationPermission();
    } else if (showHeadingCone) {
      // Desktop: Use mouse movement
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMobile, showHeadingCone, location]);

  // Update heading cone visualization
  const updateHeadingCone = (map, center, heading) => {
    // Remove old cone
    if (headingConeRef.current) {
      map.removeLayer(headingConeRef.current);
    }

    // Create cone shape (60-degree field of view, like RadarScope)
    const fov = 60; // degrees
    const radius = 500; // meters
    
    // Calculate cone points
    const startAngle = heading - fov / 2;
    const endAngle = heading + fov / 2;
    
    // Create semi-circle for the cone
    const points = [[center.lat, center.lng]]; // Start at center
    
    for (let angle = startAngle; angle <= endAngle; angle += 5) {
      const rad = (angle * Math.PI) / 180;
      const dx = radius * Math.sin(rad);
      const dy = radius * Math.cos(rad);
      
      // Convert meters to lat/lng (approximate)
      const newLat = center.lat + (dy / 111320);
      const newLng = center.lng + (dx / (111320 * Math.cos(center.lat * Math.PI / 180)));
      
      points.push([newLat, newLng]);
    }
    
    points.push([center.lat, center.lng]); // Close the shape
    
    // Create polygon
    const cone = L.polygon(points, {
      color: '#4da6ff',
      fillColor: '#4da6ff',
      fillOpacity: 0.3,
      weight: 2,
      opacity: 0.7
    }).addTo(map);
    
    headingConeRef.current = cone;
  };

  // Convert heading degrees to cardinal direction
  const getCardinalDirection = (heading) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((heading % 360) / 45)) % 8;
    return directions[index];
  };

  // Fetch weather warnings for user's location
  useEffect(() => {
    if (!location) return;

    const fetchWarnings = async () => {
      try {
        // NOAA Weather Alerts API
        const response = await fetch(
          `https://api.weather.gov/alerts/active?point=${location.lat},${location.lng}`
        );
        
        if (response.ok) {
          const data = await response.json();
          const warnings = data.features.map(feature => {
            // Calculate center point from geometry
            let centerLat = location.lat;
            let centerLng = location.lng;
            
            if (feature.geometry && feature.geometry.coordinates) {
              const coords = feature.geometry.coordinates;
              if (feature.geometry.type === 'Polygon' && coords[0]) {
                // Average all points for center
                const points = coords[0];
                const sumLat = points.reduce((sum, p) => sum + p[1], 0);
                const sumLng = points.reduce((sum, p) => sum + p[0], 0);
                centerLat = sumLat / points.length;
                centerLng = sumLng / points.length;
              }
            }
            
            return {
              id: feature.properties.id,
              type: feature.properties.event,
              headline: feature.properties.headline,
              description: feature.properties.description,
              instruction: feature.properties.instruction,
              severity: feature.properties.severity,
              urgency: feature.properties.urgency,
              certainty: feature.properties.certainty,
              onset: feature.properties.onset,
              expires: feature.properties.expires,
              area: feature.properties.areaDesc,
              senderName: feature.properties.senderName,
              centerLat,
              centerLng,
              geometry: feature.geometry
            };
          });
          
          setActiveWarnings(warnings);
          console.log(`[Warnings] Found ${warnings.length} active alerts`);
        }
      } catch (error) {
        console.error('[Warnings] Error fetching alerts:', error);
      }
    };

    // Fetch immediately
    fetchWarnings();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchWarnings, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [location]);

  // Fetch radar frames for animation
  useEffect(() => {
    const fetchRadarFrames = async () => {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        
        if (data.radar && data.radar.past) {
          // Get frames based on time range (each frame is ~10 minutes apart)
          const frameCount = Math.min(Math.floor(timeRange / 10), data.radar.past.length);
          const frames = data.radar.past.slice(-frameCount);
          setRadarFrames(frames);
          setCurrentFrameIndex(frames.length - 1); // Start at most recent
        }
      } catch (err) {
        console.error('Error fetching radar frames:', err);
      }
    };

    fetchRadarFrames();
    // Reduced refresh rate to 10 minutes to avoid rate limiting
    const interval = setInterval(fetchRadarFrames, 600000); // Every 10 minutes instead of 5
    return () => clearInterval(interval);
  }, [timeRange]);

  // Radar animation playback
  useEffect(() => {
    if (isPlaying && radarFrames.length > 0) {
      // Slower playback (1 frame per 2 seconds) to reduce tile requests
      animationIntervalRef.current = setInterval(() => {
        setCurrentFrameIndex(prev => {
          if (prev >= radarFrames.length - 1) {
            return 0; // Loop back to start
          }
          return prev + 1;
        });
      }, 2000); // 2 seconds per frame instead of 500ms to reduce API calls
    } else {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    }

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, [isPlaying, radarFrames]);

  // Fetch weather warnings/watches from NOAA
  useEffect(() => {
    if (!location) return;

    const fetchWarnings = async () => {
      try {
        // NOAA NWS API - get active alerts for location
        const response = await fetch(
          `https://api.weather.gov/alerts/active?point=${location.lat},${location.lng}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const warnings = data.features.map(feature => ({
            id: feature.properties.id,
            type: feature.properties.event,
            severity: feature.properties.severity,
            certainty: feature.properties.certainty,
            urgency: feature.properties.urgency,
            headline: feature.properties.headline,
            description: feature.properties.description,
            instruction: feature.properties.instruction,
            areaDesc: feature.properties.areaDesc,
            onset: feature.properties.onset,
            expires: feature.properties.expires,
            senderName: feature.properties.senderName
          }));
          
          setActiveWarnings(warnings);
          console.log(`[Warnings] ${warnings.length} active alerts found`);
        } else {
          setActiveWarnings([]);
        }
      } catch (error) {
        console.error('[Warnings] Error fetching:', error);
      }
    };

    // Fetch immediately
    fetchWarnings();
    
    // Refresh every 2 minutes
    const interval = setInterval(fetchWarnings, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [location]);

  // Update radar layer when frame changes
  useEffect(() => {
    if (mapRef.current && radarFrames.length > 0 && radarFrames[currentFrameIndex]) {
      updateRadarFrame(mapRef.current, radarFrames[currentFrameIndex]);
    }
  }, [currentFrameIndex, radarFrames]);

  // Auto-scroll messages to bottom when new messages arrive (like Twitch chat)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const initMap = () => {
    if (typeof L === 'undefined' || !location) return;

    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: false,  // Disable wrapping to next world copy
      maxBounds: [[-90, -180], [90, 180]],  // Constrain to one world
      maxBoundsViscosity: 1.0,  // Make bounds stick
      minZoom: 3,  // Can't zoom out past whole world view
      maxZoom: 18  // Can zoom in quite far
    }).setView([location.lat, location.lng], 7);

    // Create multiple base layers
    const layers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: 'CartoDB',
        noWrap: true
      }),
      light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: 'CartoDB',
        noWrap: true
      }),
      street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: 'OpenStreetMap',
        noWrap: true
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri',
        noWrap: true
      }),
      hybrid: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri',
        noWrap: true
      }),
      terrain: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Esri',
        noWrap: true
      })
    };

    // Add labels layer for hybrid mode
    const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      pane: 'shadowPane'
    });

    // Store layers in ref
    baseLayersRef.current = { ...layers, labelsLayer };
    console.log('Base layers initialized:', Object.keys(baseLayersRef.current));

    // Add initial base layer
    layers[baseLayer].addTo(map);
    console.log('Initial base layer added:', baseLayer);
    if (baseLayer === 'hybrid') {
      labelsLayer.addTo(map);
    }

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add user marker
    const userIcon = L.divIcon({
      className: 'user-marker',
      html: '<div style="background: #4da6ff; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 20px #4da6ff;"></div>',
      iconSize: [14, 14]
    });
    L.marker([location.lat, location.lng], { icon: userIcon }).addTo(map);

    mapRef.current = map;

    updateRadar(map);
    setInterval(() => updateRadar(map), 300000);
  };

  const switchBaseLayer = (newLayer) => {
    if (!mapRef.current || !baseLayersRef.current) {
      console.warn('Map or layers not initialized');
      return;
    }

    const map = mapRef.current;
    const layers = baseLayersRef.current;

    // Remove all base layers (don't check hasLayer, just try to remove)
    Object.keys(layers).forEach(key => {
      if (key !== 'labelsLayer' && layers[key]) {
        try {
          map.removeLayer(layers[key]);
        } catch (e) {
          // Layer wasn't on map, that's fine
        }
      }
    });

    // Remove labels layer
    if (layers.labelsLayer) {
      try {
        map.removeLayer(layers.labelsLayer);
      } catch (e) {
        // Layer wasn't on map, that's fine
      }
    }

    // Add new base layer
    if (layers[newLayer]) {
      layers[newLayer].addTo(map);
      
      // Add labels for hybrid mode
      if (newLayer === 'hybrid' && layers.labelsLayer) {
        layers.labelsLayer.addTo(map);
      }
      
      setBaseLayer(newLayer);
      console.log('Switched to base layer:', newLayer);
    } else {
      console.error('Layer not found:', newLayer);
    }
  };

  const updateRadar = (map) => {
    if (!map) return;

    if (radarLayer) {
      map.removeLayer(radarLayer);
    }

    // Get current radar product config
    const currentProduct = radarProducts.find(p => p.id === radarProduct);
    if (!currentProduct) return;

    // Use NOAA NEXRAD Ridge Radar - official government source, no API key needed
    // Different WMS layers for different products
    const baseUrl = 'https://opengeo.ncep.noaa.gov/geoserver/conus';
    const wmsUrl = `${baseUrl}/${currentProduct.wmsLayer}/ows`;
    
    const layer = L.tileLayer.wms(wmsUrl, {
      layers: currentProduct.wmsLayer,
      format: 'image/png',
      transparent: true,
      opacity: radarOpacity,
      zIndex: 1000,
      attribution: 'NOAA/NWS'
    }).addTo(map);

    setRadarLayer(layer);
    console.log(`NOAA NEXRAD radar loaded: ${currentProduct.label}`);
  };

  const updateRadarFrame = (map, frame) => {
    if (!map || !frame) return;

    if (radarLayer) {
      map.removeLayer(radarLayer);
    }

    // Use RainViewer for animation (has historical frames)
    const radarUrl = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    
    const layer = L.tileLayer(radarUrl, {
      opacity: radarOpacity,
      zIndex: 1000,
      attribution: 'RainViewer'
    }).addTo(map);

    setRadarLayer(layer);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user) return;

    const messageText = inputMessage;
    setInputMessage(''); // Clear input immediately for better UX

    console.log(`[Chat] Sending message using ${syncMode} mode`);

    // JSON mode - Backend JSON file sync
    if (syncMode === 'json') {
      const roomId = calculateRoomIdJSON(location, activeRoom);
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Optimistic UI update
      const optimisticMessage = {
        id: messageId,
        userId: user.uid,
        username: username,
        text: messageText,
        location: location || null,
        timestamp: Date.now()
      };
      
      // Add to UI immediately
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Send to backend JSON
      sendMessageJSON(roomId, user.uid, username, messageText, location, messageId)
        .then(() => {
          console.log('[JSON] Message sent to backend');
        })
        .catch(err => {
          console.error('[JSON] Error sending message:', err);
          alert('Failed to send message to backend - check if server is running');
          setInputMessage(messageText);
          setMessages(prev => prev.filter(m => m.id !== messageId));
        });
      return;
    }

    // Local mode (default) - Fast and reliable
    else if (syncMode === 'local' || !syncMode) {
      const roomId = `local_${activeRoom}`;
      localSendMessage(roomId, user.uid, username, messageText, location)
        .then(() => {
          console.log('[Local] Message sent');
          // Force immediate refresh
          setTimeout(() => {
            const stored = localStorage.getItem(`stormjack_messages_${roomId}`);
            if (stored) {
              const msgs = JSON.parse(stored);
              setMessages(msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
            }
          }, 10);
        })
        .catch(err => {
          console.error('Error sending message:', err);
          alert('Failed to send message');
          setInputMessage(messageText);
        });
      return;
    }

    // Gun.js mode - P2P sync (optional)
    else if (syncMode === 'gun') {
      const roomId = gunCalculateRoomId(location, activeRoom);
      
      // Generate message ID once (used for both optimistic and Gun.js)
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create optimistic message
      const optimisticMessage = {
        id: messageId,
        userId: user.uid,
        username: username,
        text: messageText,
        location: location || null,
        timestamp: Date.now(),
        optimistic: true // Mark as optimistic
      };
      
      // Add to UI immediately (optimistic update)
      console.log('[Gun] Adding optimistic message:', optimisticMessage.id);
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Then send to Gun.js with the same ID
      gunSendMessage(roomId, user.uid, username, messageText, location, messageId)
        .then((sentMessage) => {
          console.log('[Gun] Message sent successfully:', sentMessage.id);
          // Remove optimistic flag when confirmed from Gun.js subscription
        })
        .catch(err => {
          console.error('[Gun] Error sending message:', err);
          alert('Failed to send message');
          setInputMessage(messageText);
          // Remove optimistic message on error
          setMessages(prev => prev.filter(m => m.id !== messageId));
        });
      return;
    }

    // Local mode - Fast but device-only
    else if (syncMode === 'local') {
      const roomId = `local_${activeRoom}`;
      localSendMessage(roomId, user.uid, username, messageText, location)
        .then(() => {
          console.log('[Local] Message sent');
          // Force immediate refresh
          setTimeout(() => {
            const stored = localStorage.getItem(`stormjack_messages_${roomId}`);
            if (stored) {
              const msgs = JSON.parse(stored);
              setMessages(msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
            }
          }, 10);
        })
        .catch(err => {
          console.error('Error sending message:', err);
          alert('Failed to send message');
          setInputMessage(messageText);
        });
      return;
    }

    // Firebase mode (if configured)
    else if (isFirebaseConfigured()) {
      const roomId = calculateRoomId(location, activeRoom);
      sendMessage(roomId, user.uid, username, messageText, location)
        .then(() => {
          console.log('[Firebase] Message sent');
        })
        .catch(err => {
          console.error('Error sending message:', err);
          alert('Failed to send message');
          setInputMessage(messageText);
        });
    }
  };

  const handleLogout = async () => {
    try {
      // Check if Firebase is configured
      if (isFirebaseConfigured()) {
        await logOut();
      } else {
        localSignOut();
      }
      
      setUser(null);
      setUsername('');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleWarningClick = (warning) => {
    if (mapRef.current && warning.centerLat && warning.centerLng) {
      // Pan and zoom to warning location
      mapRef.current.setView([warning.centerLat, warning.centerLng], 10, {
        animate: true,
        duration: 1
      });
      
      console.log(`[Warnings] Navigated to: ${warning.type} at ${warning.area}`);
    }
  };

  const handleAuthSuccess = (authUser, newUsername) => {
    setUser(authUser);
    setUsername(newUsername);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (mapRef.current) {
      updateRadar(mapRef.current);
    }
  }, [radarProduct, radarOpacity]);

  const roomConfig = {
    worldwide: {
      icon: Globe,
      label: 'Global Chat',
      color: '#00d4ff',
      description: 'Everyone online'
    },
    nearby: {
      icon: MapPin,
      label: 'Nearby',
      color: '#4da6ff',
      description: '50 mi radius'
    },
    country: {
      icon: Users,
      label: 'Country',
      color: '#0080ff',
      description: 'National'
    },
    archive: {
      icon: Archive,
      label: 'Archive',
      color: '#6b9bd1',
      description: '5hr+ old messages'
    }
  };

  const radarProducts = [
    { 
      id: 'reflectivity', 
      label: 'Base Reflectivity',
      icon: Droplets,
      description: 'Precipitation intensity',
      wmsLayer: 'conus_bref_qcd',
      legend: 'dBZ',
      colors: ['#04E9E7', '#019FF4', '#0000F6', '#00FF00', '#00C800', '#009000', '#FFFF00', '#E7C000', '#FF9000', '#FF0000', '#D60000', '#C00000', '#FF00FF', '#9955C9'],
      values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
    },
    { 
      id: 'velocity', 
      label: 'Base Velocity',
      icon: Wind,
      description: 'Wind speed/direction',
      wmsLayer: 'conus_bvel_qcd',
      legend: 'knots',
      colors: ['#00FF00', '#00C800', '#009000', '#006400', '#646464', '#640000', '#C00000', '#FF0000', '#FF00FF'],
      values: [-70, -50, -30, -10, 0, 10, 30, 50, 70]
    },
    { 
      id: 'composite', 
      label: 'Composite Refl.',
      icon: Layers,
      description: 'Max column reflectivity',
      wmsLayer: 'conus_cref_qcd',
      legend: 'dBZ',
      colors: ['#04E9E7', '#019FF4', '#0000F6', '#00FF00', '#00C800', '#009000', '#FFFF00', '#E7C000', '#FF9000', '#FF0000', '#D60000', '#C00000', '#FF00FF', '#9955C9'],
      values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
    },
    { 
      id: 'spectrum', 
      label: 'Spectrum Width',
      icon: Wind,
      description: 'Turbulence indicator',
      wmsLayer: 'conus_srmv_qcd',
      legend: 'm/s',
      colors: ['#646464', '#00FF00', '#00C800', '#009000', '#FFFF00', '#FF9000', '#FF0000', '#C00000'],
      values: [0, 2, 4, 6, 8, 10, 12, 14]
    },
    { 
      id: 'differential', 
      label: 'Diff. Reflectivity',
      icon: Zap,
      description: 'Particle shape (ZDR)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'dB',
      colors: ['#9955C9', '#0000F6', '#04E9E7', '#00FF00', '#FFFF00', '#FF9000', '#FF0000', '#C00000'],
      values: [-2, 0, 1, 2, 3, 4, 5, 6]
    },
    { 
      id: 'correlation', 
      label: 'Correlation Coeff.',
      icon: Target,
      description: 'Data quality (CC)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'ratio',
      colors: ['#FF00FF', '#9955C9', '#FF0000', '#FF9000', '#FFFF00', '#00FF00', '#00C800'],
      values: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
    },
    { 
      id: 'tops', 
      label: 'Echo Tops',
      icon: Layers,
      description: 'Storm height (EET)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'kft',
      colors: ['#04E9E7', '#0000F6', '#00FF00', '#009000', '#FFFF00', '#FF9000', '#FF0000', '#C00000', '#FF00FF'],
      values: [5, 10, 15, 20, 25, 30, 35, 40, 50]
    },
    { 
      id: 'vil', 
      label: 'Vert. Int. Liquid',
      icon: Droplets,
      description: 'Water content (VIL)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'kg/m²',
      colors: ['#04E9E7', '#0000F6', '#00FF00', '#009000', '#FFFF00', '#FF9000', '#FF0000', '#C00000', '#FF00FF'],
      values: [5, 10, 15, 20, 25, 30, 40, 50, 60]
    },
    { 
      id: 'storm_relative', 
      label: 'Storm Rel. Velocity',
      icon: Wind,
      description: 'Storm motion (SRV)',
      wmsLayer: 'conus_srmv_qcd',
      legend: 'knots',
      colors: ['#00FF00', '#00C800', '#009000', '#006400', '#646464', '#640000', '#C00000', '#FF0000', '#FF00FF'],
      values: [-70, -50, -30, -10, 0, 10, 30, 50, 70]
    },
    { 
      id: 'hydro', 
      label: 'Hydrometeor Class',
      icon: Droplets,
      description: 'Precip type (HC)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'type',
      colors: ['#646464', '#04E9E7', '#0000F6', '#00FF00', '#FFFF00', '#FF9000', '#FF0000', '#FF00FF', '#9955C9', '#FFFFFF'],
      values: ['None', 'Bio', 'GC', 'IC', 'DS', 'WS', 'RA', 'HR', 'RH', 'Unknown']
    },
    { 
      id: 'phase', 
      label: 'Specific Diff. Phase',
      icon: Zap,
      description: 'Phase shift (KDP)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'deg/km',
      colors: ['#646464', '#0000F6', '#04E9E7', '#00FF00', '#FFFF00', '#FF9000', '#FF0000', '#C00000'],
      values: [0, 0.5, 1, 1.5, 2, 3, 4, 5]
    },
    { 
      id: 'one_hour', 
      label: 'One-Hour Precip',
      icon: Droplets,
      description: '1hr accumulation (OHP)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'inches',
      colors: ['#646464', '#04E9E7', '#0000F6', '#00FF00', '#FFFF00', '#FF9000', '#FF0000', '#C00000'],
      values: [0, 0.1, 0.25, 0.5, 1, 2, 3, 4]
    },
    { 
      id: 'storm_total', 
      label: 'Storm Total Precip',
      icon: Droplets,
      description: 'Total accumulation (STP)',
      wmsLayer: 'conus_bref_qcd',
      legend: 'inches',
      colors: ['#646464', '#04E9E7', '#0000F6', '#00FF00', '#FFFF00', '#FF9000', '#FF0000', '#C00000', '#FF00FF'],
      values: [0, 0.5, 1, 2, 3, 4, 5, 6, 8]
    }
  ];

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        background: '#0a1628',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#4da6ff',
        fontFamily: "'JetBrains Mono', monospace"
      }}>
        <img 
          src="/assets/logo.svg" 
          alt="Loading..." 
          style={{ width: '64px', height: '64px' }}
          className="pulse"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      background: '#0a1628',
      color: '#e0e0e0',
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #1a2642 100%)',
        borderBottom: '1px solid #4da6ff44',
        padding: isMobile ? '10px 12px' : '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(77, 166, 255, 0.15)',
        zIndex: 1000,
        flexWrap: isMobile ? 'wrap' : 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'transparent',
            border: '2px solid #4da6ff',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            boxShadow: '0 0 15px rgba(77, 166, 255, 0.4)'
          }}>
            <img 
              src="/assets/logo.svg" 
              alt="StormJack" 
              style={{ width: '24px', height: '24px', display: 'block' }}
            />
          </div>
          <div style={{ display: isMobile ? 'none' : 'block' }}>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '700',
              letterSpacing: '2px',
              background: 'linear-gradient(135deg, #4da6ff 0%, #00d4ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              STORMJACK
            </h1>
            <p style={{
              margin: 0,
              fontSize: '10px',
              color: '#6b9bd1',
              letterSpacing: '0.5px'
            }}>
              WEATHER INTELLIGENCE • {radarProducts.find(p => p.id === radarProduct)?.label.toUpperCase()}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: '#1a2642',
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #4da6ff33',
            fontSize: '12px',
            color: '#4da6ff',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00ff88',
              boxShadow: '0 0 8px #00ff88'
            }} />
            {username}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid #2a4570',
              padding: '6px 12px',
              borderRadius: '6px',
              color: '#6b9bd1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map - Expands when chat is collapsed */}
        <div style={{ 
          flex: 1, 
          position: 'relative', 
          zIndex: 1,
          width: chatCollapsed ? '100%' : 'calc(100% - 380px)',
          transition: 'width 0.3s ease-in-out'
        }}>
          <div id="map" style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}></div>
          
          {/* Compass Heading Indicator */}
          {showHeadingCone && deviceHeading !== null && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(10, 22, 40, 0.95)',
              border: '2px solid #4da6ff',
              borderRadius: '50%',
              width: '80px',
              height: '80px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 20px rgba(77, 166, 255, 0.4)',
              zIndex: 999,
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#4da6ff',
                lineHeight: '1'
              }}>
                {Math.round(deviceHeading)}°
              </div>
              <div style={{
                fontSize: '9px',
                color: '#6b9bd1',
                marginTop: '4px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                {getCardinalDirection(deviceHeading)}
              </div>
              <div style={{
                position: 'absolute',
                top: '4px',
                fontSize: '16px',
                transform: `rotate(${deviceHeading}deg)`,
                transition: 'transform 0.2s ease-out'
              }}>
                ▲
              </div>
            </div>
          )}
          
          {/* Radar Controls */}
          <div style={{
            position: 'absolute',
            top: '20px',
            left: isMobile && controlsCollapsed ? '-300px' : '20px',
            background: 'rgba(10, 22, 40, 0.98)',
            border: '2px solid #4da6ff66',
            borderRadius: '12px',
            padding: isMobile ? '12px' : '16px',
            backdropFilter: 'blur(15px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(77, 166, 255, 0.3)',
            minWidth: isMobile ? '280px' : '240px',
            maxWidth: isMobile ? '280px' : '280px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            zIndex: 1000,
            transition: 'left 0.3s ease-in-out'
          }}>
            {/* Mobile Toggle Button */}
            {isMobile && (
              <button
                onClick={() => setControlsCollapsed(!controlsCollapsed)}
                style={{
                  position: 'absolute',
                  right: '-40px',
                  top: '10px',
                  background: 'linear-gradient(135deg, #4da6ff 0%, #0080ff 100%)',
                  border: '2px solid #4da6ff',
                  borderRadius: '0 8px 8px 0',
                  padding: '12px 8px',
                  cursor: 'pointer',
                  boxShadow: '4px 0 20px rgba(77, 166, 255, 0.5)',
                  zIndex: 1001,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {controlsCollapsed ? <Menu size={20} color="#fff" /> : <X size={20} color="#fff" />}
              </button>
            )}
            {/* Map Layers */}
            <div style={{ 
              fontSize: '12px', 
              color: '#4da6ff', 
              marginBottom: '16px', 
              fontWeight: '700', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              <Globe size={16} />
              MAP LAYERS
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '8px',
              marginBottom: '24px'
            }}>
              {[
                { id: 'dark', label: 'Dark' },
                { id: 'light', label: 'Light' },
                { id: 'street', label: 'Street' },
                { id: 'satellite', label: 'Satellite' },
                { id: 'hybrid', label: 'Hybrid' },
                { id: 'terrain', label: 'Terrain' }
              ].map(layer => (
                <button
                  key={layer.id}
                  onClick={() => {
                    console.log('Map layer button clicked:', layer.id);
                    switchBaseLayer(layer.id);
                  }}
                  style={{
                    padding: '10px 6px',
                    background: baseLayer === layer.id ? 'linear-gradient(135deg, #4da6ff22 0%, #0080ff22 100%)' : 'transparent',
                    border: `2px solid ${baseLayer === layer.id ? '#4da6ff' : '#2a4570'}`,
                    borderRadius: '8px',
                    color: baseLayer === layer.id ? '#4da6ff' : '#6b9bd1',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: '700',
                    transition: 'all 0.3s',
                    fontFamily: 'inherit',
                    boxShadow: baseLayer === layer.id ? '0 0 15px rgba(77, 166, 255, 0.4)' : 'none',
                    textTransform: 'uppercase'
                  }}
                >
                  {layer.label}
                </button>
              ))}
            </div>

            <div style={{ 
              marginBottom: '24px',
              paddingBottom: '24px',
              borderBottom: '2px solid #2a4570'
            }}></div>

            {/* Radar Products */}
            <div style={{ 
              fontSize: '12px', 
              color: '#4da6ff', 
              marginBottom: '16px', 
              fontWeight: '700', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              <Layers size={16} />
              RADAR PRODUCTS
            </div>
            
            {radarProducts.map(product => {
              const Icon = product.icon;
              const isActive = radarProduct === product.id;
              return (
                <button
                  key={product.id}
                  onClick={() => setRadarProduct(product.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    background: isActive ? 'linear-gradient(135deg, #4da6ff22 0%, #0080ff22 100%)' : 'transparent',
                    border: `2px solid ${isActive ? '#4da6ff' : '#2a4570'}`,
                    borderRadius: '8px',
                    color: isActive ? '#4da6ff' : '#6b9bd1',
                    cursor: 'pointer',
                    marginBottom: '10px',
                    fontSize: '12px',
                    transition: 'all 0.3s',
                    fontFamily: 'inherit',
                    boxShadow: isActive ? '0 0 15px rgba(77, 166, 255, 0.4)' : 'none'
                  }}
                >
                  <Icon size={18} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: '700', marginBottom: '2px' }}>{product.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.8 }}>{product.description}</div>
                  </div>
                </button>
              );
            })}

            {/* Color Legend - RadarScope Style */}
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#0a1628',
              border: '2px solid #2a4570',
              borderRadius: '8px'
            }}>
              <div style={{ 
                fontSize: '11px', 
                color: '#4da6ff', 
                marginBottom: '10px', 
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                COLOR SCALE
              </div>
              
              {(() => {
                const currentProduct = radarProducts.find(p => p.id === radarProduct);
                if (!currentProduct) return null;
                
                return (
                  <>
                    <div style={{ fontSize: '10px', color: '#6b9bd1', marginBottom: '8px', fontWeight: '600' }}>
                      {currentProduct.label} ({currentProduct.legend})
                    </div>
                    
                    {/* Color gradient bar */}
                    <div style={{
                      display: 'flex',
                      height: '24px',
                      marginBottom: '6px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid #2a4570'
                    }}>
                      {currentProduct.colors.map((color, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            background: color
                          }}
                          title={currentProduct.values[i]}
                        />
                      ))}
                    </div>
                    
                    {/* Value labels */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '9px',
                      color: '#5a7a9f',
                      fontWeight: '600'
                    }}>
                      <span>{currentProduct.values[0]}</span>
                      <span>{currentProduct.values[Math.floor(currentProduct.values.length / 2)]}</span>
                      <span>{currentProduct.values[currentProduct.values.length - 1]}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #2a4570'
            }}>
              <div style={{ fontSize: '10px', color: '#6b9bd1', marginBottom: '10px', fontWeight: '600' }}>
                OPACITY: {Math.round(radarOpacity * 100)}%
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={radarOpacity * 100}
                onChange={(e) => setRadarOpacity(e.target.value / 100)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #2a4570',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: '#6b9bd1',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                transition: 'all 0.2s',
                background: showLightning ? '#4da6ff11' : 'transparent'
              }}>
                <input
                  type="checkbox"
                  checked={showLightning}
                  onChange={(e) => setShowLightning(e.target.checked)}
                />
                <Zap size={16} />
                <span style={{ fontWeight: '600' }}>Lightning Data</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: '#6b9bd1',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                transition: 'all 0.2s',
                background: showStormTracks ? '#4da6ff11' : 'transparent'
              }}>
                <input
                  type="checkbox"
                  checked={showStormTracks}
                  onChange={(e) => setShowStormTracks(e.target.checked)}
                />
                <Target size={16} />
                <span style={{ fontWeight: '600' }}>Storm Tracks</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: '#6b9bd1',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '6px',
                transition: 'all 0.2s',
                background: showHeadingCone ? '#4da6ff11' : 'transparent'
              }}>
                <input
                  type="checkbox"
                  checked={showHeadingCone}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    
                    if (enabled) {
                      // Request permission for iOS 13+
                      if (typeof DeviceOrientationEvent !== 'undefined' && 
                          typeof DeviceOrientationEvent.requestPermission === 'function') {
                        try {
                          const permission = await DeviceOrientationEvent.requestPermission();
                          if (permission === 'granted') {
                            setShowHeadingCone(true);
                          } else {
                            alert('Please allow orientation access to use the heading cone feature.');
                          }
                        } catch (error) {
                          console.log('Orientation permission denied:', error);
                        }
                      } else {
                        setShowHeadingCone(true);
                      }
                    } else {
                      setShowHeadingCone(false);
                      // Remove cone from map
                      if (headingConeRef.current && mapRef.current) {
                        mapRef.current.removeLayer(headingConeRef.current);
                        headingConeRef.current = null;
                      }
                    }
                  }}
                />
                <MapPin size={16} />
                <span style={{ fontWeight: '600' }}>Heading Cone</span>
              </label>
            </div>

            {/* Info Note */}
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#00ff8822',
              border: '1px solid #00ff8844',
              borderRadius: '8px',
              fontSize: '10px',
              color: '#00ff88',
              lineHeight: '1.5'
            }}>
              <strong>✓ NOAA Connected:</strong> Real-time NOAA/NWS NEXRAD radar data. Official government weather service. Base reflectivity available nationwide.
            </div>

            {/* Radar Animation Controls */}
            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '2px solid #2a4570'
            }}>
              <div style={{
                fontSize: '12px',
                color: '#4da6ff',
                marginBottom: '8px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                ⏱️ RADAR LOOP
              </div>
              
              {/* Rate Limit Warning */}
              <div style={{
                fontSize: '9px',
                color: '#ff9d4d',
                marginBottom: '12px',
                padding: '6px 8px',
                background: '#ff9d4d11',
                border: '1px solid #ff9d4d33',
                borderRadius: '4px',
                lineHeight: '1.4'
              }}>
                ⚠️ Use sparingly - may hit rate limits if used frequently. Slowed to 1 frame per 2 seconds.
              </div>

              {/* Time Range Slider */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: '#6b9bd1', marginBottom: '6px', fontWeight: '600' }}>
                  LOOKBACK: {timeRange} minutes (limited to reduce API calls)
                </div>
                <input
                  type="range"
                  min="20"
                  max="60"
                  step="10"
                  value={timeRange}
                  onChange={(e) => setTimeRange(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Play/Pause Controls */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px',
                    background: isPlaying ? 'linear-gradient(135deg, #ff4da6 0%, #ff0080 100%)' : 'linear-gradient(135deg, #4da6ff 0%, #0080ff 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '700',
                    boxShadow: isPlaying ? '0 0 15px rgba(255, 77, 166, 0.5)' : '0 0 15px rgba(77, 166, 255, 0.5)',
                    transition: 'all 0.3s'
                  }}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  {isPlaying ? 'PAUSE' : 'PLAY'}
                </button>
              </div>

              {/* Timeline Scrubber */}
              {radarFrames.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', color: '#6b9bd1', marginBottom: '6px', fontWeight: '600' }}>
                    FRAME: {currentFrameIndex + 1} / {radarFrames.length}
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={radarFrames.length - 1}
                    value={currentFrameIndex}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setCurrentFrameIndex(parseInt(e.target.value));
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '9px',
                    color: '#5a7a9f',
                    marginTop: '4px'
                  }}>
                    <span>-{timeRange}min</span>
                    <span>NOW</span>
                  </div>
                </div>
              )}
            </div>

            {/* Weather Warnings - Click to navigate */}
            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '2px solid #2a4570'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#ff0044',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Zap size={16} />
                WEATHER ALERTS {activeWarnings.length > 0 && `(${activeWarnings.length})`}
              </div>
              
              {activeWarnings.length === 0 ? (
                <div style={{
                  padding: '12px',
                  background: '#1a2642',
                  border: '1px solid #2a4570',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '11px',
                    color: '#6b9bd1',
                    marginBottom: '4px'
                  }}>
                    ✅ No Active Alerts
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: '#5a7a9f'
                  }}>
                    All clear in your area
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {activeWarnings.map((warning, index) => (
                    <div
                      key={warning.id}
                      onClick={() => handleWarningClick(warning)}
                      style={{
                        padding: '12px',
                        marginBottom: '10px',
                        background: warning.severity === 'Extreme' ? '#ff004422' : 
                                   warning.severity === 'Severe' ? '#ff9d4d22' : 
                                   '#4da6ff22',
                        border: `2px solid ${
                          warning.severity === 'Extreme' ? '#ff0044' : 
                          warning.severity === 'Severe' ? '#ff9d4d' : 
                          '#4da6ff'
                        }`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(77, 166, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Alert Type */}
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: warning.severity === 'Extreme' ? '#ff0044' : 
                               warning.severity === 'Severe' ? '#ff9d4d' : 
                               '#4da6ff',
                        marginBottom: '6px',
                        textTransform: 'uppercase'
                      }}>
                        {warning.type}
                      </div>
                      
                      {/* Headline */}
                      <div style={{
                        fontSize: '10px',
                        color: '#e0e0e0',
                        lineHeight: '1.4',
                        marginBottom: '6px'
                      }}>
                        {warning.headline}
                      </div>
                      
                      {/* Location */}
                      {warning.area && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginBottom: '6px'
                        }}>
                          <MapPin size={12} color="#6b9bd1" />
                          <div style={{
                            fontSize: '9px',
                            color: '#6b9bd1',
                            fontStyle: 'italic'
                          }}>
                            {warning.area}
                          </div>
                        </div>
                      )}
                      
                      {/* Expires */}
                      {warning.expires && (
                        <div style={{
                          fontSize: '9px',
                          color: '#5a7a9f',
                          marginBottom: '8px'
                        }}>
                          Expires: {new Date(warning.expires).toLocaleTimeString()}
                        </div>
                      )}
                      
                      {/* Click to view */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        color: warning.severity === 'Extreme' ? '#ff0044' : 
                               warning.severity === 'Severe' ? '#ff9d4d' : 
                               '#4da6ff',
                        fontWeight: '600'
                      }}>
                        <Target size={12} />
                        Click to view on map
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'rgba(10, 22, 40, 0.95)',
            border: '1px solid #4da6ff33',
            borderRadius: '8px',
            padding: '12px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ fontSize: '11px', color: '#6b9bd1', marginBottom: '8px', fontWeight: '600' }}>
              INTENSITY
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {[
                { color: '#40ffff', label: 'Light' },
                { color: '#40ff40', label: 'Mod' },
                { color: '#ffff40', label: 'Heavy' },
                { color: '#ff8040', label: 'Severe' },
                { color: '#ff4040', label: 'Extreme' }
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    background: item.color,
                    borderRadius: '2px',
                    boxShadow: `0 0 8px ${item.color}66`
                  }}></div>
                  <span style={{ fontSize: '9px', color: '#6b9bd1' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <div style={{
          width: chatCollapsed ? '0' : (isMobile ? '100%' : '380px'),
          position: isMobile ? 'fixed' : 'relative',
          right: isMobile ? 0 : 'auto',
          top: isMobile ? (isKeyboardOpen ? '0' : '60px') : 'auto',
          bottom: isMobile ? '0' : 'auto',
          height: isMobile 
            ? (isKeyboardOpen ? '100%' : 'calc(100vh - 60px)') 
            : 'auto',
          background: 'linear-gradient(180deg, #0a1628 0%, #1a2642 100%)',
          borderLeft: '1px solid #4da6ff44',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
          transition: 'width 0.3s ease-in-out', // Only transition width, not height
          overflow: 'hidden',
          zIndex: isMobile ? (isKeyboardOpen ? 10000 : 100) : 100 // Higher z-index when keyboard open
        }}>
          {/* Chat content - only visible when not collapsed */}
          <div style={{ 
            width: isMobile ? '100%' : '380px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: chatCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease-in-out'
          }}>
          {/* Chat Header - Twitch Style */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '2px solid #4da6ff44',
            background: 'linear-gradient(135deg, #0a1628 0%, #1a2642 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              flex: 1
            }}>
              <MessageSquare size={18} color="#4da6ff" />
              <span style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#4da6ff',
                letterSpacing: '1px'
              }}>
                CHAT
              </span>
              <span style={{
                fontSize: '9px',
                color: syncMode === 'json' ? '#00d4ff' : syncMode === 'local' ? '#00ff88' : syncMode === 'gun' ? '#4da6ff' : '#ff9d4d',
                background: syncMode === 'json' ? '#00d4ff22' : syncMode === 'local' ? '#00ff8822' : syncMode === 'gun' ? '#4da6ff22' : '#ff9d4d22',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: '600'
              }}>
                {syncMode === 'json' ? 'JSON SYNC' : syncMode === 'local' ? 'LOCAL' : syncMode === 'gun' ? 'P2P' : 'FIREBASE'}
              </span>
            </div>
            
            {/* Desktop: Collapse button (Twitch style) */}
            {!isMobile && (
              <button
                onClick={() => setChatCollapsed(!chatCollapsed)}
                style={{
                  background: 'transparent',
                  border: '1px solid #4da6ff44',
                  borderRadius: '6px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  color: '#4da6ff'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#4da6ff22';
                  e.currentTarget.style.borderColor = '#4da6ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = '#4da6ff44';
                }}
                title="Collapse chat"
              >
                <ChevronDown size={16} />
              </button>
            )}
          </div>
          
          {/* Room Selector */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #2a4570',
            background: '#0a1628'
          }}>
            {/* LIVE Status - Like Twitch */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              padding: '8px 12px',
              background: 'linear-gradient(135deg, #ff004422 0%, #ff006622 100%)',
              border: '1px solid #ff004444',
              borderRadius: '6px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ff0044',
                  boxShadow: '0 0 10px #ff0044',
                  animation: 'pulse 2s infinite'
                }} />
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#ff0044',
                  letterSpacing: '1px'
                }}>
                  LIVE CHAT
                </span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              {Object.entries(roomConfig).map(([key, config]) => {
                const Icon = config.icon;
                const isActive = activeRoom === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveRoom(key)}
                    style={{
                      flex: 1,
                      background: isActive ? `${config.color}22` : 'transparent',
                      border: `1px solid ${isActive ? config.color : '#2a4570'}`,
                      borderRadius: '8px',
                      padding: '10px 6px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: isActive ? `0 0 15px ${config.color}44` : 'none'
                    }}
                  >
                    <Icon size={18} color={isActive ? config.color : '#6b9bd1'} />
                    <span style={{
                      fontSize: '10px',
                      color: isActive ? config.color : '#6b9bd1',
                      fontWeight: '600'
                    }}>
                      {config.label}
                    </span>
                    <span style={{ fontSize: '8px', color: '#5a7a9f' }}>
                      {config.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {/* Empty State */}
            {(activeRoom === 'archive' ? archivedMessages : messages).length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#5a7a9f',
                fontSize: '12px'
              }}>
                <MessageSquare size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#6b9bd1' }}>
                  {activeRoom === 'archive' 
                    ? 'No Archived Messages' 
                    : `Welcome to ${roomConfig[activeRoom].label}!`}
                </div>
                <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
                  {activeRoom === 'archive' 
                    ? 'Messages older than 5 hours will appear here.\nThey are kept for up to 30 days.'
                    : 'Messages update in real-time for everyone in this room.\nStart the conversation!'}
                </div>
              </div>
            )}
            
            {/* Current Messages or Archived Messages */}
            {(activeRoom === 'archive' ? archivedMessages : messages).map((msg, i) => {
              const isOwn = msg.userId === user.uid;
              return (
                <div
                  key={msg.id || i}
                  style={{
                    background: isOwn ? 'linear-gradient(135deg, #4da6ff22 0%, #0080ff22 100%)' : '#1a2642',
                    border: `1px solid ${isOwn ? roomConfig[activeRoom].color + '44' : '#2a4570'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    animation: 'messageSlide 0.15s ease-out',
                    boxShadow: isOwn ? `0 0 10px ${roomConfig[activeRoom].color}22` : 'none'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                    alignItems: 'center'
                  }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: isOwn ? roomConfig[activeRoom].color : '#4da6ff'
                    }}>
                      {msg.username}
                    </span>
                    <span style={{ fontSize: '9px', color: '#5a7a9f' }}>
                      {msg.timestamp ? formatDistanceToNow(msg.timestamp, { addSuffix: true }) : 'now'}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: '#e0e0e0',
                    wordWrap: 'break-word'
                  }}>
                    {(() => {
                      try {
                        return censorText(msg.text);
                      } catch (error) {
                        console.error('[App] Error censoring text:', error);
                        return msg.text;
                      }
                    })()}
                  </p>
                </div>
              );
            })}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input - Hidden in Archive room */}
          {activeRoom !== 'archive' && (
            <form onSubmit={handleSendMessage} style={{
              padding: '16px',
              borderTop: '1px solid #2a4570',
              background: '#0a1628'
            }}>
              <div style={{
                display: 'flex',
                gap: '8px',
                background: '#1a2642',
                border: '1px solid #2a4570',
                borderRadius: '8px',
                padding: '4px'
              }}>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Message ${roomConfig[activeRoom].label.toLowerCase()}...`}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    padding: '12px',
                    fontFamily: 'inherit'
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  style={{
                    background: inputMessage.trim() 
                      ? `linear-gradient(135deg, ${roomConfig[activeRoom].color} 0%, ${roomConfig[activeRoom].color}aa 100%)`
                      : '#2a4570',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    cursor: inputMessage.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    color: inputMessage.trim() ? '#0a1628' : '#5a7a9f',
                  transition: 'all 0.2s',
                  boxShadow: inputMessage.trim() ? `0 0 15px ${roomConfig[activeRoom].color}44` : 'none'
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </form>
          )}

          {/* Archive Room Notice - Shows when viewing archive */}
          {activeRoom === 'archive' && (
            <div style={{
              padding: '16px',
              borderTop: '1px solid #2a4570',
              background: '#0a1628',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '11px',
                color: '#6b9bd1',
                lineHeight: '1.6'
              }}>
                📦 Viewing archived messages (5+ hours old)
                <br />
                <span style={{ fontSize: '10px', color: '#5a7a9f' }}>
                  Messages are kept for up to 30 days
                </span>
              </div>
            </div>
          )}
          </div>
          
          {/* Chat Toggle Button - Desktop: Floating on right when collapsed, Mobile: FAB */}
          <button
            onClick={() => setChatCollapsed(!chatCollapsed)}
            style={{
              position: isMobile ? 'fixed' : (chatCollapsed ? 'fixed' : 'absolute'),
              left: chatCollapsed ? 'auto' : (isMobile ? 'auto' : '-40px'),
              right: chatCollapsed ? '20px' : (isMobile ? '20px' : 'auto'),
              bottom: isMobile ? '80px' : (chatCollapsed ? '20px' : 'auto'),
              top: isMobile ? 'auto' : (chatCollapsed ? 'auto' : '50%'),
              transform: (isMobile || chatCollapsed) ? 'none' : 'translateY(-50%)',
              background: 'linear-gradient(135deg, #4da6ff 0%, #0080ff 100%)',
              border: '2px solid #4da6ff',
              borderRadius: (isMobile || chatCollapsed) ? '50%' : '8px 0 0 8px',
              padding: (isMobile || chatCollapsed) ? '16px' : '16px 8px',
              cursor: 'pointer',
              boxShadow: (isMobile || chatCollapsed) 
                ? '0 4px 20px rgba(77, 166, 255, 0.6), 0 0 40px rgba(77, 166, 255, 0.4)' 
                : '-4px 0 20px rgba(77, 166, 255, 0.5)',
              zIndex: 101,
              transition: 'all 0.3s ease-in-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: (isMobile || chatCollapsed) ? '56px' : 'auto',
              height: (isMobile || chatCollapsed) ? '56px' : 'auto'
            }}
            onMouseEnter={(e) => {
              if (!isMobile && chatCollapsed) {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 6px 30px rgba(77, 166, 255, 0.8), 0 0 50px rgba(77, 166, 255, 0.6)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isMobile && chatCollapsed) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(77, 166, 255, 0.6), 0 0 40px rgba(77, 166, 255, 0.4)';
              }
            }}
            title={chatCollapsed ? 'Open Chat' : 'Close Chat'}
          >
            {(isMobile || chatCollapsed) ? (
              <MessageSquare size={24} color="#fff" strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={20} color="#0a1628" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>

      {/* Radar Controls FAB - Mobile Only (Left Side) */}
      {isMobile && (
        <button
          onClick={() => setControlsCollapsed(!controlsCollapsed)}
          style={{
            position: 'fixed',
            left: '20px',
            bottom: '20px',
            background: 'linear-gradient(135deg, #4da6ff 0%, #0080ff 100%)',
            border: '2px solid #4da6ff',
            borderRadius: '50%',
            padding: '16px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(77, 166, 255, 0.6), 0 0 40px rgba(77, 166, 255, 0.4)',
            zIndex: 102,
            transition: 'all 0.3s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px'
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title={controlsCollapsed ? 'Open Radar Controls' : 'Close Radar Controls'}
        >
          {controlsCollapsed ? (
            <Layers size={24} color="#fff" strokeWidth={2.5} />
          ) : (
            <X size={24} color="#fff" strokeWidth={2.5} />
          )}
        </button>
      )}


      {/* Warning Details Modal */}
      {selectedWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #0a1628 0%, #1a2642 100%)',
            border: `3px solid ${
              selectedWarning.severity === 'Extreme' ? '#ff0044' : 
              selectedWarning.severity === 'Severe' ? '#ff9d4d' : 
              '#4da6ff'
            }`,
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: selectedWarning.severity === 'Extreme' ? '#ff0044' : 
                             selectedWarning.severity === 'Severe' ? '#ff9d4d' : 
                             '#4da6ff',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#fff',
                  marginBottom: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  {selectedWarning.severity} • {selectedWarning.urgency}
                </div>
                <h2 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#e0e0e0',
                  lineHeight: '1.4'
                }}>
                  {selectedWarning.type}
                </h2>
              </div>
              <button
                onClick={() => setSelectedWarning(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #4da6ff44',
                  borderRadius: '6px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4da6ff'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Headline */}
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#4da6ff',
              marginBottom: '16px',
              padding: '12px',
              background: '#4da6ff11',
              borderRadius: '8px',
              border: '1px solid #4da6ff33'
            }}>
              {selectedWarning.headline}
            </div>

            {/* Area */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#6b9bd1',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }}>
                AFFECTED AREAS
              </div>
              <div style={{ fontSize: '13px', color: '#e0e0e0' }}>
                {selectedWarning.areaDesc}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                color: '#6b9bd1',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }}>
                DESCRIPTION
              </div>
              <div style={{
                fontSize: '12px',
                color: '#e0e0e0',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedWarning.description}
              </div>
            </div>

            {/* Instructions */}
            {selectedWarning.instruction && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#ff9d4d',
                  marginBottom: '6px',
                  textTransform: 'uppercase'
                }}>
                  SAFETY INSTRUCTIONS
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#e0e0e0',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  padding: '12px',
                  background: '#ff9d4d11',
                  borderRadius: '8px',
                  border: '1px solid #ff9d4d33'
                }}>
                  {selectedWarning.instruction}
                </div>
              </div>
            )}

            {/* Issued By */}
            <div style={{
              fontSize: '10px',
              color: '#6b9bd1',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #2a4570'
            }}>
              Issued by {selectedWarning.senderName}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        
        @keyframes messageSlide {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 10px currentColor;
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 20px currentColor;
          }
        }

        .pulse {
          animation: pulse 2s ease-in-out infinite;
        }

        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: #0a1628;
        }

        ::-webkit-scrollbar-thumb {
          background: #2a4570;
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #4da6ff;
        }

        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: #2a4570;
          height: 4px;
          border-radius: 2px;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #4da6ff;
          cursor: pointer;
          box-shadow: 0 0 8px #4da6ff;
        }

        input[type="checkbox"] {
          accent-color: #4da6ff;
        }

        @media (max-width: 768px) {
          .chat-sidebar {
            position: fixed !important;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100% !important;
            height: 50vh !important;
            z-index: 1000;
          }
        }
      `}</style>
    </div>
  );
};

export default App;
