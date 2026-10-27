// Hardware Device Interface & Biosensor Ingestion Modal
import { sound } from '../services/sound.js';
import { SerialService } from '../services/serialService.js';

export class HardwareModal {
  constructor(containerElement, bleService, serialService, rppgService, onSourceChanged) {
    this.container = containerElement;
    this.ble = bleService;
    this.serial = serialService;
    this.rppg = rppgService;
    this.onSourceChanged = onSourceChanged;

    this.activeTab = 'ble'; // ble, serial, rppg
    this.serialLogs = [];
  }

  open() {
    sound.playClick();
    this.render();
  }

  close() {
    // If rppg is running, stop it when modal closes unless user wants it active
    this.container.innerHTML = '';
  }

  render() {
    this.container.innerHTML = `
      <div class="hardware-backdrop">
        <div class="hardware-modal">
          <div class="hardware-header">
            <div class="hardware-title-group">
              <span class="hardware-badge"><i class="fa-solid fa-microchip"></i> HARDWARE I/O</span>
              <h2>Physical Biosensor & Wearable Device Interface</h2>
            </div>
            <button class="hardware-close-btn" id="hw-close-btn" aria-label="Close dialog">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Tab Bar -->
          <div class="hw-tab-bar">
            <button class="hw-tab-btn ${this.activeTab === 'ble' ? 'active' : ''}" data-tab="ble">
              <i class="fa-brands fa-bluetooth-b"></i> Web Bluetooth (BLE)
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'serial' ? 'active' : ''}" data-tab="serial">
              <i class="fa-brands fa-usb"></i> USB Serial (Arduino/ESP32)
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'rppg' ? 'active' : ''}" data-tab="rppg">
              <i class="fa-solid fa-camera"></i> Optical Camera (rPPG)
            </button>
          </div>

          <div class="hw-tab-content">
            <!-- TAB 1: Web Bluetooth -->
            <div class="hw-tab-pane ${this.activeTab === 'ble' ? 'active' : ''}" id="pane-ble">
              <div class="hw-pane-desc">
                Connect directly to Bluetooth Low Energy (BLE) medical sensors using the standard GATT Heart Rate Service (UUID 0x180D) and Pulse Oximeter Service (UUID 0x1822). Compatible with Polar H10, Garmin, Apple Watch, and custom nRF52/ESP32 BLE nodes.
              </div>

              <div class="hw-status-box" id="ble-status-box">
                <div class="hw-status-indicator ${this.ble.isConnected ? 'connected' : 'disconnected'}">
                  <i class="fa-solid fa-circle"></i>
                  <span>${this.ble.isConnected ? 'DEVICE CONNECTED' : 'READY TO SCAN'}</span>
                </div>
                <div class="hw-device-name" id="ble-device-name">
                  ${this.ble.device?.name || 'No BLE hardware paired'}
                </div>
              </div>

              <div class="hw-action-row">
                ${!this.ble.isConnected ? `
                  <button class="hw-connect-btn" id="btn-ble-connect">
                    <i class="fa-brands fa-bluetooth-b"></i> Scan & Pair BLE Sensor
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-ble-disconnect">
                    <i class="fa-solid fa-link-slash"></i> Disconnect Bluetooth Sensor
                  </button>
                `}
              </div>
            </div>

            <!-- TAB 2: Web Serial (Arduino/ESP32) -->
            <div class="hw-tab-pane ${this.activeTab === 'serial' ? 'active' : ''}" id="pane-serial">
              <div class="hw-pane-desc">
                Stream raw telemetry directly from USB microcontrollers (Arduino Uno, Nano, ESP32, STM32) interfaced with AD8232 ECG electrodes, MAX30102 pulse oximeter, and BME680 habitat gas sensors.
              </div>

              <div class="serial-config-row">
                <label for="serial-baud">Baud Rate:</label>
                <select id="serial-baud" class="hw-select">
                  <option value="115200" selected>115200 baud</option>
                  <option value="9600">9600 baud</option>
                  <option value="57600">57600 baud</option>
                </select>

                ${!this.serial.isConnected ? `
                  <button class="hw-connect-btn" id="btn-serial-connect">
                    <i class="fa-brands fa-usb"></i> Connect USB Port
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-serial-disconnect">
                    <i class="fa-solid fa-link-slash"></i> Close Serial Port
                  </button>
                `}

                <button class="hw-secondary-btn" id="btn-download-firmware">
                  <i class="fa-solid fa-file-code"></i> Download Arduino Firmware (.ino)
                </button>
              </div>

              <!-- Live Serial Terminal Monitor -->
              <div class="serial-terminal-wrap">
                <div class="terminal-header">
                  <span><i class="fa-solid fa-terminal"></i> LIVE SERIAL STREAM</span>
                  <span class="term-status">${this.serial.isConnected ? 'READING DATA' : 'PORT IDLE'}</span>
                </div>
                <pre class="terminal-output" id="serial-terminal-output">${this.serialLogs.slice(-10).join('\n') || '// Connect microcontroller to view incoming serial telemetry...'}</pre>
              </div>
            </div>

            <!-- TAB 3: Optical Camera rPPG -->
            <div class="hw-tab-pane ${this.activeTab === 'rppg' ? 'active' : ''}" id="pane-rppg">
              <div class="hw-pane-desc">
                Contactless / Fingertip Remote Photoplethysmography (rPPG). Measures microscopic fluctuations in optical hemoglobin green-light absorption via your camera to calculate real pulse and heart rate variability (HRV) with zero external hardware.
              </div>

              <div class="rppg-interface-layout">
                <div class="rppg-video-wrap">
                  <video id="rppg-video-preview" autoplay playsinline muted></video>
                  <div class="rppg-aim-guide">
                    <div class="aim-reticle"></div>
                    <span>Position face or fingertip over lens</span>
                  </div>
                </div>

                <div class="rppg-stats-side">
                  <div class="rppg-pulse-stat">
                    <span class="label">OPTICAL PULSE</span>
                    <span class="bpm-num" id="rppg-bpm-readout">${this.rppg.isRunning ? this.rppg.calculatedBpm : '--'}</span>
                    <span class="unit">BPM</span>
                  </div>

                  <div class="rppg-controls-row">
                    ${!this.rppg.isRunning ? `
                      <button class="hw-connect-btn" id="btn-rppg-start">
                        <i class="fa-solid fa-camera"></i> Activate Camera Sensor
                      </button>
                    ` : `
                      <button class="hw-disconnect-btn" id="btn-rppg-stop">
                        <i class="fa-solid fa-power-off"></i> Stop Optical Sensor
                      </button>
                    `}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="hardware-footer">
            <span class="hw-footer-note">
              <i class="fa-solid fa-shield-halved"></i> All biomedical telemetry streams locally into AURA-OS without external cloud transmission.
            </span>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const closeBtn = this.container.querySelector('#hw-close-btn');
    closeBtn.addEventListener('click', () => this.close());

    // Tab buttons
    this.container.querySelectorAll('.hw-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // 1. Bluetooth connect/disconnect
    const bleConnectBtn = this.container.querySelector('#btn-ble-connect');
    const bleDisconnectBtn = this.container.querySelector('#btn-ble-disconnect');

    if (bleConnectBtn) {
      bleConnectBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          const deviceName = await this.ble.connect();
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`Bluetooth Low Energy (${deviceName})`);
          }
          this.render();
        } catch (err) {
          // Handled in service
          this.render();
        }
      });
    }

    if (bleDisconnectBtn) {
      bleDisconnectBtn.addEventListener('click', () => {
        sound.playClick();
        this.ble.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    // 2. Serial connect/disconnect & firmware download
    const serialConnectBtn = this.container.querySelector('#btn-serial-connect');
    const serialDisconnectBtn = this.container.querySelector('#btn-serial-disconnect');
    const baudSelect = this.container.querySelector('#serial-baud');
    const dlFirmwareBtn = this.container.querySelector('#btn-download-firmware');

    if (serialConnectBtn) {
      serialConnectBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          const baud = baudSelect ? baudSelect.value : 115200;
          await this.serial.connect(baud);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`USB Serial (${baud} baud)`);
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (serialDisconnectBtn) {
      serialDisconnectBtn.addEventListener('click', async () => {
        sound.playClick();
        await this.serial.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    if (dlFirmwareBtn) {
      dlFirmwareBtn.addEventListener('click', () => {
        sound.playSuccess();
        const code = SerialService.getSampleArduinoCode();
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_OS_Biosensor_Firmware.ino';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // 3. rPPG camera start/stop
    const rppgStartBtn = this.container.querySelector('#btn-rppg-start');
    const rppgStopBtn = this.container.querySelector('#btn-rppg-stop');
    const videoPreview = this.container.querySelector('#rppg-video-preview');

    if (rppgStartBtn) {
      rppgStartBtn.addEventListener('click', async () => {
        try {
          sound.playClick();
          await this.rppg.start(videoPreview);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged('Webcam Optical rPPG Pulse Sensor');
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (rppgStopBtn) {
      rppgStopBtn.addEventListener('click', () => {
        sound.playClick();
        this.rppg.stop(videoPreview);
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }
  }

  logSerial(line) {
    this.serialLogs.push(line);
    if (this.serialLogs.length > 50) this.serialLogs.shift();
    const term = this.container.querySelector('#serial-terminal-output');
    if (term) {
      term.textContent = this.serialLogs.slice(-12).join('\n');
      term.scrollTop = term.scrollHeight;
    }
  }

  updateRppgBpm(bpm) {
    const el = this.container.querySelector('#rppg-bpm-readout');
    if (el) el.textContent = bpm;
  }
}
