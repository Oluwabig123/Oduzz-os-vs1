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
      <div className={`fab-orb ${isWakeEnabled ? "wake-active" : ""}`}>
        <span className="fab-icon">🎙️</span>
        <span className="fab-pulse-ring" />
      </div>
      <div className="fab-tooltip">
        <OduzzLogo size={16} variant="icon" />
        <span>{isWakeEnabled ? "Voice Standby Ready" : "Voice Assistant"}</span>
      </div>
    </div>
  );
};

export default GlobalVoiceAssistant;
