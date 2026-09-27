import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <header className="app-navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand" onClick={closeMenu}>
          <span className="brand-icon">⚡</span>
          <span className="brand-text">ODUZZ <span className="brand-accent">OS</span></span>
        </NavLink>

        <button
          className="navbar-toggle"
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
        >
          {isOpen ? "✕" : "☰"}
        </button>

        <nav className={`navbar-links ${isOpen ? "open" : ""}`}>
          <NavLink
            to="/"
            end
            onClick={closeMenu}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/rooms"
            onClick={closeMenu}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">🚪</span>
            <span>Rooms</span>
          </NavLink>

          <NavLink
            to="/devices"
            onClick={closeMenu}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">💡</span>
            <span>Devices</span>
          </NavLink>

          <NavLink
            to="/voice"
            onClick={closeMenu}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">🎙️</span>
            <span>Voice Control</span>
          </NavLink>

          <NavLink
            to="/automations"
            onClick={closeMenu}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">⚡</span>
            <span>Automations</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;

