/* 
  ESP32 Pothole Detector - Reduced sensitivity version
  - Paper-based D-value + auto-calibration (60th percentile)
  - Increased detect threshold, longer calibration, scaleS clamping
  - Pretty JSON printed to Serial and sent to server
*/

#include <Wire.h>
#include "I2Cdev.h"
#include "MPU6050.h"
#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ===== USER CONFIG =====
const char* WIFI_SSID = "iQOO Neo7 Pro";
const char* WIFI_PASS = "shawn@4731";
String serverUrl = "http://172.30.26.61:5000/api/potholes"; // Your server IP + port + route
const char* DEVICE_ID = "esp32_001";

// pins and devices
const int I2C_SDA = 21;
const int I2C_SCL = 22;
const int GPS_RX_PIN = 16; // GPS TX -> ESP RX2
const int GPS_TX_PIN = 17; // GPS RX <- ESP TX2
const unsigned long GPS_BAUD = 9600;

// Wait for GPS fix timeout (milliseconds).
const unsigned long GPS_FIX_TIMEOUT_MS = 5UL * 60UL * 1000UL; // 5 min

// ===== Calibration & sensitivity tuning =====
const unsigned long CALIBRATE_RUN_MS = 30000UL; // 30s calibration (increase if needed)
const int CALIB_MAX_EVENTS = 400;
float calib_depths[CALIB_MAX_EVENTS];
int calib_cnt = 0;
int calib_idx = 0;
float scaleS = 1.0f; // multiplier depth_m -> D (paper units)
const float D_TARGET = 0.9f; // map representative depth -> D_target (less sensitive)
const float SCALE_S_CLAMP_MAX = 12.0f; // max clamp for scaleS

// paper thresholds (from paper)
const float PAPER_D_THRESH_LOW = 0.8f;
const float PAPER_D_THRESH_HIGH = 1.6f;

// ===== MPU + GPS + WiFi params =====
MPU6050 mpu;
TinyGPSPlus gps;
HardwareSerial SerialGPS(2);
SemaphoreHandle_t i2cMutex = NULL;

// Detection & classification params
const float LSB_PER_G = 16384.0f;
const float ALPHA = 0.995f;
float baseline = 1.0f;
float MAX_G_EXPECTED = 4.5f; // for normalization if needed

// detection thresholds (reduced sensitivity)
float DETECT_THRESHOLD_G = 0.65f;    // higher threshold -> fewer tiny triggers
float POTHOLE_MIN_PEAK_G = 1.15f;
float BUMP_MIN_PEAK_G = 0.5f;
float BUMP_MAX_PEAK_G = 3.0f;
unsigned long MIN_EVENT_GAP_MS = 2000; // 2s between events to avoid duplicates
const unsigned long MPU_SAMPLE_MS = 20; // 50 Hz

// runtime & buffers
const int VBUF_SIZE = 16;
float vibBuffer[VBUF_SIZE];
int vibIdx = 0;

volatile bool gpsHasFix = false;
volatile bool gpsWaiting = true;
volatile bool detectionStarted = false;

unsigned long lastEventSent = 0;
unsigned long eventCounter = 0; // unique id counter

// helpers
String fstr(float v, int d=3){ char b[30]; dtostrf(v,0,d,b); return String(b); }
void pushVib(float val){ vibBuffer[vibIdx++] = val; if (vibIdx >= VBUF_SIZE) vibIdx = 0; }

// ===== Utility: percentile helper (and median uses percentile) =====
float percentileArray(float *arr, int n, float p) {
  if (n <= 0) return 0.0f;
  static float tmp[CALIB_MAX_EVENTS];
  if (n > CALIB_MAX_EVENTS) n = CALIB_MAX_EVENTS;
  for (int i=0;i<n;i++) tmp[i] = arr[i];
  // simple insertion sort (n <= 400)
  for (int i=1;i<n;i++){
    float key = tmp[i]; int j = i-1;
    while (j>=0 && tmp[j] > key) { tmp[j+1] = tmp[j]; j--; }
    tmp[j+1] = key;
  }
  float fp = p / 100.0f * (n - 1);
  int idx = (int)fp;
  float frac = fp - idx;
  if (idx + 1 < n) return tmp[idx] * (1.0f - frac) + tmp[idx+1] * frac;
  return tmp[n-1];
}
float medianArray(float *arr, int n) { return percentileArray(arr, n, 50.0f); }

