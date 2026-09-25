import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Devices.css";

type Home = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  home_id: string;
  name: string;
};

type Device = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
  device_uid: string;
  created_at: string;
};

type DeviceState = {
  device_id: string;
  desired_state: string;
  actual_state: string;
  updated_at: string;
};

type DeviceActivity = {
  id: string;
  device_id: string;
  command: string;
  result: string;
  created_at: string;
};

function Devices() {
  const [homes, setHomes] = useState<Home[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [deviceStates, setDeviceStates] = useState<
    Record<string, DeviceState>
  >({});

  const [deviceActivity, setDeviceActivity] = useState<
    Record<string, DeviceActivity[]>
  >({});

  const [pendingCommands, setPendingCommands] = useState<
    Record<string, boolean>
  >({});

  const [selectedHome, setSelectedHome] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");

  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("light");
  const [deviceUid, setDeviceUid] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadHomes() {
    const { data, error } = await supabase
      .from("homes")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading homes:", error);
    } else {
      setHomes(data ?? []);

      if (data && data.length > 0) {
        setSelectedHome(data[0].id);
      }
    }

    setLoading(false);
  }

  async function loadRooms(homeId: string) {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, home_id, name")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading rooms:", error);
      setRooms([]);
    } else {
      setRooms(data ?? []);

      if (data && data.length > 0) {
        setSelectedRoom(data[0].id);
      } else {
        setSelectedRoom("");
      }
    }
  }

  async function loadDevices(roomId: string) {
    const { data: devicesData, error: devicesError } = await supabase
      .from("devices")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (devicesError) {
      console.error("Error loading devices:", devicesError);
      return;
    }

    const loadedDevices = devicesData ?? [];

    setDevices(loadedDevices);

    if (loadedDevices.length === 0) {
      setDeviceStates({});
      setDeviceActivity({});
      return;
    }

    const deviceIds = loadedDevices.map((device) => device.id);

    // Load device states
    const { data: statesData, error: statesError } = await supabase
      .from("device_states")
      .select("*")
      .in("device_id", deviceIds);

    if (statesError) {
      console.error("Error loading device states:", statesError);
    } else {
      const statesMap: Record<string, DeviceState> = {};

      (statesData ?? []).forEach((state) => {
        statesMap[state.device_id] = state;
      });

      setDeviceStates(statesMap);
    }

    // Load device activity
    const { data: activityData, error: activityError } = await supabase
      .from("device_activity")
      .select("*")
      .in("device_id", deviceIds)
      .order("created_at", { ascending: false });

    if (activityError) {
      console.error("Error loading device activity:", activityError);
      return;
    }

    const activityMap: Record<string, DeviceActivity[]> = {};

    deviceIds.forEach((deviceId) => {
      activityMap[deviceId] = [];
    });

    (activityData ?? []).forEach((activity) => {
      if (!activityMap[activity.device_id]) {
        activityMap[activity.device_id] = [];
      }

      activityMap[activity.device_id].push(activity);
    });

    setDeviceActivity(activityMap);
  }

  useEffect(() => {
    loadHomes();
  }, []);

  useEffect(() => {
    if (selectedHome) {
      loadRooms(selectedHome);
    }
  }, [selectedHome]);

  useEffect(() => {
    if (selectedRoom) {
      loadDevices(selectedRoom);
    } else {
      setDevices([]);
      setDeviceStates({});
      setDeviceActivity({});
    }
  }, [selectedRoom]);

  // Realtime updates
  useEffect(() => {
    if (!selectedRoom) {
      return;
    }

    const channel = supabase
      .channel(`device-realtime-${selectedRoom}`)

      // Device state realtime updates
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "device_states",
        },
        async (payload) => {
          console.log("Realtime device state:", payload);

          const updatedState = payload.new as DeviceState;

          if (!updatedState?.device_id) {
            return;
          }

          // Update immediately from realtime event
          setDeviceStates((currentStates) => ({
            ...currentStates,
            [updatedState.device_id]: updatedState,
          }));

          // Then fetch the latest state from Supabase
          const { data, error } = await supabase
            .from("device_states")
            .select("*")
            .eq("device_id", updatedState.device_id)
            .maybeSingle();

          if (error) {
            console.error(
              "Error refreshing device state:",
              error
            );
            return;
          }

          if (data) {
            setDeviceStates((currentStates) => ({
              ...currentStates,
              [data.device_id]: data,
            }));

            // Device has reached its actual state.
            // Allow another command.
            setPendingCommands((currentPending) => ({
              ...currentPending,
              [data.device_id]: false,
            }));
          }
        }
      )

      // Device activity realtime updates
      // Device activity realtime updates
        .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "device_activity",
        },
        (payload) => {
            console.log("Realtime device activity:", payload);

            const newActivity = payload.new as DeviceActivity;

            if (!newActivity?.id || !newActivity?.device_id) {
            return;
            }

            setDeviceActivity((currentActivity) => {
            const existingActivities =
                currentActivity[newActivity.device_id] ?? [];

            // Prevent duplicate activity entries
            const alreadyExists = existingActivities.some(
                (activity) => activity.id === newActivity.id
            );

            if (alreadyExists) {
                return currentActivity;
            }

            return {
                ...currentActivity,
                [newActivity.device_id]: [
                newActivity,
                ...existingActivities,
                ],
            };
            });
        }
        )   

      .subscribe((status) => {
        console.log(
          `Device realtime subscription status: ${status}`
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom]);

  async function sendCommand(
  deviceId: string,
  command: "TURN_ON" | "TURN_OFF"
) {
  // Prevent duplicate commands
  if (pendingCommands[deviceId]) {
    console.log(
      `Command already pending for device ${deviceId}`
    );
    return;
  }

  const expectedState =
    command === "TURN_ON" ? "ON" : "OFF";

  // Lock the buttons immediately
  setPendingCommands((currentPending) => ({
    ...currentPending,
    [deviceId]: true,
  }));

  const { error } = await supabase
    .from("device_commands")
    .insert([
      {
        device_id: deviceId,
        command,
        status: "pending",
      },
    ]);

  if (error) {
    console.error("Command error:", error);

    setPendingCommands((currentPending) => ({
      ...currentPending,
      [deviceId]: false,
    }));

    alert(error.message);
    return;
  }

  console.log(`Command sent: ${command}`);

  // Wait for the Virtual Hub to update the device state.
  // We check Supabase directly instead of relying only
  // on the realtime event.
  const maxAttempts = 15;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );

    const { data: latestState, error: stateError } =
      await supabase
        .from("device_states")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

    if (stateError) {
      console.error(
        "Error checking device state:",
        stateError
      );
      continue;
    }

    if (!latestState) {
      continue;
    }

    console.log(
      `Device state check ${attempt + 1}:`,
      latestState.actual_state
    );

    // Update the UI immediately
    setDeviceStates((currentStates) => ({
      ...currentStates,
      [deviceId]: latestState,
    }));

    // Command has reached the expected physical state
    if (latestState.actual_state === expectedState) {
      console.log(
        `Device ${deviceId} reached ${expectedState}`
      );

      setPendingCommands((currentPending) => ({
        ...currentPending,
        [deviceId]: false,
      }));

      return;
    }
  }

  // Safety fallback
  console.warn(
    `Device ${deviceId} did not reach ${expectedState} within the expected time.`
  );

  setPendingCommands((currentPending) => ({
    ...currentPending,
    [deviceId]: false,
  }));
}

  async function createDevice() {
    if (!selectedRoom) {
      alert("Please select a room.");
      return;
    }

    if (!deviceName.trim()) {
      alert("Please enter a device name.");
      return;
    }

    if (!deviceUid.trim()) {
      alert("Please enter a device UID.");
      return;
    }

    setSaving(true);

    const { data: newDevice, error } = await supabase
      .from("devices")
      .insert([
        {
          room_id: selectedRoom,
          name: deviceName.trim(),
          device_type: deviceType,
          device_uid: deviceUid.trim(),
        },
      ])
      .select()
      .single();

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    const { error: stateError } = await supabase
      .from("device_states")
      .insert([
        {
          device_id: newDevice.id,
          desired_state: "OFF",
          actual_state: "OFF",
        },
      ]);

    if (stateError) {
      console.error("Error creating device state:", stateError);
      alert(stateError.message);
      setSaving(false);
      return;
    }

    setDeviceName("");
    setDeviceUid("");

    await loadDevices(selectedRoom);

    alert("Device created successfully!");

    setSaving(false);
  }

  if (loading) {
    return <p style={{ padding: "2rem" }}>Loading...</p>;
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>ODUZZ OS</h1>

      <h2>Devices</h2>

      <br />

      <label>Home</label>

      <br />

      <select
        value={selectedHome}
        onChange={(e) => setSelectedHome(e.target.value)}
      >
        {homes.map((home) => (
          <option key={home.id} value={home.id}>
            {home.name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <label>Room</label>

      <br />

      <select
        value={selectedRoom}
        onChange={(e) => setSelectedRoom(e.target.value)}
      >
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </select>
        <h3 className="section-title">Devices in this Room</h3>

        {devices.length === 0 ? (
        <div className="empty-devices">
            <p>No devices found in this room.</p>
        </div>
        ) : (
        <div className="devices-grid">
            {devices.map((device) => {
            const state = deviceStates[device.id];
            const activities = deviceActivity[device.id] ?? [];
            const isPending = pendingCommands[device.id] ?? false;

            const getDeviceIcon = () => {
                switch (device.device_type) {
                case "light":
                    return "💡";
                case "fan":
                    return "🌀";
                case "socket":
                    return "🔌";
                case "ac":
                    return "❄️";
                case "tv":
                    return "📺";
                default:
                    return "⚡";
                }
            };

            const isOn = state?.actual_state === "ON";

            return (
                <div className="device-card" key={device.id}>
                {/* Device Header */}
                <div className="device-card-header">
                    <div className="device-title">
                    <div className="device-icon">
                        {getDeviceIcon()}
                    </div>

                    <div>
                        <h3 className="device-name">
                        {device.name}
                        </h3>

                        <p className="device-type">
                        {device.device_type}
                        </p>
                    </div>
                    </div>
                </div>

                {/* Device Status */}
                <div className="device-status">
                    <span className="status-label">
                    Current Status
                    </span>

                    <span
                    className={`status-value ${
                        isOn ? "status-on" : "status-off"
                    }`}
                    >
                    {isPending
                        ? state?.actual_state === "ON"
                        ? "TURNING OFF..."
                        : "TURNING ON..."
                        : isOn
                        ? "🟢 ON"
                        : "⚫ OFF"}
                    </span>
                </div>

                {/* Controls */}
                {state ? (
                    <div className="device-controls">
                    <button
                        className="btn-on"
                        onClick={() =>
                        sendCommand(device.id, "TURN_ON")
                        }
                        disabled={isOn || isPending}
                    >
                        {isPending && !isOn
                        ? "TURNING ON..."
                        : "TURN ON"}
                    </button>

                    <button
                        className="btn-off"
                        onClick={() =>
                        sendCommand(device.id, "TURN_OFF")
                        }
                        disabled={!isOn || isPending}
                    >
                        {isPending && isOn
                        ? "TURNING OFF..."
                        : "TURN OFF"}
                    </button>
                    </div>
                ) : (
                    <p>Status: No state available</p>
                )}

                {/* Device UID */}
                <div className="device-uid">
                    <strong>Device UID:</strong>{" "}
                    {device.device_uid}
                </div>

                {/* Activity */}
                <div className="device-activity">
                    <h4>Recent Activity</h4>

                    {activities.length === 0 ? (
                    <p>No activity yet.</p>
                    ) : (
                    activities.slice(0, 5).map((activity) => (
                        <div
                        className="activity-item"
                        key={activity.id}
                        >
                        <span>
                            {activity.command === "TURN_ON"
                            ? "🟢"
                            : "⚫"}{" "}
                            {activity.command === "TURN_ON"
                            ? "Turned ON"
                            : "Turned OFF"}
                        </span>

                        <span className="activity-time">
                            {new Date(
                            activity.created_at
                            ).toLocaleTimeString("en-NG", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                            })}
                        </span>
                        </div>
                    ))
                    )}
                </div>
                </div>
            );
            })}
        </div>
        )}

        <hr />

        <div className="add-device">
        <h3>Add Device</h3>

        <div className="add-device-form">
            <label>Device Name</label>

            <input
            type="text"
            placeholder="Living Room Light"
            value={deviceName}
            onChange={(e) =>
                setDeviceName(e.target.value)
            }
            />

            <label>Device Type</label>

            <select
            value={deviceType}
            onChange={(e) =>
                setDeviceType(e.target.value)
            }
            >
            <option value="light">Light</option>
            <option value="fan">Fan</option>
            <option value="socket">Socket</option>
            <option value="ac">Air Conditioner</option>
            <option value="tv">TV</option>
            </select>

            <label>Device UID</label>

            <input
            type="text"
            placeholder="ODUZZ-H001-R01"
            value={deviceUid}
            onChange={(e) =>
                setDeviceUid(e.target.value)
            }
            />

            <button
            onClick={createDevice}
            disabled={saving}
            >
            {saving ? "Saving..." : "Add Device"}
            </button>
        </div>
        </div>
      <hr />

      <h3>Add Device</h3>

      <label>Device Name</label>

      <br />

      <input
        type="text"
        placeholder="Living Room Light"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
      />

      <br />
      <br />

      <label>Device Type</label>

      <br />

      <select
        value={deviceType}
        onChange={(e) => setDeviceType(e.target.value)}
      >
        <option value="light">Light</option>
        <option value="fan">Fan</option>
        <option value="socket">Socket</option>
        <option value="ac">Air Conditioner</option>
        <option value="tv">TV</option>
      </select>

      <br />
      <br />

      <label>Device UID</label>

      <br />

      <input
        type="text"
        placeholder="ODUZZ-H001-R01"
        value={deviceUid}
        onChange={(e) => setDeviceUid(e.target.value)}
      />

      <br />
      <br />

      <button onClick={createDevice} disabled={saving}>
        {saving ? "Saving..." : "Add Device"}
      </button>
    </div>
  );
}

export default Devices;