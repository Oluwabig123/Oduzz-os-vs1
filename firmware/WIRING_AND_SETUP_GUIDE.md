# Oduzz OS — Physical Smart Switch & Hub Wiring Guide

This guide explains how to build and flash your first physical **Oduzz Smart Relay / Node** using an inexpensive ESP32 microcontroller, without requiring Tuya, Sonoff, Matter, or third-party cloud bridges.

---

## 1. Bill of Materials (BOM)

To build your first prototype on your desk:

| Component | Purpose | Recommended Model | Est. Cost |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | The brain with Wi-Fi & Oduzz firmware | ESP32 DevKit V1 (ESP-WROOM-32) or ESP32-C3 | \$4.00 |
| **Relay Module** | The high-voltage mechanical switch | 5V 1-Channel Relay Module (Optocoupler-isolated) | \$1.50 |
| **Wall Switch** | Manual physical wall toggle switch | Standard SPST Rocker Switch or Push Button | \$0.50 |
| **Jumper Wires** | Connects pins on your desk | Female-to-Female & Male-to-Female jumper wires | \$1.00 |
| **Test Load** | Safe visual testing | 5V/12V LED or DC lamp (test safely before 220V!) | \$2.00 |

---

## 2. Pinout & Wiring Connections

### A. Low-Voltage Side (ESP32 to Relay & Switch)

```
       ESP32 BOARD                              RELAY MODULE
  ┌──────────────────┐                     ┌────────────────────┐
  │   VIN (or 5V)    │ ──────────────────▶ │  VCC               │
  │   GND            │ ──────────────────▶ │  GND               │
  │   GPIO 4         │ ──────────────────▶ │  IN (Signal)       │
  │                  │                     └────────────────────┘
  │                  │                     
  │   GPIO 18        │ ────┐                PHYSICAL WALL SWITCH
  │                  │     ▼               ┌────────────────────┐
  │   GND            │ ──────────────────▶ │  Switch Terminal 1 │
  │                  │ ──────────────────▶ │  Switch Terminal 2 │
  └──────────────────┘                     └────────────────────┘
```

> [!NOTE]
> **Why GPIO 18 connects directly to the switch**: The ESP32 firmware enables the internal pull-up resistor on GPIO 18 (`INPUT_PULLUP`). When you flip the switch, it simply connects GPIO 18 to GND, creating a completely safe, low-voltage (0V) signal that toggles the light.

---

### B. High-Voltage Side (Relay to Real Light Bulb)

```
   220V / 110V AC MAINS
  ────────────────────────┐
  (Live Wire - Hot)       │
                          ▼
                    ┌────────────┐
                    │    COM     │ (Common Terminal on Relay)
                    │            │
                    │    NO      │ (Normally Open Terminal on Relay)
                    └─────┬──────┘
                          │ Switched Hot Wire
                          ▼
                    ┌────────────┐
                    │ LIGHT BULB │
                    └─────┬──────┘
                          │ (Neutral Wire)
  ────────────────────────┘
```

> [!CAUTION]
> **Mains Electricity Safety**: 220V/110V AC electricity can be dangerous. Always test your circuit first with a safe **5V or 12V LED bulb** or USB power until you have confirmed your code works smoothly before touching home wall wiring!

---

## 3. How to Flash the Firmware (3-Minute Setup)

### Step 1: Install Arduino IDE
1. Download and install the free [Arduino IDE](https://www.arduino.cc/en/software).
2. Go to **File ➔ Preferences**.
3. In *Additional Boards Manager URLs*, paste:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to **Tools ➔ Board ➔ Boards Manager**, search for **esp32**, and click **Install**.

### Step 2: Open the Oduzz Firmware
1. Open [`firmware/oduzz_smart_node/oduzz_smart_node.ino`](file:///c:/Users/HP/Desktop/OduzzTechnologies/Oduzz-Os/firmware/oduzz_smart_node/oduzz_smart_node.ino) in Arduino IDE.
2. Edit lines 14–22 with:
   - Your **Wi-Fi SSID & Password**.
   - Your **Device UUID** (copy the ID of any device from your Oduzz OS Devices page in the browser).

### Step 3: Flash to Your ESP32
1. Plug your ESP32 into your PC via USB cable.
2. Select your Port under **Tools ➔ Port** (e.g. `COM3` on Windows).
3. Select your Board under **Tools ➔ Board ➔ ESP32 Dev Module**.
4. Click the **Upload (➔)** button!

---

## 4. How the Dual-Control System Operates

Once uploaded:
1. **Physical Control**: Flip your physical rocker switch with your finger ➔ The relay snaps with a click ➔ Light turns ON/OFF instantly, and automatically updates the Oduzz Dashboard.
2. **Voice Control**: Say *"Hey Oduzz, turn on living room light"* into your phone or laptop ➔ Supabase receives the command ➔ The ESP32 picks it up in under 500ms ➔ The physical relay clicks ON!
3. **App Control**: Toggle the device button on the Oduzz OS web dashboard or mobile PWA ➔ Real light switches instantly!
