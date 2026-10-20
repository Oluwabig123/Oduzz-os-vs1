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
        <div className="dashboard-container">
          <div className="dashboard-loading">
            <div className="loading-ring" />
            <span>Synchronizing Oduzz OS Telemetry...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        {/* Hero Header */}
        <div className="dashboard-header">
          <div className="dashboard-title-row">
            <OduzzLogo size={42} variant="icon" />
            <div>
              <div className="dashboard-eyebrow">SYSTEM COMMAND CENTER</div>
              <h1>Oduzz OS Dashboard</h1>
              <p>Real-time smart home orchestration, node telemetry & automation</p>
            </div>
          </div>

          <div className="dashboard-status-pills">
            {physicalCount > 0 && (
              <div
                className="hub-status hub-status-esp"
                title="Devices configured for Physical ESP32 Smart Nodes"
              >
                <span className="esp-dot" />
                <span>
                  {physicalCount} ESP32 Node{physicalCount > 1 ? "s" : ""} Online
                </span>
              </div>
            )}

            <button
              type="button"
              className={`hub-status ${virtualHubActive ? "hub-active" : "hub-paused"}`}
              onClick={handleToggleVirtualHub}
              title="Click to toggle Virtual Hub Simulator ON or OFF"
            >
              <span className="hub-dot" />
              <span>
                {virtualHubActive
                  ? "Virtual Hub Active"
                  : "Hardware-Only Mode"}
              </span>
            </button>
          </div>
        </div>

        {/* Summary Bento Cards */}
        <div className="dashboard-stats">
          <div
            className="dashboard-stat-card stat-indigo"
            role="button"
            tabIndex={0}
            onClick={() => setShowForm(true)}
          >
            <div className="stat-icon-wrap indigo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="stat-body">
              <span className="stat-label">Smart Homes</span>
              <strong>{homes.length}</strong>
            </div>
            <span className="stat-action-hint">+ New</span>
          </div>

          <div
            className="dashboard-stat-card stat-cyan"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/rooms")}
          >
            <div className="stat-icon-wrap cyan">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div className="stat-body">
              <span className="stat-label">Configured Zones</span>
              <strong>{rooms.length}</strong>
            </div>
            <span className="stat-action-hint">Manage →</span>
          </div>

          <div
            className="dashboard-stat-card stat-violet"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/devices")}
          >
            <div className="stat-icon-wrap violet">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
              </svg>
            </div>
            <div className="stat-body">
              <span className="stat-label">Total Appliances</span>
              <strong>{devices.length}</strong>
            </div>
            <span className="stat-action-hint">View All →</span>
          </div>

          <div
            className={`dashboard-stat-card stat-emerald ${devicesOn > 0 ? "is-glowing" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => navigate("/devices")}
          >
            <div className="stat-icon-wrap emerald">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </div>
            <div className="stat-body">
              <span className="stat-label">Active Power (ON)</span>
              <strong>{devicesOn}</strong>
            </div>
            <span className="stat-live-badge">
              {devicesOn > 0 ? `${devicesOn} Running` : "Standby"}
            </span>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="dashboard-content">
          {/* Homes Section */}
          <section className="dashboard-section">
            <div className="section-header">
              <div>
                <h2>My Smart Homes</h2>
                <p>Select a property to manage rooms, zones, and connected ESP32 hardware</p>
              </div>

              <button
                className={`dashboard-add-button ${showForm ? "btn-cancel" : ""}`}
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? "✕ Cancel" : "+ Add Smart Home"}
              </button>
            </div>

            {/* Add Home Form */}
            {showForm && (
              <div className="dashboard-form">
                <div className="form-header-row">
                  <h3>Register New Smart Home</h3>
                  <span className="form-badge">Property Setup</span>
                </div>

                <div className="dashboard-form-grid">
                  <div className="dashboard-form-group">
                    <label>Home / Property Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Victoria Island Residence"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="dashboard-form-group">
                    <label>Location / Address (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 12 Ahmadu Bello Way, Lagos"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </div>
                </div>

                <div className="dashboard-form-actions">
                  <button
                    className="dashboard-save-button"
                    onClick={createHome}
                    disabled={saving}
                  >
                    {saving ? "Provisioning Home..." : "Create Smart Home"}
                  </button>
                </div>
              </div>
            )}

            {homes.length === 0 ? (
              <div className="dashboard-empty">
                <div className="empty-icon-circle">🏠</div>
                <h3>No Smart Homes Registered Yet</h3>
                <p>Create your first smart home above to start organizing rooms and IoT nodes.</p>
                {!showForm && (
                  <button
                    className="dashboard-add-button"
                    style={{ marginTop: "14px" }}
                    onClick={() => setShowForm(true)}
                  >
                    + Create Your First Home
                  </button>
                )}
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

                  const activeInHome = homeDevices.filter((d) =>
                    deviceStates.some(
                      (s) => s.device_id === d.id && s.actual_state === "ON"
                    )
                  ).length;

                  return (
                    <div
                      className="home-card"
                      key={home.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/rooms?home=${home.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/rooms?home=${home.id}`);
                        }
                      }}
                    >
                      <div className="home-card-top">
                        <div className="home-icon">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        </div>
                        <div className="home-card-actions">
                          {activeInHome > 0 && (
                            <span className="home-active-pill">
                              <span className="home-active-dot" />
                              {activeInHome} ON
                            </span>
                          )}
                          <button
                            type="button"
                            className="icon-delete-btn"
                            onClick={(e) => deleteHome(e, home)}
                            title="Delete Home"
                            aria-label={`Delete ${home.name}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                          <div className="home-arrow">→</div>
                        </div>
                      </div>

                      <h3>{home.name}</h3>

                      <p className="home-address">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>{home.address || "Primary Smart Residence"}</span>
                      </p>

                      <div className="home-meta">
                        <span className="meta-chip">
                          <strong>{homeRooms.length}</strong>{" "}
                          {homeRooms.length === 1 ? "Room" : "Rooms"}
                        </span>

                        <span className="meta-chip">
                          <strong>{homeDevices.length}</strong>{" "}
                          {homeDevices.length === 1 ? "Device" : "Devices"}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                  System Activity Telemetry
                  <span className="activity-count-pill">{activities.length}</span>
                </h2>
                <p>
                  Real-time hardware state transitions, automated routines & voice command audit trail
                </p>
              </div>

              <button className="activity-toggle-btn">
                {showActivity ? "Collapse ▲" : "Expand ▼"}
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
    </div>
  );
}

export default Dashboard;
