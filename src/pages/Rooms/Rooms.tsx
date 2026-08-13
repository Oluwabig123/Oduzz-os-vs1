import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const homeId = searchParams.get("home");

  const [home, setHome] = useState<Home | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadHomeAndRooms() {
    if (!homeId) {
      setLoading(false);
      return;
    }

    const { data: homeData, error: homeError } = await supabase
      .from("homes")
      .select("id, name")
      .eq("id", homeId)
      .single();

    if (homeError) {
      console.error("Error loading home:", homeError);
    } else {
      setHome(homeData);
    }

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (roomsError) {
      console.error("Error loading rooms:", roomsError);
    } else {
      setRooms(roomsData ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadHomeAndRooms();
  }, [homeId]);

  async function createRoom() {
    if (!homeId) {
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
        home_id: homeId,
        name: roomName.trim(),
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      setRoomName("");
      await loadHomeAndRooms();
    }

    setSaving(false);
  }

  if (loading) {
    return <p style={{ padding: "2rem" }}>Loading...</p>;
  }

  if (!homeId || !home) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1>ODUZZ OS</h1>
        <p>No home selected.</p>

        <button onClick={() => navigate("/")}>
          ← Back to Homes
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <button onClick={() => navigate("/")}>
        ← Back to Homes
      </button>

      <h1>🏠 {home.name}</h1>

      <h2>Rooms</h2>

      {rooms.length === 0 ? (
        <p>No rooms found.</p>
      ) : (
        rooms.map((room) => (
          <div key={room.id}>
            <p>🚪 {room.name}</p>
          </div>
        ))
      )}

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
    </div>
  );
}

export default Rooms;