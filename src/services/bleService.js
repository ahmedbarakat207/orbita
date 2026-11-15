// Web Bluetooth (BLE) & macOS CoreBluetooth Bridge Service
// Supports:
// 1. Amazfit Bip U / Huami Wearable Protocol (0xFEE0, 0xFEE1, 0x180D, 0x180F, 0x180A, 0x1802, 0x1811)
// 2. Local macOS CoreBluetooth Auto-Bridge (http://127.0.0.1:8766 SSE + REST) for zero-popup / Brave compatibility
// 3. Custom ESP32-C3 AURA Band & Standard Bluetooth SIG Heart Rate / Pulse Oximeter GATT devices

const BRIDGE_BASE_URL = 'http://127.0.0.1:8766';

const UUID_SVC_AURA       = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const UUID_CHAR_AURA      = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const UUID_SVC_HUAMI_FEE0 = '0000fee0-0000-1000-8000-00805f9b34fb';
const UUID_SVC_HUAMI_FEE1 = '0000fee1-0000-1000-8000-00805f9b34fb';
const UUID_SVC_IMM_ALERT  = '00001802-0000-1000-8000-00805f9b34fb';
const UUID_SVC_ALERT_NOTIF = '00001811-0000-1000-8000-00805f9b34fb';

const UUID_SERIAL_NUMBER  = '00002a25-0000-1000-8000-00805f9b34fb';
const UUID_HW_REVISION    = '00002a27-0000-1000-8000-00805f9b34fb';
const UUID_SW_REVISION    = '00002a28-0000-1000-8000-00805f9b34fb';
const UUID_SYSTEM_ID      = '00002a23-0000-1000-8000-00805f9b34fb';
const UUID_CURRENT_TIME   = '00002a2b-0000-1000-8000-00805f9b34fb';
const UUID_IMM_ALERT      = '00002a06-0000-1000-8000-00805f9b34fb';
const UUID_NEW_ALERT      = '00002a46-0000-1000-8000-00805f9b34fb';
const UUID_HR_CONTROL     = '00002a39-0000-1000-8000-00805f9b34fb';

const UUID_SENS_CONTROL   = '00000001-0000-3512-2118-0009af100700';
const UUID_SENS_DATA      = '00000002-0000-3512-2118-0009af100700';
const UUID_CONFIGURATION  = '00000003-0000-3512-2118-0009af100700';
const UUID_BATTERY_INFO   = '00000006-0000-3512-2118-0009af100700';
const UUID_REALTIME_STEPS = '00000007-0000-3512-2118-0009af100700';
const UUID_HUAMI_AUTH     = '00000009-0000-3512-2118-0009af100700';
const UUID_WORKOUT        = '0000000f-0000-3512-2118-0009af100700';
const UUID_DEVICE_EVENT   = '00000010-0000-3512-2118-0009af100700';

const HUAMI_EVENT_NAMES = {
  0x01: 'CALL_REJECT',
  0x02: 'CALL_IGNORE',
  0x04: 'BUTTON_PRESSED',
  0x05: 'FAMILIAR_WAKEUP',
  0x06: 'START_NONWEAR',
  0x07: 'ALARM_TOGGLED',
  0x08: 'FIND_PHONE_START',
  0x09: 'FIND_PHONE_STOP',
  0x0b: 'BUTTON_PRESSED_LONG',
  0x0e: 'FELL_ASLEEP',
  0x0f: 'WOKE_UP',
  0x11: 'STEPSGOAL_REACHED',
  0x16: 'MTU_REQUEST',
  0x19: 'SILENT_MODE',
  0x1c: 'WORKOUT_STARTING',
  0xfe: 'MUSIC_CONTROL'
};

