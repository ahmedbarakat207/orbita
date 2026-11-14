/**
 * ORBITA Multi-Device Manager
 * Coordinates multiple connected watches (Bridge + Web Bluetooth),
 * manages custom device aliases, persistence, active watch selection,
 * and clinical health threshold classification.
 */

export class DeviceManager {
  constructor(onUpdateCallback) {
    this.onUpdate = onUpdateCallback;
    this.devices = new Map();
    this.activeDeviceId = null;

    // Load custom names and threshold settings from localStorage
    this.customNames = this.loadCustomNames();
    this.thresholds = this.loadThresholds();

    // Default built-in primary device for the local Amazfit / CoreBluetooth bridge
    this.registerDevice({
      id: 'orbita-primary',
      defaultName: 'Amazfit Bip U',
      sourceType: 'bridge',
      connected: false
    });
    this.activeDeviceId = 'orbita-primary';
  }

  loadCustomNames() {
    try {
      const saved = localStorage.getItem('orbita_device_names');
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  }

  saveCustomNames() {
    try {
      localStorage.setItem('orbita_device_names', JSON.stringify(this.customNames));
    } catch (_) {}
  }

  loadThresholds() {
    try {
      const saved = localStorage.getItem('orbita_health_thresholds');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      hr: { minDanger: 50, minMild: 58, maxMild: 90, maxDanger: 105 },
      spo2: { dangerBelow: 93, mildBelow: 95 },
      stress: { mildAbove: 40, dangerAbove: 65 }
    };
  }

  saveThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    try {
      localStorage.setItem('orbita_health_thresholds', JSON.stringify(this.thresholds));
    } catch (_) {}
    if (this.onUpdate) this.onUpdate();
  }

  registerDevice({ id, defaultName, sourceType, address = null }) {
    if (!this.devices.has(id)) {
      const customName = this.customNames[id] || (this.devices.size === 0 ? 'Orbita 1' : `Orbita ${this.devices.size + 1}`);
      this.devices.set(id, {
        id,
        defaultName: defaultName || 'Orbita Watch',
        customName,
        sourceType: sourceType || 'ble',
        address: address || null,
        connected: false,
        isOffWrist: false,
        vitals: {
          hr: null,
          hrv: null,
          spo2: null,
          stress: null,
          respRate: null,
          bpSys: null,
          bpDia: null,
          map: null,
          temp: null
        },
        activity: {
          steps: null,
          distanceMeters: null,
          caloriesKcal: null,
          cadenceSpm: null,
          batt: null,
          charging: false
        },
        meta: {
          serialNumber: null,
          firmwareRevision: null,
          hardwareRevision: null,
          lastSync: null
        },
        lastSeen: null
      });
    }
    return this.devices.get(id);
  }

  renameDevice(id, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const dev = this.devices.get(id);
    if (dev) {
      dev.customName = trimmed;
      this.customNames[id] = trimmed;
      this.saveCustomNames();
      if (this.onUpdate) this.onUpdate();
    }
  }

  setActiveDevice(id) {
    if (this.devices.has(id)) {
      this.activeDeviceId = id;
      if (this.onUpdate) this.onUpdate();
    }
  }

  getActiveDevice() {
    return this.devices.get(this.activeDeviceId) || Array.from(this.devices.values())[0] || null;
  }

  getAllDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Evaluates physiological status of a vitals reading:
   * Returns: { level: 'good' | 'mild' | 'danger', statusText: string, reasons: string[] }
   */
  evaluateHealth(vitals) {
    if (!vitals || !vitals.hr || vitals.hr <= 0) {
      return { level: 'unknown', statusText: 'AWAITING TELEMETRY', reasons: [] };
    }

    const t = this.thresholds;
    const reasons = [];
    let isDanger = false;
    let isMild = false;

    // Heart Rate check
    if (vitals.hr > t.hr.maxDanger) {
      isDanger = true;
      reasons.push(`High HR (${Math.round(vitals.hr)} BPM > ${t.hr.maxDanger})`);
    } else if (vitals.hr < t.hr.minDanger) {
      isDanger = true;
      reasons.push(`Low HR (${Math.round(vitals.hr)} BPM < ${t.hr.minDanger})`);
    } else if (vitals.hr > t.hr.maxMild) {
      isMild = true;
      reasons.push(`Elevated HR (${Math.round(vitals.hr)} BPM)`);
    } else if (vitals.hr < t.hr.minMild) {
      isMild = true;
      reasons.push(`Mild Bradycardia (${Math.round(vitals.hr)} BPM)`);
    }

    // SpO2 check
    if (vitals.spo2 && vitals.spo2 > 0) {
      if (vitals.spo2 < t.spo2.dangerBelow) {
        isDanger = true;
        reasons.push(`Critical SpO2 (${Math.round(vitals.spo2)}% < ${t.spo2.dangerBelow}%)`);
      } else if (vitals.spo2 < t.spo2.mildBelow) {
        isMild = true;
        reasons.push(`Borderline SpO2 (${Math.round(vitals.spo2)}%)`);
      }
    }

    // Stress check
    if (vitals.stress !== null && vitals.stress !== undefined && vitals.stress > 0) {
      if (vitals.stress > t.stress.dangerAbove) {
        isDanger = true;
        reasons.push(`High Stress (${Math.round(vitals.stress)}/100)`);
      } else if (vitals.stress > t.stress.mildAbove) {
        isMild = true;
        reasons.push(`Moderate Stress (${Math.round(vitals.stress)}/100)`);
      }
    }

    if (isDanger) {
      return { level: 'danger', statusText: 'DANGER', reasons };
    }
    if (isMild) {
      return { level: 'mild', statusText: 'MILD', reasons };
    }
    return { level: 'good', statusText: 'GOOD', reasons: ['All physiological channels nominal'] };
  }
}
