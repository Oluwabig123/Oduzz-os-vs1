// AI Voice Structured Intent Schema & Safety Validation Pipeline
import type { Scene } from "../types/automations";

export type IntentType =
  | "ACTIVATE_SCENE"
  | "CONTROL_SINGLE"
  | "CONTROL_ROOM_BULK"
  | "QUERY_DEVICE"
  | "QUERY_GLOBAL_ON";

export type ParsedIntent =
  | {
      type: "ACTIVATE_SCENE";
      sceneName: string;
      modeKey: "MOVIE" | "NIGHT" | "WELCOME" | "AWAY" | "CUSTOM";
      customScene?: Scene;
    }
  | {
      type: "CONTROL_SINGLE";
      deviceId: string;
      deviceName: string;
      command: "TURN_ON" | "TURN_OFF";
    }
  | {
      type: "CONTROL_ROOM_BULK";
      roomId: string;
      roomName: string;
      command: "TURN_ON" | "TURN_OFF";
      deviceIds: string[];
    }
  | {
      type: "QUERY_DEVICE";
      deviceId: string;
      deviceName: string;
    }
  | {
      type: "QUERY_GLOBAL_ON";
    };

export type DeviceInfo = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
};

export type RoomInfo = {
  id: string;
  name: string;
};

function detectMentionedDeviceType(text: string): string | null {
  if (/\b(lights?|lamps?|bulbs?)\b/.test(text)) return "light";
  if (/\b(fans?|ventilators?)\b/.test(text)) return "fan";
  if (/\b(ac|air\s*conditioners?|coolers?)\b/.test(text)) return "ac";
  if (/\b(tvs?|televisions?|screens?)\b/.test(text)) return "tv";
  if (/\b(sockets?|plugs?|outlets?)\b/.test(text)) return "socket";
  return null;
}

export function parseVoiceIntent(
  commandText: string,
  devices: DeviceInfo[],
  rooms: RoomInfo[],
  customScenes?: Scene[]
): ParsedIntent | null {
  let text = commandText.toLowerCase().trim();

  // 0. Cleanly strip any leading wake word phonetic variant or pleasantry
  text = text
    .replace(
      /^(hey|hi|hello|ok|okay)?\s*(oduzz|odus|odos|or dose|oh duzz|all does|o duzz|audus|audos|o dose|old us)\s*,?\s*/i,
      ""
    )
    .replace(/^(can you|could you|please)\s+/i, "")
    .trim();

  if (!text) return null;

  // 1. Check user-created custom scenes first
  if (customScenes && customScenes.length > 0) {
    for (const scene of customScenes) {
      const cleanSceneName = scene.name
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();
      if (cleanSceneName && text.includes(cleanSceneName)) {
        return {
          type: "ACTIVATE_SCENE",
          sceneName: scene.name,
          modeKey: "CUSTOM",
          customScene: scene,
        };
      }
    }
  }

  // 2. Detect Built-in Scene Mode Phrases
  if (
    text.includes("movie time") ||
    text.includes("movie mode") ||
    text.includes("cinema mode") ||
    text.includes("watch a movie")
  ) {
    return {
      type: "ACTIVATE_SCENE",
      sceneName: "Movie Mode 🎬",
      modeKey: "MOVIE",
    };
  }

  if (
    text.includes("night mode") ||
    text.includes("sleep mode") ||
    text.includes("good night") ||
    text.includes("goodnight") ||
    text.includes("bedtime")
  ) {
    return {
      type: "ACTIVATE_SCENE",
      sceneName: "Night Mode 🌙",
      modeKey: "NIGHT",
    };
  }

  if (
    text.includes("welcome home") ||
    text.includes("i'm home") ||
    text.includes("im home") ||
    text.includes("arrived home")
  ) {
    return {
      type: "ACTIVATE_SCENE",
      sceneName: "Welcome Home 🏠",
      modeKey: "WELCOME",
    };
  }

  if (
    text.includes("away mode") ||
    text.includes("leaving home") ||
    text.includes("i'm leaving") ||
    text.includes("im leaving")
  ) {
    return {
      type: "ACTIVATE_SCENE",
      sceneName: "Away Mode 🚗",
      modeKey: "AWAY",
    };
  }

  // 3. Detect Global Status Query: "what devices are currently on?"
  if (
    text.includes("what devices are") ||
    text.includes("which devices are") ||
    text.includes("devices currently on") ||
    text.includes("what is on") ||
    text.includes("what's on") ||
    text.includes("whats on")
  ) {
    return { type: "QUERY_GLOBAL_ON" };
  }

  // 4. Detect Specific Device Query: "is the kitchen light on?"
  if (
    text.startsWith("is ") ||
    text.includes("is the") ||
    text.includes("status of") ||
    text.includes("check if")
  ) {
    const matchedDevice = findDeviceByName(text, devices, rooms);
    if (matchedDevice) {
      return {
        type: "QUERY_DEVICE",
        deviceId: matchedDevice.id,
        deviceName: matchedDevice.name,
      };
    }
  }

  // 5. Detect Action: TURN_ON or TURN_OFF
  let command: "TURN_ON" | "TURN_OFF" | null = null;
  if (
    text.includes("turn on") ||
    text.includes("switch on") ||
    text.includes("power on") ||
    text.includes("enable ") ||
    (text.includes("switch") && /\bon\b/.test(text)) ||
    (text.includes("turn") && /\bon\b/.test(text))
  ) {
    command = "TURN_ON";
  } else if (
    text.includes("turn off") ||
    text.includes("switch off") ||
    text.includes("power off") ||
    text.includes("shut off") ||
    text.includes("disable ") ||
    (text.includes("switch") && /\boff\b/.test(text)) ||
    (text.includes("turn") && /\boff\b/.test(text))
  ) {
    command = "TURN_OFF";
  }

  if (!command) {
    return null;
  }

  // 6. Check for Room or Home Bulk Intent: "turn off everything in the bedroom" / "turn off all lights"
  const isBulk =
    text.includes("everything") ||
    text.includes("all devices") ||
    text.includes("all the devices") ||
    text.includes("all lights") ||
    text.includes("all the lights") ||
    text.includes("all fans") ||
    text.includes("all sockets") ||
    text.includes("every device") ||
    text.includes("every light");

  if (isBulk) {
    const targetType = detectMentionedDeviceType(text);
    const matchedRoom = rooms.find((room) =>
      text.includes(room.name.toLowerCase())
    );

    if (matchedRoom) {
      const roomDevices = devices.filter(
        (dev) =>
          dev.room_id === matchedRoom.id &&
          (!targetType || dev.device_type === targetType)
      );

      return {
        type: "CONTROL_ROOM_BULK",
        roomId: matchedRoom.id,
        roomName: matchedRoom.name,
        command,
        deviceIds: roomDevices.map((d) => d.id),
      };
    }

    // Global bulk across all rooms (e.g., "turn off all lights" or "turn off everything")
    const filteredGlobal = targetType
      ? devices.filter((dev) => dev.device_type === targetType)
      : devices;

    if (filteredGlobal.length > 0) {
      return {
        type: "CONTROL_ROOM_BULK",
        roomId: "all",
        roomName: targetType ? `all ${targetType}s` : "your home",
        command,
        deviceIds: filteredGlobal.map((d) => d.id),
      };
    }
  }

  // 7. Fallback to Single Device Intent
  const matchedDevice = findDeviceByName(text, devices, rooms);
  if (matchedDevice) {
    return {
      type: "CONTROL_SINGLE",
      deviceId: matchedDevice.id,
      deviceName: matchedDevice.name,
      command,
    };
  }

  return null;
}

