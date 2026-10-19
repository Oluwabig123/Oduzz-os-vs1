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
        <div className="rooms-loading">Loading Rooms...</div>
      </div>
    );
  }

  return (
    <div className="rooms-page">
      <div className="rooms-header">
        <div>
          <h1>Room Manager</h1>
          <p>Organize smart appliances by room and zone</p>
        </div>

        {homes.length > 0 && (
          <button
            className="add-room-trigger"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Cancel" : "+ Add Room"}
          </button>
        )}
      </div>

      {homes.length === 0 ? (
        <div className="empty-rooms">
          <span className="empty-icon">🏠</span>
          <h3>No Homes Created Yet</h3>
          <p>Create your first smart home on the Dashboard before adding rooms.</p>
          <button
            className="add-room-trigger"
            style={{ marginTop: "12px" }}
            onClick={() => navigate("/")}
          >
            Create a Home on Dashboard →
          </button>
        </div>
      ) : (
        <>
          <div className="rooms-selector-bar">
            <label>Select Target Home:</label>
            <select
              value={selectedHomeId}
              onChange={(e) => {
                setSelectedHomeId(e.target.value);
                navigate(`/rooms?home=${e.target.value}`);
              }}
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  🏠 {h.name}
                </option>
              ))}
            </select>
          </div>

          {showAddForm && (
            <div className="add-room-card">
              <h3>Create Room in {selectedHome?.name || "Home"}</h3>
              <div className="add-room-input-group">
                <input
                  type="text"
                  placeholder="e.g. Master Bedroom"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
                <button onClick={createRoom} disabled={saving}>
                  {saving ? "Saving..." : "Save Room"}
                </button>
              </div>
            </div>
          )}

          <div className="rooms-grid">
            {rooms.length === 0 ? (
              <div className="empty-rooms">
                <span className="empty-icon">🚪</span>
                <h3>No rooms in this home yet</h3>
                <p>
                  Add a room to start attaching smart lights, switches, and fans.
                </p>
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
                    <div className="room-card-header">
                      <div className="room-icon">🚪</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="room-badge">
                          {roomDevices.length} Devices
                        </span>
                        <button
                          type="button"
                          onClick={(e) => deleteRoom(e, room)}
                          title="Delete Room"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    <h3>{room.name}</h3>

                    <div className="room-device-preview">
                      {roomDevices.length === 0 ? (
                        <span className="no-devices-text">No devices added</span>
                      ) : (
                        roomDevices.slice(0, 3).map((d) => (
                          <span key={d.id} className="device-chip">
                            {d.name}
                          </span>
                        ))
                      )}
                      {roomDevices.length > 3 && (
                        <span className="device-chip-more">
                          +{roomDevices.length - 3} more
                        </span>
                      )}
                    </div>

                    <div className="room-card-footer">
                      <span>Manage Devices →</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Rooms;