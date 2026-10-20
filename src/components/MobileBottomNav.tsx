import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./MobileBottomNav.css";

export const MobileBottomNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || location.pathname === "/login" || location.pathname === "/register") {
    return null;
  }

  return (
    <nav className="oduzz-mobile-bottom-nav" aria-label="Mobile Navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
        <span className="mobile-nav-label">Home</span>
      </NavLink>

      <NavLink
        to="/rooms"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="mobile-nav-label">Rooms</span>
      </NavLink>

      {/* Prominent Center Voice Action Orb */}
      <NavLink
        to="/voice"
        className={({ isActive }) => `mobile-nav-center-item ${isActive ? "active" : ""}`}
        aria-label="Voice Assistant"
      >
        <div className="mobile-voice-orb">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </div>
        <span className="mobile-nav-label">Voice AI</span>
      </NavLink>

      <NavLink
        to="/devices"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
        <span className="mobile-nav-label">Devices</span>
      </NavLink>

      <NavLink
        to="/automations"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="mobile-nav-label">Automate</span>
      </NavLink>
    </nav>
  );
};

export default MobileBottomNav;
