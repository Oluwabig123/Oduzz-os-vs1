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
        <div className="devices-container">
          <div className="devices-loading">
            <div className="loading-ring" />
            <span>Connecting to Hardware & Virtual Nodes...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="devices-page">
      <div className="devices-container">
        <div className="devices-header">
          <div>
            <div className="page-eyebrow">HARDWARE & NODE MATRIX</div>
            <h1>Device Controller</h1>
            <p>Monitor and control your physical ESP32 relays & virtual IoT appliances</p>
          </div>

          <button
            className={`add-device-trigger ${showAddForm ? "btn-cancel" : ""}`}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "✕ Close Form" : "+ Register Device"}
          </button>
        </div>

        {noticeMessage && (
          <div className="device-notice-banner" role="status">
            <span>⚡ {noticeMessage}</span>
            <button
              onClick={() => setNoticeMessage(null)}
              className="device-notice-close"
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        )}

        {homes.length === 0 ? (
          <div className="empty-devices">
            <div className="empty-icon-circle">🏠</div>
            <h3>No Smart Homes Found</h3>
            <p>Create a home and room first before attaching smart devices.</p>
            <button
              className="add-device-trigger"
              style={{ marginTop: "14px" }}
              onClick={() => navigate("/")}
            >
              Go to Dashboard →
            </button>
          </div>
        ) : (
          <>
            <div className="device-selectors">
              <div className="selector-group">
                <label>Property / Home</label>
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
                      {home.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="selector-group">
                <label>Target Zone / Room</label>
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
                        {room.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {showAddForm && (
              <div className="add-device-card">
                <div className="add-device-card-header">
                  <h3>Register New Smart Appliance</h3>
                  <span className="node-setup-badge">Node Provisioning</span>
                </div>
                <div className="add-device-grid">
                  <div className="form-field">
                    <label>Device Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Chandelier, Ceiling Fan, AC..."
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Appliance Category</label>
                    <select
                      value={deviceType}
                      onChange={(e) => setDeviceType(e.target.value)}
                    >
                      <option value="light">💡 Lighting Fixture</option>
                      <option value="fan">🌀 Ceiling / Standing Fan</option>
                      <option value="socket">🔌 Smart Power Socket</option>
                      <option value="ac">❄️ Air Conditioner (HVAC)</option>
                      <option value="tv">📺 Television / Media</option>
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

                <div className="add-device-actions">
                  <button
                    className="save-device-btn"
                    onClick={createDevice}
                    disabled={saving}
                  >
                    {saving ? "Provisioning Node..." : "Save & Provision Device"}
                  </button>
                </div>
              </div>
            )}

            <div className="devices-section-bar">
              <h3 className="section-title">
                Connected Zone Appliances
                <span className="device-count-badge">{devices.length}</span>
              </h3>
            </div>

            {devices.length === 0 ? (
              <div className="empty-devices">
                <div className="empty-icon-circle">💡</div>
                <h3>No devices found in this room</h3>
                <p>
                  {rooms.length === 0
                    ? "Create a room first in the Rooms tab, then add your smart devices."
                    : "Click '+ Register Device' above to pair a physical ESP32 node or virtual simulator."}
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
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                          </svg>
                        );
                      case "fan":
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z" />
                            <circle cx="12" cy="12" r="2" />
                          </svg>
                        );
                      case "socket":
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22v-5" />
                            <path d="M9 8V2" />
                            <path d="M15 8V2" />
                            <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
                          </svg>
                        );
                      case "ac":
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <line x1="12" y1="2" x2="12" y2="22" />
                            <path d="m20 16-4-4 4-4" />
                            <path d="m4 8 4 4-4 4" />
                            <path d="m16 4-4 4-4-4" />
                            <path d="m8 20 4-4 4 4" />
                          </svg>
                        );
                      case "tv":
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                            <polyline points="17 2 12 7 7 2" />
                          </svg>
                        );
                      default:
                        return (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                        );
                    }
                  };

                  const isOn = state?.actual_state === "ON";

                  return (
                    <div
                      className={`device-card ${isOn ? "device-is-on" : "device-is-off"} ${
                        isPending ? "device-is-pending" : ""
                      }`}
                      key={device.id}
                    >
                      <div>
                        <div className="device-card-header">
                          <div className="device-title">
                            <div className={`device-icon ${isOn ? "icon-illuminated" : ""}`}>
                              {getDeviceIcon()}
                            </div>
                            <div>
                              <h3 className="device-name">{device.name}</h3>
                              <div className="device-meta-row">
                                <span className="device-type">
                                  {device.device_type}
                                </span>
                                <button
                                  type="button"
                                  className={`hw-mode-badge ${isPhysical ? "hw-esp" : "hw-sim"}`}
                                  onClick={() => toggleHardwareMode(device)}
                                  title="Click to switch between Physical ESP32 Hub and Virtual Simulator"
                                >
                                  {isPhysical ? "ESP32 Hub" : "Virtual Sim"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="device-status-actions">
                            <span
                              className={`status-pill ${
                                isPending
                                  ? "status-pill-pending"
                                  : isOn
                                  ? "status-pill-on"
                                  : "status-pill-off"
                              }`}
                            >
                              <span className="status-dot" />
                              {isPending ? "SYNCING" : isOn ? "ON" : "OFF"}
                            </span>
                            <button
                              type="button"
                              className="device-delete-btn"
                              onClick={() => deleteDevice(device)}
                              title="Delete device"
                              aria-label={`Delete ${device.name}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="device-controls">
                          <button
                            className={`btn-on ${isOn ? "active-state" : ""}`}
                            onClick={() => sendCommand(device, "TURN_ON")}
                            disabled={isOn || isPending}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>{isPending && !isOn ? "TURNING ON..." : "TURN ON"}</span>
                          </button>

                          <button
                            className={`btn-off ${!isOn ? "active-state" : ""}`}
                            onClick={() => sendCommand(device, "TURN_OFF")}
                            disabled={!isOn || isPending}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                              <line x1="12" y1="2" x2="12" y2="12" />
                            </svg>
                            <span>{isPending && isOn ? "TURNING OFF..." : "TURN OFF"}</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="device-footer">
                          <div className="device-uid-group">
                            <span className="device-uid-text">
                              UID: <code>{device.device_uid}</code>
                            </span>
                            <button
                              type="button"
                              className={`copy-uuid-btn ${
                                copiedDeviceId === device.id ? "copied" : ""
                              }`}
                              onClick={() => copyUuidForEsp32(device)}
                              title={`Device UUID for ESP32 firmware: ${device.id}`}
                            >
                              {copiedDeviceId === device.id
                                ? "✓ Copied ESP32 UUID"
                                : "Copy ESP32 UUID"}
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
                            <div className="firmware-uuid-row">
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
                                  <span className="activity-cmd-tag">
                                    {activity.command === "TURN_ON"
                                      ? "🟢 Turned ON"
                                      : "⚫ Turned OFF"}
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
    </div>
  );
}

export default Devices;
