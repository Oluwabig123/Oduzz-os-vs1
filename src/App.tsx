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
          <div
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "24px",
              padding: "36px 32px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
            }}
          >
            <h2 style={{ margin: "0 0 8px", color: "#f8fafc", fontSize: "22px" }}>
              System Interruption
            </h2>
            <p style={{ color: "#94a3b8", marginBottom: "24px", fontSize: "14px", lineHeight: 1.5 }}>
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.assign("/")}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
              }}
            >
              Reload Oduzz OS
            </button>
          </div>
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
      <div
        style={{
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "24px",
          padding: "40px 32px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "14px" }}>🛰️</div>
        <h1 style={{ margin: "0 0 8px", fontSize: "24px", color: "#f8fafc" }}>
          404 — Route Not Found
        </h1>
        <p style={{ margin: "0 0 24px", color: "#94a3b8", fontSize: "14px", lineHeight: 1.5 }}>
          The smart home control sector you requested could not be located.
        </p>
        <Link
          to="/"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "14px",
            boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
          }}
        >
          Return to Command Center
        </Link>
      </div>
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
                  minHeight: "65vh",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "14px",
                  color: "#94a3b8",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "3px solid rgba(99, 102, 241, 0.2)",
                    borderTopColor: "#6366f1",
                    animation: "oduzzSpin 0.8s linear infinite",
                  }}
                />
                <span>Initializing Oduzz OS...</span>
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
