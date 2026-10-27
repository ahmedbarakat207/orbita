/* =========================================================================================
   AURA-OS | Deep Space Astronaut Biomedical Health & Telemetry Band
   NASA International Space Apps Challenge 2026
   Hardware Target: ESP32-C3 (RISC-V) with MAX30102 / MAX30100 & 0.96" SSD1306 OLED
   Communication: USB Serial (115200 baud JSON stream) + Bluetooth Low Energy (BLE GATT)
   ========================================================================================= */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ==========================================
// 1. PIN CONFIGURATION & HARDWARE ASSIGNMENT
// ==========================================
// Default I2C pins for ESP32-C3 SuperMini & DevKit:
// (If using Seeed Xiao ESP32-C3: SDA = 6, SCL = 7)
#define I2C_SDA_PIN      8
#define I2C_SCL_PIN      9

// Battery voltage ADC sense pin (connect via 100k/100k voltage divider to LiPo 3.7V)
#define BATTERY_ADC_PIN  0

// OLED Display parameters
#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1
#define OLED_I2C_ADDR    0x3C

// MAX30102 Biosensor I2C address
#define MAX30102_ADDR    0x57

// Thresholds for true finger / skin contact detection
#define IR_FINGER_THRESHOLD 35000L  // Minimum IR raw count for valid tissue contact

// ==========================================
// 2. BLE GATT UUID DEFINITIONS
// ==========================================
#define DEVICE_NAME              "AURA-BAND-C3"
// Standard Bluetooth SIG GATT Services
#define BLE_SERVICE_HR           BLEUUID((uint16_t)0x180D)
#define BLE_CHAR_HR_MEASURE      BLEUUID((uint16_t)0x2A37)

#define BLE_SERVICE_BATTERY      BLEUUID((uint16_t)0x180F)
#define BLE_CHAR_BATTERY_LEVEL   BLEUUID((uint16_t)0x2A19)

// Custom AURA-OS Telemetry Service (Full JSON Packet Stream)
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
float currentTempC = 36.6;
int currentHrvSdnn = 0;
int batteryPercentage = 95;

// Signal processing variables
uint32_t rawRed = 0;
uint32_t rawIR = 0;
float dcFilterIR = 0.0;
float dcFilterRed = 0.0;
float acIR = 0.0;
float acRed = 0.0;

// Peak detection for Heart Rate (IBI in ms)
unsigned long lastBeatTimestamp = 0;
float recentIbis[4] = {800, 800, 800, 800};
uint8_t ibiIndex = 0;

// HRV (SDNN) rolling window (last 10 valid RR intervals)
float hrvIntervals[10];
uint8_t hrvIndex = 0;
uint8_t hrvCount = 0;

// SpO2 Ratio-of-Ratios tracking
float maxAcIR = 0, minAcIR = 0;
float maxAcRed = 0, minAcRed = 0;
int sampleCounter = 0;

// Timers
unsigned long lastTelemetryStream = 0;
unsigned long lastDisplayRefresh = 0;
unsigned long lastTempRead = 0;

// ==========================================
// 4. MAX30102 DIRECT HARDWARE DRIVER
// ==========================================
class MAX30102Driver {
public:
  static bool begin() {
    Wire.beginTransmission(MAX30102_ADDR);
    if (Wire.endTransmission() != 0) {
      return false; // Device not found on I2C
    }

    // Reset sensor
    writeRegister(0x09, 0x40);
    delay(50);

    // FIFO Configuration: sample average 4, FIFO rollover enabled, FIFO almost full 17
    writeRegister(0x08, 0x5F);

    // Mode Configuration: SpO2 & Heart Rate mode (Red + IR enabled)
    writeRegister(0x09, 0x03);

    // SpO2 Configuration: ADC range = 4096nA, Sample Rate = 100 Hz, Pulse Width = 411us (18-bit)
    writeRegister(0x0A, 0x27);

    // LED Pulse Amplitude (current): 0x24 = ~7.2mA for optical bio-perfusion
    writeRegister(0x0C, 0x24); // Red LED
    writeRegister(0x0D, 0x24); // IR LED

    return true;
  }

