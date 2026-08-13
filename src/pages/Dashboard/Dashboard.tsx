import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Home = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
};

function Dashboard() {
  const [homes, setHomes] = useState<Home[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadHomes() {
    const { data, error } = await supabase
      .from("homes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading homes:", error);
    } else {
      setHomes(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadHomes();
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

      await loadHomes();
    }

    setSaving(false);
  }

  if (loading) {
    return <p style={{ padding: "2rem" }}>Loading homes...</p>;
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>ODUZZ OS</h1>

      <h2>My Homes</h2>

      {homes.length === 0 ? (
        <p>No homes found.</p>
      ) : (
        homes.map((home) => (
          <div key={home.id}>
            <h3>🏠 {home.name}</h3>
            <p>📍 {home.address || "No address provided"}</p>
          </div>
        ))
      )}

      <br />

      <button onClick={() => setShowForm(!showForm)}>
        {showForm ? "Cancel" : "+ Add New Home"}
      </button>

      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>Create New Home</h2>

          <input
            type="text"
            placeholder="Home Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <br />
          <br />

          <input
            type="text"
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <br />
          <br />

          <button onClick={createHome} disabled={saving}>
            {saving ? "Saving..." : "Save Home"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Dashboard;