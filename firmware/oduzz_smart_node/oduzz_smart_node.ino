/* ==============================================================================
   ODUZZ OS — PHYSICAL SMART RELAY & HUB FIRMWARE
   Target Hardware: ESP32 Dev Module (NodeMCU-32S / ESP-WROOM-32 / ESP32-C3)
   Purpose: Standalone physical IoT controller for lights & appliances
            without Tuya, Sonoff, Matter, or third-party cloud bridges.
   ============================================================================== */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ==============================================================================
// 1. NETWORK & SUPABASE CONFIGURATION
// ==============================================================================
#if __has_include("secrets.h")
  #include "secrets.h"
#endif

#ifndef ODUZZ_WIFI_SSID
  #define ODUZZ_WIFI_SSID     "YOUR_WIFI_NAME"
  #define ODUZZ_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
  #define ODUZZ_SUPABASE_URL  "https://your-project-id.supabase.co"
  #define ODUZZ_SUPABASE_KEY  "REPLACE_WITH_YOUR_SUPABASE_KEY"
  // You can provide EITHER the Device UUID (copied via "Copy ESP32 UUID" in Oduzz OS)
  // OR your custom Hardware Tag/UID (e.g. "ESP32-NODE-01")!
  #define ODUZZ_DEVICE_ID     "REPLACE_WITH_YOUR_DEVICE_UUID_OR_UID"
#endif

const char* WIFI_SSID     = ODUZZ_WIFI_SSID;
const char* WIFI_PASSWORD = ODUZZ_WIFI_PASSWORD;
const char* SUPABASE_URL  = ODUZZ_SUPABASE_URL;
const char* SUPABASE_KEY  = ODUZZ_SUPABASE_KEY;
String resolvedDeviceId   = String(ODUZZ_DEVICE_ID);

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define RELAY_PIN         4    // GPIO 4 connected to Relay Signal (IN)
#define WALL_SWITCH_PIN   18   // GPIO 18 connected to Physical Wall Switch
#define STATUS_LED_PIN    2    // Onboard Blue LED (GPIO 2 on most ESP32 boards)

// Most relay modules are ACTIVE-LOW (LOW = ON, HIGH = OFF).
// If your relay turns ON when pin is HIGH, change this to false.
const bool RELAY_ACTIVE_LOW = true;

// ==============================================================================
// 3. GLOBAL SYSTEM STATE & TIMERS
// ==============================================================================
bool currentLightState = false;       // false = OFF, true = ON
int lastWallSwitchState = HIGH;       // For switch toggle detection
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 120; // 120ms debounce to prevent electrical bounce

unsigned long lastCloudPoll = 0;
const unsigned long CLOUD_POLL_INTERVAL = 800; // Poll Supabase every 800ms

// ==============================================================================
// 4. RELAY HARDWARE CONTROL HELPER
// ==============================================================================
void setPhysicalRelay(bool turnOn) {
  currentLightState = turnOn;
  
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, turnOn ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  }

  // Flash onboard LED to confirm state
  digitalWrite(STATUS_LED_PIN, turnOn ? HIGH : LOW);

  Serial.print("⚡ [ODUZZ HARDWARE] Relay physical state switched to: ");
  Serial.println(turnOn ? "ON" : "OFF");
}

// ==============================================================================
// 5. SUPABASE CLOUD REST HELPERS
// ==============================================================================

// Checks if a string looks like a standard 36-char UUID
bool isUuidFormat(String str) {
  return (str.length() == 36 && str.charAt(8) == '-' && str.charAt(13) == '-');
}

// Resolves custom device_uid (e.g. "ESP32-NODE-01") to the database UUID if needed
void resolveDeviceUuidIfNeeded() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (isUuidFormat(resolvedDeviceId)) return;

  Serial.print("🔍 Resolving Hardware UID '");
  Serial.print(resolvedDeviceId);
  Serial.println("' to Supabase Device UUID...");

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/devices?device_uid=eq." + resolvedDeviceId + "&select=id&limit=1";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    int idKeyIndex = response.indexOf("\"id\":\"");
    if (idKeyIndex != -1) {
      int idStart = idKeyIndex + 6;
      int idEnd = response.indexOf("\"", idStart);
      if (idEnd != -1) {
        resolvedDeviceId = response.substring(idStart, idEnd);
        Serial.print("✓ Resolved Device UUID: ");
        Serial.println(resolvedDeviceId);
      }
    }
  }
  http.end();
}

// Fetches last known state from Supabase at boot so power cuts don't reset active appliances
void restoreLastCloudState() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_states?device_id=eq." + resolvedDeviceId + "&select=actual_state&limit=1";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    if (response.indexOf("\"actual_state\":\"ON\"") != -1) {
      setPhysicalRelay(true);
      http.end();
      return;
    } else if (response.indexOf("\"actual_state\":\"OFF\"") != -1) {
      setPhysicalRelay(false);
      http.end();
      return;
    }
  }
  http.end();

  // If no state row exists yet in Supabase, initialize it
  syncStateToCloud(currentLightState, false);
}