// ----- Depth & D-value computations -----
// compute depth (meters) from peak_g and duration (ms): d = 0.5 * a * t^2
float compute_depth_m(float peak_g, unsigned long duration_ms) {
  float a_mps2 = peak_g * 9.81f;          // g -> m/s^2
  float t = (float)duration_ms / 1000.0f; // seconds
  return 0.5f * a_mps2 * t * t;           // meters
}
float compute_D_from_depth(float depth_m) { return depth_m * scaleS; }

// ===== WiFi connect helper =====
void connectWiFi(){
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  const unsigned long WIFI_TIMEOUT_MS = 15000;
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS){
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connect failed (timeout). Continuing but POSTs may fail.");
  }
}

// ===== classification: POTHOLE or SPEED_BUMP =====
String classifyEventSimple(float peak_g, unsigned long duration_ms, float speed_kmph){
  float peakNorm = constrain((peak_g - BUMP_MIN_PEAK_G) / (MAX_G_EXPECTED - BUMP_MIN_PEAK_G), 0.0f, 1.0f);
  float durNorm = constrain((float)duration_ms / 1000.0f, 0.0f, 1.0f);
  float speedNorm = constrain(speed_kmph / 50.0f, 0.0f, 1.0f);
  float potholeScore = 0.6f * peakNorm + 0.2f * (1.0f - durNorm) + 0.2f * speedNorm;
  float bumpPeakComponent = constrain((peak_g - BUMP_MIN_PEAK_G) / (BUMP_MAX_PEAK_G - BUMP_MIN_PEAK_G), 0.0f, 1.0f);
  float bumpScore = 0.5f * bumpPeakComponent + 0.4f * durNorm + 0.1f * (1.0f - speedNorm);
  if (potholeScore >= bumpScore) return "POTHOLE";
  return "SPEED_BUMP";
}

// ===== HTTP POST helper - retries (NO API KEY) =====
int postJsonWithRetries(const String &payload, int maxRetries = 3) {
  if (payload.length() == 0) return -1;
  int attempt = 0;
  int lastCode = -1;
  while (attempt < maxRetries) {
    HTTPClient http;
    http.setTimeout(10000);
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    Serial.printf("POST attempt %d/%d ...\n", attempt+1, maxRetries);
    int code = http.POST(payload);
    if (code > 0) {
      String resp = http.getString();
      Serial.printf("POST %d response: %s\n", code, resp.c_str());
      http.end();
      return code;
    } else {
      Serial.printf("POST failed (attempt %d) error=%d\n", attempt+1, code);
      lastCode = code;
      http.end();
      unsigned long backoff = 500 * (1UL << attempt);
      delay(backoff);
      attempt++;
    }
  }
  return lastCode;
}

