import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
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

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [lastCommandTime, setLastCommandTime] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    loadDevices();

    return () => {
      recognitionRef.current?.abort();
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

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessage(
        "Speech recognition is not supported in this browser. Try Google Chrome."
      );
      return;
    }

    if (processing) {
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onstart = () => {
      setListening(true);
      setMessage("Listening...");
      setTranscript("");
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

      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      if (finalTranscript) {
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("❌ Speech recognition error:", event);
      setListening(false);

      if (event.error === "not-allowed") {
        setMessage("Microphone permission was denied. Please allow microphone access.");
      } else {
        setMessage(`Voice error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error("❌ Unable to start speech recognition:", error);
      setListening(false);
      setMessage("Unable to start voice recognition.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function processVoiceCommand(text: string) {
    if (processing) {
      return;
    }

    setProcessing(true);
    setMessage("Processing speech input...");

    const commandText = text.toLowerCase().trim();

    let command: "TURN_ON" | "TURN_OFF" | null = null;

    if (
      commandText.includes("turn on") ||
      commandText.includes("switch on") ||
      (commandText.includes("switch the") && commandText.includes("on"))
    ) {
      command = "TURN_ON";
    }

    if (
      commandText.includes("turn off") ||
      commandText.includes("switch off") ||
      (commandText.includes("switch the") && commandText.includes("off"))
    ) {
      command = "TURN_OFF";
    }

    if (!command) {
      setMessage('Command unrecognized. Try saying "Turn on living room light".');
      setProcessing(false);
      return;
    }

    const device = findDevice(commandText);

    if (!device) {
      setMessage("No matching target device recognized in speech.");
      setProcessing(false);
      return;
    }

    const { error } = await supabase
      .from("device_commands")
      .insert({
        device_id: device.id,
        command,
        status: "pending",
      });

    if (error) {
      setMessage("Unable to transmit voice command.");
      setProcessing(false);
      return;
    }

    setMessage(
      `${command === "TURN_ON" ? "Turning on" : "Turning off"} ${device.name}...`
    );

    try {
      const { processPendingCommands } = await import("../../hub/virtualHub");
      await processPendingCommands();

      const expectedState = command === "TURN_ON" ? "ON" : "OFF";
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data: latestState } = await supabase
          .from("device_states")
          .select("actual_state")
          .eq("device_id", device.id)
          .maybeSingle();

        if (latestState?.actual_state === expectedState) {
          setMessage(
            `Successfully ${command === "TURN_ON" ? "turned on" : "turned off"} ${device.name}.`
          );
          setLastCommandTime(new Date().toLocaleTimeString());
          setProcessing(false);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error("Error processing command state update:", err);
    }

    setLastCommandTime(new Date().toLocaleTimeString());
    setMessage(`Command sent for ${device.name}.`);
    setProcessing(false);
  }

  function findDevice(commandText: string): Device | null {
    const normalizedText = commandText.toLowerCase().trim();

    const exactMatch = devices.find((device) =>
      normalizedText.includes(device.name.toLowerCase())
    );

    if (exactMatch) {
      return exactMatch;
    }

    for (const device of devices) {
      const room = rooms.find((room) => room.id === device.room_id);
      if (!room) continue;

      const roomName = room.name.toLowerCase();
      const deviceName = device.name.toLowerCase();

      if (normalizedText.includes(roomName) && normalizedText.includes(deviceName)) {
        return device;
      }
    }

    const stopWords = new Set(["turn", "switch", "on", "off", "the", "a", "an", "please", "light", "device"]);
    const words = normalizedText
      .split(/\s+/)
      .filter((w) => !stopWords.has(w));

    let bestDevice: Device | null = null;
    let bestScore = 0;

    for (const device of devices) {
      const room = rooms.find((r) => r.id === device.room_id);
      const roomWords = room ? room.name.toLowerCase().split(/\s+/) : [];
      const deviceWords = device.name.toLowerCase().split(/\s+/);
      const targetWords = [...roomWords, ...deviceWords].filter((w) => !stopWords.has(w));

      let score = 0;
      for (const word of words) {
        if (targetWords.includes(word)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestDevice = device;
      }
    }

    return bestScore > 0 ? bestDevice : null;
  }

  return (
    <div className="voice-container">
      {/* Background Ambient Glow */}
      <div className={`ambient-glow ${listening ? "ambient-listening" : ""}`} />

      {/* Main Ambient Voice Card */}
      <div className="soothing-voice-card">
        {/* Status Badge */}
        <div className={`soothing-status-badge ${listening ? "listening" : ""}`}>
          <span className="pulse-dot" />
          <span>{listening ? "Listening..." : processing ? "Processing..." : "Voice Ready"}</span>
        </div>

        {/* Dynamic Orb Indicator */}
        <div className="orb-wrapper" onClick={listening ? stopListening : startListening}>
          <div className={`soothing-orb ${listening ? "active" : processing ? "processing" : ""}`}>
            <span className="orb-icon">{listening ? "🎙️" : "✨"}</span>
          </div>
          <div className="orb-ring ring-1" />
          <div className="orb-ring ring-2" />
        </div>

        {/* Prompt Header */}
        <h1 className="soothing-title">
          {listening
            ? "Speak your command clearly..."
            : processing
            ? "Understanding command..."
            : "Tap to Control"}
        </h1>
        <p className="soothing-subtitle">
          Say "Turn on living room light" or "Switch off bedroom fan"
        </p>

        {/* Action Button */}
        <button
          className={`soothing-action-button ${listening ? "listening" : ""}`}
          onClick={listening ? stopListening : startListening}
          disabled={processing}
        >
          {listening ? "Stop Listening" : "Start Voice Input"}
        </button>

        {/* Live Audio & Transcript Stream */}
        <div className="transcript-panel">
          <div className="transcript-header">
            <span className="transcript-label">Live Speech Transcript</span>
            {listening && (
              <div className="audio-wave">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </div>
            )}
          </div>
          <p className="transcript-text">
            {transcript || "Spoken commands will appear here in real time..."}
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
                disabled={listening || processing}
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-NG">English (Nigeria)</option>
              </select>
            </div>

            <div className="param-card">
              <span className="param-label">Input Sensitivity</span>
              <span className="param-value">Auto-Calibrated</span>
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
