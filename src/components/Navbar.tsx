import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import OduzzLogo from "./OduzzLogo";
import "./Navbar.css";

function Navbar() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "Profile";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="app-navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand-link" onClick={closeMenu}>
          <OduzzLogo size={34} variant="full" />
        </NavLink>

        <button
          className="navbar-toggle"
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          )}
        </button>

        <nav className={`navbar-links ${isOpen ? "open" : ""}`}>
          {user ? (
            <>
              <div className="nav-pill-group">
                <NavLink
                  to="/"
                  end
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="9" rx="2" />
                    <rect x="14" y="3" width="7" height="5" rx="2" />
                    <rect x="14" y="12" width="7" height="9" rx="2" />
                    <rect x="3" y="16" width="7" height="5" rx="2" />
                  </svg>
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/rooms"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span>Rooms</span>
                </NavLink>

                <NavLink
                  to="/devices"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                  </svg>
                  <span>Devices</span>
                </NavLink>

                <NavLink
                  to="/voice"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                  <span>Voice AI</span>
                </NavLink>

                <NavLink
                  to="/automations"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Automations</span>
                </NavLink>
              </div>

              <div className="nav-user-actions">
                <NavLink
                  to="/profile"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `nav-profile-pill ${isActive ? "active" : ""}`
                  }
                >
                  <span className="nav-avatar-badge">{initial}</span>
                  <span className="nav-profile-name">{displayName}</span>
                </NavLink>

                <button
                  onClick={async () => {
                    closeMenu();
                    await signOut();
                    navigate("/login");
                  }}
                  className="nav-logout-btn"
                  title="Sign out of Oduzz OS"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span className="logout-text">Logout</span>
                </button>
              </div>
            </>
          ) : (
            <div className="nav-auth-actions">
              <NavLink
                to="/login"
                onClick={closeMenu}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <span>Sign In</span>
              </NavLink>
              <NavLink
                to="/register"
                onClick={closeMenu}
                className="nav-cta-btn"
              >
                <span>Get Started</span>
              </NavLink>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
