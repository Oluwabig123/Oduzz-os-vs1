# Oduzz OS — Smart Home & Automation Operating System

Oduzz OS is a progressive web application (PWA) and IoT control plane built with **React 19**, **TypeScript**, **Vite**, **Supabase** (Auth, Postgres, Realtime), and **ESP32 physical relay firmware**.

## Key Features

- **Multi-Home & Room Hierarchy**: Manage multiple homes, rooms, and IoT appliances scoped per authenticated user.
- **Real-Time Telemetry & Control**: Live state synchronization (`device_states`) and command audit trail (`device_activity`) via Supabase Realtime.
- **Hands-Free Voice Assistant**: Continuous wake-word detection (`"Hey Oduzz"`, `"Odos"`, `"Odus"`) with natural-language intent parsing and speech synthesis (TTS) feedback.
- **Preset Scenes & Automations**: One-tap multi-device scenes and time/state-driven automation rules.
- **Hybrid Hardware + Virtual Hub**: Supports standalone physical ESP32 relay nodes (`firmware/oduzz_smart_node/`) alongside a fallback browser Virtual Hub simulator.

## Environment Variables

Create a `.env.local` file in `Oduzz-Os/`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development & Production Build

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type-check and build for production
npm run build
```

## Physical ESP32 Smart Node Setup

1. Copy `firmware/oduzz_smart_node/secrets.example.h` to `firmware/oduzz_smart_node/secrets.h`.
2. Fill in your Wi-Fi credentials, Supabase URL/Key, and target `DEVICE_ID`.
3. Follow `firmware/WIRING_AND_SETUP_GUIDE.md` to flash the ESP32 using Arduino IDE.