export class BleService {
  constructor(onDataCallback, onStatusCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.device = null;
    this.server = null;
    this.isConnected = false;
    this.connectionMode = null; // 'bridge' | 'web_ble'
    this.eventSource = null;
    this.chars = {};
    this.coupledTimer = null;
    this.phase = 0;

    // Comprehensive Watch State Dossier (populated by Bridge or Web Bluetooth)
    // Only values actually read from the watch are stored. null = unknown/unavailable.
    this.watchState = {
      connected: false,
      connectionMode: 'standby',
      deviceName: null, address: null, mtu: null,
      serialNumber: null, hardwareRevision: null, firmwareRevision: null, systemId: null,
      watchTime: null, batt: null, charging: null,
      lastChargeTime: null, lastChargeLevel: null,
      steps: null, distanceMeters: null, caloriesKcal: null, cadenceSpm: null,
      wearing: null, workoutActive: false, workoutName: null,
      authenticated: false, hasAuthKey: false, autonomousConfigActive: false,
      hrStreamMode: 'locked',
      hr: null, hrv: null, rrIntervals: [],
      spo2: null, spo2Timestamp: null, spo2Mode: null,
      stress: null, stressTimestamp: null, stressMode: null,
      paiTotal: null, paiToday: null, standHours: null, lastHealthSync: null,
      buttonPressCount: 0, lastEvent: null, packetCount: 0, recentPackets: []
    };
  }

  isSupported() {
    return typeof navigator !== 'undefined' && ('bluetooth' in navigator || true);
  }

  hasWebBluetooth() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // Probe local macOS CoreBluetooth bridge (http://127.0.0.1:8766) on startup
  async autoConnectBridge() {
    try {
      const res = await fetch(`${BRIDGE_BASE_URL}/api/status`, { method: 'GET' });
      if (!res.ok) return false;
      const json = await res.json();
      if (json && json.ok) {
        await this.connectBridge();
        return true;
      }
    } catch (_) {
      // Bridge not running locally, ignore silently
    }
    return false;
  }

  async connectBridge() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('connecting', 'Linking to Amazfit Bip U via macOS CoreBluetooth Bridge...');

    const res = await fetch(`${BRIDGE_BASE_URL}/api/status`);
    if (!res.ok) {
      throw new Error('Local Amazfit Bip U Bridge (port 8766) is not reachable.');
    }
    const statusJson = await res.json();
    if (statusJson.state) {
      this.ingestBridgeState(statusJson.state);
    }

    this.connectionMode = 'bridge';
    this.isConnected = true;
    this.device = { name: this.watchState.deviceName || 'Amazfit Bip U' };

