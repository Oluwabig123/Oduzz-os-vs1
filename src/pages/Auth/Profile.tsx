import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import "./Auth.css";

const Profile: React.FC = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
  }, [profile]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMsg(null);

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName.trim(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      await refreshProfile();
      setMsg("Profile updated successfully!");
    }

    setSaving(false);
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-avatar-section">
          <div className="profile-avatar-circle">
            {fullName ? fullName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>
              {profile?.full_name || "User Profile"}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
              {user?.email}
            </p>
          </div>
        </div>

        {msg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "13px",
              fontWeight: 600,
              background: msg.startsWith("Error") ? "#fef2f2" : "#f0fdf4",
              color: msg.startsWith("Error") ? "#dc2626" : "#166534",
              border: `1px solid ${msg.startsWith("Error") ? "#fecaca" : "#bbf7d0"}`
            }}
          >
            {msg}
          </div>
        )}

        <form className="auth-form" onSubmit={handleUpdateProfile}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="profile-details-grid">
            <div className="form-group">
              <label>User ID</label>
              <input type="text" value={user?.id || ""} disabled readOnly />
            </div>

            <div className="form-group">
              <label>Account Role</label>
              <input type="text" value={profile?.role || "Owner / User"} disabled readOnly />
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={saving}>
            {saving ? "Saving..." : "Update Profile"}
          </button>
        </form>

        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #f1f5f9" }}>
          <button
            onClick={() => signOut()}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#dc2626",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            Sign Out of ODUZZ OS
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