function findDeviceByName(
  text: string,
  devices: DeviceInfo[],
  rooms: RoomInfo[]
): DeviceInfo | null {
  // 1. Check if both room name and exact device name appear in the transcript
  for (const device of devices) {
    const room = rooms.find((r) => r.id === device.room_id);
    if (!room) continue;

    if (
      text.includes(room.name.toLowerCase()) &&
      text.includes(device.name.toLowerCase())
    ) {
      return device;
    }
  }

  // 2. Check exact device name match (prefer longer/more specific names first)
  const sortedByNameLength = [...devices].sort(
    (a, b) => b.name.length - a.name.length
  );
  const exactMatch = sortedByNameLength.find((device) =>
    text.includes(device.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  // 3. Weighted token + room + device_type scoring (keeping 'light', 'fan', 'tv', 'ac', 'socket' as meaningful tokens!)
  const stopWords = new Set([
    "turn",
    "switch",
    "power",
    "shut",
    "enable",
    "disable",
    "on",
    "off",
    "the",
    "a",
    "an",
    "in",
    "at",
    "my",
    "please",
    "device",
    "is",
    "check",
    "status",
    "of",
    "oduzz",
    "odus",
    "odos",
    "dose",
    "hey",
    "hello",
  ]);

  const mentionedType = detectMentionedDeviceType(text);
  const words = text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w));

  let bestDevice: DeviceInfo | null = null;
  let bestScore = 0;

  for (const device of devices) {
    const room = rooms.find((r) => r.id === device.room_id);
    const roomWords = room
      ? room.name
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
      : [];
    const deviceWords = device.name
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/);

    let score = 0;

    for (const word of words) {
      if (deviceWords.includes(word)) {
        score += 3; // High weight for matching device name word
      }
      if (roomWords.includes(word)) {
        score += 2; // Weight for matching room word
      }
    }

    if (mentionedType && device.device_type.toLowerCase() === mentionedType) {
      score += 3; // Strong bonus when spoken appliance type matches device_type
    }

    if (score > bestScore) {
      bestScore = score;
      bestDevice = device;
    }
  }

  return bestScore > 0 ? bestDevice : null;
}
