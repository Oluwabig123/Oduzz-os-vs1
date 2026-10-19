import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchUserScopedHierarchy } from "../../lib/userScope";
import {
  isVirtualHubEnabled,
  setVirtualHubEnabled,
  isDevicePhysical,
} from "../../hub/virtualHub";
import { useNavigate } from "react-router-dom";
import OduzzLogo from "../../components/OduzzLogo";
import ActivityLogView from "../../components/ActivityLogView";
import "./Dashboard.css";

type Home = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
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
  device_uid?: string;
};

type DeviceState = {
  device_id: string;
  desired_state: string;
  actual_state: string;
};

type Activity = {
  id: string;
  device_id: string;
  command: string;
  result: string;
  created_at: string;
};

function Dashboard() {
  const navigate = useNavigate();

  const [homes, setHomes] = useState<Home[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceStates, setDeviceStates] = useState<DeviceState[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [virtualHubActive, setVirtualHubActive] = useState<boolean>(
    isVirtualHubEnabled
  );

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadDashboard() {
    setLoading(true);

    const {
      userId,
      homes: currentHomes,
      rooms: currentRooms,
      devices: loadedDevices,
    } = await fetchUserScopedHierarchy();

    if (!userId) {
      setHomes([]);
      setRooms([]);
      setDevices([]);
      setDeviceStates([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    setHomes(currentHomes);
    setRooms(currentRooms);
    setDevices(loadedDevices);

    const validDeviceIds = loadedDevices.map((d) => d.id);
    if (validDeviceIds.length === 0) {
      setDeviceStates([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    const [statesResult, activityResult] = await Promise.all([
      supabase
        .from("device_states")
        .select("*")
        .in("device_id", validDeviceIds),
      supabase
        .from("device_activity")
        .select("*")
        .in("device_id", validDeviceIds)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setDeviceStates(statesResult.data ?? []);
    setActivities(activityResult.data ?? []);
    setLoading(false);
  }

  async function refreshLogs() {
    setIsRefreshingLogs(true);
    try {
      const validDeviceIds = devices.map((d) => d.id);
      if (validDeviceIds.length === 0) {
        setActivities([]);
        return;
      }
      const { data: latestLogs } = await supabase
        .from("device_activity")
        .select("*")
        .in("device_id", validDeviceIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (latestLogs) {
        setActivities(latestLogs);
      }
    } catch (err) {
      console.warn("Failed to refresh activity logs:", err);
    } finally {
      setIsRefreshingLogs(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const syncHubMode = () => setVirtualHubActive(isVirtualHubEnabled());
    window.addEventListener("oduzz-hub-mode-change", syncHubMode);
    return () => window.removeEventListener("oduzz-hub-mode-change", syncHubMode);
  }, []);

  // Realtime device state updates
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-device-states")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "device_states",
        },
        (payload) => {
          if (!payload.new) return;

          const newState = payload.new as DeviceState;

          setDeviceStates((current) => {
            const isMyDevice = devices.some((d) => d.id === newState.device_id);
            if (!isMyDevice) return current;

            const exists = current.some(
              (state) => state.device_id === newState.device_id
            );

            if (!exists) {
              return [...current, newState];
            }

            return current.map((state) =>
              state.device_id === newState.device_id ? newState : state
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [devices]);

  // Realtime activity updates
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-device-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "device_activity",
        },
        (payload) => {
          const newActivity = payload.new as Activity;

          setActivities((current) => {
            const isMyDevice = devices.some(
              (d) => d.id === newActivity.device_id
            );
            if (!isMyDevice) return current;

            const alreadyExists = current.some(
              (activity) => activity.id === newActivity.id
            );

            if (alreadyExists) {
              return current;
            }

            return [newActivity, ...current].slice(0, 50);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [devices]);

  async function createHome() {
    if (!name.trim()) {
      alert("Please enter a home name.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        alert(
          "Authentication error: " +
            (authError?.message || "No user session found. Please log in again.")
        );
        setSaving(false);
        return;
      }

      const userId = authData.user.id;

      const { data: createdHome, error } = await supabase
        .from("homes")
        .insert([
          {
            name: name.trim(),
            address: address.trim() || null,
            owner_id: userId,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Create home error:", error);
        alert("Failed to create home: " + error.message);
      } else {
        if (createdHome?.id) {
          await supabase.from("home_users").insert({
            home_id: createdHome.id,
            user_id: userId,
            role: "owner",
          });
        }
        setName("");
        setAddress("");
        setShowForm(false);
        await loadDashboard();
      }
    } catch (err: any) {
      console.error("Unexpected error creating home:", err);
      alert("Unexpected error: " + (err?.message || String(err)));
    }

    setSaving(false);
  }

  async function deleteHome(e: React.MouseEvent, home: Home) {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete home "${home.name}" and all its rooms/devices?`
    );
    if (!confirmed) return;

    await supabase.from("home_users").delete().eq("home_id", home.id);
    const { error } = await supabase.from("homes").delete().eq("id", home.id);
    if (error) {
      alert(`Unable to delete home: ${error.message}`);
      return;
    }
    await loadDashboard();
  }

  function handleToggleVirtualHub() {
    const next = !virtualHubActive;
    setVirtualHubEnabled(next);
    setVirtualHubActive(next);
  }

  const validDeviceIds = devices.map((d) => d.id);
  const devicesOn = deviceStates.filter(
    (state) =>
      validDeviceIds.includes(state.device_id) && state.actual_state === "ON"
  ).length;
  const physicalCount = devices.filter((d) => isDevicePhysical(d)).length;

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">Loading ODUZZ OS...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <OduzzLogo size={36} variant="icon" />
          <div>
            <h1>ODUZZ OS Dashboard</h1>
            <p>Smart home system control center & analytics</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {physicalCount > 0 && (
            <div
              className="hub-status"
              style={{
                background: "#eff6ff",
                borderColor: "#bfdbfe",
                color: "#1d4ed8",
              }}
              title="Devices configured for Physical ESP32 Smart Nodes"
            >
              <span>🔌 {physicalCount} ESP32 Node{physicalCount > 1 ? "s" : ""}</span>
            </div>
          )}

          <button
            type="button"
            className="hub-status"
            onClick={handleToggleVirtualHub}
            title="Click to toggle Virtual Hub Simulator ON or OFF"
            style={{
              cursor: "pointer",
              background: virtualHubActive ? "#f0fdf4" : "#f1f5f9",
              borderColor: virtualHubActive ? "#bbf7d0" : "#cbd5e1",
              color: virtualHubActive ? "#166534" : "#475569",
            }}
          >
            <span
              className="hub-dot"
              style={{
                background: virtualHubActive ? "#22c55e" : "#94a3b8",
                boxShadow: virtualHubActive
                  ? "0 0 0 4px rgba(34, 197, 94, 0.15)"
                  : "none",
              }}
            />
            <span>
              {virtualHubActive
                ? "Virtual Hub Active"
                : "Hardware-Only Mode (Virtual Hub Paused)"}
            </span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-stats">
        <div
          className="dashboard-stat-card"
          role="button"
          tabIndex={0}
          onClick={() => setShowForm(true)}
        >
          <div className="stat-icon">🏠</div>
          <div>
            <span className="stat-label">Homes</span>
            <strong>{homes.length}</strong>
          </div>
        </div>

        <div
          className="dashboard-stat-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/rooms")}
        >
          <div className="stat-icon">🚪</div>
          <div>
            <span className="stat-label">Rooms</span>
            <strong>{rooms.length}</strong>
          </div>
        </div>

        <div
          className="dashboard-stat-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/devices")}
        >
          <div className="stat-icon">💡</div>
          <div>
            <span className="stat-label">Total Devices</span>
            <strong>{devices.length}</strong>
          </div>
        </div>

        <div
          className="dashboard-stat-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/devices")}
        >
          <div className="stat-icon">🟢</div>
          <div>
            <span className="stat-label">Active (ON)</span>
            <strong>{devicesOn}</strong>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-content">
        {/* Homes Section */}
        <section className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>My Homes</h2>
              <p>Select a home to manage rooms and devices</p>
            </div>

            <button
              className="dashboard-add-button"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? "Cancel" : "+ Add Home"}
            </button>
          </div>

          {homes.length === 0 ? (
            <div className="dashboard-empty">
              <div className="empty-icon">🏠</div>
              <h3>No homes yet</h3>
              <p>Add your first smart home to start building your system.</p>
            </div>
          ) : (
            <div className="home-grid">
              {homes.map((home) => {
                const homeRooms = rooms.filter(
                  (room) => room.home_id === home.id
                );

                const homeRoomIds = homeRooms.map((room) => room.id);

                const homeDevices = devices.filter((device) =>
                  homeRoomIds.includes(device.room_id)
                );

                return (
                  <div
                    className="home-card"
                    key={home.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/rooms?home=${home.id}`)}
                  >
                    <div className="home-card-top">
                      <div className="home-icon">🏠</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={(e) => deleteHome(e, home)}
                          title="Delete Home"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                        >
                          🗑️
                        </button>
                        <div className="home-arrow">→</div>
                      </div>
                    </div>

                    <h3>{home.name}</h3>

                    <p className="home-address">
                      📍 {home.address || "No address specified"}
                    </p>

                    <div className="home-meta">
                      <span>
                        🚪 {homeRooms.length}{" "}
                        {homeRooms.length === 1 ? "Room" : "Rooms"}
                      </span>

                      <span>
                        💡 {homeDevices.length}{" "}
                        {homeDevices.length === 1 ? "Device" : "Devices"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Home Form */}
          {showForm && (
            <div className="dashboard-form">
              <h3>Create New Home</h3>

              <div className="dashboard-form-group">
                <label>Home Name</label>
                <input
                  type="text"
                  placeholder="e.g. Main House"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="dashboard-form-group">
                <label>Address</label>
                <input
                  type="text"
                  placeholder="e.g. 12 Victoria Island"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>

              <button
                className="dashboard-save-button"
                onClick={createHome}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Home"}
              </button>
            </div>
          )}
        </section>

        {/* Interactive System Activity Log Section */}
        <section className="dashboard-section activity-section">
          <div
            className="section-header clickable-header"
            onClick={() => setShowActivity(!showActivity)}
          >
            <div>
              <h2>
                System Activity Log ({activities.length}){" "}
                <span className="toggle-icon">{showActivity ? "▲" : "▼"}</span>
              </h2>
              <p>
                Real-time telemetry, automated routines & voice command audit
                trail
              </p>
            </div>

            <button className="activity-toggle-btn">
              {showActivity ? "Collapse" : "Expand"}
            </button>
          </div>

          {showActivity && (
            <div className="activity-dropdown-container">
              <ActivityLogView
                activities={activities}
                devices={devices}
                rooms={rooms}
                onRefresh={refreshLogs}
                isRefreshing={isRefreshingLogs}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;