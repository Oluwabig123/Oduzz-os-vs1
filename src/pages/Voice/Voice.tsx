import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { speakText, stopSpeech } from "../../lib/tts";
import { parseVoiceIntent } from "../../lib/aiVoiceParser";
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
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lastCommandTime, setLastCommandTime] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    loadDevices();

    return () => {
      recognitionRef.current?.abort();
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

  function startListening() {
    stopSpeech(); // Stop any ongoing TTS audio before listening

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const err = "Speech recognition is not supported in this browser. Try Google Chrome.";
      setMessage(err);
      speakText(err, { lang: selectedLanguage, enabled: ttsEnabled });
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

      let errMsg = `Voice error: ${event.error}`;
      if (event.error === "not-allowed") {
        errMsg = "Microphone permission was denied. Please allow microphone access.";
      }
      setMessage(errMsg);
      speakText(errMsg, { lang: selectedLanguage, enabled: ttsEnabled });
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
    setMessage("Analyzing voice intent...");

    const intent = parseVoiceIntent(text, devices, rooms);

    if (!intent) {
      const fallbackMsg = 'Command unrecognized. Try saying "Turn on living room light" or "Is bedroom fan on?".';
      setMessage(fallbackMsg);
      speakText(fallbackMsg, { lang: selectedLanguage, enabled: ttsEnabled });
      setProcessing(false);
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
      setProcessing(false);
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
      setProcessing(false);
      return;
    }

    // Handle Bulk Room Command
    if (intent.type === "CONTROL_ROOM_BULK") {
      if (intent.deviceIds.length === 0) {
        const emptyMsg = `No devices found in the ${intent.roomName}.`;
        setMessage(emptyMsg);
        speakText(emptyMsg, { lang: selectedLanguage, enabled: ttsEnabled });
        setProcessing(false);
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
      setProcessing(false);
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
        setProcessing(false);
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
            setProcessing(false);
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
      setProcessing(false);
    }
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
          Try "Turn off everything in bedroom" or "Is kitchen light on?"
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