    this.eventSource = new EventSource(`${BRIDGE_BASE_URL}/api/stream`);
    this.eventSource.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg && msg.data) {
          this.ingestBridgeState(msg.data);
        }
      } catch (e) {
        console.warn('Bridge SSE parse error:', e);
      }
    };

    this.eventSource.onerror = () => {
      // Keep trying via EventSource auto-reconnect
    };

    this.updateStatus('connected', `Streaming live telemetry from ${this.device.name} (CoreBluetooth Bridge)`);
    return this.device.name;
  }

  ingestBridgeState(st) {
    Object.assign(this.watchState, st, {
      connectionMode: 'macOS CoreBluetooth Bridge (127.0.0.1:8766)'
    });
    this.isConnected = Boolean(st.connected);
    if (!this.device) {
      this.device = { name: st.deviceName || 'Amazfit Bip U' };
    }

    this.emitWatchState();
  }

  // Primary connect method: prefers Bridge if available, otherwise Web Bluetooth
  async connect(preferWebBle = false) {
    if (!preferWebBle) {
      try {
        const name = await this.connectBridge();
        return name;
      } catch (_) {
        // Fallback to Web Bluetooth
      }
    }
    return this.connectWebBluetooth();
  }

  async connectWebBluetooth() {
    if (!this.hasWebBluetooth()) {
      // Try bridge one more time in case user is in Brave without Web Bluetooth flag
      try {
        return await this.connectBridge();
      } catch (_) {
        throw new Error(
          'Web Bluetooth is unavailable. Open http://localhost:5173 in Chrome/Edge (Safari/Firefox lack it, Brave needs brave://flags/#enable-web-bluetooth, LAN URLs are not secure contexts), or run `npm run bridge`.'
        );
      }
    }

    try {
      this.updateStatus('requesting', 'Scanning for Amazfit Bip U, AURA-BAND-C3 & BLE wearables...');

      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Amazfit' },
          { namePrefix: 'Bip' },
          { namePrefix: 'AURA' },
          { services: [UUID_SVC_HUAMI_FEE0] },
          { services: ['heart_rate'] },
          { services: ['pulse_oximeter'] }
        ],
        optionalServices: [
          UUID_SVC_AURA,
          UUID_SVC_HUAMI_FEE0,
          UUID_SVC_HUAMI_FEE1,
          UUID_SVC_IMM_ALERT,
          UUID_SVC_ALERT_NOTIF,
          'heart_rate',
          'pulse_oximeter',
          'battery_service',
          'device_information'
        ]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.updateStatus('connecting', `Connecting to ${this.device.name || 'BLE Wearable'}...`);
      this.server = await this.device.gatt.connect();
      this.connectionMode = 'web_ble';
      this.watchState.deviceName = this.device.name || 'Amazfit Bip U';
      this.watchState.connectionMode = 'Web Bluetooth GATT';

      let subscribedAny = false;

      // 1. Try Custom AURA Telemetry Service (ESP32-C3)
      try {
        const auraService = await this.server.getPrimaryService(UUID_SVC_AURA);
        const auraChar = await auraService.getCharacteristic(UUID_CHAR_AURA);
        await auraChar.startNotifications();
        auraChar.addEventListener('characteristicvaluechanged', (e) => {
          this.parseAuraJson(e.target.value);
        });
        subscribedAny = true;
      } catch (_) {}

      // 2. Device Information Service (0x180A)
      try {
        const infoSvc = await this.server.getPrimaryService('device_information');
        const readStr = async (uuid) => {
          try {
            const c = await infoSvc.getCharacteristic(uuid);
            const v = await c.readValue();
            return new TextDecoder('utf-8').decode(v).trim();
          } catch (_) {
            return null;
          }
        };
        const sn = await readStr(UUID_SERIAL_NUMBER);
        const hw = await readStr(UUID_HW_REVISION);
        const sw = await readStr(UUID_SW_REVISION);
        if (sn) this.watchState.serialNumber = sn;
        if (hw) this.watchState.hardwareRevision = hw;
        if (sw) this.watchState.firmwareRevision = sw;
        subscribedAny = true;
      } catch (_) {}

      // 3. Huami Primary Service (0xFEE0) — Battery Info, Realtime Steps, Device Events, Workout, Current Time
      try {
        const fee0 = await this.server.getPrimaryService(UUID_SVC_HUAMI_FEE0);
        subscribedAny = true;

        // Current Time (0x2A2B)
        try {
          const timeChar = await fee0.getCharacteristic(UUID_CURRENT_TIME);
          this.chars.currentTime = timeChar;
          const tv = await timeChar.readValue();
          this.parseHuamiCurrentTime(tv);
        } catch (_) {}

        // Detailed Battery Info (0x0006)
        try {
          const battInfoChar = await fee0.getCharacteristic(UUID_BATTERY_INFO);
          this.chars.battInfo = battInfoChar;
          const bv = await battInfoChar.readValue();
          this.parseHuamiBatteryInfo(bv);
          await battInfoChar.startNotifications();
          battInfoChar.addEventListener('characteristicvaluechanged', (e) => {
            this.parseHuamiBatteryInfo(e.target.value);
          });
        } catch (_) {}

        // Realtime Steps / Distance / Calories (0x0007)
        try {
          const stepsChar = await fee0.getCharacteristic(UUID_REALTIME_STEPS);
          this.chars.steps = stepsChar;
          await stepsChar.startNotifications();
          stepsChar.addEventListener('characteristicvaluechanged', (e) => {
            this.parseHuamiSteps(e.target.value);
          });
        } catch (_) {}

        // Device Events (0x0010)
        try {
          const evtChar = await fee0.getCharacteristic(UUID_DEVICE_EVENT);
          this.chars.deviceEvent = evtChar;
          await evtChar.startNotifications();
          evtChar.addEventListener('characteristicvaluechanged', (e) => {
            this.parseHuamiDeviceEvent(e.target.value);
          });
        } catch (_) {}

        // Workout Events (0x000F)
        try {
          const wrkChar = await fee0.getCharacteristic(UUID_WORKOUT);
          this.chars.workout = wrkChar;
          await wrkChar.startNotifications();
          wrkChar.addEventListener('characteristicvaluechanged', (e) => {
            this.parseHuamiWorkout(e.target.value);
          });
        } catch (_) {}

        // Raw Sensor Control & Data (0x0001 / 0x0002) & Config (0x0003)
        try {
          this.chars.sensControl = await fee0.getCharacteristic(UUID_SENS_CONTROL);
          this.chars.sensData = await fee0.getCharacteristic(UUID_SENS_DATA);
          this.chars.config = await fee0.getCharacteristic(UUID_CONFIGURATION);
        } catch (_) {}
      } catch (_) {}

      // 4. Huami Auth Service (0xFEE1 -> 0x0009)
      try {
        const fee1 = await this.server.getPrimaryService(UUID_SVC_HUAMI_FEE1);
        const authChar = await fee1.getCharacteristic(UUID_HUAMI_AUTH);
        this.chars.auth = authChar;
        await authChar.startNotifications();
      } catch (_) {}

      // 5. Alert Services (0x1802 Immediate Alert & 0x1811 Alert Notification)
      try {
        const immSvc = await this.server.getPrimaryService(UUID_SVC_IMM_ALERT);
        this.chars.immAlert = await immSvc.getCharacteristic(UUID_IMM_ALERT);
      } catch (_) {}

      try {
        const anSvc = await this.server.getPrimaryService(UUID_SVC_ALERT_NOTIF);
        this.chars.newAlert = await anSvc.getCharacteristic(UUID_NEW_ALERT);
      } catch (_) {}

      // 6. Standard Heart Rate Service (0x180D)
      try {
        const hrService = await this.server.getPrimaryService('heart_rate');
        const hrChar = await hrService.getCharacteristic('heart_rate_measurement');
        this.chars.hrMeasure = hrChar;
        try {
          this.chars.hrControl = await hrService.getCharacteristic(UUID_HR_CONTROL);
        } catch (_) {}
        await hrChar.startNotifications();
        hrChar.addEventListener('characteristicvaluechanged', (e) => {
          this.parseHeartRate(e.target.value);
        });
        this.watchState.hrStreamMode = 'direct_gatt';
        subscribedAny = true;
      } catch (_) {
        this.watchState.hrStreamMode = 'locked';
      }

      // 7. Standard Battery Service (0x180F)
      try {
        const battService = await this.server.getPrimaryService('battery_service');
        const battChar = await battService.getCharacteristic('battery_level');
        const battVal = await battChar.readValue();
        this.watchState.batt = battVal.getUint8(0);
        await battChar.startNotifications();
        battChar.addEventListener('characteristicvaluechanged', (e) => {
          this.watchState.batt = e.target.value.getUint8(0);
          this.emitWatchState();
        });
        subscribedAny = true;
      } catch (_) {}

      if (!subscribedAny) {
        throw new Error('Device did not expose compatible GATT services.');
      }

      this.isConnected = true;
      this.watchState.connected = true;
      this.emitWatchState();

      this.updateStatus('connected', `Streaming live telemetry from ${this.device.name || 'Amazfit Bip U'}`);
      return this.device.name || 'Amazfit Bip U';
    } catch (err) {
      this.updateStatus('disconnected', err.message || 'Connection failed or was cancelled');
      throw err;
    }
  }

  emitWatchState() {
    if (!this.onData) return;
    const st = this.watchState;
    const payload = {
      source: `${st.deviceName || 'Amazfit Bip U'} (BLE)`,
      batt: st.batt, charging: st.charging,
      steps: st.steps, distanceMeters: st.distanceMeters, caloriesKcal: st.caloriesKcal,
      watchState: st, timestamp: Date.now()
    };
    if (st.hr > 0) payload.hr = st.hr;
    if (st.hrv > 0) payload.hrv = st.hrv;
    if (st.spo2 > 0) {
      payload.spo2 = st.spo2;
      payload.spo2Timestamp = st.spo2Timestamp;
      payload.spo2Mode = st.spo2Mode;
    }
    if (st.stress > 0) {
      payload.stress = st.stress;
      payload.stressTimestamp = st.stressTimestamp;
      payload.stressMode = st.stressMode;
    }
    if (st.paiTotal !== null && st.paiTotal !== undefined) payload.paiTotal = st.paiTotal;
    if (st.rrIntervals?.length) payload.rrIntervals = st.rrIntervals;
    if (st.wearing !== null && st.wearing !== undefined) {
      payload.finger = st.wearing;
    } else if (st.connected) {
      payload.finger = true;
    }
    this.onData(payload);
  }

  logPacket(dir, charShort, dataView, decoded = '') {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    this.watchState.packetCount += 1;
    this.watchState.recentPackets.unshift({
      ts: new Date().toISOString().slice(11, 23),
      dir,
      char: charShort,
      hex,
      decoded
    });
    if (this.watchState.recentPackets.length > 35) {
      this.watchState.recentPackets.pop();
    }
  }

  parseHuamiCurrentTime(dv) {
    if (dv.byteLength >= 7) {
      const y = dv.getUint16(0, true);
      const m = String(dv.getUint8(2)).padStart(2, '0');
      const d = String(dv.getUint8(3)).padStart(2, '0');
      const hh = String(dv.getUint8(4)).padStart(2, '0');
      const mm = String(dv.getUint8(5)).padStart(2, '0');
      const ss = String(dv.getUint8(6)).padStart(2, '0');
      this.watchState.watchTime = `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
      this.logPacket('READ', '0x2A2B', dv, `RTC ${this.watchState.watchTime}`);
    }
  }

  parseHuamiBatteryInfo(dv) {
    if (dv.byteLength >= 20 && dv.getUint8(0) === 0x0f) {
      this.watchState.batt = dv.getUint8(1);
      this.watchState.charging = dv.getUint8(2) === 1;
      const ly = dv.getUint16(11, true);
      const lm = String(dv.getUint8(13)).padStart(2, '0');
      const ld = String(dv.getUint8(14)).padStart(2, '0');
      const lhh = String(dv.getUint8(15)).padStart(2, '0');
      const lmm = String(dv.getUint8(16)).padStart(2, '0');
      this.watchState.lastChargeTime = `${ly}-${lm}-${ld} ${lhh}:${lmm}`;
      this.watchState.lastChargeLevel = dv.getUint8(19);
      this.logPacket('READ', '0x0006', dv, `Batt ${this.watchState.batt}% (${this.watchState.charging ? 'CHARGING' : 'ON BATT'})`);
    } else if (dv.byteLength >= 3) {
      this.watchState.batt = dv.getUint8(1);
      this.watchState.charging = dv.getUint8(2) === 1;
      this.logPacket('NOTIFY', '0x0006', dv, `Batt ${this.watchState.batt}%`);
    }
    this.emitWatchState();
  }

  parseHuamiSteps(dv) {
    if (dv.byteLength >= 13 && dv.getUint8(0) === 0x0c) {
      this.watchState.steps = dv.getUint32(1, true);
      this.watchState.distanceMeters = dv.getUint32(5, true);
      this.watchState.caloriesKcal = dv.getUint32(9, true);
      this.logPacket('NOTIFY', '0x0007', dv, `Steps=${this.watchState.steps}, Dist=${this.watchState.distanceMeters}m`);
      this.emitWatchState();
    }
  }

  parseHuamiDeviceEvent(dv) {
    if (dv.byteLength < 1) return;
    const code = dv.getUint8(0);
    const name = HUAMI_EVENT_NAMES[code] || `EVENT_0x${code.toString(16).toUpperCase()}`;
    if (code === 0x16 && dv.byteLength >= 3) {
      this.watchState.mtu = dv.getUint16(1, true);
    } else if (code === 0x04 || code === 0x0b) {
      this.watchState.buttonPressCount += 1;
    } else if (code === 0x06) {
      this.watchState.wearing = false;
    } else if (code === 0x0f) {
      this.watchState.wearing = true;
    }
    this.watchState.lastEvent = name;
    this.logPacket('NOTIFY', '0x0010', dv, name);
    this.emitWatchState();
  }

  parseHuamiWorkout(dv) {
    if (dv.byteLength >= 2 && dv.getUint8(0) === 0x11) {
      const st = dv.getUint8(1);
      this.watchState.workoutActive = st === 0x01;
      this.watchState.lastEvent = st === 0x01 ? 'WORKOUT STARTED' : 'WORKOUT ENDED';
    }
    this.logPacket('NOTIFY', '0x000F', dv, this.watchState.lastEvent);
    this.emitWatchState();
  }

  // --- Bidirectional Watch Commands (Bridge or Web Bluetooth) ---
  async sendWatchAlert(message = 'ORBITA TELEMETRY LINKED', category = 5, title = null) {
    if (this.connectionMode === 'bridge') {
      const res = await fetch(`${BRIDGE_BASE_URL}/api/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, category, title, vibrate: true })
      });
      return res.json();
    }
    if (this.chars.newAlert) {
      const fullText = title ? `${title}\0${message}` : message;
      const enc = new TextEncoder().encode(fullText.slice(0, 180));
      const pkt = new Uint8Array(2 + enc.length);
      pkt[0] = category & 0xff;
      pkt[1] = 1;
      pkt.set(enc, 2);
      await this.chars.newAlert.writeValueWithResponse(pkt);
      this.watchState.lastEvent = `OLED Alert sent: "${fullText}"`;
      this.emitWatchState();
      return { ok: true };
    }
    throw new Error('Watch New Alert characteristic (0x2A46) not connected');
  }

  async vibrateWatch(level = 2, durationMs = 550) {
    if (this.connectionMode === 'bridge') {
      const res = await fetch(`${BRIDGE_BASE_URL}/api/vibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, durationMs })
      });
      return res.json();
    }
    if (this.chars.immAlert) {
      await this.chars.immAlert.writeValueWithoutResponse(new Uint8Array([level]));
      setTimeout(async () => {
        try {
          await this.chars.immAlert.writeValueWithoutResponse(new Uint8Array([0]));
        } catch (_) {}
      }, durationMs);
      return { ok: true };
    }
    throw new Error('Watch Immediate Alert characteristic (0x2A06) not connected');
  }

  async syncWatchTime() {
    if (this.connectionMode === 'bridge') {
      const res = await fetch(`${BRIDGE_BASE_URL}/api/sync-time`, { method: 'POST' });
      return res.json();
    }
    if (this.chars.currentTime) {
      const now = new Date();
      const tzQuarters = Math.round((-now.getTimezoneOffset() * 60) / 900);
      const buf = new ArrayBuffer(11);
      const dv = new DataView(buf);
      dv.setUint16(0, now.getFullYear(), true);
      dv.setUint8(2, now.getMonth() + 1);
      dv.setUint8(3, now.getDate());
      dv.setUint8(4, now.getHours());
      dv.setUint8(5, now.getMinutes());
      dv.setUint8(6, now.getSeconds());
      dv.setUint8(7, now.getDay() === 0 ? 7 : now.getDay());
      dv.setUint8(8, 0);
      dv.setUint8(9, 0);
      dv.setInt8(10, tzQuarters);
      await this.chars.currentTime.writeValueWithResponse(buf);
      return { ok: true, watchTime: now.toISOString().slice(0, 19).replace('T', ' ') };
    }
    throw new Error('Watch Current Time characteristic (0x2A2B) not connected');
  }

  async releaseBle() {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/release-ble`, { method: 'POST' });
    return res.json();
  }

  async resumeBle() {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/resume-ble`, { method: 'POST' });
    return res.json();
  }

  async triggerHrScan() {
    if (this.connectionMode === 'bridge') {
      const res = await fetch(`${BRIDGE_BASE_URL}/api/trigger-hr`, { method: 'POST' });
      return res.json();
    }
    if (this.chars.hrMeasure) {
      await this.chars.hrMeasure.startNotifications();
      if (this.chars.hrControl) {
        await this.chars.hrControl.writeValueWithResponse(new Uint8Array([0x15, 0x01, 0x01]));
      }
      return { ok: true, mode: 'direct_gatt' };
    }
    return { ok: false, reason: 'HR characteristic locked' };
  }

  async syncWatchHealth(fullResync = false) {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/sync-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookbackHours: 48, fullResync })
    });
    return res.json();
  }

  async authenticateWithKey(authKeyHex) {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/auth-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: authKeyHex })
    });
    return res.json();
  }

  async fetchZeppKey(email, password) {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/zepp-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.coupledTimer) {
      clearInterval(this.coupledTimer);
      this.coupledTimer = null;
    }
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnect();
  }

  handleDisconnect() {
    this.isConnected = false;
    this.connectionMode = null;
    this.device = null;
    this.server = null;
    this.watchState.connected = false;
    this.updateStatus('disconnected', 'Hardware disconnected');
  }

  updateStatus(state, message) {
    if (this.onStatus) {
      this.onStatus({
        state,
        message,
        isConnected: this.isConnected,
        deviceName: this.device?.name || this.watchState.deviceName || null
      });
    }
  }

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
          finger: typeof data.finger === 'boolean' ? data.finger : data.hr > 0,
          rawIR: data.ir ?? null,
          rawRed: data.red ?? null,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.warn('Failed to parse AURA BLE JSON packet:', err);
    }
  }

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
      offset += 2;
    }

    const rrIntervals = [];
    if (hasRrIntervals) {
      while (offset + 1 < dataView.byteLength) {
        const rrRaw = dataView.getUint16(offset, true);
        const rrMs = Math.round((rrRaw / 1024) * 1000);
        rrIntervals.push(rrMs);
        offset += 2;
      }
    }

    let hrv = null;
    if (rrIntervals.length >= 2) {
      const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
      const variance = rrIntervals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rrIntervals.length;
      hrv = Math.round(Math.sqrt(variance));
    }

    if (hr > 0) this.watchState.hr = hr;
    if (hrv) this.watchState.hrv = hrv;
    this.watchState.hrStreamMode = 'direct_gatt';
    this.logPacket('NOTIFY', '0x2A37', dataView, `Optical HR = ${hr} BPM`);

    if (this.onData) {
      this.onData({
        source: this.device?.name || 'Amazfit Bip U (BLE)',
        hr: hr > 0 ? hr : 0,
        hrv,
        rrIntervals,
        finger: hr > 0 || hasContact,
        watchState: this.watchState,
        timestamp: Date.now()
      });
    }
  }
}
