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

  const [showActivity, setShowActivity] = useState<
    Record<string, boolean>
  >({});

  const [showAddForm, setShowAddForm] = useState(false);

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "device_states",
        },
        async (payload) => {
          const updatedState = payload.new as DeviceState;

          if (!updatedState?.device_id) {
            return;
          }

          setDeviceStates((currentStates) => ({
            ...currentStates,
            [updatedState.device_id]: updatedState,
          }));

          const { data, error } = await supabase
            .from("device_states")
            .select("*")
            .eq("device_id", updatedState.device_id)
            .maybeSingle();

          if (error) {
            console.error("Error refreshing device state:", error);
            return;
          }

          if (data) {
            setDeviceStates((currentStates) => ({
              ...currentStates,
              [data.device_id]: data,
            }));

            setPendingCommands((currentPending) => ({
              ...currentPending,
              [data.device_id]: false,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_activity",
        },
        (payload) => {
          const newActivity = payload.new as DeviceActivity;

          if (!newActivity?.id || !newActivity?.device_id) {
            return;
          }

          setDeviceActivity((currentActivity) => {
            const existingActivities =
              currentActivity[newActivity.device_id] ?? [];

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom]);

  async function sendCommand(
    deviceId: string,
    command: "TURN_ON" | "TURN_OFF"
  ) {
    if (pendingCommands[deviceId]) {
      return;
    }

    const expectedState = command === "TURN_ON" ? "ON" : "OFF";

    setPendingCommands((currentPending) => ({
      ...currentPending,
      [deviceId]: true,
    }));

    const { error } = await supabase.from("device_commands").insert([
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

    const maxAttempts = 15;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data: latestState, error: stateError } = await supabase
        .from("device_states")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (stateError) continue;
      if (!latestState) continue;

      setDeviceStates((currentStates) => ({
        ...currentStates,
        [deviceId]: latestState,
      }));

      if (latestState.actual_state === expectedState) {
        setPendingCommands((currentPending) => ({
          ...currentPending,
          [deviceId]: false,
        }));
        return;
      }
    }

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

    const { error: stateError } = await supabase.from("device_states").insert([
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
    setShowAddForm(false);

    await loadDevices(selectedRoom);
    setSaving(false);
  }

  function toggleActivityDropdown(deviceId: string) {
    setShowActivity((prev) => ({
      ...prev,
      [deviceId]: !prev[deviceId],
    }));
  }

  if (loading) {
    return (
      <div className="devices-page">
        <div className="devices-loading">Loading Devices...</div>
      </div>
    );
  }

  return (
    <div className="devices-page">
      <div className="devices-header">
        <div>
          <h1>Device Manager</h1>
          <p>Monitor and control your smart IoT appliances</p>
        </div>

        <button
          className="add-device-trigger"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Close Form" : "+ Add Device"}
        </button>
      </div>

      <div className="device-selectors">
        <div className="selector-group">
          <label>Select Home</label>
          <select
            value={selectedHome}
            onChange={(e) => setSelectedHome(e.target.value)}
          >
            {homes.map((home) => (
              <option key={home.id} value={home.id}>
                🏠 {home.name}
              </option>
            ))}
          </select>
        </div>

        <div className="selector-group">
          <label>Select Room</label>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            disabled={rooms.length === 0}
          >
            {rooms.length === 0 ? (
              <option value="">No rooms in this home</option>
            ) : (
              rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  🚪 {room.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {showAddForm && (
        <div className="add-device-card">
          <h3>Create New Device</h3>
          <div className="add-device-grid">
            <div className="form-field">
              <label>Device Name</label>
              <input
                type="text"
                placeholder="e.g. Ceiling Fan"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Device Type</label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
              >
                <option value="light">Light 💡</option>
                <option value="fan">Fan 🌀</option>
                <option value="socket">Socket 🔌</option>
                <option value="ac">Air Conditioner ❄️</option>
                <option value="tv">TV 📺</option>
              </select>
            </div>

            <div className="form-field">
              <label>Device UID</label>
              <input
                type="text"
                placeholder="e.g. ODUZZ-H001-R01"
                value={deviceUid}
                onChange={(e) => setDeviceUid(e.target.value)}
              />
            </div>
          </div>

          <button
            className="save-device-btn"
            onClick={createDevice}
            disabled={saving}
          >
            {saving ? "Creating Device..." : "Save Device"}
          </button>
        </div>
      )}

      <h3 className="section-title">
        Devices in Room ({devices.length})
      </h3>

      {devices.length === 0 ? (
        <div className="empty-devices">
          <span className="empty-icon">💡</span>
          <h3>No devices found</h3>
          <p>Select a different room or add a new device to get started.</p>
        </div>
      ) : (
        <div className="devices-grid">
          {devices.map((device) => {
            const state = deviceStates[device.id];
            const activities = deviceActivity[device.id] ?? [];
            const isPending = pendingCommands[device.id] ?? false;
            const isActivityOpen = showActivity[device.id] ?? false;

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
                <div className="device-card-header">
                  <div className="device-title">
                    <div className="device-icon">{getDeviceIcon()}</div>
                    <div>
                      <h3 className="device-name">{device.name}</h3>
                      <p className="device-type">{device.device_type}</p>
                    </div>
                  </div>

                  <span
                    className={`status-pill ${
                      isOn ? "status-pill-on" : "status-pill-off"
                    }`}
                  >
                    {isPending
                      ? "updating..."
                      : isOn
                      ? "ON"
                      : "OFF"}
                  </span>
                </div>

                <div className="device-controls">
                  <button
                    className="btn-on"
                    onClick={() => sendCommand(device.id, "TURN_ON")}
                    disabled={isOn || isPending}
                  >
                    {isPending && !isOn ? "TURNING ON..." : "TURN ON"}
                  </button>

                  <button
                    className="btn-off"
                    onClick={() => sendCommand(device.id, "TURN_OFF")}
                    disabled={!isOn || isPending}
                  >
                    {isPending && isOn ? "TURNING OFF..." : "TURN OFF"}
                  </button>
                </div>

                <div className="device-footer">
                  <span className="device-uid-text">UID: {device.device_uid}</span>

                  <button
                    className="activity-dropdown-toggle"
                    onClick={() => toggleActivityDropdown(device.id)}
                  >
                    History ({activities.length}) {isActivityOpen ? "▲" : "▼"}
                  </button>
                </div>

                {/* Collapsible Activity Dropdown */}
                {isActivityOpen && (
                  <div className="activity-dropdown-menu">
                    {activities.length === 0 ? (
                      <p className="no-activity">No recent activity recorded.</p>
                    ) : (
                      activities.slice(0, 5).map((activity) => (
                        <div className="activity-dropdown-item" key={activity.id}>
                          <span>
                            {activity.command === "TURN_ON" ? "🟢 On" : "⚫ Off"}
                          </span>
                          <span className="activity-time">
                            {new Date(activity.created_at).toLocaleTimeString(
                              "en-NG",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: true,
                              }
                            )}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Devices;