/* =========================================================================================
   AURA-OS | Deep Space Astronaut Biomedical Health & Telemetry Band
   NASA International Space Apps Challenge 2026
   Hardware Target: ESP32-C3 (RISC-V) with MAX30102 & 0.96" SSD1306 OLED
   Communication: USB Serial (115200 baud JSON stream) + Bluetooth Low Energy (BLE GATT)
   ========================================================================================= */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "esp_sleep.h"

// ==========================================
// 1. PIN CONFIGURATION & HARDWARE ASSIGNMENT
// ==========================================
// Default I2C pins for ESP32-C3 SuperMini & DevKit:
// (If using Seeed Xiao ESP32-C3: SDA = 6, SCL = 7)
#define I2C_SDA_PIN       8
#define I2C_SCL_PIN       9

// Battery voltage ADC sense pin (100k+100k voltage divider to LiPo 3.7V)
#define BATTERY_ADC_PIN   0

// Vibration motor PWM/GPIO pin (connect via NPN transistor or MOSFET gate)
#define VIBRATION_PIN     4

// OLED Display parameters
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1
#define OLED_I2C_ADDR     0x3C

// MAX30102 Biosensor I2C address
#define MAX30102_ADDR     0x57

// Minimum IR raw count for valid tissue contact
#define IR_FINGER_THRESHOLD 35000L

// ==========================================
// 2. BLE GATT UUID DEFINITIONS
// ==========================================
#define DEVICE_NAME              "AURA-BAND-C3"
#define BLE_SERVICE_HR           BLEUUID((uint16_t)0x180D)
#define BLE_CHAR_HR_MEASURE      BLEUUID((uint16_t)0x2A37)
#define BLE_SERVICE_BATTERY      BLEUUID((uint16_t)0x180F)
#define BLE_CHAR_BATTERY_LEVEL   BLEUUID((uint16_t)0x2A19)
#define AURA_SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define AURA_CHAR_TELEMETRY_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Global instances
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
BLEServer* pServer = nullptr;
BLECharacteristic* pHrChar = nullptr;
BLECharacteristic* pBattChar = nullptr;
BLECharacteristic* pTelemetryChar = nullptr;
bool bleClientConnected = false;

// ==========================================
// 3. PHYSIOLOGICAL METRICS & FILTER BUFFERS
// ==========================================
bool fingerDetected = false;
float currentHeartRate = 0.0;
float currentSpO2 = 0.0;
float currentTempC = 0.0;
int   currentHrvSdnn = 0;
float currentPnn50 = 0.0;
float currentRespRate = 0.0;
int   batteryPercentage = 95;

// Raw optical channels
uint32_t rawRed = 0;
uint32_t rawIR  = 0;

// DC-blocking filter state
float dcFilterIR  = 0.0;
float dcFilterRed = 0.0;
float acIR  = 0.0;
float acRed = 0.0;

// Peak detection for Heart Rate (IBI in ms)
unsigned long lastBeatTimestamp = 0;
float recentIbis[4] = {800, 800, 800, 800};
uint8_t ibiIndex = 0;

// HRV (SDNN) rolling window - last 10 valid RR intervals
float hrvIntervals[10];
uint8_t hrvIndex = 0;
uint8_t hrvCount = 0;

// Respiratory rate estimation - last 20 RR intervals for RSA analysis
float rraBuf[20]; // RR interval amplitude buffer for RSA
uint8_t rraBufIdx = 0;
uint8_t rraBufCount = 0;

// SpO2 Ratio-of-Ratios tracking - initialized to extremes for correct first window
float maxAcIR  = -999999, minAcIR  = 999999;
float maxAcRed = -999999, minAcRed = 999999;
int   sampleCounter = 0;

// ==========================================
// 4. VIBRATION MOTOR ALERT STATE
// ==========================================
unsigned long vibNextToggle = 0;
int  vibPulsesLeft  = 0;
bool vibMotorOn     = false;
bool spo2AlertArmed = true;
bool hrAlertArmed   = true;

// ==========================================
// 5. DEEP SLEEP / POWER CONSERVATION
// ==========================================
unsigned long offWristStart = 0;
bool offWristTimerActive = false;

// ==========================================
// 6. TIMERS
// ==========================================
unsigned long lastTelemetryStream = 0;
unsigned long lastDisplayRefresh  = 0;
unsigned long lastTempRead        = 0;

