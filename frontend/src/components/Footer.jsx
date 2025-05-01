import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="app-footer">
      {/* Decorative elements */}
      <div className="footer-glow-orbs">
        <div className="orb orb1"></div>
        <div className="orb orb2"></div>
      </div>
      
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="logo-text">ArtGridStudio</span>
            <span className="logo-accent"></span>
          </div>
          <p className="footer-tagline">Revolutionizing Digital Art on <span className="highlight">LUKSO</span></p>
        </div>
        
        <div className="footer-divider"></div>
        
        <div className="footer-nav">
          <div className="footer-links">
            <a href="https://docs.lukso.tech/" target="_blank" rel="noopener noreferrer">
              <span className="link-icon">📄</span>
              <span className="link-text">LUKSO Docs</span>
            </a>
            <a href="https://explorer.execution.testnet.lukso.network/" target="_blank" rel="noopener noreferrer">
              <span className="link-icon">🔍</span>
              <span className="link-text">Explorer</span>
            </a>
            <a href="#" className="featured-link">
              <span className="link-icon">✨</span>
              <span className="link-text">Create NFT</span>
            </a>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p className="copyright">&copy; {new Date().getFullYear()} ArtGridStudio - Built on LUKSO</p>
        <div className="social-links">
          <a href="#" aria-label="Twitter" className="social-link">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
            </svg>
          </a>
          <a href="#" aria-label="Discord" className="social-link">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 18V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"></path>
              <path d="M16 12h.01"></path>
              <path d="M8 12h.01"></path>
              <path d="M8 11v1"></path>
              <path d="M16 11v1"></path>
              <path d="M12 18v-6"></path>
              <path d="M8 7v1"></path>
              <path d="M16 7v1"></path>
            </svg>
          </a>
          <a href="#" aria-label="GitHub" className="social-link">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
          </a>
        </div>
      </div>
      
      <div className="footer-particles">
        {[...Array(6)].map((_, index) => (
          <div key={index} className={`particle particle-${index + 1}`}></div>
        ))}
      </div>
    </footer>
  );
};

export default Footer;