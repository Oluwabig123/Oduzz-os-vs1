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

    console.log("🎤 Voice devices loaded:", deviceData);
    console.log("🎤 Voice rooms loaded:", roomData);
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

    if (processing) {
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

      console.log("🎤 Speech recognition started");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
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

      console.log(
        "🎤 Speech transcript:",
        currentTranscript
      );

      if (finalTranscript) {
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error(
        "❌ Speech recognition error:",
        event
      );

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

      console.log("🎤 Speech recognition ended");
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "❌ Unable to start speech recognition:",
        error
      );

      setListening(false);
      setMessage("Unable to start voice recognition.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);

    console.log("🎤 Speech recognition stopped");
  }

  async function processVoiceCommand(text: string) {
    if (processing) {
      return;
    }

    setProcessing(true);
    setMessage("Understanding command...");

    const commandText = text.toLowerCase().trim();

    console.log(
      "🎤 Processing voice command:",
      commandText
    );

    let command: "TURN_ON" | "TURN_OFF" | null = null;

    /*
     * Detect TURN ON
     */
    if (
      commandText.includes("turn on") ||
      commandText.includes("switch on") ||
      (commandText.includes("switch the") &&
        commandText.includes("on"))
    ) {
      command = "TURN_ON";
    }

    /*
     * Detect TURN OFF
     */
    if (
      commandText.includes("turn off") ||
      commandText.includes("switch off") ||
      (commandText.includes("switch the") &&
        commandText.includes("off"))
    ) {
      command = "TURN_OFF";
    }

    console.log("🎤 Detected command:", command);

    if (!command) {
      setMessage(
        'I could not understand the command. Try saying "turn on living room light".'
      );

      setProcessing(false);
      return;
    }

    /*
     * Find matching device
     */
    const device = findDevice(commandText);

    console.log("🎤 Matched device:", device);

    if (!device) {
      setMessage(
        "I could not find a matching device. Try mentioning the device name."
      );

      setProcessing(false);
      return;
    }

    /*
     * Create device command
     */
    console.log("🎤 Creating device command:", {
      deviceId: device.id,
      deviceName: device.name,
      command,
    });

    const {
      data: insertedCommand,
      error,
    } = await supabase
      .from("device_commands")
      .insert({
        device_id: device.id,
        command,
        status: "pending",
      })
      .select()
      .single();

    console.log("🎤 Voice command created:", {
      command,
      device: device.name,
      deviceId: device.id,
      insertedCommand,
      error,
    });

    if (error) {
      console.error(
        "❌ Voice command error:",
        error
      );

      setMessage("Unable to send the command.");
      setProcessing(false);
      return;
    }

    console.log(
      "🎤 Voice command is now pending:",
      insertedCommand
    );

    setMessage(
      `${command === "TURN_ON" ? "Turning on" : "Turning off"} ${
        device.name
      }...`
    );

    // Trigger Virtual Hub & wait for completion
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
            `Successfully ${
              command === "TURN_ON" ? "turned on" : "turned off"
            } ${device.name}.`
          );
          setProcessing(false);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error("Error processing command state update:", err);
    }

    setMessage(
      `Command sent for ${device.name}.`
    );
    setProcessing(false);
  }

  function findDevice(commandText: string): Device | null {
    const normalizedText = commandText
      .toLowerCase()
      .trim();

    /*
     * First try exact device-name matching.
     *
     * Example:
     * "turn on living room light"
     *
     * Device:
     * "Living Room Light"
     */
    const exactMatch = devices.find((device) =>
      normalizedText.includes(
        device.name.toLowerCase()
      )
    );

    if (exactMatch) {
      console.log(
        "🎤 Device matched by exact name:",
        exactMatch
      );

      return exactMatch;
    }

    /*
     * Try room + device matching.
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
        console.log(
          "🎤 Device matched by room + device:",
          device
        );

        return device;
      }
    }

    /*
     * Finally try individual word matching.
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

    if (bestDevice && bestScore > 0) {
      console.log(
        "🎤 Device matched by word similarity:",
        {
          device: bestDevice,
          score: bestScore,
        }
      );

      return bestDevice;
    }

    console.log(
      "🎤 No matching device found for:",
      normalizedText
    );

    return null;
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
          <span>
            "Turn on living room light"
          </span>

          <span>
            "Turn off bedroom light"
          </span>

          <span>
            "Switch on kitchen light"
          </span>
        </div>

        <button
          className={`voice-button ${
            listening ? "voice-stop" : ""
          }`}
          onClick={
            listening
              ? stopListening
              : startListening
          }
          disabled={processing}
        >
          {listening
            ? "Stop Listening"
            : "Start Listening"}
        </button>

        <div className="voice-transcript">
          <span>Transcript</span>

          <p>
            {transcript ||
              "Your spoken command will appear here."}
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
            {devices.length === 1
              ? ""
              : "s"}
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
                (item) =>
                  item.id === device.room_id
              );

              return (
                <div
                  className="voice-device"
                  key={device.id}
                >
                  <div>
                    <strong>
                      {device.name}
                    </strong>

                    <span>
                      {room?.name ||
                        "Unknown room"}
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
