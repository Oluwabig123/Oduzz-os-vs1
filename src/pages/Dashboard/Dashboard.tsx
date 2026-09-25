import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";

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

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadDashboard() {
    setLoading(true);

    const [
      homesResult,
      roomsResult,
      devicesResult,
      statesResult,
      activityResult,
    ] = await Promise.all([
      supabase
        .from("homes")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase.from("rooms").select("*"),

      supabase.from("devices").select("*"),

      supabase.from("device_states").select("*"),

      supabase
        .from("device_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (homesResult.error) {
      console.error("Error loading homes:", homesResult.error);
    }

    if (roomsResult.error) {
      console.error("Error loading rooms:", roomsResult.error);
    }

    if (devicesResult.error) {
      console.error("Error loading devices:", devicesResult.error);
    }

    if (statesResult.error) {
      console.error("Error loading device states:", statesResult.error);
    }

    if (activityResult.error) {
      console.error(
        "Error loading device activity:",
        activityResult.error
      );
    }

    setHomes(homesResult.data ?? []);
    setRooms(roomsResult.data ?? []);
    setDevices(devicesResult.data ?? []);
    setDeviceStates(statesResult.data ?? []);
    setActivities(activityResult.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
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
            const exists = current.some(
              (state) => state.device_id === newState.device_id
            );

            if (!exists) {
              return [...current, newState];
            }

            return current.map((state) =>
              state.device_id === newState.device_id
                ? newState
                : state
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
            const alreadyExists = current.some(
              (activity) => activity.id === newActivity.id
            );

            if (alreadyExists) {
              return current;
            }

            return [newActivity, ...current].slice(0, 10);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function createHome() {
    if (!name.trim()) {
      alert("Please enter a home name.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("homes").insert([
      {
        name: name.trim(),
        address: address.trim() || null,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setName("");
      setAddress("");
      setShowForm(false);

      await loadDashboard();
    }

    setSaving(false);
  }

  function getDeviceName(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    return device?.name || "Unknown Device";
  }

  function formatActivity(command: string) {
    if (command === "TURN_ON") {
      return "🟢 Turned ON";
    }

    if (command === "TURN_OFF") {
      return "⚫ Turned OFF";
    }

    return command;
  }

  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const devicesOn = deviceStates.filter(
    (state) => state.actual_state === "ON"
  ).length;

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          Loading ODUZZ OS...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Header */}

      <div className="dashboard-header">
        <div>
          <h1>ODUZZ OS</h1>
          <p>Smart home control center</p>
        </div>

        <div className="hub-status">
          <span className="hub-dot"></span>
          <span>Virtual Hub Online</span>
        </div>
      </div>

      {/* Summary Cards */}

      <div className="dashboard-stats">
        <div className="dashboard-stat-card">
          <div className="stat-icon">🏠</div>

          <div>
            <span className="stat-label">Homes</span>
            <strong>{homes.length}</strong>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">🚪</div>

          <div>
            <span className="stat-label">Rooms</span>
            <strong>{rooms.length}</strong>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">💡</div>

          <div>
            <span className="stat-label">Devices</span>
            <strong>{devices.length}</strong>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon">🟢</div>

          <div>
            <span className="stat-label">Devices ON</span>
            <strong>{devicesOn}</strong>
          </div>
        </div>
      </div>

      {/* Main Content */}

      <div className="dashboard-content">
        {/* Homes */}

        <section className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>My Homes</h2>
              <p>Select a home to manage its rooms and devices.</p>
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

              <p>
                Add your first smart home to start building your
                ODUZZ OS system.
              </p>
            </div>
          ) : (
            <div className="home-grid">
              {homes.map((home) => {
                const homeRooms = rooms.filter(
                  (room) => room.home_id === home.id
                );

                const homeRoomIds = homeRooms.map(
                  (room) => room.id
                );

                const homeDevices = devices.filter((device) =>
                  homeRoomIds.includes(device.room_id)
                );

                return (
                  <div
                    className="home-card"
                    key={home.id}
                    onClick={() =>
                      navigate(`/rooms?home=${home.id}`)
                    }
                  >
                    <div className="home-card-top">
                      <div className="home-icon">🏠</div>

                      <div className="home-arrow">→</div>
                    </div>

                    <h3>{home.name}</h3>

                    <p>
                      📍 {home.address || "No address provided"}
                    </p>

                    <div className="home-meta">
                      <span>
                        🚪 {homeRooms.length}{" "}
                        {homeRooms.length === 1 ? "Room" : "Rooms"}
                      </span>

                      <span>
                        💡 {homeDevices.length}{" "}
                        {homeDevices.length === 1
                          ? "Device"
                          : "Devices"}
                      </span>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();

                        navigate(`/rooms?home=${home.id}`);
                      }}
                    >
                      Manage Home →
                    </button>
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
                  placeholder="e.g. My House"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                />
              </div>

              <div className="dashboard-form-group">
                <label>Address</label>

                <input
                  type="text"
                  placeholder="e.g. 12 Example Street"
                  value={address}
                  onChange={(event) =>
                    setAddress(event.target.value)
                  }
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

        {/* Recent Activity */}

        <section className="dashboard-section">
          <div className="section-header">
            <div>
              <h2>Recent Activity</h2>
              <p>Latest commands processed by ODUZZ OS.</p>
            </div>
          </div>

          {activities.length === 0 ? (
            <div className="dashboard-empty small">
              <div className="empty-icon">⚡</div>

              <p>No device activity yet.</p>
            </div>
          ) : (
            <div className="activity-list">
              {activities.map((activity) => (
                <div
                  className="dashboard-activity-item"
                  key={activity.id}
                >
                  <div>
                    <strong>
                      {formatActivity(activity.command)}
                    </strong>

                    <span>
                      {getDeviceName(activity.device_id)}
                    </span>
                  </div>

                  <time>
                    {formatTime(activity.created_at)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;