// ===== sendEventToServer (prints pretty JSON to Serial) =====
void sendEventToServer(String deviceId, double lat, double lon, float speed_kmph,
                       const String &type, float dValue, float peak_g, unsigned long duration_ms,
                       float depth_cm, int16_t ax_raw, int16_t ay_raw, int16_t az_raw)
{
  if (serverUrl.length() == 0) {
    Serial.println("serverUrl empty - skipping POST");
    return;
  }

  // Build JSON with ArduinoJson
  StaticJsonDocument<1024> doc;
  doc["latitude"] = lat;
  doc["longitude"] = lon;
  doc["dValue"] = dValue;
  String severityStr;
  if (dValue < PAPER_D_THRESH_LOW) severityStr = "low";
  else if (dValue < PAPER_D_THRESH_HIGH) severityStr = "moderate";
  else severityStr = "severe";
  doc["severity"] = severityStr;

  JsonObject acc = doc.createNestedObject("acceleration");
  acc["x"] = (int)ax_raw;
  acc["y"] = (int)ay_raw;
  acc["z"] = (int)az_raw;

  JsonArray vibArray = doc.createNestedArray("vibration_pattern");
  int take = 4;
  for (int i=0;i<take;i++){
    int idx = (vibIdx - take + i + VBUF_SIZE) % VBUF_SIZE;
    vibArray.add(vibBuffer[idx]);
  }

  doc["depth"] = depth_cm;
  float speed_m_s = speed_kmph / 3.6f;
  float width_m = speed_m_s * ((float)duration_ms / 1000.0f);
  doc["width"] = width_m;
  doc["device_id"] = String(deviceId);
  unsigned long t = millis();
  uint32_t rnd = (uint32_t)esp_random();
  String event_id = String(deviceId) + "_evt_" + String(t) + "_" + String(rnd);
  doc["event_id"] = event_id;
  doc["flagged"] = false;

  // Pretty print JSON to Serial (server-format)
  Serial.println("\n===== EVENT JSON (sending to server) =====");
  serializeJsonPretty(doc, Serial);
  Serial.println("\n==========================================\n");

  // Convert to string for POST
  String payload;
  serializeJson(doc, payload);

  int code = postJsonWithRetries(payload, 3);
  if (code > 0) {
    if (code == 200 || code == 201) Serial.println("✅ Server accepted data.");
    else Serial.printf("⚠ Server returned HTTP %d\n", code);
  } else {
    Serial.printf("❌ POST attempts failed, final error=%d\n", code);
  }
}