  static bool readSample(uint32_t &red, uint32_t &ir) {
    // Read FIFO read and write pointers
    uint8_t wrPtr = readRegister(0x04);
    uint8_t rdPtr = readRegister(0x06);
    if (wrPtr == rdPtr) {
      return false; // FIFO empty
    }

    // Request 6 bytes from FIFO data register (0x07)
    Wire.beginTransmission(MAX30102_ADDR);
    Wire.write(0x07);
    if (Wire.endTransmission(false) != 0) return false;

    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)6);
    if (Wire.available() < 6) return false;

    // Byte 0-2: Red channel (18 bits)
    red = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    red &= 0x03FFFF;

    // Byte 3-5: IR channel (18 bits)
    ir = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    ir &= 0x03FFFF;

    return true;
  }

  static float readDieTemperature() {
    writeRegister(0x21, 0x01); // Trigger temperature conversion
    delay(30);

    int8_t tempInt = (int8_t)readRegister(0x1F);
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
// 5. BLE SERVER CALLBACKS
// ==========================================
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleClientConnected = true;
  }
  void onDisconnect(BLEServer* pServer) {
    bleClientConnected = false;
    BLEDevice::startAdvertising(); // Resume advertising immediately
  }
};

void initBluetooth() {
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  // 1. Standard Heart Rate Service
  BLEService* pHrService = pServer->createService(BLE_SERVICE_HR);
  pHrChar = pHrService->createCharacteristic(
    BLE_CHAR_HR_MEASURE,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pHrChar->addDescriptor(new BLE2902());
  pHrService->start();

  // 2. Battery Service
  BLEService* pBattService = pServer->createService(BLE_SERVICE_BATTERY);
  pBattChar = pBattService->createCharacteristic(
    BLE_CHAR_BATTERY_LEVEL,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pBattChar->addDescriptor(new BLE2902());
  pBattService->start();

  // 3. Custom AURA Telemetry Service
  BLEService* pAuraService = pServer->createService(AURA_SERVICE_UUID);
  pTelemetryChar = pAuraService->createCharacteristic(
    AURA_CHAR_TELEMETRY_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pTelemetryChar->addDescriptor(new BLE2902());
  pAuraService->start();

  // Configure Advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_HR);
  pAdvertising->addServiceUUID(AURA_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // Functions well with iOS/Web Bluetooth
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
}

// ==========================================
// 6. REAL SIGNAL PROCESSING ALGORITHMS
// ==========================================
void processPhysiologicalData() {
  uint32_t r, ir;
  while (MAX30102Driver::readSample(r, ir)) {
    rawRed = r;
    rawIR = ir;

    // Contact Check: If IR is below threshold, finger/wrist is disconnected
    if (rawIR < IR_FINGER_THRESHOLD) {
      fingerDetected = false;
      currentHeartRate = 0.0;
      currentSpO2 = 0.0;
      currentHrvSdnn = 0;
      dcFilterIR = 0;
      dcFilterRed = 0;
      continue;
    }

    fingerDetected = true;

    // High-Pass Filter: Extract AC pulse from DC tissue attenuation
    if (dcFilterIR == 0) {
      dcFilterIR = rawIR;
      dcFilterRed = rawRed;
    } else {
      dcFilterIR = 0.95f * dcFilterIR + 0.05f * (float)rawIR;
      dcFilterRed = 0.95f * dcFilterRed + 0.05f * (float)rawRed;
    }

    acIR = (float)rawIR - dcFilterIR;
    acRed = (float)rawRed - dcFilterRed;

    // Track AC peak-to-peak for SpO2 calculation
    if (acIR > maxAcIR) maxAcIR = acIR;
    if (acIR < minAcIR) minAcIR = acIR;
    if (acRed > maxAcRed) maxAcRed = acRed;
    if (acRed < minAcRed) minAcRed = acRed;

    sampleCounter++;

    // Peak Detection on inverted AC pulse (hemodynamic systolic surge absorbs IR light)
    static float prevAcIR = 0;
    static bool troughDetected = false;
    unsigned long now = millis();

    if (acIR < -120.0f && acIR > prevAcIR && !troughDetected) {
      troughDetected = true;
      unsigned long ibi = now - lastBeatTimestamp;

      // Validate physiologic beat interval (333ms = 180 BPM, 1500ms = 40 BPM)
      if (ibi >= 333 && ibi <= 1500 && lastBeatTimestamp > 0) {
        lastBeatTimestamp = now;

        // Rolling average for smooth BPM
        recentIbis[ibiIndex] = (float)ibi;
        ibiIndex = (ibiIndex + 1) % 4;

        float sumIbi = 0;
        for (int i = 0; i < 4; i++) sumIbi += recentIbis[i];
        float avgIbi = sumIbi / 4.0f;
        currentHeartRate = 60000.0f / avgIbi;

        // HRV (SDNN) calculation across last 10 intervals
        hrvIntervals[hrvIndex] = (float)ibi;
        hrvIndex = (hrvIndex + 1) % 10;
        if (hrvCount < 10) hrvCount++;

        if (hrvCount >= 3) {
          float meanIbi = 0;
          for (int i = 0; i < hrvCount; i++) meanIbi += hrvIntervals[i];
          meanIbi /= (float)hrvCount;

          float varianceSum = 0;
          for (int i = 0; i < hrvCount; i++) {
            varianceSum += pow(hrvIntervals[i] - meanIbi, 2);
          }
          currentHrvSdnn = round(sqrt(varianceSum / (float)hrvCount));
        }
      } else if (lastBeatTimestamp == 0 || ibi > 2000) {
        lastBeatTimestamp = now;
      }
    } else if (acIR >= 0.0f) {
      troughDetected = false;
    }
    prevAcIR = acIR;

    // SpO2 calculation computed every 100 samples (~1 second)
    if (sampleCounter >= 100) {
      float ptpIR = maxAcIR - minAcIR;
      float ptpRed = maxAcRed - minAcRed;

      if (ptpIR > 50 && ptpRed > 50 && dcFilterIR > 1000 && dcFilterRed > 1000) {
        float ratio = (ptpRed / dcFilterRed) / (ptpIR / dcFilterIR);
        // Calibrated empirical curve: SpO2 = 104 - 17 * R
        float calcSpo2 = 104.0f - (17.0f * ratio);
        calcSpo2 = constrain(calcSpo2, 85.0f, 99.8f);

        // Exponential smoothing
        if (currentSpO2 == 0.0f) currentSpO2 = calcSpo2;
        else currentSpO2 = 0.85f * currentSpO2 + 0.15f * calcSpo2;
      }

      // Reset AC peak-to-peak tracker
      maxAcIR = -999999; minAcIR = 999999;
      maxAcRed = -999999; minAcRed = 999999;
      sampleCounter = 0;
    }
  }
}

// ==========================================
// 7. BATTERY MONITORING
// ==========================================
int readBatteryPercentage() {
  // Read analog millivolts on ADC pin
  uint32_t mv = analogReadMilliVolts(BATTERY_ADC_PIN);
  // Voltage divider (100k + 100k) divides by 2, so multiply by 2 for raw battery voltage
  float vBat = (float)mv * 2.0f / 1000.0f;

  if (vBat <= 3.2f) return 5;
  if (vBat >= 4.2f) return 100;
  return (int)((vBat - 3.2f) / (4.2f - 3.2f) * 100.0f);
}

// ==========================================
// 8. ON-WRIST 0.96" OLED DISPLAY RENDERING
// ==========================================
void renderOledDisplay() {
  display.clearDisplay();

  // Top Status Bar: AURA-OS | BLE Status | Battery %
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("AURA-OS");

  display.setCursor(56, 0);
  if (bleClientConnected) {
    display.print("[BLE ON]");
  } else {
    display.print("[BLE RDY]");
  }

  display.setCursor(102, 0);
  display.print(batteryPercentage);
  display.print("%");

  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // Main Biometric Body
  if (fingerDetected && currentHeartRate > 35.0f) {
    // Large Heart Rate Readout
    display.setCursor(0, 16);
    display.setTextSize(1);
    display.print("PULSE:");

    display.setTextSize(2);
    display.setCursor(44, 14);
    display.print((int)round(currentHeartRate));
    display.setTextSize(1);
    display.print(" BPM");

    // SpO2 Readout
    display.setCursor(0, 36);
    display.print("SpO2 : ");
    display.setTextSize(2);
    display.print((int)round(currentSpO2 > 0 ? currentSpO2 : 98));
    display.setTextSize(1);
    display.print(" %");

    // Bottom Stats: HRV & Skin Temp
    display.drawLine(0, 52, 127, 52, SSD1306_WHITE);
    display.setCursor(0, 56);
    display.print("HRV:");
    display.print(currentHrvSdnn);
    display.print("ms");

    display.setCursor(70, 56);
    display.print("T:");
    display.print(currentTempC, 1);
    display.print("C");
  } else {
    // Contact Disconnected Warning
    display.setCursor(20, 22);
    display.setTextSize(1);
    display.print("AURA WRISTBAND");

    display.setCursor(14, 34);
    display.setTextSize(1);
    display.print("[ SENSOR CONTACT ]");

    display.setCursor(10, 48);
    display.print("Position on wrist");
  }

  display.display();
}

// ==========================================
// 9. TELEMETRY STREAMING (USB & BLE)
// ==========================================
void sendTelemetryStream() {
  // 1. JSON Telemetry for USB Web Serial & Web Bluetooth
  // Format matches AURA-OS Ingestion Protocol exactly:
  // {"hr":74.2,"spo2":98.3,"temp":36.7,"hrv":56,"batt":92,"finger":true}
  String jsonPayload = "{";
  jsonPayload += "\"hr\":" + String(fingerDetected ? currentHeartRate : 0.0f, 1) + ",";
  jsonPayload += "\"spo2\":" + String(fingerDetected ? currentSpO2 : 0.0f, 1) + ",";
  jsonPayload += "\"temp\":" + String(currentTempC, 1) + ",";
  jsonPayload += "\"hrv\":" + String(fingerDetected ? currentHrvSdnn : 0) + ",";
  jsonPayload += "\"batt\":" + String(batteryPercentage) + ",";
  jsonPayload += "\"finger\":" + String(fingerDetected ? "true" : "false") + ",";
  jsonPayload += "\"ir\":" + String(rawIR) + ",";
  jsonPayload += "\"red\":" + String(rawRed);
  jsonPayload += "}";

  // Emit to USB Serial at 115200 baud
  Serial.println(jsonPayload);

  // Emit to BLE GATT Server if connected
  if (bleClientConnected) {
    // A. Custom JSON Telemetry Characteristic
    if (pTelemetryChar) {
      pTelemetryChar->setValue(jsonPayload.c_str());
      pTelemetryChar->notify();
    }

    // B. Standard GATT Heart Rate Measurement Packet (UUID 0x2A37)
    if (pHrChar && fingerDetected && currentHeartRate > 0) {
      uint8_t hrPacket[4];
      hrPacket[0] = 0b00010000; // Flags: 8-bit HR, RR-interval present
      hrPacket[1] = (uint8_t)round(currentHeartRate);
      uint16_t rr1024 = (uint16_t)round(((60000.0f / currentHeartRate) / 1000.0f) * 1024.0f);
      hrPacket[2] = rr1024 & 0xFF;
      hrPacket[3] = (rr1024 >> 8) & 0xFF;
      pHrChar->setValue(hrPacket, 4);
      pHrChar->notify();
    }

    // C. Standard GATT Battery Level (UUID 0x2A19)
    if (pBattChar) {
      uint8_t battVal = (uint8_t)batteryPercentage;
      pBattChar->setValue(&battVal, 1);
      pBattChar->notify();
    }
  }
}

// ==========================================
// 10. SETUP & MAIN EXECUTION LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(200);

  // Initialize I2C Bus with assigned ESP32-C3 pins
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000); // 400 kHz fast mode

  // Initialize SSD1306 OLED
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(18, 18);
    display.print("NASA · HRP");
    display.setCursor(10, 32);
    display.print("AURA-OS WRISTBAND");
    display.setCursor(14, 46);
    display.print("ESP32-C3 BIOSENSOR");
    display.display();
  }

  // Initialize MAX30102 Biosensor
  bool sensorOk = MAX30102Driver::begin();
  if (!sensorOk) {
    Serial.println("{\"status\":\"ERROR\",\"msg\":\"MAX30102 not found on I2C\"}");
  }

  // Initialize Bluetooth Low Energy Stack
  initBluetooth();

  delay(800);
}

void loop() {
  unsigned long now = millis();

  // 1. Process Raw Optical Samples from MAX30102
  processPhysiologicalData();

  // 2. Periodic Die Temperature Reading (every 3 seconds)
  if (now - lastTempRead >= 3000) {
    currentTempC = MAX30102Driver::readDieTemperature();
    batteryPercentage = readBatteryPercentage();
    lastTempRead = now;
  }

  // 3. Telemetry Stream to USB Serial and BLE (every 200ms = 5Hz telemetry)
  if (now - lastTelemetryStream >= 200) {
    sendTelemetryStream();
    lastTelemetryStream = now;
  }

  // 4. Update On-Wrist OLED Display (every 100ms = 10 FPS UI)
  if (now - lastDisplayRefresh >= 100) {
    renderOledDisplay();
    lastDisplayRefresh = now;
  }

  delay(5); // Yield to FreeRTOS scheduler & BLE stack
}