// ==========================================
// 7. MAX30102 DIRECT HARDWARE DRIVER
// ==========================================
class MAX30102Driver {
public:
  static bool begin() {
    Wire.beginTransmission(MAX30102_ADDR);
    if (Wire.endTransmission() != 0) return false;

    writeRegister(0x09, 0x40); // Reset
    delay(50);

    // FIFO: sample avg 4, rollover on, almost-full 17
    writeRegister(0x08, 0x5F);
    // Mode: SpO2 + HR (Red + IR)
    writeRegister(0x09, 0x03);
    // SpO2: ADC range 4096nA, 100 Hz, 411us pulse width (18-bit)
    writeRegister(0x0A, 0x27);
    // LED current: ~7.2mA
    writeRegister(0x0C, 0x24); // Red LED
    writeRegister(0x0D, 0x24); // IR LED

    return true;
  }

  static bool readSample(uint32_t &red, uint32_t &ir) {
    uint8_t wrPtr = readRegister(0x04);
    uint8_t rdPtr = readRegister(0x06);
    if (wrPtr == rdPtr) return false;

    Wire.beginTransmission(MAX30102_ADDR);
    Wire.write(0x07);
    if (Wire.endTransmission(false) != 0) return false;

    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)6);
    if (Wire.available() < 6) return false;

    red = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    red &= 0x03FFFF;

    ir = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    ir &= 0x03FFFF;

    return true;
  }

  static float readDieTemperature() {
    writeRegister(0x21, 0x01); // Trigger conversion
    delay(30);
    int8_t  tempInt  = (int8_t)readRegister(0x1F);
    uint8_t tempFrac = readRegister(0x20);
    return (float)tempInt + ((float)tempFrac * 0.0625f);
  }

private:
  static void writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(MAX30102_ADDR);
    Wire.write(reg);
    Wire.write(value);
    Wire.endTransmission();
  }

  static uint8_t readRegister(uint8_t reg) {
    Wire.beginTransmission(MAX30102_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)1);
    return Wire.available() ? Wire.read() : 0;
  }
};

// ==========================================
// 8. BLE SERVER CALLBACKS
// ==========================================
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override    { bleClientConnected = true; }
  void onDisconnect(BLEServer*) override {
    bleClientConnected = false;
    BLEDevice::startAdvertising();
  }
};

