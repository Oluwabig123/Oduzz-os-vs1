import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import OduzzLogo from "./OduzzLogo";
import "./GlobalVoiceAssistant.css";

export const GlobalVoiceAssistant: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isWakeEnabled, setIsWakeEnabled] = useState(false);

  useEffect(() => {
    const checkEnabled = () => {
      setIsWakeEnabled(localStorage.getItem("oduzz_wake_enabled") === "true");
    };

    checkEnabled();
    window.addEventListener("storage", checkEnabled);
    return () => window.removeEventListener("storage", checkEnabled);
  }, []);

  // Hide on the dedicated /voice page or login/register pages
  if (
    location.pathname === "/voice" ||
    location.pathname === "/login" ||
    location.pathname === "/register"
  ) {
    return null;
  }

  return (
    <div
      className="global-voice-assistant-fab"
      onClick={() => navigate("/voice")}
      title="Quick Voice Assistant — Tap to control or say 'Hey Oduzz'"
    >
      <div className={`fab-orb ${isWakeEnabled ? "wake-active" : ""}`}>
        <span className="fab-icon">🎙️</span>
        <span className="fab-pulse-ring" />
      </div>
      <div className="fab-tooltip">
        <OduzzLogo size={16} variant="icon" />
        <span>{isWakeEnabled ? "Listening for 'Hey Oduzz'" : "Voice Assistant"}</span>
      </div>
    </div>
  );
};

export default GlobalVoiceAssistant;
