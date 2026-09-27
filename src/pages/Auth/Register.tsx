import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./Auth.css";

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [homeName, setHomeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const newUser = authData.user;

    if (newUser) {
      // 2. Create user profile in profiles table
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: newUser.id,
        full_name: fullName.trim(),
        role: "owner",
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        console.error("Profile creation warning:", profileError.message);
      }

      // 3. Create default home connected to this user (owner_id = newUser.id)
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
        console.error("Home connection error:", homeError.message);
      } else if (homeData) {
        // Also create a home_users link table entry
        await supabase.from("home_users").insert({
          home_id: homeData.id,
          user_id: newUser.id,
          role: "owner",
        });
      }

    }

    setLoading(false);
    navigate("/");
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            ⚡ ODUZZ <span className="auth-brand-accent">OS</span>
          </div>
          <p className="auth-subtitle">Create your smart home account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

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
