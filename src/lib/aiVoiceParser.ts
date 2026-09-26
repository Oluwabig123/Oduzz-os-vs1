// AI Voice Structured Intent Schema & Safety Validation Pipeline

export type IntentType =
  | "CONTROL_SINGLE"
  | "CONTROL_ROOM_BULK"
  | "QUERY_DEVICE"
  | "QUERY_GLOBAL_ON";

export type ParsedIntent =
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

export function parseVoiceIntent(
  commandText: string,
  devices: DeviceInfo[],
  rooms: RoomInfo[]
): ParsedIntent | null {
  const text = commandText.toLowerCase().trim();

  // 1. Detect Global Status Query: "what devices are currently on?" or "what devices are on?"
  if (
    text.includes("what devices are") ||
    text.includes("which devices are") ||
    text.includes("devices currently on") ||
    (text.includes("what") && text.includes("on"))
  ) {
    return { type: "QUERY_GLOBAL_ON" };
  }

  // 2. Detect Specific Device Query: "is the kitchen light on?" or "status of living room light"
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

  // 3. Detect Action: TURN_ON or TURN_OFF
  let command: "TURN_ON" | "TURN_OFF" | null = null;
  if (
    text.includes("turn on") ||
    text.includes("switch on") ||
    (text.includes("switch") && text.includes("on"))
  ) {
    command = "TURN_ON";
  } else if (
    text.includes("turn off") ||
    text.includes("switch off") ||
    (text.includes("switch") && text.includes("off"))
  ) {
    command = "TURN_OFF";
  }

  if (!command) {
    return null;
  }

  // 4. Check for Room Bulk Intent: "turn off everything in the bedroom" / "turn on all lights in living room"
  const isBulk =
    text.includes("everything") ||
    text.includes("all devices") ||
    text.includes("all lights") ||
    text.includes("every device");

  if (isBulk) {
    const matchedRoom = rooms.find((room) =>
      text.includes(room.name.toLowerCase())
    );

    if (matchedRoom) {
      const roomDevices = devices.filter(
        (dev) => dev.room_id === matchedRoom.id
      );

      return {
        type: "CONTROL_ROOM_BULK",
        roomId: matchedRoom.id,
        roomName: matchedRoom.name,
        command,
        deviceIds: roomDevices.map((d) => d.id),
      };
    }
  }

  // 5. Fallback to Single Device Intent
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
  const exactMatch = devices.find((device) =>
    text.includes(device.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

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

  const stopWords = new Set([
    "turn",
    "switch",
    "on",
    "off",
    "the",
    "a",
    "an",
    "please",
    "light",
    "device",
    "is",
    "check",
    "status",
  ]);

  const words = text.split(/\s+/).filter((w) => !stopWords.has(w));
  let bestDevice: DeviceInfo | null = null;
  let bestScore = 0;

  for (const device of devices) {
    const room = rooms.find((r) => r.id === device.room_id);
    const roomWords = room ? room.name.toLowerCase().split(/\s+/) : [];
    const deviceWords = device.name.toLowerCase().split(/\s+/);
    const targetWords = [...roomWords, ...deviceWords].filter(
      (w) => !stopWords.has(w)
    );

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
