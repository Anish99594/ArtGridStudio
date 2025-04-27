import './Header.css';

const Header = ({ children }) => {
  return (
    <header className="app-header">
      <div className="logo">
        <h1>ArtGridStudio</h1>
        {/* <span className="tagline">Social NFTs on LUKSO</span> */}
      </div>
      {children}
    </header>
  );
};

export default Header;