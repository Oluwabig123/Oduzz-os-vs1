import { NavLink } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  return (
    <header className="app-navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">ODUZZ <span className="brand-accent">OS</span></span>
        </NavLink>

        <nav className="navbar-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">📊</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/rooms"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">🚪</span>
            <span>Rooms</span>
          </NavLink>

          <NavLink
            to="/devices"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">💡</span>
            <span>Devices</span>
          </NavLink>

          <NavLink
            to="/voice"
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="nav-icon">🎙️</span>
            <span>Voice Control</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
