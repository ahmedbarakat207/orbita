// Web Bluetooth (BLE) GATT Heart Rate & Pulse Oximetry Ingestion Service
export class BleService {
  constructor(onDataCallback, onStatusCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera over HTTPS/localhost.');
    }

    try {
      this.updateStatus('requesting', 'Scanning for AURA-BAND-C3 & Bluetooth Low Energy medical devices...');

      // Support custom ESP32-C3 AURA Band & standard GATT Heart Rate / Oximeter devices
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'AURA' },
          { services: ['heart_rate'] },
          { services: ['pulse_oximeter'] }
        ],
        optionalServices: [
          '4fafc201-1fb5-459e-8fcc-c5c9c331914b', // Custom AURA Telemetry Service
          'heart_rate',
          'pulse_oximeter',
          'battery_service',
          'device_information'
        ]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.updateStatus('connecting', `Connecting to ${this.device.name || 'BLE Device'}...`);
      this.server = await this.device.gatt.connect();

      let subscribedAny = false;

      // 1. Try Custom AURA Telemetry Service (Full JSON stream from ESP32-C3)
      try {
        const auraService = await this.server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
        const auraChar = await auraService.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
        await auraChar.startNotifications();
        auraChar.addEventListener('characteristicvaluechanged', (e) => {
          this.parseAuraJson(e.target.value);
        });
        subscribedAny = true;
      } catch (e) {
        // Not an ESP32-C3 custom service or service not present, proceed to standard GATT
      }

      // 2. Standard Heart Rate Service (0x180D)
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
        await hrChar.startNotifications();
        hrChar.addEventListener('characteristicvaluechanged', (e) => {
          this.parseHeartRate(e.target.value);
        });
        subscribedAny = true;
      } catch (e) {
        // heart_rate service not available
      }

      // 3. Optional Battery Service (0x180F)
      try {
        const battService = await this.server.getPrimaryService('battery_service');
        const battChar = await battService.getCharacteristic('battery_level');
        const battVal = await battChar.readValue();
        const battPct = battVal.getUint8(0);
        if (this.onData) {
          this.onData({
            source: this.device.name || 'BLE Device',
            batt: battPct,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        // battery_service not available
      }

      if (!subscribedAny) {
        throw new Error('Device does not expose AURA Telemetry or Heart Rate GATT services.');
      }

      this.isConnected = true;
      this.updateStatus('connected', `Streaming live telemetry from ${this.device.name || 'Medical Wearable'}`);
      return this.device.name || 'BLE Medical Sensor';
    } catch (err) {
      this.updateStatus('disconnected', err.message || 'Connection failed or was cancelled');
      throw err;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnect();
  }

  handleDisconnect() {
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.updateStatus('disconnected', 'Hardware disconnected');
  }

  updateStatus(state, message) {
    if (this.onStatus) {
      this.onStatus({ state, message, isConnected: this.isConnected, deviceName: this.device?.name || null });
    }
  }

  // Parse raw JSON packet emitted by ESP32-C3 firmware
  parseAuraJson(dataView) {
    try {
      const decoder = new TextDecoder('utf-8');
      const jsonStr = decoder.decode(dataView);
      const data = JSON.parse(jsonStr);

      if (this.onData) {
        this.onData({
          source: `ESP32-C3 Band (${this.device?.name || 'AURA-BAND-C3'})`,
          hr: data.hr ?? null,
          spo2: data.spo2 ?? null,
          temp: data.temp ?? null,
          hrv: data.hrv ?? null,
          batt: data.batt ?? null,
          finger: typeof data.finger === 'boolean' ? data.finger : (data.hr > 0),
          rawIR: data.ir ?? null,
          rawRed: data.red ?? null,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.warn('Failed to parse AURA BLE JSON packet:', err);
    }
  }

  // Parse standard Bluetooth SIG Heart Rate Measurement GATT packet (0x2A37)
  parseHeartRate(dataView) {
    const flags = dataView.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const hasContact = (flags & 0x06) === 0x06;
    const hasEnergyExpended = (flags & 0x08) !== 0;
    const hasRrIntervals = (flags & 0x10) !== 0;

    let offset = 1;
    let hr = 0;

    if (is16Bit) {
      hr = dataView.getUint16(offset, true);
      offset += 2;
    } else {
      hr = dataView.getUint8(offset);
      offset += 1;
    }

    if (hasEnergyExpended) {
      offset += 2; // skip energy expended
    }

    // RR intervals (in 1/1024 seconds) provide real HRV (SDNN)
    const rrIntervals = [];
    if (hasRrIntervals) {
      while (offset + 1 < dataView.byteLength) {
        const rrRaw = dataView.getUint16(offset, true);
        const rrMs = Math.round((rrRaw / 1024) * 1000);
        rrIntervals.push(rrMs);
        offset += 2;
      }
    }

    // Estimate HRV from RR intervals if present
    let hrv = null;
    if (rrIntervals.length >= 2) {
      const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
      const variance = rrIntervals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rrIntervals.length;
      hrv = Math.round(Math.sqrt(variance));
    }

    if (this.onData) {
      this.onData({
        source: this.device?.name || 'Web Bluetooth (BLE)',
        hr: hr > 0 ? hr : 0,
        hrv,
        rrIntervals,
        finger: hr > 0 || hasContact,
        timestamp: Date.now()
      });
    }
  }
}
