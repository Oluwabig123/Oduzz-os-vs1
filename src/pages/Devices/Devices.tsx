import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

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

function Devices() {
  const [homes, setHomes] = useState<Home[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

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
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading devices:", error);
    } else {
      setDevices(data ?? []);
    }
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
    }
  }, [selectedRoom]);

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

    const { error } = await supabase.from("devices").insert([
      {
        room_id: selectedRoom,
        name: deviceName.trim(),
        device_type: deviceType,
        device_uid: deviceUid.trim(),
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setDeviceName("");
      setDeviceUid("");

      await loadDevices(selectedRoom);

      alert("Device created successfully!");
    }

    setSaving(false);
  }

  if (loading) {
    return <p style={{ padding: "2rem" }}>Loading...</p>;
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>ODUZZ OS</h1>

      <h2>Devices</h2>

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

      <h3>Devices in this Room</h3>

      {devices.length === 0 ? (
        <p>No devices found.</p>
      ) : (
        devices.map((device) => (
          <div
            key={device.id}
            style={{
              border: "1px solid #ccc",
              padding: "1rem",
              marginBottom: "1rem",
              borderRadius: "8px",
            }}
          >
            <h3>
              {device.device_type === "light" ? "💡" : "🔌"} {device.name}
            </h3>

            <p>Type: {device.device_type}</p>

            <p>UID: {device.device_uid}</p>

            <p>Status: Not connected</p>
          </div>
        ))
      )}

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