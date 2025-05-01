import { useState, useEffect } from 'react';
import './Header.css';

const Header = ({ children }) => {
  const [scrolled, setScrolled] = useState(false);
  const [animateLogo, setAnimateLogo] = useState(false);
  
  // Handle scroll effects
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      setScrolled(isScrolled);
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // Trigger logo animation after initial render
    const timer = setTimeout(() => {
      setAnimateLogo(true);
    }, 500);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, []);
  
  return (
    <header className={`app-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-content">
        <div className={`logo-container ${animateLogo ? 'animate' : ''}`}>
          <div className="logo-glow"></div>
          
          {/* SVG Logo replacing the text logo */}
          <svg className="header-logo" viewBox="0 0 400 280" xmlns="http://www.w3.org/2000/svg" style={{ padding: '0px 20px', marginTop: '20px' }}>
            {/* Background glow effect */}
            <defs>
              <radialGradient id="logoGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" stopColor="#8A2BE2" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#8A2BE2" stopOpacity="0" />
              </radialGradient>
              
              <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9D50BB" />
                <stop offset="100%" stopColor="#6E48AA" />
              </linearGradient>
              
              <linearGradient id="gridGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00C9FF" />
                <stop offset="100%" stopColor="#92FE9D" />
              </linearGradient>
              
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            
            {/* Background glow */}
            <circle cx="200" cy="140" r="120" fill="url(#logoGlow)" />
            
            {/* Grid pattern representing the "Grid" in ArtGrid */}
            <g transform="translate(120, 70)">
              {/* Grid lines */}
              <g stroke="#4A90E2" strokeWidth="1.5" opacity="0.7">
                {/* Horizontal lines */}
                <line x1="0" y1="0" x2="160" y2="0" />
                <line x1="0" y1="30" x2="160" y2="30" />
                <line x1="0" y1="60" x2="160" y2="60" />
                <line x1="0" y1="90" x2="160" y2="90" />
                <line x1="0" y1="120" x2="160" y2="120" />
                
                {/* Vertical lines */}
                <line x1="0" y1="0" x2="0" y2="120" />
                <line x1="40" y1="0" x2="40" y2="120" />
                <line x1="80" y1="0" x2="80" y2="120" />
                <line x1="120" y1="0" x2="120" y2="120" />
                <line x1="160" y1="0" x2="160" y2="120" />
              </g>
              
              {/* Artistic elements within the grid */}
              <circle cx="40" cy="30" r="15" fill="#FF6B6B" filter="url(#glow)" />
              <rect x="105" y="15" width="30" height="30" rx="5" fill="#5AFFB1" transform="rotate(45, 120, 30)" filter="url(#glow)" />
              <polygon points="80,60 95,85 65,85" fill="#FFD166" filter="url(#glow)" />
              <circle cx="120" cy="90" r="18" fill="#7A77FF" filter="url(#glow)" />
              <rect x="25" y="75" width="30" height="30" fill="#FF9BD2" filter="url(#glow)" />
            </g>
            
            {/* Logo text */}
            <g transform="translate(80, 210)">
              <text fontFamily="Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="1">
                <tspan fill="url(#textGradient)" x="0" y="0">Art</tspan>
                <tspan fill="url(#gridGradient)" x="70" y="0">Grid</tspan>
                <tspan fill="#9D50BB" fontSize="24" x="175" y="0">Studio</tspan>
              </text>
              
              {/* Underline */}
              <line x1="0" y1="10" x2="240" y2="10" stroke="#8A2BE2" strokeWidth="3" strokeLinecap="round" />
            </g>
            
            {/* Decorative particles */}
            <circle cx="310" cy="70" r="5" fill="#FF6B6B" opacity="0.7">
              <animate attributeName="opacity" values="0.7;0.3;0.7" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="90" cy="90" r="4" fill="#5AFFB1" opacity="0.6">
              <animate attributeName="opacity" values="0.6;0.2;0.6" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="280" cy="150" r="6" fill="#FFD166" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.4;0.8" dur="5s" repeatCount="indefinite" />
            </circle>
          </svg>
          
          <div className="tagline">
            <span>Social NFTs on LUKSO</span>
          </div>
        </div>
        
        <div className="header-nav-container">
          {children}
        </div>
      </div>
      
      <div className="header-decorations">
        <div className="header-particle particle1"></div>
        <div className="header-particle particle2"></div>
        <div className="header-particle particle3"></div>
        <div className="header-accent accent1"></div>
        <div className="header-accent accent2"></div>
      </div>
    </header>
  );
};

export default Header;