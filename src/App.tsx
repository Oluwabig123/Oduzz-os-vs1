import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard/Dashboard";
import Rooms from "./pages/Rooms/Rooms";
import Devices from "./pages/Devices/Devices";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/devices" element={<Devices />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;