// ===== GPS parsing task =====
void gpsTask(void *pv){
  (void) pv;
  SerialGPS.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("GPS task started");
  for (;;){
    const int MAX_BYTES = 64;
    int n = 0;
    while (SerialGPS.available() && n < MAX_BYTES){
      gps.encode(SerialGPS.read());
      n++;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ===== Calibration (60th percentile, clamp scaleS) =====
void runCalibrationIfNeeded() {
  if (CALIBRATE_RUN_MS == 0) {
    Serial.println("Calibration disabled. Using default scaleS=1.0");
    return;
  }
  Serial.printf("Calibration running for %lu ms ... (mount on vehicle, outdoors/drive)\n", CALIBRATE_RUN_MS);
  unsigned long start = millis();
  calib_cnt = 0; calib_idx = 0;

  // warm baseline a little
  unsigned long warmStart = millis();
  while (millis() - warmStart < 800) {
    int16_t ax_i=0, ay_i=0, az_i=0;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
      mpu.getAcceleration(&ax_i,&ay_i,&az_i);
      xSemaphoreGive(i2cMutex);
    }
    float ax = (float)ax_i / LSB_PER_G;
    float ay = (float)ay_i / LSB_PER_G;
    float az = (float)az_i / LSB_PER_G;
    float mag = sqrt(ax*ax + ay*ay + az*az);
    baseline = ALPHA * baseline + (1.0 - ALPHA) * mag;
    delay(50);
  }

  while (millis() - start < CALIBRATE_RUN_MS) {
    int16_t ax_i=0, ay_i=0, az_i=0;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
      mpu.getAcceleration(&ax_i,&ay_i,&az_i);
      xSemaphoreGive(i2cMutex);
    }
    float ax = (float)ax_i / LSB_PER_G;
    float ay = (float)ay_i / LSB_PER_G;
    float az = (float)az_i / LSB_PER_G;
    float mag = sqrt(ax*ax + ay*ay + az*az);
    baseline = ALPHA * baseline + (1.0 - ALPHA) * mag;
    float hp = fabs(mag - baseline);
    unsigned long sampleDurMs = MPU_SAMPLE_MS;
    float depth_m = compute_depth_m(hp, sampleDurMs);
    calib_depths[calib_idx++] = depth_m;
    if (calib_idx >= CALIB_MAX_EVENTS) calib_idx = 0;
    if (calib_cnt < CALIB_MAX_EVENTS) calib_cnt++;
    delay(MPU_SAMPLE_MS);
  }

  if (calib_cnt == 0) {
    Serial.println("No calibration samples taken - leaving scaleS=1.0");
    scaleS = 1.0f;
    return;
  }

  // use 60th percentile to avoid tiny medians
  float repDepth = percentileArray(calib_depths, calib_cnt, 60.0f);
  if (repDepth <= 1e-9f) repDepth = 1e-9f;
  scaleS = D_TARGET / repDepth;
  if (scaleS > SCALE_S_CLAMP_MAX) {
    Serial.printf("scaleS (%.3f) exceeded clamp max %.3f -> clamping\n", scaleS, SCALE_S_CLAMP_MAX);
    scaleS = SCALE_S_CLAMP_MAX;
  }
  Serial.printf("Calibration done. samples=%d repDepth(60th)=%.6f m -> scaleS=%.3f\n", calib_cnt, repDepth, scaleS);
  Serial.println("If sensitivity still high: increase CALIBRATE_RUN_MS or raise DETECT_THRESHOLD_G.");
}

// ===== wait for GPS fix =====
bool waitForGpsFix(unsigned long timeoutMs){
  Serial.println("Waiting for GPS fix...");
  unsigned long start = millis();
  while (true){
    if (gps.location.isValid()) {
      Serial.println("GPS FIX acquired.");
      return true;
    }
    unsigned long now = millis();
    if (timeoutMs > 0 && now - start >= timeoutMs){
      Serial.println("GPS FIX timeout reached.");
      return false;
    }
    static unsigned long lastStatus = 0;
    if (now - lastStatus > 2000){
      lastStatus = now;
      Serial.printf("  waiting... sats=%d  GGA fix=%d\n", gps.satellites.value(), gps.location.isValid()?1:0);
    }
    delay(200);
  }
}

// ===== MPU detection task =====
void mpuTask(void *pv){
  (void) pv;
  TickType_t lastWake = xTaskGetTickCount();
  bool localInEvent = false;
  unsigned long localStart = 0;
  float localPeak = 0;
  int16_t last_ax_raw=0, last_ay_raw=0, last_az_raw=0;

  for (;;){
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(MPU_SAMPLE_MS));
    int16_t ax_i=0, ay_i=0, az_i=0;
    bool readOk = false;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(200)) == pdTRUE){
      mpu.getAcceleration(&ax_i, &ay_i, &az_i);
      xSemaphoreGive(i2cMutex);
      readOk = true;
    } else {
      Serial.println("I2C mutex timeout");
    }
    if (!readOk) continue;
    if (ax_i==0 && ay_i==0 && az_i==0) continue;

    last_ax_raw = ax_i; last_ay_raw = ay_i; last_az_raw = az_i;
    float ax = (float)ax_i / LSB_PER_G;
    float ay = (float)ay_i / LSB_PER_G;
    float az = (float)az_i / LSB_PER_G;
    float mag = sqrt(ax*ax + ay*ay + az*az);

    pushVib(mag);
    baseline = ALPHA * baseline + (1.0 - ALPHA) * mag;
    float hp = mag - baseline;
    float abs_hp = fabs(hp);
    unsigned long now = millis();

    if (!localInEvent) {
      if (abs_hp >= DETECT_THRESHOLD_G) {
        localInEvent = true;
        localStart = now;
        localPeak = abs_hp;
      }
    } else {
      if (abs_hp > localPeak) localPeak = abs_hp;
      if (abs_hp < DETECT_THRESHOLD_G * 0.6f) {
        unsigned long duration = now - localStart;
        float peak_g = localPeak;
        float depth_m = compute_depth_m(peak_g, duration);
        float depth_cm = depth_m * 100.0f;
        float Dval = compute_D_from_depth(depth_m);

        String severityStr;
        if (Dval < PAPER_D_THRESH_LOW) severityStr = "low";
        else if (Dval < PAPER_D_THRESH_HIGH) severityStr = "moderate";
        else severityStr = "severe";

        double lat = 0.0, lon = 0.0;
        float speed_kmph = 0.0;
        bool hasFix = gps.location.isValid();
        if (hasFix) {
          lat = gps.location.lat();
          lon = gps.location.lng();
          speed_kmph = gps.speed.kmph();
        }

        String type = classifyEventSimple(peak_g, duration, speed_kmph);

        if (now - lastEventSent >= MIN_EVENT_GAP_MS) {
          lastEventSent = now;
          Serial.println();
          Serial.printf("Event at %lu ms Type:%s Peak:%s g Dur:%lums Speed:%s km/h D=%.3f depth_cm=%.2f Sev=%s\n",
                        now, type.c_str(), fstr(peak_g).c_str(), duration, fstr(speed_kmph).c_str(), Dval, depth_cm, severityStr.c_str());
          Serial.printf("GPS fix=%d lat=%s lon=%s sats=%d\n", hasFix?1:0, String(lat,6).c_str(), String(lon,6).c_str(), gps.satellites.value());
          Serial.printf("Raw ax=%d ay=%d az=%d mag=%s\n", ax_i, ay_i, az_i, fstr(mag,4).c_str());

          sendEventToServer(DEVICE_ID, lat, lon, speed_kmph, type, Dval, peak_g, duration, depth_cm, ax_i, ay_i, az_i);
        }
        localInEvent = false;
        localPeak = 0;
      }
    }

    static unsigned long lastStatus = 0;
    if (millis() - lastStatus > 3000) {
      lastStatus = millis();
      Serial.printf("Status mag=%s baseline=%s hp=%s sats=%d fix=%d scaleS=%.3f\n",
                    fstr(mag,3).c_str(), fstr(baseline,3).c_str(), fstr(hp,3).c_str(),
                    gps.satellites.value(), gps.location.isValid()?1:0, scaleS);
    }
  }
}

