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
      this.updateStatus('requesting', 'Scanning for Bluetooth Low Energy medical devices...');

      // Standard Bluetooth GATT Heart Rate (0x180D) and Pulse Oximeter (0x1822)
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['heart_rate'] },
          { services: ['pulse_oximeter'] }
        ],
        optionalServices: ['battery_service', 'device_information']
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.updateStatus('connecting', `Connecting to ${this.device.name || 'BLE Device'}...`);
      this.server = await this.device.gatt.connect();

      // Connect to Heart Rate Service (0x180D)
      const service = await this.server.getPrimaryService('heart_rate');
      this.characteristic = await service.getCharacteristic('heart_rate_measurement');

      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (e) => {
        this.parseHeartRate(e.target.value);
      });

      this.isConnected = true;
      this.updateStatus('connected', `Streaming live telemetry from ${this.device.name || 'Medical Wearable'}`);
      return this.device.name || 'BLE Medical Sensor';
    } catch (err) {
      this.updateStatus('disconnected', err.message || 'Connection failed or was cancelled');
      throw err;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
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

    if (this.onData && hr > 0) {
      this.onData({
        source: 'Web Bluetooth (BLE)',
        hr,
        hrv,
        rrIntervals,
        timestamp: Date.now()
      });
    }
  }
}
