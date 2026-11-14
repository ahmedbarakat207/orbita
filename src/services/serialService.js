// Web Serial API Microcontroller Ingestion Service (Arduino / ESP32 / STM32)
export class SerialService {
  constructor(onDataCallback, onStatusCallback, onLogCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.onLog = onLogCallback;
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.isConnected = false;
    this.keepReading = false;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect(baudRate = 115200) {
    if (!this.isSupported()) {
      throw new Error('Web Serial is not supported in this browser. Please use Chrome, Edge, or Opera on desktop.');
    }

    try {
      this.updateStatus('requesting', 'Requesting serial port authorization...');
      this.port = await navigator.serial.requestPort();

      this.updateStatus('connecting', `Opening serial port at ${baudRate} baud...`);
      await this.port.open({ baudRate: parseInt(baudRate, 10) });

      this.isConnected = true;
      this.keepReading = true;
      this.updateStatus('connected', `Streaming live telemetry via Serial Port (${baudRate} baud)`);

      this.readLoop();
      return true;
    } catch (err) {
      this.updateStatus('disconnected', err.message || 'Serial connection cancelled');
      throw err;
    }
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.reader = reader;

    let buffer = '';

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep remaining partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              if (this.onLog) this.onLog(trimmed);
              this.parseSerialLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      if (this.keepReading) {
        this.updateStatus('error', `Serial stream read error: ${err.message}`);
      }
    } finally {
      reader.releaseLock();
    }
  }

