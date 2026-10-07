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
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // Replace with your home Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // Replace with your home Wi-Fi Password

// Supabase REST Endpoint & API Key (from your Oduzz OS project)
const char* SUPABASE_URL  = "https://hwxjhlztkosxbjxwzqpw.supabase.co";
const char* SUPABASE_KEY  = "sb_publishable_koIuqmTMmD-_8fMxrbE4KQ_z3LgWygt";

// The UUID of the device in your Oduzz "devices" table that this node controls
// (Copy the UUID of any device from your Oduzz OS Devices page)
const char* DEVICE_ID     = "REPLACE_WITH_YOUR_DEVICE_UUID";

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

// Updates device_states table in Supabase
void syncStateToCloud(bool state) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL certificate validation for embedded lightweight speed

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_states?device_id=eq." + String(DEVICE_ID);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer", "resolution=merge-duplicates");

  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"actual_state\":\"" + (state ? "ON" : "OFF") + "\",\"desired_state\":\"" + (state ? "ON" : "OFF") + "\"}";
  
  int httpCode = http.PATCH(payload);
  if (httpCode <= 0) {
    // If state row didn't exist yet, insert it
    http.POST(payload);
  }
  http.end();

  // Log activity
  logActivityToCloud(state ? "TURN_ON" : "TURN_OFF", "SUCCESS");
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

  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"command\":\"" + command + "\",\"result\":\"" + result + "\"}";
  http.POST(payload);
  http.end();
}

// Polls pending commands sent by Voice / App / Automations
void checkPendingCloudCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  // Fetch pending commands for this device
  String url = String(SUPABASE_URL) + "/rest/v1/device_commands?status=eq.pending&device_id=eq." + String(DEVICE_ID) + "&order=created_at.asc&limit=1";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    
    // Check if response contains a pending command
    if (response.indexOf("\"command\":\"TURN_ON\"") != -1) {
      Serial.println("🌐 [CLOUD CMD] Received: TURN_ON via Oduzz OS");
      setPhysicalRelay(true);
      markCommandExecuted(response);
      syncStateToCloud(true);
    } else if (response.indexOf("\"command\":\"TURN_OFF\"") != -1) {
      Serial.println("🌐 [CLOUD CMD] Received: TURN_OFF via Oduzz OS");
      setPhysicalRelay(false);
      markCommandExecuted(response);
      syncStateToCloud(false);
    }
  }
  http.end();
}

// Marks command as executed in Supabase
void markCommandExecuted(String jsonResponse) {
  // Extract command ID
  int idStart = jsonResponse.indexOf("\"id\":\"") + 6;
  if (idStart < 6) return;
  int idEnd = jsonResponse.indexOf("\"", idStart);
  String cmdId = jsonResponse.substring(idStart, idEnd);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_commands?id=eq." + cmdId;

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

  http.PATCH("{\"status\":\"executed\"}");
  http.end();
}

// ==============================================================================
// 6. SETUP & HARDWARE INITIALIZATION
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n==========================================");
  Serial.println("   ODUZZ OS — PHYSICAL SMART NODE v1.0   ");
  Serial.println("==========================================");

  // Configure Pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(WALL_SWITCH_PIN, INPUT_PULLUP); // Internal pullup for physical switch

  // Default light to OFF safely at boot
  setPhysicalRelay(false);

  // Read initial wall switch position
  lastWallSwitchState = digitalRead(WALL_SWITCH_PIN);

  // Connect to Home Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN)); // Blink while connecting
    delay(300);
    Serial.print(".");
  }

  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println("\n✓ Wi-Fi Connected!");
  Serial.print("✓ Node IP Address: ");
  Serial.println(WiFi.localIP());

  // Report initial state to Supabase
  syncStateToCloud(currentLightState);
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
      syncStateToCloud(newState);
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
