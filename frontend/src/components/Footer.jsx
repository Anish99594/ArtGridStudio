import './Footer.css';

const Footer = () => {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p>&copy; {new Date().getFullYear()} ArtGridStudio - Built on LUKSO</p>
        <div className="footer-links">
          <a href="https://docs.lukso.tech/" target="_blank" rel="noopener noreferrer">LUKSO Docs</a>
          <a href="https://explorer.execution.testnet.lukso.network/" target="_blank" rel="noopener noreferrer">Explorer</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;