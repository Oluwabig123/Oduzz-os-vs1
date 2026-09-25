import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard/Dashboard";
import Rooms from "./pages/Rooms/Rooms";
import Devices from "./pages/Devices/Devices";
import Voice from "./pages/Voice/Voice";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/voice" element={<Voice />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;