// Inserts an event into device_activity table
void logActivityToCloud(String command, String result) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_activity";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  String payload = "{\"device_id\":\"" + resolvedDeviceId + "\",\"command\":\"" + command + "\",\"result\":\"" + result + "\"}";
  http.POST(payload);
  http.end();
}

// Updates device_states table in Supabase
void syncStateToCloud(bool state, bool recordActivity = true) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_states?device_id=eq." + resolvedDeviceId;

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer", "return=representation");

  String payload = "{\"device_id\":\"" + resolvedDeviceId + "\",\"actual_state\":\"" + (state ? "ON" : "OFF") + "\",\"desired_state\":\"" + (state ? "ON" : "OFF") + "\"}";
  
  int httpCode = http.PATCH(payload);
  String patchResp = httpCode > 0 ? http.getString() : "";
  http.end();

  // If the device_states row did not exist yet (empty JSON array "[]"), POST to create it
  if (httpCode <= 0 || patchResp == "[]") {
    HTTPClient postHttp;
    String postUrl = String(SUPABASE_URL) + "/rest/v1/device_states";
    postHttp.begin(client, postUrl);
    postHttp.addHeader("Content-Type", "application/json");
    postHttp.addHeader("apikey", SUPABASE_KEY);
    postHttp.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
    postHttp.addHeader("Prefer", "resolution=merge-duplicates");
    postHttp.POST(payload);
    postHttp.end();
  }

  if (recordActivity) {
    logActivityToCloud(state ? "TURN_ON" : "TURN_OFF", "success");
  }
}

// Marks command as completed in Supabase atomically
bool markCommandExecuted(String jsonResponse) {
  int idKeyIndex = jsonResponse.indexOf("\"id\":\"");
  if (idKeyIndex == -1) return false;
  int idStart = idKeyIndex + 6;
  int idEnd = jsonResponse.indexOf("\"", idStart);
  if (idEnd == -1) return false;
  String cmdId = jsonResponse.substring(idStart, idEnd);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_commands?id=eq." + cmdId + "&status=eq.pending";

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int code = http.PATCH("{\"status\":\"completed\"}");
  http.end();
  return (code >= 200 && code < 300);
}

// Polls pending commands sent by Voice / App / Automations
void checkPendingCloudCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_commands?status=eq.pending&device_id=eq." + resolvedDeviceId + "&order=created_at.asc&limit=1";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    
    if (response.indexOf("\"command\":\"TURN_ON\"") != -1) {
      Serial.println("🌐 [CLOUD CMD] Received: TURN_ON via Oduzz OS");
      if (markCommandExecuted(response)) {
        setPhysicalRelay(true);
        syncStateToCloud(true, true);
      }
    } else if (response.indexOf("\"command\":\"TURN_OFF\"") != -1) {
      Serial.println("🌐 [CLOUD CMD] Received: TURN_OFF via Oduzz OS");
      if (markCommandExecuted(response)) {
        setPhysicalRelay(false);
        syncStateToCloud(false, true);
      }
    }
  }
  http.end();
}

// ==============================================================================
// 6. SETUP & HARDWARE INITIALIZATION
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n==========================================");
  Serial.println("   ODUZZ OS — PHYSICAL SMART NODE v1.1   ");
  Serial.println("==========================================");

  // Configure Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(WALL_SWITCH_PIN, INPUT_PULLUP);

  // Default relay safely at boot before cloud state restoration
  setPhysicalRelay(false);

  // Read initial wall switch position
  lastWallSwitchState = digitalRead(WALL_SWITCH_PIN);

  // Connect to Home Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(300);
    Serial.print(".");
  }

  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println("\n✓ Wi-Fi Connected!");
  Serial.print("✓ Node IP Address: ");
  Serial.println(WiFi.localIP());

  // 1. Resolve custom device_uid to UUID if needed
  resolveDeviceUuidIfNeeded();

  // 2. Restore last known state from Oduzz OS Cloud (without logging a false boot event)
  restoreLastCloudState();
  Serial.println("✓ Oduzz Cloud Synced! Listening for physical switch & voice commands...");
}

// ==============================================================================
// 7. MAIN RUNTIME LOOP (DUAL CONTROL: PHYSICAL SWITCH + VOICE/CLOUD)
// ==============================================================================
void loop() {
  // A. MONITOR PHYSICAL WALL SWITCH (Instant Local Override)
  int currentSwitchReading = digitalRead(WALL_SWITCH_PIN);

  if (currentSwitchReading != lastWallSwitchState) {
    if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
      lastDebounceTime = millis();
      lastWallSwitchState = currentSwitchReading;

      // Toggle physical light state
      bool newState = !currentLightState;
      setPhysicalRelay(newState);
      Serial.println("🔘 [WALL SWITCH] Physical switch flipped! Toggling light...");

      // Update Supabase so Web App & Voice UI update immediately
      syncStateToCloud(newState, true);
    }
  }

  // B. POLL ODUZZ OS CLOUD FOR VOICE & APP COMMANDS
  if (millis() - lastCloudPoll >= CLOUD_POLL_INTERVAL) {
    lastCloudPoll = millis();
    checkPendingCloudCommands();
  }

  // C. AUTO-RECONNECT WI-FI IF SIGNAL DROPS
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }
}
