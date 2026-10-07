import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import OduzzLogo from "../../components/OduzzLogo";
import "./Auth.css";

const REMEMBER_EMAIL_KEY = "oduzz_remembered_email";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setError("Please provide both email address and password.");
      return;
    }

    setLoading(true);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }

      // Handle Remember Me
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, cleanEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Unexpected authentication error occurred.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      {/* Background ambient lighting */}
      <div className="auth-ambient-glow" />

      <div className="auth-card">
        {/* Header with Oduzz brand identity */}
        <div className="auth-header">
          <div className="auth-brand">
            <OduzzLogo size={42} variant="full" />
          </div>
          <p className="auth-subtitle">
            Secure Smart Home Operating System Gateway
          </p>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="auth-error" role="alert">
            <span className="auth-error-icon">⚠️</span>
            <span className="auth-error-text">{error}</span>
            <button
              type="button"
              className="auth-error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleLogin}>
          {/* Email input field with icon */}
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <div className="input-with-icon">
              <span className="input-leading-icon">✉️</span>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          {/* Password input field with Show/Hide toggle */}
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div className="input-with-icon">
              <span className="input-leading-icon">🔒</span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>
          </div>

          {/* Remember Me and Security Note */}
          <div className="auth-options-row">
            <label className="remember-me-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />
              <span>Remember me</span>
            </label>
          </div>

          {/* Interactive Submit Button with Spinner */}
          <button
            type="submit"
            className={`auth-submit-btn ${loading ? "loading" : ""}`}
            disabled={loading}
          >
            {loading ? (
              <span className="btn-spinner-wrapper">
                <span className="btn-spinner" />
                <span>Verifying credentials...</span>
              </span>
            ) : (
              <span>Sign In to Oduzz OS</span>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>New to Oduzz OS?</span>
          <Link to="/register" className="auth-link">
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
