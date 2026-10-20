import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./Rooms.css";

type Home = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  home_id: string;
  name: string;
  created_at: string;
};

type Device = {
  id: string;
  room_id: string;
  name: string;
  device_type: string;
};

function Rooms() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const homeId = searchParams.get("home");

  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeId, setSelectedHomeId] = useState<string>(homeId || "");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setHomes([]);
      setRooms([]);
      setDevices([]);
      setLoading(false);
      return;
    }

    const { data: homesData, error: homesError } = await supabase
      .from("homes")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (homesError) {
      console.error("Error loading homes:", homesError);
    } else {
      const loadedHomes = homesData ?? [];
      setHomes(loadedHomes);
      if (homeId && loadedHomes.some((h) => h.id === homeId)) {
        setSelectedHomeId(homeId);
      } else if (loadedHomes.length > 0) {
        setSelectedHomeId((prev) =>
          prev && loadedHomes.some((h) => h.id === prev)
            ? prev
            : loadedHomes[0].id
        );
      }
    }

    setLoading(false);
  }

  async function loadRoomsAndDevices(hId: string) {
    if (!hId) {
      setRooms([]);
      setDevices([]);
      return;
    }

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("*")
      .eq("home_id", hId)
      .order("created_at", { ascending: true });

    if (roomsError) {
      console.error("Error loading rooms:", roomsError);
      setRooms([]);
      setDevices([]);
      return;
    }

    const loadedRooms = roomsData ?? [];
    setRooms(loadedRooms);

    if (loadedRooms.length === 0) {
      setDevices([]);
      return;
    }

    const roomIds = loadedRooms.map((r) => r.id);
    const { data: devicesData, error: devicesError } = await supabase
      .from("devices")
      .select("id, room_id, name, device_type")
      .in("room_id", roomIds);

    if (devicesError) {
      console.error("Error loading devices:", devicesError);
    } else {
      setDevices(devicesData ?? []);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (homeId && homes.some((h) => h.id === homeId)) {
      setSelectedHomeId(homeId);
    }
  }, [homeId, homes]);

  useEffect(() => {
    if (selectedHomeId) {
      loadRoomsAndDevices(selectedHomeId);
    }
  }, [selectedHomeId]);

  async function createRoom() {
    if (!selectedHomeId) {
      alert("Please create or select a home first.");
      return;
    }

    if (!roomName.trim()) {
      alert("Please enter a room name.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("rooms").insert([
      {
        home_id: selectedHomeId,
        name: roomName.trim(),
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setRoomName("");
      setShowAddForm(false);
      await loadRoomsAndDevices(selectedHomeId);
    }

    setSaving(false);
  }

  async function deleteRoom(e: React.MouseEvent, room: Room) {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete room "${room.name}" and its devices?`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("rooms").delete().eq("id", room.id);
    if (error) {
      alert(`Unable to delete room: ${error.message}`);
      return;
    }
    await loadRoomsAndDevices(selectedHomeId);
  }

  const selectedHome = homes.find((h) => h.id === selectedHomeId);

  if (loading) {
    return (
      <div className="rooms-page">
        <div className="rooms-container">
          <div className="rooms-loading">
            <div className="loading-ring" />
            <span>Loading Smart Zones...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rooms-page">
      <div className="rooms-container">
        <div className="rooms-header">
          <div>
            <div className="page-eyebrow">SPATIAL ARCHITECTURE</div>
            <h1>Room & Zone Manager</h1>
            <p>Organize smart appliances by room and environmental zone</p>
          </div>

          {homes.length > 0 && (
            <button
              className={`add-room-trigger ${showAddForm ? "btn-cancel" : ""}`}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? "✕ Cancel" : "+ Add Room"}
            </button>
          )}
        </div>

        {homes.length === 0 ? (
          <div className="empty-rooms">
            <div className="empty-icon-circle">🏠</div>
            <h3>No Homes Created Yet</h3>
            <p>Create your first smart home on the Dashboard before adding rooms.</p>
            <button
              className="add-room-trigger"
              style={{ marginTop: "16px" }}
              onClick={() => navigate("/")}
            >
              Create a Home on Dashboard →
            </button>
          </div>
        ) : (
          <>
            <div className="rooms-toolbar-row">
              <div className="rooms-selector-bar">
                <label htmlFor="home-select">Active Property</label>
                <select
                  id="home-select"
                  value={selectedHomeId}
                  onChange={(e) => {
                    setSelectedHomeId(e.target.value);
                    navigate(`/rooms?home=${e.target.value}`);
                  }}
                >
                  {homes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rooms-summary-pills">
                <span className="summary-pill">
                  <strong>{rooms.length}</strong> {rooms.length === 1 ? "Zone" : "Zones"}
                </span>
                <span className="summary-pill">
                  <strong>{devices.length}</strong> Connected Devices
                </span>
              </div>
            </div>

            {showAddForm && (
              <div className="add-room-card">
                <div className="add-room-card-header">
                  <h3>Create New Zone in {selectedHome?.name || "Home"}</h3>
                  <span className="zone-tag">Spatial Setup</span>
                </div>
                <div className="add-room-input-group">
                  <input
                    type="text"
                    placeholder="e.g. Master Bedroom, Living Room, Kitchen..."
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createRoom();
                    }}
                  />
                  <button onClick={createRoom} disabled={saving}>
                    {saving ? "Saving..." : "Create Room"}
                  </button>
                </div>
              </div>
            )}

            <div className="rooms-grid">
              {rooms.length === 0 ? (
                <div className="empty-rooms">
                  <div className="empty-icon-circle">🚪</div>
                  <h3>No rooms in this home yet</h3>
                  <p>
                    Add a room to start attaching smart lights, switches, AC units, and fans.
                  </p>
                  {!showAddForm && (
                    <button
                      className="add-room-trigger"
                      style={{ marginTop: "14px" }}
                      onClick={() => setShowAddForm(true)}
                    >
                      + Create First Room
                    </button>
                  )}
                </div>
              ) : (
                rooms.map((room) => {
                  const roomDevices = devices.filter(
                    (d) => d.room_id === room.id
                  );

                  return (
                    <div
                      className="room-card"
                      key={room.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        navigate(`/devices?home=${selectedHomeId}&room=${room.id}`)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(
                            `/devices?home=${selectedHomeId}&room=${room.id}`
                          );
                        }
                      }}
                    >
                      <div>
                        <div className="room-card-header">
                          <div className="room-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <path d="M9 3v18" />
                            </svg>
                          </div>
                          <div className="room-header-actions">
                            <span className="room-badge">
                              {roomDevices.length}{" "}
                              {roomDevices.length === 1 ? "Device" : "Devices"}
                            </span>
                            <button
                              type="button"
                              className="room-delete-btn"
                              onClick={(e) => deleteRoom(e, room)}
                              title="Delete Room"
                              aria-label={`Delete ${room.name}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <h3>{room.name}</h3>

                        <div className="room-device-preview">
                          {roomDevices.length === 0 ? (
                            <span className="no-devices-text">
                              No appliances assigned yet
                            </span>
                          ) : (
                            roomDevices.slice(0, 4).map((d) => (
                              <span key={d.id} className="device-chip">
                                {d.name}
                              </span>
                            ))
                          )}
                          {roomDevices.length > 4 && (
                            <span className="device-chip-more">
                              +{roomDevices.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="room-card-footer">
                        <span>Control Room Devices</span>
                        <span className="footer-arrow">→</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Rooms;
