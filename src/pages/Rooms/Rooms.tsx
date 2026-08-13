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
  created_at: string;
};

function Rooms() {
  const [homes, setHomes] = useState<Home[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [selectedHome, setSelectedHome] = useState("");
  const [roomName, setRoomName] = useState("");

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
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading rooms:", error);
    } else {
      setRooms(data ?? []);
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

  async function createRoom() {
    if (!selectedHome) {
      alert("Please select a home.");
      return;
    }

    if (!roomName.trim()) {
      alert("Please enter a room name.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("rooms").insert([
      {
        home_id: selectedHome,
        name: roomName.trim(),
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setRoomName("");
      await loadRooms(selectedHome);
    }

    setSaving(false);
  }

  if (loading) {
    return <p style={{ padding: "2rem" }}>Loading...</p>;
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>ODUZZ OS</h1>

      <h2>Rooms</h2>

      <label>Select Home</label>

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

      <h3>Add Room</h3>

      <input
        type="text"
        placeholder="Room Name"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
      />

      <button onClick={createRoom} disabled={saving}>
        {saving ? "Saving..." : "Add Room"}
      </button>

      <h3>Rooms in this Home</h3>

      {rooms.length === 0 ? (
        <p>No rooms found.</p>
      ) : (
        rooms.map((room) => (
          <div key={room.id}>
            <p>🚪 {room.name}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default Rooms;