void initBluetooth() {
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* pHrService = pServer->createService(BLE_SERVICE_HR);
  pHrChar = pHrService->createCharacteristic(BLE_CHAR_HR_MEASURE, BLECharacteristic::PROPERTY_NOTIFY);
  pHrChar->addDescriptor(new BLE2902());
  pHrService->start();

  BLEService* pBattService = pServer->createService(BLE_SERVICE_BATTERY);
  pBattChar = pBattService->createCharacteristic(BLE_CHAR_BATTERY_LEVEL, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pBattChar->addDescriptor(new BLE2902());
  pBattService->start();

  BLEService* pAuraService = pServer->createService(AURA_SERVICE_UUID);
  pTelemetryChar = pAuraService->createCharacteristic(AURA_CHAR_TELEMETRY_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pTelemetryChar->addDescriptor(new BLE2902());
  pAuraService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_HR);
  pAdvertising->addServiceUUID(AURA_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
}

// ==========================================
// 9. RESPIRATORY RATE ESTIMATION (PPG RSA)
// ==========================================
// Respiratory Sinus Arrhythmia: breathing modulates the RR interval series.
// Count zero-crossings of the IBI sequence around its mean → breathing frequency.
void computeRespiratoryRate() {
  if (rraBufCount < 10) return;

  float mean = 0;
  for (uint8_t i = 0; i < rraBufCount; i++) mean += rraBuf[i];
  mean /= (float)rraBufCount;

  // Count zero-crossings (sign changes relative to mean)
  int crossings = 0;
  bool above = rraBuf[0] > mean;
  for (uint8_t i = 1; i < rraBufCount; i++) {
    bool nowAbove = rraBuf[i] > mean;
    if (nowAbove != above) { crossings++; above = nowAbove; }
  }

  // Total window duration in minutes
  float windowMs = 0;
  for (uint8_t i = 0; i < rraBufCount; i++) windowMs += rraBuf[i];
  float windowMin = windowMs / 60000.0f;

  if (windowMin > 0 && crossings >= 2) {
    float rr = ((float)crossings / 2.0f) / windowMin;
    currentRespRate = constrain(rr, 4.0f, 40.0f);
  }
}

// ==========================================
// 10. REAL SIGNAL PROCESSING ALGORITHMS
// ==========================================
void processPhysiologicalData() {
  uint32_t r, ir;
  while (MAX30102Driver::readSample(r, ir)) {
    rawRed = r;
    rawIR  = ir;

    if (rawIR < IR_FINGER_THRESHOLD) {
      fingerDetected    = false;
      currentHeartRate  = 0.0;
      currentSpO2       = 0.0;
      currentHrvSdnn    = 0;
      currentPnn50      = 0.0;
      dcFilterIR        = 0;
      dcFilterRed       = 0;

      // Deep sleep power conservation: enter light sleep after 60s off-wrist
      if (!offWristTimerActive) {
        offWristStart       = millis();
        offWristTimerActive = true;
      } else if (millis() - offWristStart > 60000) {
        display.clearDisplay();
        display.setCursor(22, 24);
        display.print("POWER SAVE");
        display.setCursor(8, 38);
        display.print("Place on wrist...");
        display.display();

        BLEDevice::stopAdvertising();
        esp_sleep_enable_timer_wakeup(10ULL * 1000000ULL); // 10s wakeup
        esp_light_sleep_start();
        BLEDevice::startAdvertising();
        offWristStart = millis();
      }
      continue;
    }

    fingerDetected      = true;
    offWristTimerActive = false;
    spo2AlertArmed      = true;
    hrAlertArmed        = true;

    // DC-blocking high-pass filter: extract AC pulsatile component
    if (dcFilterIR == 0.0f) {
      dcFilterIR  = (float)rawIR;
      dcFilterRed = (float)rawRed;
    } else {
      dcFilterIR  = 0.95f * dcFilterIR  + 0.05f * (float)rawIR;
      dcFilterRed = 0.95f * dcFilterRed + 0.05f * (float)rawRed;
    }

    acIR  = (float)rawIR  - dcFilterIR;
    acRed = (float)rawRed - dcFilterRed;

    // Track AC peak-to-peak for SpO2
    if (acIR  > maxAcIR)  maxAcIR  = acIR;
    if (acIR  < minAcIR)  minAcIR  = acIR;
    if (acRed > maxAcRed) maxAcRed = acRed;
    if (acRed < minAcRed) minAcRed = acRed;

    sampleCounter++;

    // Beat detection: IR trough (systolic surge absorbs IR, causes negative AC dip)
    static float prevAcIR = 0;
    static bool  troughDetected = false;
    unsigned long now = millis();

    if (acIR < -120.0f && acIR > prevAcIR && !troughDetected) {
      troughDetected = true;
      unsigned long ibi = now - lastBeatTimestamp;

      if (ibi >= 333 && ibi <= 1500 && lastBeatTimestamp > 0) {
        lastBeatTimestamp = now;

        // 4-beat rolling average for BPM
        recentIbis[ibiIndex] = (float)ibi;
        ibiIndex = (ibiIndex + 1) % 4;
        float sumIbi = 0;
        for (int i = 0; i < 4; i++) sumIbi += recentIbis[i];
        currentHeartRate = 60000.0f / (sumIbi / 4.0f);

        // HRV: SDNN over last 10 intervals
        hrvIntervals[hrvIndex] = (float)ibi;
        hrvIndex = (hrvIndex + 1) % 10;
        if (hrvCount < 10) hrvCount++;

        if (hrvCount >= 3) {
          float meanIbi = 0;
          for (int i = 0; i < hrvCount; i++) meanIbi += hrvIntervals[i];
          meanIbi /= (float)hrvCount;

          float varianceSum = 0;
          for (int i = 0; i < hrvCount; i++)
            varianceSum += powf(hrvIntervals[i] - meanIbi, 2);
          currentHrvSdnn = (int)roundf(sqrtf(varianceSum / (float)hrvCount));

          // pNN50: fraction of successive diffs > 50ms
          int above50 = 0;
          for (int i = 1; i < (int)hrvCount; i++) {
            if (fabsf(hrvIntervals[i] - hrvIntervals[i-1]) > 50.0f) above50++;
          }
          currentPnn50 = (float)above50 / (float)(hrvCount - 1) * 100.0f;
        }

        // Respiratory rate: push IBI into RSA buffer
        rraBuf[rraBufIdx] = (float)ibi;
        rraBufIdx = (rraBufIdx + 1) % 20;
        if (rraBufCount < 20) rraBufCount++;
        computeRespiratoryRate();

      } else if (lastBeatTimestamp == 0 || ibi > 2000) {
        lastBeatTimestamp = now;
      }
    } else if (acIR >= 0.0f) {
      troughDetected = false;
    }
    prevAcIR = acIR;

    // SpO2: Ratio-of-Ratios computed every 100 samples (~1s at 100Hz)
    if (sampleCounter >= 100) {
      float ptpIR  = maxAcIR  - minAcIR;
      float ptpRed = maxAcRed - minAcRed;

      if (ptpIR > 50 && ptpRed > 50 && dcFilterIR > 1000 && dcFilterRed > 1000) {
        float ratio     = (ptpRed / dcFilterRed) / (ptpIR / dcFilterIR);
        float calcSpo2  = constrain(104.0f - (17.0f * ratio), 85.0f, 99.8f);
        currentSpO2 = (currentSpO2 == 0.0f) ? calcSpo2 : (0.85f * currentSpO2 + 0.15f * calcSpo2);
      }

      maxAcIR  = -999999; minAcIR  = 999999;
      maxAcRed = -999999; minAcRed = 999999;
      sampleCounter = 0;
    }
  }
}

// ==========================================
// 11. BATTERY MONITORING
// ==========================================
int readBatteryPercentage() {
  uint32_t mv  = analogReadMilliVolts(BATTERY_ADC_PIN);
  float    vBat = (float)mv * 2.0f / 1000.0f; // voltage divider 100k+100k
  if (vBat <= 3.2f) return 5;
  if (vBat >= 4.2f) return 100;
  return (int)((vBat - 3.2f) / 1.0f * 100.0f);
}

// ==========================================
// 12. VIBRATION MOTOR ALERTS (non-blocking)
// ==========================================
void runVibrationMotor() {
  // Trigger on clinical threshold breach (armed once per finger-on session)
  if (fingerDetected && currentSpO2 > 0 && currentSpO2 < 94.0f && spo2AlertArmed && vibPulsesLeft == 0) {
    vibPulsesLeft  = 6; // 3 on-off pulses
    spo2AlertArmed = false;
  }
  if (fingerDetected && currentHeartRate > 110.0f && hrAlertArmed && vibPulsesLeft == 0) {
    vibPulsesLeft = 4; // 2 on-off pulses
    hrAlertArmed  = false;
  }

  // Non-blocking pulse output
  unsigned long now = millis();
  if (vibPulsesLeft > 0 && now >= vibNextToggle) {
    vibMotorOn = !vibMotorOn;
    digitalWrite(VIBRATION_PIN, vibMotorOn ? HIGH : LOW);
    vibNextToggle = now + 200;
    if (!vibMotorOn) vibPulsesLeft--;
  }
}

// ==========================================
// 13. ON-WRIST OLED DISPLAY RENDERING
// ==========================================
void renderOledDisplay() {
  display.clearDisplay();

  // Status bar
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("AURA-OS");
  display.setCursor(56, 0);
  display.print(bleClientConnected ? "[BLE ON]" : "[BLE RDY]");
  display.setCursor(102, 0);
  display.print(batteryPercentage);
  display.print("%");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  if (fingerDetected && currentHeartRate > 35.0f) {
    display.setCursor(0, 14);
    display.setTextSize(1);
    display.print("HR:");
    display.setTextSize(2);
    display.setCursor(22, 12);
    display.print((int)roundf(currentHeartRate));
    display.setTextSize(1);
    display.print(" BPM");

    display.setCursor(0, 30);
    display.print("SpO2:");
    display.setTextSize(1);
    if (currentSpO2 > 0) display.print((int)roundf(currentSpO2));
    else display.print("--");
    display.print("%");

    display.setCursor(68, 30);
    display.print("RR:");
    if (currentRespRate > 0) display.print((int)roundf(currentRespRate));
    else display.print("--");

    display.drawLine(0, 42, 127, 42, SSD1306_WHITE);

    display.setCursor(0, 46);
    display.print("HRV:");
    display.print(currentHrvSdnn);
    display.print("ms");

    display.setCursor(0, 56);
    display.print("pNN50:");
    display.print((int)roundf(currentPnn50));
    display.print("%");

    display.setCursor(84, 56);
    display.print("T:");
    if (currentTempC > 0) display.print(currentTempC, 1);
    else display.print("--");

  } else {
    display.setCursor(20, 22);
    display.print("AURA WRISTBAND");
    display.setCursor(14, 34);
    display.print("[ SENSOR CONTACT ]");
    display.setCursor(10, 48);
    display.print("Position on wrist");
  }

  display.display();
}

// ==========================================
// 14. TELEMETRY STREAMING (USB & BLE)
// ==========================================
void sendTelemetryStream() {
  String json = "{";
  json += "\"hr\":"   + String(fingerDetected ? currentHeartRate : 0.0f, 1) + ",";
  json += "\"spo2\":" + String(fingerDetected ? currentSpO2 : 0.0f, 1) + ",";
  json += "\"temp\":" + String(currentTempC, 1) + ",";
  json += "\"hrv\":"  + String(fingerDetected ? currentHrvSdnn : 0) + ",";
  json += "\"pnn50\":" + String(fingerDetected ? currentPnn50 : 0.0f, 1) + ",";
  json += "\"rr\":"   + String(fingerDetected ? currentRespRate : 0.0f, 1) + ",";
  json += "\"batt\":" + String(batteryPercentage) + ",";
  json += "\"finger\":" + String(fingerDetected ? "true" : "false") + ",";
  json += "\"ir\":"   + String(rawIR) + ",";
  json += "\"red\":"  + String(rawRed);
  json += "}";

  Serial.println(json);

  if (bleClientConnected) {
    if (pTelemetryChar) {
      pTelemetryChar->setValue(json.c_str());
      pTelemetryChar->notify();
    }

    if (pHrChar && fingerDetected && currentHeartRate > 0) {
      uint8_t  hrPacket[4];
      hrPacket[0] = 0b00010000; // flags: 8-bit HR, RR-interval present
      hrPacket[1] = (uint8_t)roundf(currentHeartRate);
      uint16_t rr1024 = (uint16_t)roundf(((60000.0f / currentHeartRate) / 1000.0f) * 1024.0f);
      hrPacket[2] = rr1024 & 0xFF;
      hrPacket[3] = (rr1024 >> 8) & 0xFF;
      pHrChar->setValue(hrPacket, 4);
      pHrChar->notify();
    }

    if (pBattChar) {
      uint8_t battVal = (uint8_t)batteryPercentage;
      pBattChar->setValue(&battVal, 1);
      pBattChar->notify();
    }
  }
}

// ==========================================
// 15. SETUP & MAIN EXECUTION LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(200);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000);

  pinMode(VIBRATION_PIN, OUTPUT);
  digitalWrite(VIBRATION_PIN, LOW);

  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(18, 14);
    display.print("NASA \xB7 HRP");
    display.setCursor(10, 26);
    display.print("AURA-OS WRISTBAND");
    display.setCursor(14, 38);
    display.print("ESP32-C3 BIOSENSOR");
    display.setCursor(8, 52);
    display.print("Initializing BLE...");
    display.display();
  }

  if (!MAX30102Driver::begin()) {
    Serial.println("{\"status\":\"ERROR\",\"msg\":\"MAX30102 not found on I2C\"}");
  }

  initBluetooth();
  delay(800);
}

void loop() {
  unsigned long now = millis();

  processPhysiologicalData();

  if (now - lastTempRead >= 3000) {
    currentTempC        = MAX30102Driver::readDieTemperature();
    batteryPercentage   = readBatteryPercentage();
    lastTempRead        = now;
  }

  runVibrationMotor();

  if (now - lastTelemetryStream >= 200) {
    sendTelemetryStream();
    lastTelemetryStream = now;
  }

  if (now - lastDisplayRefresh >= 100) {
    renderOledDisplay();
    lastDisplayRefresh  = now;
  }

  delay(5);
}
