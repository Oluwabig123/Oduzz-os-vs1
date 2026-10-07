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

  return (
    <header className="app-navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-brand-link" onClick={closeMenu}>
          <OduzzLogo size={32} variant="full" />
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

          {user ? (
            <>
              <NavLink
                to="/profile"
                onClick={closeMenu}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <span className="nav-icon">👤</span>
                <span>{profile?.full_name || user.email?.split("@")[0] || "Profile"}</span>
              </NavLink>

              <button
                onClick={async () => {
                  closeMenu();
                  await signOut();
                  navigate("/login");
                }}
                className="nav-link nav-logout-btn"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#ef4444"
                }}
              >
                <span className="nav-icon">🚪</span>
                <span>Logout</span>
              </button>

            </>
          ) : (
            <NavLink
              to="/login"
              onClick={closeMenu}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">🔑</span>
              <span>Login</span>
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;