// ===== setup sequence =====
void setup(){
  Serial.begin(115200);
  delay(100);
  Serial.println("\n--- Startup sequence: WiFi -> MPU -> GPS fix -> Calibration -> Detection ---");

  connectWiFi();

  Wire.begin(I2C_SDA, I2C_SCL);
  i2cMutex = xSemaphoreCreateMutex();
  if (!i2cMutex) Serial.println("Failed to create I2C mutex");

  bool mpuOk = false;
  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(1000)) == pdTRUE){
    mpu.initialize();
    mpuOk = mpu.testConnection();
    Serial.printf("mpu.testConnection() -> %d\n", mpuOk ? 1:0);
    // wake MPU
    Wire.beginTransmission(0x68);
    Wire.write(0x6B);
    Wire.write((uint8_t)0x00);
    Wire.endTransmission();
    xSemaphoreGive(i2cMutex);
  } else {
    Serial.println("Could not init MPU (mutex)");
  }

  if (!mpuOk){
    Serial.println("MPU6050 connection FAILED. Halting.");
    while (true) { delay(1000); }
  }

  for (int i=0;i<VBUF_SIZE;i++) vibBuffer[i] = 0.0f;

  xTaskCreatePinnedToCore(gpsTask, "GPS", 4096, NULL, 1, NULL, 1);

  bool gotFix = waitForGpsFix(GPS_FIX_TIMEOUT_MS);
  gpsHasFix = gotFix;
  gpsWaiting = false;
  if (!gotFix) {
    Serial.println("WARNING: GPS did not fix within timeout. Continuing (lat/lon will be 0).");
  } else {
    Serial.println("GPS fix OK. Proceeding to calibration.");
  }

  runCalibrationIfNeeded();

  xTaskCreatePinnedToCore(mpuTask, "MPU", 4096, NULL, 2, NULL, 1);
  detectionStarted = true;

  Serial.println("Setup complete. Detection running.");
  Serial.println("Server URL: " + serverUrl);
  Serial.printf("Calibration active: %lu ms. scaleS=%.3f\n", CALIBRATE_RUN_MS, scaleS);
}

void loop(){
  delay(1000);
}