  parseSerialLine(line) {
    // 1. Try parsing JSON format from ESP32-C3 or microcontroller:
    // {"hr": 74.2, "spo2": 98.3, "temp": 36.8, "hrv": 56, "batt": 94, "finger": true}
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const data = JSON.parse(line);
        if (this.onData) {
          const isFingerOn = data.finger !== undefined ? Boolean(data.finger) : (data.hr > 0);
          this.onData({
            source: 'USB Serial (ESP32-C3 Band)',
            hr: isFingerOn ? (data.hr !== undefined ? parseFloat(data.hr) : null) : 0,
            spo2: isFingerOn ? (data.spo2 !== undefined ? parseFloat(data.spo2) : null) : 0,
            temp: data.temp !== undefined ? parseFloat(data.temp) : null,
            hrv: isFingerOn ? (data.hrv !== undefined ? parseInt(data.hrv, 10) : null) : 0,
            batt: data.batt !== undefined ? parseInt(data.batt, 10) : null,
            finger: isFingerOn,
            co2: data.co2 ? parseFloat(data.co2) : null,
            icp: data.icp ? parseFloat(data.icp) : null,
            rawRed: data.red !== undefined ? data.red : null,
            rawIR: data.ir !== undefined ? data.ir : null,
            raw: data,
            timestamp: Date.now()
          });
        }
        return;
      } catch (e) {
        // Fall through to CSV
      }
    }

    // 2. Try parsing CSV format: 72, 98.4, 36.9
    const parts = line.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 1 && !isNaN(parts[0])) {
      const payload = {
        source: 'USB Serial (Hardware)',
        hr: parts[0] >= 30 && parts[0] <= 240 ? parts[0] : null,
        spo2: parts.length > 1 && parts[1] >= 70 && parts[1] <= 100 ? parts[1] : null,
        temp: parts.length > 2 && parts[2] >= 30 && parts[2] <= 45 ? parts[2] : null,
        finger: parts[0] > 0,
        timestamp: Date.now()
      };
      if (this.onData && (payload.hr || payload.spo2)) {
        this.onData(payload);
      }
    }
  }

  async disconnect() {
    this.keepReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
    }
    this.isConnected = false;
    this.port = null;
    this.reader = null;
    this.updateStatus('disconnected', 'Serial port closed');
  }

  updateStatus(state, message) {
    if (this.onStatus) {
      this.onStatus({ state, message, isConnected: this.isConnected });
    }
  }

  // Returns production C++ firmware code for ESP32-C3 Astronaut Biosensor Wristband
  static getSampleArduinoCode() {
    return `/* =========================================================================================
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

#define I2C_SDA_PIN       8
#define I2C_SCL_PIN       9
#define BATTERY_ADC_PIN   0
#define VIBRATION_PIN     4

#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1
#define OLED_I2C_ADDR     0x3C
#define MAX30102_ADDR     0x57
#define IR_FINGER_THRESHOLD 35000L

#define DEVICE_NAME              "AURA-BAND-C3"
#define BLE_SERVICE_HR           BLEUUID((uint16_t)0x180D)
#define BLE_CHAR_HR_MEASURE      BLEUUID((uint16_t)0x2A37)
#define BLE_SERVICE_BATTERY      BLEUUID((uint16_t)0x180F)
#define BLE_CHAR_BATTERY_LEVEL   BLEUUID((uint16_t)0x2A19)
#define AURA_SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define AURA_CHAR_TELEMETRY_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
BLEServer* pServer = nullptr;
BLECharacteristic* pHrChar = nullptr;
BLECharacteristic* pBattChar = nullptr;
BLECharacteristic* pTelemetryChar = nullptr;
bool bleClientConnected = false;

bool fingerDetected = false;
float currentHeartRate = 0.0;
float currentSpO2 = 0.0;
float currentTempC = 0.0;
int   currentHrvSdnn = 0;
float currentPnn50 = 0.0;
float currentRespRate = 0.0;
int   batteryPercentage = 95;

uint32_t rawRed = 0, rawIR = 0;
float dcFilterIR = 0.0, dcFilterRed = 0.0, acIR = 0.0, acRed = 0.0;
unsigned long lastBeatTimestamp = 0;
float recentIbis[4] = {800, 800, 800, 800};
uint8_t ibiIndex = 0;

float hrvIntervals[10];
uint8_t hrvIndex = 0, hrvCount = 0;

float rraBuf[20];
uint8_t rraBufIdx = 0, rraBufCount = 0;

float maxAcIR = -999999, minAcIR = 999999;
float maxAcRed = -999999, minAcRed = 999999;
int   sampleCounter = 0;

unsigned long vibNextToggle = 0;
int  vibPulsesLeft  = 0;
bool vibMotorOn     = false;
bool spo2AlertArmed = true;
bool hrAlertArmed   = true;

unsigned long offWristStart = 0;
bool offWristTimerActive = false;

unsigned long lastTelemetryStream = 0;
unsigned long lastDisplayRefresh  = 0;
unsigned long lastTempRead        = 0;

class MAX30102Driver {
public:
  static bool begin() {
    Wire.beginTransmission(MAX30102_ADDR);
    if (Wire.endTransmission() != 0) return false;
    writeRegister(0x09, 0x40); delay(50);
    writeRegister(0x08, 0x5F); writeRegister(0x09, 0x03);
    writeRegister(0x0A, 0x27); writeRegister(0x0C, 0x24); writeRegister(0x0D, 0x24);
    return true;
  }
  static bool readSample(uint32_t &red, uint32_t &ir) {
    uint8_t wrPtr = readRegister(0x04), rdPtr = readRegister(0x06);
    if (wrPtr == rdPtr) return false;
    Wire.beginTransmission(MAX30102_ADDR); Wire.write(0x07);
    if (Wire.endTransmission(false) != 0) return false;
    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)6);
    if (Wire.available() < 6) return false;
    red = (((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read()) & 0x03FFFF;
    ir  = (((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read()) & 0x03FFFF;
    return true;
  }
  static float readDieTemperature() {
    writeRegister(0x21, 0x01); delay(30);
    int8_t  tempInt  = (int8_t)readRegister(0x1F);
    uint8_t tempFrac = readRegister(0x20);
    return (float)tempInt + ((float)tempFrac * 0.0625f);
  }
private:
  static void writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(MAX30102_ADDR); Wire.write(reg); Wire.write(value); Wire.endTransmission();
  }
  static uint8_t readRegister(uint8_t reg) {
    Wire.beginTransmission(MAX30102_ADDR); Wire.write(reg); Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MAX30102_ADDR, (uint8_t)1);
    return Wire.available() ? Wire.read() : 0;
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override    { bleClientConnected = true; }
  void onDisconnect(BLEServer*) override { bleClientConnected = false; BLEDevice::startAdvertising(); }
};

void initBluetooth() {
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  BLEService* pHrService = pServer->createService(BLE_SERVICE_HR);
  pHrChar = pHrService->createCharacteristic(BLE_CHAR_HR_MEASURE, BLECharacteristic::PROPERTY_NOTIFY);
  pHrChar->addDescriptor(new BLE2902()); pHrService->start();
  BLEService* pBattService = pServer->createService(BLE_SERVICE_BATTERY);
  pBattChar = pBattService->createCharacteristic(BLE_CHAR_BATTERY_LEVEL, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pBattChar->addDescriptor(new BLE2902()); pBattService->start();
  BLEService* pAuraService = pServer->createService(AURA_SERVICE_UUID);
  pTelemetryChar = pAuraService->createCharacteristic(AURA_CHAR_TELEMETRY_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pTelemetryChar->addDescriptor(new BLE2902()); pAuraService->start();
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_HR); pAdvertising->addServiceUUID(AURA_SERVICE_UUID);
  pAdvertising->setScanResponse(true); pAdvertising->setMinPreferred(0x06); pAdvertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
}

void computeRespiratoryRate() {
  if (rraBufCount < 10) return;
  float mean = 0;
  for (uint8_t i = 0; i < rraBufCount; i++) mean += rraBuf[i];
  mean /= (float)rraBufCount;
  int crossings = 0; bool above = rraBuf[0] > mean;
  for (uint8_t i = 1; i < rraBufCount; i++) {
    bool nowAbove = rraBuf[i] > mean;
    if (nowAbove != above) { crossings++; above = nowAbove; }
  }
  float windowMs = 0;
  for (uint8_t i = 0; i < rraBufCount; i++) windowMs += rraBuf[i];
  float windowMin = windowMs / 60000.0f;
  if (windowMin > 0 && crossings >= 2) {
    float rr = ((float)crossings / 2.0f) / windowMin;
    currentRespRate = constrain(rr, 4.0f, 40.0f);
  }
}

void processPhysiologicalData() {
  uint32_t r, ir;
  while (MAX30102Driver::readSample(r, ir)) {
    rawRed = r; rawIR = ir;
    if (rawIR < IR_FINGER_THRESHOLD) {
      fingerDetected = false; currentHeartRate = 0.0; currentSpO2 = 0.0; currentHrvSdnn = 0; currentPnn50 = 0.0;
      dcFilterIR = 0; dcFilterRed = 0;
      if (!offWristTimerActive) { offWristStart = millis(); offWristTimerActive = true; }
      else if (millis() - offWristStart > 60000) {
        display.clearDisplay(); display.setCursor(22, 24); display.print("POWER SAVE");
        display.setCursor(8, 38); display.print("Place on wrist..."); display.display();
        BLEDevice::stopAdvertising();
        esp_sleep_enable_timer_wakeup(10ULL * 1000000ULL);
        esp_light_sleep_start();
        BLEDevice::startAdvertising(); offWristStart = millis();
      }
      continue;
    }
    fingerDetected = true; offWristTimerActive = false; spo2AlertArmed = true; hrAlertArmed = true;
    if (dcFilterIR == 0.0f) { dcFilterIR = (float)rawIR; dcFilterRed = (float)rawRed; }
    else { dcFilterIR = 0.95f * dcFilterIR + 0.05f * (float)rawIR; dcFilterRed = 0.95f * dcFilterRed + 0.05f * (float)rawRed; }
    acIR = (float)rawIR - dcFilterIR; acRed = (float)rawRed - dcFilterRed;
    if (acIR > maxAcIR) maxAcIR = acIR; if (acIR < minAcIR) minAcIR = acIR;
    if (acRed > maxAcRed) maxAcRed = acRed; if (acRed < minAcRed) minAcRed = acRed;
    sampleCounter++;
    static float prevAcIR = 0; static bool troughDetected = false;
    unsigned long now = millis();
    if (acIR < -120.0f && acIR > prevAcIR && !troughDetected) {
      troughDetected = true;
      unsigned long ibi = now - lastBeatTimestamp;
      if (ibi >= 333 && ibi <= 1500 && lastBeatTimestamp > 0) {
        lastBeatTimestamp = now;
        recentIbis[ibiIndex] = (float)ibi; ibiIndex = (ibiIndex + 1) % 4;
        float sumIbi = 0; for (int i = 0; i < 4; i++) sumIbi += recentIbis[i];
        currentHeartRate = 60000.0f / (sumIbi / 4.0f);
        hrvIntervals[hrvIndex] = (float)ibi; hrvIndex = (hrvIndex + 1) % 10;
        if (hrvCount < 10) hrvCount++;
        if (hrvCount >= 3) {
          float meanIbi = 0; for (int i = 0; i < hrvCount; i++) meanIbi += hrvIntervals[i];
          meanIbi /= (float)hrvCount; float varianceSum = 0;
          for (int i = 0; i < hrvCount; i++) varianceSum += powf(hrvIntervals[i] - meanIbi, 2);
          currentHrvSdnn = (int)roundf(sqrtf(varianceSum / (float)hrvCount));
          int above50 = 0;
          for (int i = 1; i < (int)hrvCount; i++) {
            if (fabsf(hrvIntervals[i] - hrvIntervals[i-1]) > 50.0f) above50++;
          }
          currentPnn50 = (float)above50 / (float)(hrvCount - 1) * 100.0f;
        }
        rraBuf[rraBufIdx] = (float)ibi; rraBufIdx = (rraBufIdx + 1) % 20;
        if (rraBufCount < 20) rraBufCount++;
        computeRespiratoryRate();
      } else if (lastBeatTimestamp == 0 || ibi > 2000) { lastBeatTimestamp = now; }
    } else if (acIR >= 0.0f) { troughDetected = false; }
    prevAcIR = acIR;
    if (sampleCounter >= 100) {
      float ptpIR = maxAcIR - minAcIR, ptpRed = maxAcRed - minAcRed;
      if (ptpIR > 50 && ptpRed > 50 && dcFilterIR > 1000 && dcFilterRed > 1000) {
        float ratio = (ptpRed / dcFilterRed) / (ptpIR / dcFilterIR);
        float calcSpo2 = constrain(104.0f - (17.0f * ratio), 85.0f, 99.8f);
        currentSpO2 = (currentSpO2 == 0.0f) ? calcSpo2 : (0.85f * currentSpO2 + 0.15f * calcSpo2);
      }
      maxAcIR = -999999; minAcIR = 999999; maxAcRed = -999999; minAcRed = 999999;
      sampleCounter = 0;
    }
  }
}

int readBatteryPercentage() {
  uint32_t mv = analogReadMilliVolts(BATTERY_ADC_PIN);
  float vBat = (float)mv * 2.0f / 1000.0f;
  if (vBat <= 3.2f) return 5; if (vBat >= 4.2f) return 100;
  return (int)((vBat - 3.2f) / 1.0f * 100.0f);
}

void runVibrationMotor() {
  if (fingerDetected && currentSpO2 > 0 && currentSpO2 < 94.0f && spo2AlertArmed && vibPulsesLeft == 0) {
    vibPulsesLeft = 6; spo2AlertArmed = false;
  }
  if (fingerDetected && currentHeartRate > 110.0f && hrAlertArmed && vibPulsesLeft == 0) {
    vibPulsesLeft = 4; hrAlertArmed = false;
  }
  unsigned long now = millis();
  if (vibPulsesLeft > 0 && now >= vibNextToggle) {
    vibMotorOn = !vibMotorOn;
    digitalWrite(VIBRATION_PIN, vibMotorOn ? HIGH : LOW);
    vibNextToggle = now + 200;
    if (!vibMotorOn) vibPulsesLeft--;
  }
}

void renderOledDisplay() {
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0); display.print("AURA-OS");
  display.setCursor(56, 0); display.print(bleClientConnected ? "[BLE ON]" : "[BLE RDY]");
  display.setCursor(102, 0); display.print(batteryPercentage); display.print("%");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  if (fingerDetected && currentHeartRate > 35.0f) {
    display.setCursor(0, 14); display.print("HR:"); display.setTextSize(2);
    display.setCursor(22, 12); display.print((int)roundf(currentHeartRate));
    display.setTextSize(1); display.print(" BPM");
    display.setCursor(0, 30); display.print("SpO2:");
    if (currentSpO2 > 0) display.print((int)roundf(currentSpO2)); else display.print("--");
    display.print("%");
    display.setCursor(68, 30); display.print("RR:");
    if (currentRespRate > 0) display.print((int)roundf(currentRespRate)); else display.print("--");
    display.drawLine(0, 42, 127, 42, SSD1306_WHITE);
    display.setCursor(0, 46); display.print("HRV:"); display.print(currentHrvSdnn); display.print("ms");
    display.setCursor(0, 56); display.print("pNN50:"); display.print((int)roundf(currentPnn50)); display.print("%");
    display.setCursor(84, 56); display.print("T:");
    if (currentTempC > 0) display.print(currentTempC, 1); else display.print("--");
  } else {
    display.setCursor(20, 22); display.print("AURA WRISTBAND");
    display.setCursor(14, 34); display.print("[ SENSOR CONTACT ]");
    display.setCursor(10, 48); display.print("Position on wrist");
  }
  display.display();
}

void sendTelemetryStream() {
  String json = "{";
  json += "\\"hr\\":"   + String(fingerDetected ? currentHeartRate : 0.0f, 1) + ",";
  json += "\\"spo2\\":" + String(fingerDetected ? currentSpO2 : 0.0f, 1) + ",";
  json += "\\"temp\\":" + String(currentTempC, 1) + ",";
  json += "\\"hrv\\":"  + String(fingerDetected ? currentHrvSdnn : 0) + ",";
  json += "\\"pnn50\\":" + String(fingerDetected ? currentPnn50 : 0.0f, 1) + ",";
  json += "\\"rr\\":"   + String(fingerDetected ? currentRespRate : 0.0f, 1) + ",";
  json += "\\"batt\\":" + String(batteryPercentage) + ",";
  json += "\\"finger\\":" + String(fingerDetected ? "true" : "false") + ",";
  json += "\\"ir\\":"   + String(rawIR) + ",";
  json += "\\"red\\":"  + String(rawRed);
  json += "}";
  Serial.println(json);
  if (bleClientConnected) {
    if (pTelemetryChar) { pTelemetryChar->setValue(json.c_str()); pTelemetryChar->notify(); }
    if (pHrChar && fingerDetected && currentHeartRate > 0) {
      uint8_t hrPacket[4] = {0b00010000, (uint8_t)roundf(currentHeartRate), 0, 0};
      uint16_t rr1024 = (uint16_t)roundf(((60000.0f / currentHeartRate) / 1000.0f) * 1024.0f);
      hrPacket[2] = rr1024 & 0xFF; hrPacket[3] = (rr1024 >> 8) & 0xFF;
      pHrChar->setValue(hrPacket, 4); pHrChar->notify();
    }
    if (pBattChar) { uint8_t battVal = (uint8_t)batteryPercentage; pBattChar->setValue(&battVal, 1); pBattChar->notify(); }
  }
}

void setup() {
  Serial.begin(115200); delay(200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000);
  pinMode(VIBRATION_PIN, OUTPUT); digitalWrite(VIBRATION_PIN, LOW);
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
    display.setCursor(18, 14); display.print("NASA · HRP");
    display.setCursor(10, 26); display.print("AURA-OS WRISTBAND");
    display.setCursor(14, 38); display.print("ESP32-C3 BIOSENSOR");
    display.setCursor(8, 52);  display.print("Initializing BLE...");
    display.display();
  }
  if (!MAX30102Driver::begin()) { Serial.println("{\\"status\\":\\"ERROR\\",\\"msg\\":\\"MAX30102 not found\\"}"); }
  initBluetooth(); delay(800);
}

void loop() {
  unsigned long now = millis();
  processPhysiologicalData();
  if (now - lastTempRead >= 3000) {
    currentTempC = MAX30102Driver::readDieTemperature();
    batteryPercentage = readBatteryPercentage();
    lastTempRead = now;
  }
  runVibrationMotor();
  if (now - lastTelemetryStream >= 200) { sendTelemetryStream(); lastTelemetryStream = now; }
  if (now - lastDisplayRefresh >= 100)  { renderOledDisplay(); lastDisplayRefresh = now; }
  delay(5);
}`;
  }
}
