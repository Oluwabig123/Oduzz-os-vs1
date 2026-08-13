import { useState } from "react";
import { supabase } from "../../lib/supabase";

function CreateHome() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  async function saveHome() {
    const { error } = await supabase.from("homes").insert([
      {
        name,
        address,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Home created successfully!");
      setName("");
      setAddress("");
    }
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Create Home</h1>

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

      <button onClick={saveHome}>
        Save Home
      </button>
    </div>
  );
}

export default CreateHome;