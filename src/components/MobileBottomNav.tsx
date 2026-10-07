import React from "react";
import { NavLink } from "react-router-dom";
import "./MobileBottomNav.css";

export const MobileBottomNav: React.FC = () => {
  return (
    <nav className="oduzz-mobile-bottom-nav" aria-label="Mobile Navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <span className="mobile-nav-icon">📊</span>
        <span className="mobile-nav-label">Dashboard</span>
      </NavLink>

      <NavLink
        to="/rooms"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <span className="mobile-nav-icon">🚪</span>
        <span className="mobile-nav-label">Rooms</span>
      </NavLink>

      {/* Prominent Center Voice Action Orb */}
      <NavLink
        to="/voice"
        className={({ isActive }) => `mobile-nav-center-item ${isActive ? "active" : ""}`}
        aria-label="Voice Assistant"
      >
        <div className="mobile-voice-orb">
          <span className="mobile-voice-icon">🎙️</span>
        </div>
        <span className="mobile-nav-label">Voice</span>
      </NavLink>

      <NavLink
        to="/devices"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <span className="mobile-nav-icon">💡</span>
        <span className="mobile-nav-label">Devices</span>
      </NavLink>

      <NavLink
        to="/automations"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
      >
        <span className="mobile-nav-icon">⚡</span>
        <span className="mobile-nav-label">Automate</span>
      </NavLink>
    </nav>
  );
};

export default MobileBottomNav;
