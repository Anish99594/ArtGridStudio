import { useState, useEffect } from 'react';
import './Aboutwebsite.css';

const About = () => {
  const [animateSection, setAnimateSection] = useState({
    hero: false,
    features: false,
    tiers: false,
    community: false
  });

  useEffect(() => {
    // Trigger animations sequentially
    setTimeout(() => setAnimateSection(prev => ({ ...prev, hero: true })), 300);
    setTimeout(() => setAnimateSection(prev => ({ ...prev, features: true })), 800);
    setTimeout(() => setAnimateSection(prev => ({ ...prev, tiers: true })), 1300);
    setTimeout(() => setAnimateSection(prev => ({ ...prev, community: true })), 1800);
    
    // Set up scroll-based animation triggers for when user scrolls down the page
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('ags-in-view');
        }
      });
    }, { threshold: 0.2 });
    
    document.querySelectorAll('.ags-animate-on-scroll').forEach(el => {
      observer.observe(el);
    });
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ags-about-container">
      {/* Hero Section */}
      <section className={`ags-about-hero ${animateSection.hero ? 'ags-animate' : ''}`}>
        <div className="ags-hero-backdrop">
          <div className="ags-hero-particle ags-hero-particle1"></div>
          <div className="ags-hero-particle ags-hero-particle2"></div>
          <div className="ags-hero-grid"></div>
        </div>
        
        <div className="ags-hero-content">
          <h1>Redefining Digital Art Ownership</h1>
          <p className="ags-hero-tagline">Where creation meets interaction in the LUKSO ecosystem</p>
          <div className="ags-hero-description">
            <p>ArtGridStudio is the next evolution in digital art platforms, combining the permanence 
            of NFTs with the dynamic nature of social engagement on the LUKSO blockchain.</p>
          </div>
          <div className="ags-hero-cta">
            <button className="ags-cta-button ags-primary">Explore Gallery</button>
            <button className="ags-cta-button ags-secondary">Create Your Own</button>
          </div>
        </div>
      </section>
      
      {/* What is ArtGridStudio Section */}
      <section className={`ags-about-section ags-what-is ${animateSection.features ? 'ags-animate' : ''}`}>
        <div className="ags-section-header">
          <h2>What is ArtGridStudio?</h2>
          <div className="ags-section-divider"></div>
        </div>
        
        <div className="ags-feature-grid">
          <div className="ags-feature-card ags-animate-on-scroll">
            <div className="ags-feature-icon ags-social-nft-icon"></div>
            <h3>Social NFTs</h3>
            <p>NFTs that evolve based on community engagement, creating a deeper connection 
            between creators and collectors.</p>
          </div>
          
          <div className="ags-feature-card ags-animate-on-scroll">
            <div className="ags-feature-icon ags-lukso-icon"></div>
            <h3>Powered by LUKSO</h3>
            <p>Built on the innovative LUKSO blockchain, designed specifically for 
            digital assets and social experiences.</p>
          </div>
          
          <div className="ags-feature-card ags-animate-on-scroll">
            <div className="ags-feature-icon ags-marketplace-icon"></div>
            <h3>Creator Marketplace</h3>
            <p>Buy, sell, and trade evolving digital art with transparent ownership 
            and verifiable engagement metrics.</p>
          </div>
          
          <div className="ags-feature-card ags-animate-on-scroll">
            <div className="ags-feature-icon ags-rewards-icon"></div>
            <h3>Engagement Rewards</h3>
            <p>Artists can monetize beyond initial sales through ongoing community interest 
            and participation in their work.</p>
          </div>
        </div>
      </section>
      
      {/* How It Works Section */}
      <section className={`ags-about-section ags-how-it-works ${animateSection.tiers ? 'ags-animate' : ''}`}>
        <div className="ags-section-header">
          <h2>How It Works: Engagement Tiers</h2>
          <div className="ags-section-divider"></div>
        </div>
        
        <div className="ags-tiers-container">
          <div className="ags-tier-steps">
            <div className="ags-tier-step ags-animate-on-scroll">
              <div className="ags-tier-number">1</div>
              <div className="ags-tier-content">
                <h3>Artist Creates Tiered NFT</h3>
                <p>Artists upload their work and define multiple engagement tiers, each with 
                special unlockable content and unique metadata.</p>
              </div>
            </div>
            
            <div className="ags-tier-step ags-animate-on-scroll">
              <div className="ags-tier-number">2</div>
              <div className="ags-tier-content">
                <h3>Community Engages</h3>
                <p>Fans interact through likes, comments, and LYX staking to show support 
                for their favorite pieces and artists.</p>
              </div>
            </div>
            
            <div className="ags-tier-step ags-animate-on-scroll">
              <div className="ags-tier-number">3</div>
              <div className="ags-tier-content">
                <h3>NFT Evolves</h3>
                <p>As engagement thresholds are met, the NFT unlocks new tiers with exclusive 
                content, revealing more of the artist's vision.</p>
              </div>
            </div>
            
            <div className="ags-tier-step ags-animate-on-scroll">
              <div className="ags-tier-number">4</div>
              <div className="ags-tier-content">
                <h3>Value Increases</h3>
                <p>Higher engagement NFTs gain value in the marketplace, rewarding both 
                early collectors and active community members.</p>
              </div>
            </div>
          </div>
          
          <div className="ags-tier-visualization ags-animate-on-scroll">
            <div className="ags-tier ags-tier-basic">
              <div className="ags-tier-label">Basic</div>
              <div className="ags-tier-preview"></div>
            </div>
            <div className="ags-tier-arrow"></div>
            <div className="ags-tier ags-tier-silver">
              <div className="ags-tier-label">Bronze</div>
              <div className="ags-tier-preview"></div>
            </div>
            <div className="ags-tier-arrow"></div>
            <div className="ags-tier ags-tier-platinum">
              <div className="ags-tier-label">Silver</div>
              <div className="ags-tier-preview"></div>
            </div>
            <div className="ags-tier-arrow"></div>
            <div className="ags-tier ags-tier-gold">
              <div className="ags-tier-label">Gold</div>
              <div className="ags-tier-preview"></div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Join Community Section */}
      <section className={`ags-about-section ags-community ${animateSection.community ? 'ags-animate' : ''}`}>
        <div className="ags-section-header">
          <h2>Join Our Creative Community</h2>
          <div className="ags-section-divider"></div>
        </div>
        
        <div className="ags-community-content">
          <div className="ags-community-text ags-animate-on-scroll">
            <p>ArtGridStudio is more than a platform—it's a community where artists and collectors 
            come together to redefine the relationship between creation and appreciation.</p>
            
            <p>By rewarding engagement and fostering interaction, we're building a dynamic ecosystem 
            where digital art continues to evolve long after its creation.</p>
            
            <div className="ags-community-stats">
              <div className="ags-stat ags-animate-on-scroll">
                <span className="ags-stat-number">500+</span>
                <span className="ags-stat-label">Artists</span>
              </div>
              <div className="ags-stat ags-animate-on-scroll">
                <span className="ags-stat-number">5,000+</span>
                <span className="ags-stat-label">NFT Collectors</span>
              </div>
              <div className="ags-stat ags-animate-on-scroll">
                <span className="ags-stat-number">10,000+</span>
                <span className="ags-stat-label">Social NFTs</span>
              </div>
            </div>
          </div>
          
          <div className="ags-community-cta ags-animate-on-scroll">
            <h3>Ready to get started?</h3>
            <div className="ags-cta-buttons">
              <button className="ags-cta-button ags-primary">Connect Wallet</button>
              <button className="ags-cta-button ags-secondary">Learn More</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;