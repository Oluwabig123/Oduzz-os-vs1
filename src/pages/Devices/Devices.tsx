import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  isDevicePhysical,
  setDevicePhysicalMode,
  processPendingCommands,
} from "../../hub/virtualHub";
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialHomeParam = searchParams.get("home") || "";
  const initialRoomParam = searchParams.get("room") || "";

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

  const [selectedHome, setSelectedHome] = useState(initialHomeParam);
  const [selectedRoom, setSelectedRoom] = useState(initialRoomParam);

  const [deviceName, setDeviceName] = useState("");
  const [deviceType, setDeviceType] = useState("light");
  const [deviceUid, setDeviceUid] = useState("");
  const [connectionMode, setConnectionMode] = useState<"virtual" | "physical">(
    "physical"
  );

  const [copiedDeviceId, setCopiedDeviceId] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [, setModeTick] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function showNotice(msg: string) {
    setNoticeMessage(msg);
    setTimeout(() => {
      setNoticeMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  async function loadHomes() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setHomes([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("homes")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading homes:", error);
    } else {
      const loadedHomes = data ?? [];
      setHomes(loadedHomes);

      if (loadedHomes.length > 0) {
        if (
          initialHomeParam &&
          loadedHomes.some((h) => h.id === initialHomeParam)
        ) {
          setSelectedHome(initialHomeParam);
        } else {
          setSelectedHome(loadedHomes[0].id);
        }
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
      const loadedRooms = data ?? [];
      setRooms(loadedRooms);

      if (loadedRooms.length > 0) {
        if (
          initialRoomParam &&
          loadedRooms.some((r) => r.id === initialRoomParam)
        ) {
          setSelectedRoom(initialRoomParam);
        } else {
          setSelectedRoom((prev) =>
            prev && loadedRooms.some((r) => r.id === prev)
              ? prev
              : loadedRooms[0].id
          );
        }
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

    // Load device states and bounded recent activity in parallel
    const [statesRes, activityRes] = await Promise.all([
      supabase.from("device_states").select("*").in("device_id", deviceIds),
      supabase
        .from("device_activity")
        .select("*")
        .in("device_id", deviceIds)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (statesRes.error) {
      console.error("Error loading device states:", statesRes.error);
    } else {
      const statesMap: Record<string, DeviceState> = {};
      (statesRes.data ?? []).forEach((state) => {
        statesMap[state.device_id] = state;
      });
      setDeviceStates(statesMap);
    }

    if (activityRes.error) {
      console.error("Error loading device activity:", activityRes.error);
      return;
    }

    const activityMap: Record<string, DeviceActivity[]> = {};
    deviceIds.forEach((deviceId) => {
      activityMap[deviceId] = [];
    });

    (activityRes.data ?? []).forEach((activity) => {
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

  // Realtime updates scoped to current room's devices
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
        (payload) => {
          const updatedState = payload.new as DeviceState;

          if (!updatedState?.device_id) {
            return;
          }

          setDeviceStates((currentStates) => ({
            ...currentStates,
            [updatedState.device_id]: updatedState,
          }));

          if (updatedState.actual_state === updatedState.desired_state) {
            setPendingCommands((currentPending) => ({
              ...currentPending,
              [updatedState.device_id]: false,
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
              ].slice(0, 20),
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
    device: Device,
    command: "TURN_ON" | "TURN_OFF"
  ) {
    const deviceId = device.id;
    if (pendingCommands[deviceId]) {
      return;
    }

    const expectedState = command === "TURN_ON" ? "ON" : "OFF";
    const physicalMode = isDevicePhysical(device);

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
      showNotice(`Command error: ${error.message}`);
      return;
    }

    // If this is a Virtual Simulator device, trigger the Virtual Hub immediately!
    if (!physicalMode) {
      await processPendingCommands({ immediate: true });
    }

    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data: latestState, error: stateError } = await supabase
        .from("device_states")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (stateError || !latestState) continue;

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

    if (physicalMode) {
      showNotice(
        `No response from physical node "${device.name}". Ensure your ESP32 is powered on, connected to Wi-Fi, and configured with UUID ${device.id} (or UID ${device.device_uid}).`
      );
    }
  }

  async function createDevice() {
    if (!selectedRoom) {
      showNotice("Please select a room first.");
      return;
    }

    if (!deviceName.trim()) {
      showNotice("Please enter a device name.");
      return;
    }

    let finalUid = deviceUid.trim();
    if (!finalUid) {
      finalUid =
        connectionMode === "physical"
          ? `ESP32-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
          : `SIM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    } else if (
      connectionMode === "physical" &&
      !finalUid.toUpperCase().startsWith("ESP32") &&
      !finalUid.toUpperCase().startsWith("HW-")
    ) {
      finalUid = `ESP32-${finalUid}`;
    }

    setSaving(true);

    const { data: newDevice, error } = await supabase
      .from("devices")
      .insert([
        {
          room_id: selectedRoom,
          name: deviceName.trim(),
          device_type: deviceType,
          device_uid: finalUid,
        },
      ])
      .select()
      .single();

    if (error) {
      showNotice(error.message);
      setSaving(false);
      return;
    }

    setDevicePhysicalMode(newDevice.id, connectionMode === "physical");

    const { error: stateError } = await supabase.from("device_states").insert([
      {
        device_id: newDevice.id,
        desired_state: "OFF",
        actual_state: "OFF",
      },
    ]);

    if (stateError) {
      console.error("Error creating device state:", stateError);
      showNotice(stateError.message);
      setSaving(false);
      return;
    }

    setDeviceName("");
    setDeviceUid("");
    setShowAddForm(false);
    showNotice(
      `Created "${newDevice.name}" (${
        connectionMode === "physical" ? "Physical ESP32 Node" : "Virtual Simulator"
      }).`
    );

    await loadDevices(selectedRoom);
    setSaving(false);
  }

  async function deleteDevice(device: Device) {
    const confirmed = window.confirm(
      `Remove device "${device.name}" from this room?`
    );
    if (!confirmed) return;

    await supabase.from("device_states").delete().eq("device_id", device.id);
    await supabase.from("device_commands").delete().eq("device_id", device.id);
    await supabase.from("device_activity").delete().eq("device_id", device.id);
    const { error } = await supabase
      .from("devices")
      .delete()
      .eq("id", device.id);

    if (error) {
      showNotice(`Unable to delete device: ${error.message}`);
      return;
    }

    showNotice(`Removed "${device.name}".`);
    await loadDevices(selectedRoom);
  }

  function toggleHardwareMode(device: Device) {
    const currentPhysical = isDevicePhysical(device);
    const nextPhysical = !currentPhysical;
    setDevicePhysicalMode(device.id, nextPhysical);
    setModeTick((t) => t + 1);
    showNotice(
      `"${device.name}" switched to ${
        nextPhysical
          ? "🔌 Physical ESP32 Hub mode (Virtual Hub will not intercept commands)"
          : "💻 Virtual Simulator mode (Browser simulates relay responses)"
      }.`
    );
  }

  function copyUuidForEsp32(device: Device) {
    navigator.clipboard.writeText(device.id);
    setCopiedDeviceId(device.id);
    setTimeout(() => setCopiedDeviceId(null), 2500);
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
          <p>Monitor and control your physical ESP32 nodes & virtual IoT appliances</p>
        </div>

        <button
          className="add-device-trigger"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Close Form" : "+ Add Device"}
        </button>
      </div>

      {noticeMessage && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            color: "#1e3a8a",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>ℹ️ {noticeMessage}</span>
          <button
            onClick={() => setNoticeMessage(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#1e3a8a",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {homes.length === 0 ? (
        <div className="empty-devices">
          <span className="empty-icon">🏠</span>
          <h3>No Homes Found</h3>
          <p>Create a home and room first before attaching smart devices.</p>
          <button
            className="add-device-trigger"
            style={{ marginTop: "12px" }}
            onClick={() => navigate("/")}
          >
            Go to Dashboard →
          </button>
        </div>
      ) : (
        <>
          <div className="device-selectors">
            <div className="selector-group">
              <label>Select Home</label>
              <select
                value={selectedHome}
                onChange={(e) => {
                  const nextHome = e.target.value;
                  setSelectedHome(nextHome);
                  setSearchParams(nextHome ? { home: nextHome } : {});
                }}
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
                onChange={(e) => {
                  const nextRoom = e.target.value;
                  setSelectedRoom(nextRoom);
                  setSearchParams(
                    selectedHome && nextRoom
                      ? { home: selectedHome, room: nextRoom }
                      : selectedHome
                      ? { home: selectedHome }
                      : {}
                  );
                }}
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
              <h3>Create New Smart Device</h3>
              <div
                className="add-device-grid"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
              >
                <div className="form-field">
                  <label>Device Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Living Room Light"
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
                  <label>Controller Hub Type</label>
                  <select
                    value={connectionMode}
                    onChange={(e) =>
                      setConnectionMode(
                        e.target.value as "physical" | "virtual"
                      )
                    }
                  >
                    <option value="physical">
                      🔌 Physical Hub (ESP32 Relay)
                    </option>
                    <option value="virtual">
                      💻 Virtual Hub Simulator
                    </option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Hardware Tag / UID (Optional)</label>
                  <input
                    type="text"
                    placeholder={
                      connectionMode === "physical"
                        ? "e.g. ESP32-NODE-01"
                        : "e.g. SIM-LIGHT-01"
                    }
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
              <h3>No devices found in this room</h3>
              <p>
                {rooms.length === 0
                  ? "Create a room first in the Rooms tab, then add your smart devices."
                  : "Click '+ Add Device' above to register a physical ESP32 node or virtual device."}
              </p>
            </div>
          ) : (
            <div className="devices-grid">
              {devices.map((device) => {
                const state = deviceStates[device.id];
                const activities = deviceActivity[device.id] ?? [];
                const isPending = pendingCommands[device.id] ?? false;
                const isActivityOpen = showActivity[device.id] ?? false;
                const isPhysical = isDevicePhysical(device);

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
                    <div>
                      <div className="device-card-header">
                        <div className="device-title">
                          <div className="device-icon">{getDeviceIcon()}</div>
                          <div>
                            <h3 className="device-name">{device.name}</h3>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                marginTop: "3px",
                              }}
                            >
                              <span className="device-type">
                                {device.device_type}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleHardwareMode(device)}
                                title="Click to switch between Physical ESP32 Hub and Virtual Simulator"
                                style={{
                                  fontSize: "10.5px",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: "6px",
                                  border: isPhysical
                                    ? "1px solid #bfdbfe"
                                    : "1px solid #e2e8f0",
                                  background: isPhysical ? "#eff6ff" : "#f8fafc",
                                  color: isPhysical ? "#1d4ed8" : "#64748b",
                                  cursor: "pointer",
                                }}
                              >
                                {isPhysical ? "🔌 ESP32 Hub" : "💻 Virtual Sim"}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            className={`status-pill ${
                              isOn ? "status-pill-on" : "status-pill-off"
                            }`}
                          >
                            {isPending ? "updating..." : isOn ? "ON" : "OFF"}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteDevice(device)}
                            title="Delete device"
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#94a3b8",
                              cursor: "pointer",
                              fontSize: "13px",
                              padding: "2px 4px",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="device-controls">
                        <button
                          className="btn-on"
                          onClick={() => sendCommand(device, "TURN_ON")}
                          disabled={isOn || isPending}
                        >
                          {isPending && !isOn ? "TURNING ON..." : "TURN ON"}
                        </button>

                        <button
                          className="btn-off"
                          onClick={() => sendCommand(device, "TURN_OFF")}
                          disabled={!isOn || isPending}
                        >
                          {isPending && isOn ? "TURNING OFF..." : "TURN OFF"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div
                        className="device-footer"
                        style={{ flexWrap: "wrap", gap: "8px" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <span className="device-uid-text">
                            UID: <strong>{device.device_uid}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => copyUuidForEsp32(device)}
                            title={`Device UUID for ESP32 firmware: ${device.id}`}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              textAlign: "left",
                              fontSize: "11px",
                              color:
                                copiedDeviceId === device.id
                                  ? "#16a34a"
                                  : "#6366f1",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {copiedDeviceId === device.id
                              ? "✓ Copied ESP32 UUID!"
                              : "📋 Copy ESP32 UUID"}
                          </button>
                        </div>

                        <button
                          className="activity-dropdown-toggle"
                          onClick={() => toggleActivityDropdown(device.id)}
                        >
                          History ({activities.length}){" "}
                          {isActivityOpen ? "▲" : "▼"}
                        </button>
                      </div>

                      {/* Collapsible Activity Dropdown */}
                      {isActivityOpen && (
                        <div className="activity-dropdown-menu">
                          <div
                            style={{
                              fontSize: "10.5px",
                              color: "#64748b",
                              paddingBottom: "6px",
                              borderBottom: "1px solid #e2e8f0",
                              wordBreak: "break-all",
                            }}
                          >
                            <strong>ESP32 Firmware DEVICE_ID:</strong>{" "}
                            <code>{device.id}</code>
                          </div>
                          {activities.length === 0 ? (
                            <p className="no-activity">
                              No recent activity recorded.
                            </p>
                          ) : (
                            activities.slice(0, 5).map((activity) => (
                              <div
                                className="activity-dropdown-item"
                                key={activity.id}
                              >
                                <span>
                                  {activity.command === "TURN_ON"
                                    ? "🟢 On"
                                    : "⚫ Off"}
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Devices;