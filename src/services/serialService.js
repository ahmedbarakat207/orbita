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
    // 1. Try parsing JSON format: {"hr": 75, "spo2": 98.1, "temp": 36.9, "co2": 2.7, "ecg": 520}
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const data = JSON.parse(line);
        if (this.onData) {
          this.onData({
            source: 'USB / Web Serial (Hardware)',
            hr: data.hr ? parseFloat(data.hr) : null,
            spo2: data.spo2 ? parseFloat(data.spo2) : null,
            temp: data.temp ? parseFloat(data.temp) : null,
            co2: data.co2 ? parseFloat(data.co2) : null,
            icp: data.icp ? parseFloat(data.icp) : null,
            ecgVoltage: data.ecg !== undefined ? parseFloat(data.ecg) : null,
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
        source: 'USB / Web Serial (Hardware)',
        hr: parts[0] >= 30 && parts[0] <= 240 ? parts[0] : null,
        spo2: parts.length > 1 && parts[1] >= 70 && parts[1] <= 100 ? parts[1] : null,
        temp: parts.length > 2 && parts[2] >= 30 && parts[2] <= 45 ? parts[2] : null,
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

  // Returns C++ firmware code for Arduino / ESP32
  static getSampleArduinoCode() {
    return `/*
 * NASA Space Apps Challenge 2026 - AURA-OS Hardware Biosensor Bridge
 * Board: ESP32 or Arduino Uno/Nano
 * Sensors: MAX30102 (Pulse Oximeter) / AD8232 (ECG) / BME680
 *
 * Flashes standard JSON packets to USB Serial at 115200 baud.
 */

#include <Wire.h>

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  // Initialize I2C / Biosensors here (e.g., Wire.begin(), max30102.begin())
}

void loop() {
  // Read real analog/I2C sensor inputs
  int ecgRaw = analogRead(A0); // Analog ECG pin (AD8232)
  
  // Format as JSON packet recognized by AURA-OS:
  // {"hr": <bpm>, "spo2": <percentage>, "temp": <celsius>, "co2": <mmHg>, "ecg": <analog>}
  float hr = 72.0 + (analogRead(A0) % 6) - 3;
  float spo2 = 98.2;
  float temp = 36.8;
  float co2 = 2.7;

  Serial.print("{\\"hr\\":");
  Serial.print(hr, 1);
  Serial.print(",\\"spo2\\":");
  Serial.print(spo2, 1);
  Serial.print(",\\"temp\\":");
  Serial.print(temp, 1);
  Serial.print(",\\"co2\\":");
  Serial.print(co2, 1);
  Serial.print(",\\"ecg\\":");
  Serial.print(ecgRaw);
  Serial.println("}");

  delay(500); // 2Hz sample transmission
}`;
  }
}
