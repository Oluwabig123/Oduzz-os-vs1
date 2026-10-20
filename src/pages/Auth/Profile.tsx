import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import "./Auth.css";

const Profile: React.FC = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

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

  function handleCopyUserId() {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  }

  const isError = msg?.startsWith("Error");

  return (
    <div className="profile-page">
      <div className="auth-ambient-glow" />
      <div className="profile-card">
        <div className="profile-avatar-section">
          <div className="profile-avatar-circle">
            {fullName
              ? fullName.charAt(0).toUpperCase()
              : user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="profile-header-meta">
            <div className="profile-role-badge">
              {profile?.role ? profile.role.toUpperCase() : "SYSTEM OWNER"}
            </div>
            <h2>{profile?.full_name || "Operator Profile"}</h2>
            <p>{user?.email}</p>
          </div>
        </div>

        {msg && (
          <div className={`profile-feedback-banner ${isError ? "error" : "success"}`}>
            <span>{isError ? "⚠️" : "✓"} {msg}</span>
            <button
              type="button"
              className="feedback-close-btn"
              onClick={() => setMsg(null)}
            >
              ✕
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleUpdateProfile}>
          <div className="form-group">
            <label htmlFor="profile-fullname">Full Name / Display Name</label>
            <div className="input-with-icon">
              <span className="input-leading-icon">👤</span>
              <input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
          </div>

          <div className="profile-details-grid">
            <div className="form-group">
              <label>Operator UUID</label>
              <div className="readonly-field-box">
                <code className="readonly-mono">{user?.id || "N/A"}</code>
                <button
                  type="button"
                  className="copy-inline-btn"
                  onClick={handleCopyUserId}
                  title="Copy User ID"
                >
                  {copiedUid ? "✓" : "📋"}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Security Clearance</label>
              <div className="readonly-field-box">
                <span>{profile?.role || "Owner / Administrator"}</span>
                <span className="verified-pill">Verified</span>
              </div>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={saving}>
            {saving ? "Saving Changes..." : "Save Profile Changes"}
          </button>
        </form>

        <div className="profile-danger-zone">
          <div className="danger-zone-info">
            <strong>Session Management</strong>
            <span>Disconnect this device from your Oduzz OS gateway</span>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="profile-signout-btn"
          >
            Sign Out of Oduzz OS
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
