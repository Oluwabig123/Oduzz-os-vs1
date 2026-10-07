import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import OduzzLogo from "../../components/OduzzLogo";
import "./Auth.css";


const Register: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [homeName, setHomeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    // 1. Sign up user via Supabase Auth
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const newUser = authData.user;
    const session = authData.session;

    // Check if email confirmation is required (user exists but no active session yet)
    if (newUser && !session) {
      setLoading(false);
      setInfoMessage(
        "Registration successful! Please check your email to confirm your account before logging in."
      );
      return;
    }

    if (newUser) {
      // Note: Profile row (with role = 'owner') is created automatically
      // by the server-side database trigger on auth.users — no client input needed.

      // 2. Create default home connected to this user (owner_id = newUser.id)
      const newHomeName = homeName.trim() || `${fullName.trim()}'s Home`;
      const { data: homeData, error: homeError } = await supabase
        .from("homes")
        .insert({
          name: newHomeName,
          address: "Default Address",
          owner_id: newUser.id,
        })
        .select()
        .single();

      if (homeError) {
        setError("Account created but home setup failed. Please contact support.");
        setLoading(false);
        return;
      }

      // 3. Link user to home in home_users junction table
      const { error: homeUserError } = await supabase.from("home_users").insert({
        home_id: homeData.id,
        user_id: newUser.id,
        role: "owner",
      });

      if (homeUserError) {
        setError("Account created but home membership setup failed. Please contact support.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate("/");
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand" style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
            <OduzzLogo size={36} variant="full" />
          </div>
          <p className="auth-subtitle">Create your smart home account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {infoMessage && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "20px",
              lineHeight: 1.4,
            }}
          >
            ✉️ {infoMessage}
          </div>
        )}

        <form className="auth-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="e.g. Alex Johnson"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Default Home Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Victoria Residence"
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?
          <Link to="/login" className="auth-link">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
