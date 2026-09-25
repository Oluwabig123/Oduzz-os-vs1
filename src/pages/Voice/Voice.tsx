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

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    const [{ data: deviceData, error: deviceError }, { data: roomData }] =
      await Promise.all([
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

    setDevices(deviceData || []);
    setRooms(roomData || []);
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessage(
        "Speech recognition is not supported in this browser. Try Google Chrome."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

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

      const currentTranscript =
        finalTranscript || interimTranscript;

      setTranscript(currentTranscript);

      if (finalTranscript) {
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event);

      setListening(false);

      if (event.error === "not-allowed") {
        setMessage(
          "Microphone permission was denied. Please allow microphone access."
        );
      } else {
        setMessage(`Voice error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function processVoiceCommand(text: string) {
    setProcessing(true);
    setMessage("Understanding command...");

    const commandText = text.toLowerCase().trim();

    let command: "TURN_ON" | "TURN_OFF" | null = null;

    if (
      commandText.includes("turn on") ||
      commandText.includes("switch on") ||
      commandText.includes("switch the") &&
        commandText.includes("on")
    ) {
      command = "TURN_ON";
    }

    if (
      commandText.includes("turn off") ||
      commandText.includes("switch off") ||
      commandText.includes("switch the") &&
        commandText.includes("off")
    ) {
      command = "TURN_OFF";
    }

    if (!command) {
      setMessage(
        'I could not understand the command. Try saying "turn on living room light".'
      );
      setProcessing(false);
      return;
    }

    const device = findDevice(commandText);

    if (!device) {
      setMessage(
        "I could not find a matching device. Try mentioning the device name."
      );
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
      console.error("Voice command error:", error);

      setMessage("Unable to send the command.");
      setProcessing(false);
      return;
    }

    setMessage(
      `${command === "TURN_ON" ? "Turning on" : "Turning off"} ${
        device.name
      }...`
    );

    setProcessing(false);
  }

  function findDevice(commandText: string): Device | null {
    const normalizedText = commandText.toLowerCase();

    /*
     * First try matching the device name.
     */
    const exactMatch = devices.find((device) =>
      normalizedText.includes(device.name.toLowerCase())
    );

    if (exactMatch) {
      return exactMatch;
    }

    /*
     * Try matching room + device.
     *
     * Example:
     * "turn on living room light"
     */

    for (const device of devices) {
      const room = rooms.find(
        (room) => room.id === device.room_id
      );

      if (!room) continue;

      const roomName = room.name.toLowerCase();
      const deviceName = device.name.toLowerCase();

      if (
        normalizedText.includes(roomName) &&
        normalizedText.includes(deviceName)
      ) {
        return device;
      }
    }

    /*
     * Finally try individual words.
     */

    const words = normalizedText.split(/\s+/);

    let bestDevice: Device | null = null;
    let bestScore = 0;

    for (const device of devices) {
      const deviceWords = device.name
        .toLowerCase()
        .split(/\s+/);

      let score = 0;

      for (const word of deviceWords) {
        if (words.includes(word)) {
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
    <div className="voice-page">
      <div className="voice-header">
        <div>
          <h1>Voice Control</h1>
          <p>
            Control your ODUZZ devices using your voice.
          </p>
        </div>

        <div
          className={`voice-status ${
            listening ? "listening" : ""
          }`}
        >
          <span className="voice-status-dot"></span>

          {listening ? "Listening" : "Ready"}
        </div>
      </div>

      <section className="voice-card">
        <div className="voice-microphone">
          🎙️
        </div>

        <h2>
          {listening
            ? "I'm listening..."
            : "What would you like to control?"}
        </h2>

        <p className="voice-description">
          Try commands such as:
        </p>

        <div className="voice-examples">
          <span>"Turn on living room light"</span>
          <span>"Turn off bedroom light"</span>
          <span>"Switch on kitchen light"</span>
        </div>

        <button
          className={`voice-button ${
            listening ? "voice-stop" : ""
          }`}
          onClick={
            listening ? stopListening : startListening
          }
          disabled={processing}
        >
          {listening ? "Stop Listening" : "Start Listening"}
        </button>

        <div className="voice-transcript">
          <span>Transcript</span>

          <p>
            {transcript || "Your spoken command will appear here."}
          </p>
        </div>

        {message && (
          <div className="voice-message">
            {message}
          </div>
        )}
      </section>

      <section className="voice-devices">
        <div className="voice-section-header">
          <h2>Available Devices</h2>

          <span>
            {devices.length} device
            {devices.length === 1 ? "" : "s"}
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="voice-empty">
            No devices available.
          </div>
        ) : (
          <div className="voice-device-list">
            {devices.map((device) => {
              const room = rooms.find(
                (item) => item.id === device.room_id
              );

              return (
                <div
                  className="voice-device"
                  key={device.id}
                >
                  <div>
                    <strong>{device.name}</strong>

                    <span>
                      {room?.name || "Unknown room"}
                    </span>
                  </div>

                  <span className="voice-device-type">
                    {device.device_type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Voice;