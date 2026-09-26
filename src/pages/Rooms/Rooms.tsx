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

    const { data: homesData, error: homesError } = await supabase
      .from("homes")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (homesError) {
      console.error("Error loading homes:", homesError);
    } else {
      setHomes(homesData ?? []);
      if (!selectedHomeId && homesData && homesData.length > 0) {
        setSelectedHomeId(homesData[0].id);
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

    const [roomsRes, devicesRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("home_id", hId)
        .order("created_at", { ascending: true }),

      supabase.from("devices").select("id, room_id, name, device_type"),
    ]);

    if (roomsRes.error) {
      console.error("Error loading rooms:", roomsRes.error);
    } else {
      setRooms(roomsRes.data ?? []);
    }

    if (devicesRes.error) {
      console.error("Error loading devices:", devicesRes.error);
    } else {
      setDevices(devicesRes.data ?? []);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedHomeId) {
      loadRoomsAndDevices(selectedHomeId);
    }
  }, [selectedHomeId]);

  async function createRoom() {
    if (!selectedHomeId) {
      alert("No home selected.");
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

        <button
          className="add-room-trigger"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Cancel" : "+ Add Room"}
        </button>
      </div>

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
            <p>Add a room to start attaching smart lights, switches, and fans.</p>
          </div>
        ) : (
          rooms.map((room) => {
            const roomDevices = devices.filter((d) => d.room_id === room.id);

            return (
              <div
                className="room-card"
                key={room.id}
                onClick={() => navigate(`/devices`)}
              >
                <div className="room-card-header">
                  <div className="room-icon">🚪</div>
                  <span className="room-badge">{roomDevices.length} Devices</span>
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
    </div>
  );
}

export default Rooms;