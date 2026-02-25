import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { githubLogin } from '../services/githubAuth';

const AuthScreen = ({ onAuthSuccess }) => {
  const [showInfo, setShowInfo] = useState(false);

  const handleGitHubLogin = () => {
    githubLogin();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a1929 0%, #001e3c 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        border: '1px solid rgba(255, 255, 255, 0.18)'
      }}>
        {/* Logo/Title */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '10px'
          }}>
            ⛈️
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#fff',
            margin: '0 0 10px 0',
            textShadow: '0 2px 10px rgba(0, 212, 255, 0.5)'
          }}>
            StormJack
          </h1>
          <p style={{
            color: '#b0bec5',
            fontSize: '14px',
            margin: 0
          }}>
            Real-time Weather Radar & Chat
          </p>
        </div>

        {/* GitHub Login Button */}
        <button
          onClick={handleGitHubLogin}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#fff',
            background: '#24292e',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.3s ease',
            marginBottom: '20px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#2f363d';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#24292e';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <svg
            height="20"
            width="20"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Sign in with GitHub
        </button>

        {/* Info Section */}
        <div style={{
          background: 'rgba(0, 212, 255, 0.1)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h3 style={{
            color: '#00d4ff',
            fontSize: '14px',
            fontWeight: '600',
            margin: '0 0 8px 0'
          }}>
            Why GitHub Login?
          </h3>
          <ul style={{
            color: '#b0bec5',
            fontSize: '13px',
            margin: 0,
            paddingLeft: '20px'
          }}>
            <li>No password to remember</li>
            <li>Secure OAuth authentication</li>
            <li>Your GitHub username is your chat name</li>
            <li>Works across all devices</li>
          </ul>
        </div>

        {/* Features */}
        <div style={{
          textAlign: 'center',
          color: '#78909c',
          fontSize: '12px'
        }}>
          <p style={{ margin: '0 0 10px 0' }}>
            🌩️ Live radar • ⚡ Real-time chat • 🗺️ Weather warnings
          </p>
          <p style={{ margin: 0, opacity: 0.7 }}>
            By signing in, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
