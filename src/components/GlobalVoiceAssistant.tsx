import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import OduzzLogo from "./OduzzLogo";
import "./GlobalVoiceAssistant.css";

export const GlobalVoiceAssistant: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isWakeEnabled, setIsWakeEnabled] = useState(false);

  useEffect(() => {
    const checkEnabled = () => {
      setIsWakeEnabled(localStorage.getItem("oduzz_wake_enabled") === "true");
    };

    checkEnabled();
    window.addEventListener("storage", checkEnabled);
    window.addEventListener("oduzz-wake-change", checkEnabled);
    return () => {
      window.removeEventListener("storage", checkEnabled);
      window.removeEventListener("oduzz-wake-change", checkEnabled);
    };
  }, [location.pathname]);

  // Hide when unauthenticated or on the dedicated /voice page
  if (
    !user ||
    location.pathname === "/voice" ||
    location.pathname === "/login" ||
    location.pathname === "/register"
  ) {
    return null;
  }

  return (
    <div
      className="global-voice-assistant-fab"
      role="button"
      tabIndex={0}
      aria-label="Open Voice Assistant"
      onClick={() => navigate("/voice")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("/voice");
        }
      }}
      title="Quick Voice Assistant — Tap to open voice control"
    >
      <div className="fab-tooltip">
        <OduzzLogo size={16} variant="icon" />
        <span>{isWakeEnabled ? "Voice Standby Ready" : "Voice Assistant"}</span>
      </div>
      <div className={`fab-orb ${isWakeEnabled ? "wake-active" : ""}`}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
        <span className="fab-pulse-ring" />
      </div>
    </div>
  );
};

export default GlobalVoiceAssistant;
