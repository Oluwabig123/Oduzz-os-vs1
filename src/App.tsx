import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import Navbar from "./components/Navbar";
import InstallAppBanner from "./components/InstallAppBanner";
import MobileBottomNav from "./components/MobileBottomNav";
import GlobalVoiceAssistant from "./components/GlobalVoiceAssistant";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { startVirtualHub } from "./hub/virtualHub";

// Route-level code splitting for faster initial bundle load
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Rooms = lazy(() => import("./pages/Rooms/Rooms"));
const Devices = lazy(() => import("./pages/Devices/Devices"));
const Voice = lazy(() => import("./pages/Voice/Voice"));
const Automations = lazy(() => import("./pages/Automations/Automations"));
const Login = lazy(() => import("./pages/Auth/Login"));
const Register = lazy(() => import("./pages/Auth/Register"));
const Profile = lazy(() => import("./pages/Auth/Profile"));

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || "Unexpected runtime error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Oduzz OS Error Boundary caught an error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ marginBottom: "8px", color: "#0f172a" }}>Something went wrong</h2>
          <p style={{ color: "#64748b", marginBottom: "20px", maxWidth: "420px" }}>
            {this.state.errorMessage}
          </p>
          <button
            onClick={() => window.location.assign("/")}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              background: "#315efb",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload Oduzz OS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 70px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "48px", marginBottom: "12px" }}>🛰️</div>
      <h1 style={{ margin: "0 0 8px", fontSize: "26px", color: "#0f172a" }}>
        404 — Page Not Found
      </h1>
      <p style={{ margin: "0 0 20px", color: "#64748b", maxWidth: "400px" }}>
        The smart home control route you requested does not exist.
      </p>
      <Link
        to="/"
        style={{
          padding: "10px 20px",
          borderRadius: "10px",
          background: "#315efb",
          color: "#ffffff",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: "14px",
        }}
      >
        Return to Dashboard
      </Link>
    </div>
  );
}

function App() {
  useEffect(() => {
    const stopVirtualHub = startVirtualHub();

    return () => {
      stopVirtualHub?.();
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppErrorBoundary>
          {/* PWA Download / Install App Prompt Banner */}
          <InstallAppBanner />

          <Navbar />

          <Suspense
            fallback={
              <div
                style={{
                  minHeight: "60vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                Loading Oduzz OS...
              </div>
            }
          >
            <Routes>
              {/* Public routes for unauthenticated users */}
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              {/* Protected routes for authenticated users */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/voice" element={<Voice />} />
                <Route path="/automations" element={<Automations />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Catch-all 404 route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>

          {/* Global Floating Voice Assistant */}
          <GlobalVoiceAssistant />

          {/* Mobile Native-Style Bottom Navigation Bar */}
          <MobileBottomNav />
        </AppErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;