import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard/Dashboard";
import Rooms from "./pages/Rooms/Rooms";
import Devices from "./pages/Devices/Devices";
import Voice from "./pages/Voice/Voice";
import Automations from "./pages/Automations/Automations";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import Profile from "./pages/Auth/Profile";
import Navbar from "./components/Navbar";
import InstallAppBanner from "./components/InstallAppBanner";
import MobileBottomNav from "./components/MobileBottomNav";
import GlobalVoiceAssistant from "./components/GlobalVoiceAssistant";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

import { startVirtualHub } from "./hub/virtualHub";

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
        {/* PWA Download / Install App Prompt Banner */}
        <InstallAppBanner />

        <Navbar />

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
        </Routes>

        {/* Global Floating Voice Assistant */}
        <GlobalVoiceAssistant />

        {/* Mobile Native-Style Bottom Navigation Bar */}
        <MobileBottomNav />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;