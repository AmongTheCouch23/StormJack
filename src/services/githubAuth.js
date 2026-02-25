// GitHub OAuth Authentication Service
// Simple OAuth flow for GitHub Pages deployment

const CLIENT_ID = 'Ov23liIMJSn4alLCfYaR';
const REDIRECT_URI = window.location.origin + window.location.pathname; // Auto-detects your URL
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_PROXY = 'https://github-oauth-proxy.herokuapp.com/authenticate'; // Free proxy service

// Storage keys
const USER_KEY = 'stormjack_github_user';
const TOKEN_KEY = 'stormjack_github_token';

// GitHub OAuth login flow
export const githubLogin = () => {
  // Generate random state for security
  const state = Math.random().toString(36).substring(7);
  sessionStorage.setItem('github_oauth_state', state);
  
  // Build authorization URL
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user user:email',
    state: state
  });
  
  // Redirect to GitHub OAuth
  window.location.href = `${GITHUB_AUTH_URL}?${params.toString()}`;
};

// Handle OAuth callback
export const handleGitHubCallback = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const storedState = sessionStorage.getItem('github_oauth_state');
  
  // Verify state to prevent CSRF
  if (!code || !state || state !== storedState) {
    return null;
  }
  
  try {
    // Exchange code for access token using proxy
    const response = await fetch(GITHUB_TOKEN_PROXY + '/' + code);
    const data = await response.json();
    
    if (!data.token) {
      throw new Error('Failed to get access token');
    }
    
    const token = data.token;
    
    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const userData = await userResponse.json();
    
    // Create user object
    const user = {
      uid: userData.id.toString(),
      username: userData.login,
      email: userData.email || `${userData.login}@github.user`,
      avatar: userData.avatar_url,
      name: userData.name || userData.login,
      provider: 'github'
    };
    
    // Store user and token
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
    
    // Clear OAuth state
    sessionStorage.removeItem('github_oauth_state');
    
    // Clean URL (remove OAuth params)
    window.history.replaceState({}, document.title, window.location.pathname);
    
    return user;
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return null;
  }
};

// Get current user
export const githubGetCurrentUser = () => {
  try {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    
    const user = JSON.parse(userStr);
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Logout
export const githubLogout = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

// Get user token
export const getGitHubToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!githubGetCurrentUser();
};

export default {
  githubLogin,
  handleGitHubCallback,
  githubGetCurrentUser,
  githubLogout,
  getGitHubToken,
  isAuthenticated
};
