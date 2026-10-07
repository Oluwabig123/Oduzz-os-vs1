import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { speakText, stopSpeech } from "../../lib/tts";
import { parseVoiceIntent } from "../../lib/aiVoiceParser";
import {
  detectWakeWord,
  getStoredWakeVariants,
  saveWakeVariants,
  resetWakeVariants,
  playWakeChime,
  isChimeEnabled,
  setChimeEnabled,
} from "../../lib/wakeWordEngine";
import "./Voice.css";

type Room = {
  id: string;
  name: string;
};

type Device = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;

  start: () => void;
  stop: () => void;
  abort: () => void;

  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function Voice() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Speech states
  const [listening, setListening] = useState(false);
  const [wakeStandby, setWakeStandby] = useState(false); // In background listening for wake-up word
  const [awake, setAwake] = useState(false); // Wake word triggered, awaiting command
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lastCommandTime, setLastCommandTime] = useState<string | null>(null);

  // Wake word settings
  const [wakeWordActive, setWakeWordActive] = useState<boolean>(() => {
    return localStorage.getItem("oduzz_wake_enabled") === "true";
  });
  const [wakeVariants, setWakeVariants] = useState<string[]>(getStoredWakeVariants);
  const [newVariantInput, setNewVariantInput] = useState("");
  const [chimeActive, setChimeActive] = useState<boolean>(isChimeEnabled);
  const [showWakeSettings, setShowWakeSettings] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeWordActiveRef = useRef(wakeWordActive);
  const awakeTimeoutRef = useRef<any>(null);
  const isIntentProcessingRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    wakeWordActiveRef.current = wakeWordActive;
    localStorage.setItem("oduzz_wake_enabled", wakeWordActive ? "true" : "false");
  }, [wakeWordActive]);

  useEffect(() => {
    loadDevices();

    // If wake word is already saved as active, start listener
    if (wakeWordActive) {
      startSpeechStream(true);
    }

    return () => {
      recognitionRef.current?.abort();
      if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
      stopSpeech();
    };
  }, []);

  async function loadDevices() {
    const [
      { data: deviceData, error: deviceError },
      { data: roomData, error: roomError },
    ] = await Promise.all([
      supabase
        .from("devices")
        .select("id, room_id, name, device_type")
        .order("created_at", { ascending: true }),

      supabase
        .from("rooms")
        .select("id, name")
        .order("created_at", { ascending: true }),
    ]);

    if (deviceError) {
      console.error("Error loading devices:", deviceError);
      setMessage("Unable to load devices.");
      return;
    }

    if (roomError) {
      console.error("Error loading rooms:", roomError);
      setMessage("Unable to load rooms.");
      return;
    }

    setDevices(deviceData || []);
    setRooms(roomData || []);
  }

  /**
   * Initializes and maintains the Speech Recognition stream.
   * Handles continuous loop for wake-up word detection.
   */
  function startSpeechStream(isWakeMode: boolean = false) {
    stopSpeech();

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const err =
        "Speech recognition is not supported in this browser. Try Google Chrome or Android/Edge.";
      setMessage(err);
      speakText(err, { lang: selectedLanguage, enabled: ttsEnabled });
      return;
    }

    if (isIntentProcessingRef.current) return;

    // Clean up existing recognition instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      setListening(true);
      if (isWakeMode) {
        setWakeStandby(true);
        setMessage("Listening for wake phrase ('Hey Oduzz', 'Odos', 'Odus')...");
      } else {
        setMessage("Listening for command...");
      }
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      const currentTranscript = (finalTranscript || interimTranscript).trim();
      if (!currentTranscript) return;

      setTranscript(currentTranscript);

      // 1. Hands-Free Wake Word Mode is enabled
      if (wakeWordActiveRef.current) {
        handleWakeWordStream(currentTranscript, Boolean(finalTranscript));
      } else if (finalTranscript) {
        // Manual mode: process final phrase
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition notice:", event.error);

      if (event.error === "not-allowed") {
        setListening(false);
        setWakeStandby(false);
        setWakeWordActive(false);
        const errMsg =
          "Microphone permission was denied. Please allow microphone access in your browser.";
        setMessage(errMsg);
        speakText(errMsg, { lang: selectedLanguage, enabled: ttsEnabled });
        return;
      }

      // For network / no-speech errors, we let onend handle the auto-restart loop
    };

    recognition.onend = () => {
      setListening(false);

      // Auto-restart loop if wake word mode is still active and not paused by command execution
      if (wakeWordActiveRef.current && !isIntentProcessingRef.current) {
        setTimeout(() => {
          if (wakeWordActiveRef.current && !isIntentProcessingRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.warn("Speech restart retry:", err);
            }
          }
        }, 250);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error("Unable to start speech recognition:", error);
      setListening(false);
      setMessage("Unable to start microphone.");
    }
  }

  /**
   * Processes live transcripts for wake word triggers.
   */
  function handleWakeWordStream(text: string, isFinal: boolean) {
    if (isIntentProcessingRef.current) return;

    // Check if transcript contains any wake-up variant
    const check = detectWakeWord(text, wakeVariants);

    if (check.detected) {
      // If we weren't awake yet, trigger wake state and chime!
      if (!awake) {
        setAwake(true);
        setWakeStandby(false);
        playWakeChime();

        // If there's already a command in the same sentence (e.g. "Hey Odos, turn on the light")
        if (check.commandText && check.commandText.length > 2) {
          setMessage(`Wake detected (${check.matchedVariant})! Executing command...`);
          processVoiceCommand(check.commandText);
          return;
        }

        // Otherwise, wake up and wait for the upcoming command
        setMessage(`Oduzz is listening! Speak your command...`);
        speakText("I'm listening", { lang: selectedLanguage, enabled: ttsEnabled });

        // Set a 6-second timeout to return to wake standby if no follow-up command arrives
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        awakeTimeoutRef.current = setTimeout(() => {
          setAwake(false);
          setWakeStandby(true);
          setMessage("Listening for wake phrase ('Hey Oduzz', 'Odos', 'Odus')...");
        }, 6000);
        return;
      }

      // If we were already awake and user spoke the command
      if (check.commandText) {
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        processVoiceCommand(check.commandText);
      }
    } else if (awake && isFinal) {
      // User is awake and spoke a non-wake command (e.g. "turn off light")
      if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
      processVoiceCommand(text);
    }
  }

  function stopAllListening() {
    wakeWordActiveRef.current = false;
    setWakeWordActive(false);
    setWakeStandby(false);
    setAwake(false);
    setListening(false);
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
    try {
      recognitionRef.current?.stop();
    } catch {}
  }

  function toggleWakeWordMode() {
    const nextState = !wakeWordActive;
    setWakeWordActive(nextState);

    if (nextState) {
      startSpeechStream(true);
    } else {
      stopAllListening();
      setMessage("Wake word standby deactivated.");
    }
  }

  async function processVoiceCommand(text: string) {
    if (processing || isIntentProcessingRef.current) {
      return;
    }

    isIntentProcessingRef.current = true;
    setProcessing(true);
    setMessage("Analyzing voice intent...");

    const intent = parseVoiceIntent(text, devices, rooms);

    if (!intent) {
      const fallbackMsg =
        'Command unrecognized. Try saying "Turn on living room light" or "Is bedroom fan on?".';
      setMessage(fallbackMsg);
      speakText(fallbackMsg, { lang: selectedLanguage, enabled: ttsEnabled });
      cleanupAfterCommand();
      return;
    }

    // Handle Scene Mode Activation
    if (intent.type === "ACTIVATE_SCENE") {
      const startMsg = `Activating ${intent.sceneName}...`;
      setMessage(startMsg);
      speakText(startMsg, { lang: selectedLanguage, enabled: ttsEnabled });

      let commandRows: { device_id: string; command: string; status: string }[] = [];

      if (intent.modeKey === "MOVIE") {
        commandRows = devices.map((d) => ({
          device_id: d.id,
          command: d.device_type === "light" ? "TURN_OFF" : "TURN_ON",
          status: "pending",
        }));
      } else if (intent.modeKey === "NIGHT" || intent.modeKey === "AWAY") {
        commandRows = devices.map((d) => ({
          device_id: d.id,
          command: "TURN_OFF",
          status: "pending",
        }));
      } else if (intent.modeKey === "WELCOME") {
        commandRows = devices.map((d) => ({
          device_id: d.id,
          command: "TURN_ON",
          status: "pending",
        }));
      }

      if (commandRows.length > 0) {
        await supabase.from("device_commands").insert(commandRows);
        try {
          const { processPendingCommands } = await import("../../hub/virtualHub");
          await processPendingCommands();
        } catch (err) {
          console.error("Error executing scene commands:", err);
        }
      }

      const successMsg = `Successfully activated ${intent.sceneName}. Mode routines executed.`;
      setMessage(successMsg);
      speakText(successMsg, { lang: selectedLanguage, enabled: ttsEnabled });
      setLastCommandTime(new Date().toLocaleTimeString());
      cleanupAfterCommand();
      return;
    }

    // Handle Global Status Query
    if (intent.type === "QUERY_GLOBAL_ON") {
      const { data: states } = await supabase.from("device_states").select("*");
      const onDeviceIds = (states || [])
        .filter((s) => s.actual_state === "ON")
        .map((s) => s.device_id);

      const activeDevices = devices.filter((d) => onDeviceIds.includes(d.id));

      let queryReply = "";
      if (activeDevices.length === 0) {
        queryReply = "All devices are currently turned off.";
      } else {
        const names = activeDevices.map((d) => d.name).join(", ");
        queryReply = `The following ${activeDevices.length} device${
          activeDevices.length === 1 ? " is" : "s are"
        } currently on: ${names}.`;
      }

      setMessage(queryReply);
      speakText(queryReply, { lang: selectedLanguage, enabled: ttsEnabled });
      setLastCommandTime(new Date().toLocaleTimeString());
      cleanupAfterCommand();
      return;
    }

    // Handle Specific Device Query
    if (intent.type === "QUERY_DEVICE") {
      const { data: stateData } = await supabase
        .from("device_states")
        .select("actual_state")
        .eq("device_id", intent.deviceId)
        .maybeSingle();

      const currentState = stateData?.actual_state || "OFF";
      const reply = `The ${intent.deviceName} is currently turned ${currentState.toLowerCase()}.`;

      setMessage(reply);
      speakText(reply, { lang: selectedLanguage, enabled: ttsEnabled });
      setLastCommandTime(new Date().toLocaleTimeString());
      cleanupAfterCommand();
      return;
    }

    // Handle Bulk Room Command
    if (intent.type === "CONTROL_ROOM_BULK") {
      if (intent.deviceIds.length === 0) {
        const emptyMsg = `No devices found in the ${intent.roomName}.`;
        setMessage(emptyMsg);
        speakText(emptyMsg, { lang: selectedLanguage, enabled: ttsEnabled });
        cleanupAfterCommand();
        return;
      }

      const actionText = intent.command === "TURN_ON" ? "Turning on" : "Turning off";
      const startMsg = `${actionText} all devices in ${intent.roomName}...`;
      setMessage(startMsg);
      speakText(startMsg, { lang: selectedLanguage, enabled: ttsEnabled });

      const commandRows = intent.deviceIds.map((devId) => ({
        device_id: devId,
        command: intent.command,
        status: "pending",
      }));

      await supabase.from("device_commands").insert(commandRows);

      try {
        const { processPendingCommands } = await import("../../hub/virtualHub");
        await processPendingCommands();
      } catch (err) {
        console.error("Error executing bulk command:", err);
      }

      const successMsg = `Successfully ${
        intent.command === "TURN_ON" ? "turned on" : "turned off"
      } all devices in ${intent.roomName}.`;
      setMessage(successMsg);
      speakText(successMsg, { lang: selectedLanguage, enabled: ttsEnabled });
      setLastCommandTime(new Date().toLocaleTimeString());
      cleanupAfterCommand();
      return;
    }

    // Handle Single Device Control
    if (intent.type === "CONTROL_SINGLE") {
      const actionText = intent.command === "TURN_ON" ? "Turning on" : "Turning off";
      const startMsg = `${actionText} ${intent.deviceName}...`;
      setMessage(startMsg);
      speakText(startMsg, { lang: selectedLanguage, enabled: ttsEnabled });

      const { error } = await supabase.from("device_commands").insert({
        device_id: intent.deviceId,
        command: intent.command,
        status: "pending",
      });

      if (error) {
        const errReply = "Unable to transmit command to device.";
        setMessage(errReply);
        speakText(errReply, { lang: selectedLanguage, enabled: ttsEnabled });
        cleanupAfterCommand();
        return;
      }

      try {
        const { processPendingCommands } = await import("../../hub/virtualHub");
        await processPendingCommands();

        const expectedState = intent.command === "TURN_ON" ? "ON" : "OFF";
        const maxAttempts = 10;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const { data: latestState } = await supabase
            .from("device_states")
            .select("actual_state")
            .eq("device_id", intent.deviceId)
            .maybeSingle();

          if (latestState?.actual_state === expectedState) {
            const successMsg = `Successfully ${
              intent.command === "TURN_ON" ? "turned on" : "turned off"
            } ${intent.deviceName}.`;
            setMessage(successMsg);
            speakText(successMsg, { lang: selectedLanguage, enabled: ttsEnabled });
            setLastCommandTime(new Date().toLocaleTimeString());
            cleanupAfterCommand();
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error("Error processing command state update:", err);
      }

      const sentMsg = `Command sent for ${intent.deviceName}.`;
      setMessage(sentMsg);
      speakText(sentMsg, { lang: selectedLanguage, enabled: ttsEnabled });
      setLastCommandTime(new Date().toLocaleTimeString());
      cleanupAfterCommand();
    }
  }

  function cleanupAfterCommand() {
    setProcessing(false);
    isIntentProcessingRef.current = false;
    setAwake(false);

    // If wake word is active, return smoothly to wake standby
    if (wakeWordActiveRef.current) {
      setWakeStandby(true);
      setMessage("Listening for wake phrase ('Hey Oduzz', 'Odos', 'Odus')...");
    }
  }

  // Variant manager functions
  function handleAddVariant(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newVariantInput.trim().toLowerCase();
    if (!trimmed || wakeVariants.includes(trimmed)) return;

    const updated = [...wakeVariants, trimmed];
    setWakeVariants(updated);
    saveWakeVariants(updated);
    setNewVariantInput("");
  }

  function handleRemoveVariant(variantToRemove: string) {
    const updated = wakeVariants.filter((v) => v !== variantToRemove);
    setWakeVariants(updated);
    saveWakeVariants(updated);
  }

  function handleResetVariants() {
    const defaults = resetWakeVariants();
    setWakeVariants(defaults);
  }

  function toggleChime() {
    const nextVal = !chimeActive;
    setChimeActive(nextVal);
    setChimeEnabled(nextVal);
  }

  return (
    <div className="voice-container">
      {/* Background Ambient Glow */}
      <div
        className={`ambient-glow ${
          awake
            ? "ambient-awake"
            : listening || wakeStandby
            ? "ambient-listening"
            : ""
        }`}
      />

      {/* Main Voice Card */}
      <div className="soothing-voice-card">
        {/* Status Badge */}
        <div
          className={`soothing-status-badge ${
            awake ? "awake" : listening || wakeStandby ? "listening" : ""
          }`}
        >
          <span className="pulse-dot" />
          <span>
            {processing
              ? "Executing Command..."
              : awake
              ? "✨ Oduzz is Listening..."
              : wakeStandby
              ? "👂 Standby: Listening for 'Hey Oduzz' / 'Odos'"
              : listening
              ? "🎙️ Listening..."
              : "Voice Ready"}
          </span>
        </div>

        {/* Dynamic Orb Indicator */}
        <div
          className="orb-wrapper"
          onClick={
            wakeWordActive
              ? toggleWakeWordMode
              : listening
              ? stopAllListening
              : () => startSpeechStream(false)
          }
        >
          <div
            className={`soothing-orb ${
              awake
                ? "awake-orb"
                : listening || wakeStandby
                ? "active"
                : processing
                ? "processing"
                : ""
            }`}
          >
            <span className="orb-icon">{awake ? "⚡" : listening ? "🎙️" : "✨"}</span>
          </div>
          <div className="orb-ring ring-1" />
          <div className="orb-ring ring-2" />
        </div>

        {/* Prompt Header */}
        <h1 className="soothing-title">
          {awake
            ? "I'm listening! Speak your command..."
            : wakeStandby
            ? "Say 'Hey Oduzz' or 'Odos' anytime"
            : listening
            ? "Speak your command clearly..."
            : processing
            ? "Understanding command..."
            : "Voice Control"}
        </h1>

        <p className="soothing-subtitle">
          {wakeWordActive
            ? "Hands-free listening is active. Try saying 'Hey Odos, turn on living room light' or 'Or dose, night mode'"
            : "Tap to talk or enable hands-free wake word below"}
        </p>

        {/* Wake Word Hands-Free Banner Toggle */}
        <div className="wake-word-toggle-card">
          <div className="wake-toggle-info">
            <span className="wake-toggle-title">
              ⚡ Hands-Free Wake Word Engine
            </span>
            <span className="wake-toggle-desc">
              Listens for <strong>"Hey Oduzz"</strong>, <strong>"Odos"</strong>, <strong>"Odus"</strong>, or <strong>"Or dose"</strong>
            </span>
          </div>
          <div className="wake-toggle-controls">
            <button
              className={`wake-switch ${wakeWordActive ? "active" : ""}`}
              onClick={toggleWakeWordMode}
            >
              {wakeWordActive ? "🟢 Active" : "⚪ Disabled"}
            </button>
            <button
              className="wake-settings-btn"
              onClick={() => setShowWakeSettings(!showWakeSettings)}
              title="Configure Wake Words"
            >
              ⚙️ Options
            </button>
          </div>
        </div>

        {/* Wake Word Settings Drawer */}
        {showWakeSettings && (
          <div className="wake-settings-drawer">
            <div className="wake-settings-header">
              <h4>Configure Wake Words & Phonetics</h4>
              <button
                className="drawer-close-btn"
                onClick={() => setShowWakeSettings(false)}
              >
                ✕
              </button>
            </div>
            <p className="wake-settings-hint">
              Speech recognizers interpret "Oduzz" differently based on accent or device. You can add or customize phonetic variants below.
            </p>

            <form onSubmit={handleAddVariant} className="add-variant-form">
              <input
                type="text"
                placeholder="e.g. 'hey odos', 'or dose', 'odus'"
                value={newVariantInput}
                onChange={(e) => setNewVariantInput(e.target.value)}
                className="variant-input"
              />
              <button type="submit" className="add-variant-btn">
                + Add
              </button>
            </form>

            <div className="variants-chip-list">
              {wakeVariants.map((v) => (
                <span key={v} className="variant-chip">
                  <span>{v}</span>
                  <button
                    onClick={() => handleRemoveVariant(v)}
                    className="chip-remove"
                    title="Remove variant"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="wake-settings-actions">
              <button
                className="reset-variants-btn"
                onClick={handleResetVariants}
              >
                ↺ Reset Default Phonetics
              </button>

              <button
                className={`chime-toggle-btn ${chimeActive ? "on" : "off"}`}
                onClick={toggleChime}
              >
                {chimeActive ? "🔔 Wake Chime: On" : "🔕 Wake Chime: Off"}
              </button>
            </div>
          </div>
        )}

        {/* Action Button for Manual Input */}
        {!wakeWordActive && (
          <button
            className={`soothing-action-button ${listening ? "listening" : ""}`}
            onClick={listening ? stopAllListening : () => startSpeechStream(false)}
            disabled={processing}
          >
            {listening ? "Stop Listening" : "Start Voice Input"}
          </button>
        )}

        {/* Live Audio & Transcript Stream */}
        <div className="transcript-panel">
          <div className="transcript-header">
            <span className="transcript-label">Live Speech Transcript</span>
            {(listening || wakeStandby) && (
              <div className="audio-wave">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </div>
            )}
          </div>
          <p className="transcript-text">
            {transcript ||
              (wakeWordActive
                ? "Say 'Hey Oduzz' or 'Odos' to wake up..."
                : "Spoken commands will appear here in real time...")}
          </p>
        </div>

        {/* Notification Feedback */}
        {message && <div className="soothing-message-box">{message}</div>}

        {/* Voice Parameters Drawer */}
        <div className="voice-params-panel">
          <h3 className="params-title">Voice Parameters</h3>
          <div className="params-grid">
            <div className="param-card">
              <span className="param-label">Language / Locale</span>
              <select
                className="param-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={processing}
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-NG">English (Nigeria)</option>
              </select>
            </div>

            <div className="param-card">
              <span className="param-label">Voice Feedback (TTS)</span>
              <button
                className={`tts-toggle-btn ${ttsEnabled ? "enabled" : "disabled"}`}
                onClick={() => setTtsEnabled(!ttsEnabled)}
              >
                {ttsEnabled ? "🔊 Enabled" : "🔇 Muted"}
              </button>
            </div>

            <div className="param-card">
              <span className="param-label">Connected Targets</span>
              <span className="param-value">{devices.length} Devices</span>
            </div>

            <div className="param-card">
              <span className="param-label">Last Execution</span>
              <span className="param-value">{lastCommandTime || "None"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Voice;
