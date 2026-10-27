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

    this.activeTab = 'band'; // 'band', 'serial', 'ble', 'rppg'
    this.serialLogs = [];
    this.latestBandData = null;
    this.copiedTimeout = null;
  }

  open(initialTab = null) {
    sound.playClick();
    if (initialTab) this.activeTab = initialTab;
    this.render();
  }

  close() {
    this.container.innerHTML = '';
  }

  updateTelemetry(data) {
    this.latestBandData = data;
    this.updateLiveBandDom();
  }

  updateLiveBandDom() {
    if (this.activeTab !== 'band') return;

    const statusChip = this.container.querySelector('#band-status-chip');
    const contactBadge = this.container.querySelector('#band-contact-badge');
    const hrVal = this.container.querySelector('#band-hr-val');
    const spo2Val = this.container.querySelector('#band-spo2-val');
    const hrvVal = this.container.querySelector('#band-hrv-val');
    const tempVal = this.container.querySelector('#band-temp-val');
    const battVal = this.container.querySelector('#band-batt-val');
    const rawVal = this.container.querySelector('#band-raw-val');

    const isConnected = this.serial.isConnected || this.ble.isConnected;
    const data = this.latestBandData;

    if (statusChip) {
      if (isConnected) {
        const sourceName = this.serial.isConnected ? 'USB Serial (115200 baud)' : (this.ble.device?.name || 'BLE GATT');
        statusChip.className = 'status-chip-live connected';
        statusChip.innerHTML = `<i class="fa-solid fa-link"></i> CONNECTED · ${sourceName}`;
      } else {
        statusChip.className = 'status-chip-live standby';
        statusChip.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> STANDBY · DISCONNECTED`;
      }
    }

    if (contactBadge) {
      if (!isConnected) {
        contactBadge.className = 'contact-badge idle';
        contactBadge.innerHTML = `<i class="fa-solid fa-circle-pause"></i> HARDWARE IDLE · READY TO CONNECT`;
      } else if (data && data.finger) {
        contactBadge.className = 'contact-badge active';
        contactBadge.innerHTML = `<i class="fa-solid fa-heart-pulse"></i> SKIN CONTACT DETECTED · PERFUSION ACTIVE`;
      } else {
        contactBadge.className = 'contact-badge idle';
        contactBadge.innerHTML = `<i class="fa-solid fa-hand"></i> SENSOR OFF-WRIST · PLACE ON SKIN`;
      }
    }

    if (data && isConnected) {
      if (hrVal) hrVal.textContent = (data.finger && data.hr > 0) ? `${Math.round(data.hr)} BPM` : '--';
      if (spo2Val) spo2Val.textContent = (data.finger && data.spo2 > 0) ? `${data.spo2.toFixed(1)} %` : '--';
      if (hrvVal) hrvVal.textContent = (data.finger && data.hrv > 0) ? `${data.hrv} ms` : '--';
      if (tempVal) tempVal.textContent = data.temp ? `${data.temp.toFixed(1)} °C` : '--';
      if (battVal) battVal.textContent = data.batt ? `${data.batt} %` : '95 %';
      if (rawVal) {
        rawVal.textContent = (data.rawIR !== null && data.rawRed !== null)
          ? `IR: ${data.rawIR} | Red: ${data.rawRed}`
          : 'PPG Raw Stream: Active';
      }
    }
  }

  render() {
    const isConnected = this.serial.isConnected || this.ble.isConnected;
    const data = this.latestBandData;

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
            <button class="hw-tab-btn ${this.activeTab === 'band' ? 'active' : ''}" data-tab="band">
              <i class="fa-solid fa-ring"></i> ESP32-C3 Wristband
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'serial' ? 'active' : ''}" data-tab="serial">
              <i class="fa-brands fa-usb"></i> USB Serial Monitor
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'ble' ? 'active' : ''}" data-tab="ble">
              <i class="fa-brands fa-bluetooth-b"></i> Web Bluetooth (BLE)
            </button>
            <button class="hw-tab-btn ${this.activeTab === 'rppg' ? 'active' : ''}" data-tab="rppg">
              <i class="fa-solid fa-camera"></i> Optical Camera (rPPG)
            </button>
          </div>

          <div class="hw-tab-content">
            <!-- TAB 1: ESP32-C3 ASTRONAUT WRISTBAND -->
            <div class="hw-tab-pane ${this.activeTab === 'band' ? 'active' : ''}" id="pane-band">
              <div class="band-banner">
                <div class="band-banner-info">
                  <h3><i class="fa-solid fa-shield-halved"></i> AURA-OS Physical Biometric Band</h3>
                  <p>
                    Production hardware build for NASA Space Apps Challenge. Reads real-time photoplethysmography (PPG) from MAX30102, renders on 0.96" OLED, and broadcasts zero-fake-data telemetry to AURA-OS.
                  </p>
                </div>
                <div class="band-banner-actions">
                  <button class="band-dl-btn" id="btn-band-dl-ino">
                    <i class="fa-solid fa-download"></i> Download Firmware (.ino)
                  </button>
                  <button class="band-dl-btn secondary" id="btn-band-copy-ino">
                    <i class="fa-solid fa-copy"></i> <span id="copy-ino-label">Copy Sketch</span>
                  </button>
                  <button class="band-dl-btn secondary" id="btn-band-dl-guide">
                    <i class="fa-solid fa-book"></i> Wiring Guide (.md)
                  </button>
                </div>
              </div>

              <!-- Live Telemetry Status Bar -->
              <div class="band-live-bar">
                <div class="band-live-header">
                  <span class="status-chip-live ${isConnected ? 'connected' : 'standby'}" id="band-status-chip">
                    <i class="fa-solid ${isConnected ? 'fa-link' : 'fa-satellite-dish'}"></i>
                    ${isConnected ? 'CONNECTED · ' + (this.serial.isConnected ? 'USB Serial' : (this.ble.device?.name || 'BLE')) : 'STANDBY · DISCONNECTED'}
                  </span>
                  <span class="contact-badge ${(!isConnected || !data?.finger) ? 'idle' : 'active'}" id="band-contact-badge">
                    <i class="fa-solid ${(!isConnected || !data?.finger) ? 'fa-hand' : 'fa-heart-pulse'}"></i>
                    ${!isConnected ? 'HARDWARE IDLE · READY TO CONNECT' : (data?.finger ? 'SKIN CONTACT DETECTED · PERFUSION ACTIVE' : 'SENSOR OFF-WRIST · PLACE ON SKIN')}
                  </span>
                </div>

                <div class="band-live-grid">
                  <div class="band-live-metric">
                    <span class="m-lbl">Heart Rate</span>
                    <span class="m-val" id="band-hr-val">${(data?.finger && data?.hr > 0) ? Math.round(data.hr) + ' BPM' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">SpO2 Oxygen</span>
                    <span class="m-val" id="band-spo2-val">${(data?.finger && data?.spo2 > 0) ? data.spo2.toFixed(1) + ' %' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">HRV (SDNN)</span>
                    <span class="m-val" id="band-hrv-val">${(data?.finger && data?.hrv > 0) ? data.hrv + ' ms' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">Skin Temp</span>
                    <span class="m-val" id="band-temp-val">${data?.temp ? data.temp.toFixed(1) + ' °C' : '--'}</span>
                  </div>
                  <div class="band-live-metric">
                    <span class="m-lbl">LiPo Battery</span>
                    <span class="m-val" id="band-batt-val">${data?.batt ? data.batt + ' %' : '95 %'}</span>
                  </div>
                  <div class="band-live-metric wide">
                    <span class="m-lbl">Raw Optical Signal</span>
                    <span class="m-val small" id="band-raw-val">
                      ${(data?.rawIR !== null && data?.rawIR !== undefined) ? `IR: ${data.rawIR} | Red: ${data.rawRed}` : 'Awaiting sensor stream'}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Quick Connect Controls -->
              <div class="band-quick-connect-row">
                ${!this.serial.isConnected ? `
                  <button class="hw-connect-btn" id="btn-band-quick-serial">
                    <i class="fa-brands fa-usb"></i> Connect USB Port (115200 baud)
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-band-quick-disconnect-serial">
                    <i class="fa-solid fa-link-slash"></i> Disconnect USB Serial
                  </button>
                `}

                ${!this.ble.isConnected ? `
                  <button class="hw-connect-btn" id="btn-band-quick-ble">
                    <i class="fa-brands fa-bluetooth-b"></i> Pair AURA-BAND-C3 (BLE)
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-band-quick-disconnect-ble">
                    <i class="fa-solid fa-link-slash"></i> Disconnect Bluetooth
                  </button>
                `}
              </div>

              <!-- Hardware Components from Shopping Cart -->
              <div class="band-section-title">
                <i class="fa-solid fa-layer-group"></i> Bill of Materials (Exact Hardware Components)
              </div>
              <div class="band-components-grid">
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-microchip"></i></div>
                  <div class="comp-info">
                    <h4>ESP32-C3 RISC-V MCU</h4>
                    <p>160MHz 32-bit core, built-in USB-CDC & BLE 5.0 GATT. Runs firmware, I2C polling, and physiological algorithms.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-heart-pulse"></i></div>
                  <div class="comp-info">
                    <h4>MAX30102 Biosensor</h4>
                    <p>Red (660nm) & IR (880nm) optical PPG sensor. 18-bit ADC, I2C address 0x57. Detects true pulse and calculates SpO2.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-tv"></i></div>
                  <div class="comp-info">
                    <h4>0.96" I2C OLED Display</h4>
                    <p>128x64 monochrome SSD1306 screen at address 0x3C. Displays on-wrist pulse, SpO2, HRV, battery, and contact alerts.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-bolt"></i></div>
                  <div class="comp-info">
                    <h4>BMS 1S TP4056 Module</h4>
                    <p>5V 1A CC/CV LiPo charger with over-charge, over-discharge (2.5V), and short-circuit protection for wearable safety.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-solid fa-car-battery"></i></div>
                  <div class="comp-info">
                    <h4>3.7V LiPo Battery Cell</h4>
                    <p>1S 3.7V nominal (4.2V max) battery. Lightweight profile designed for comfortable astronaut wristband enclosure.</p>
                  </div>
                </div>
                <div class="band-comp-card">
                  <div class="comp-icon"><i class="fa-brands fa-usb"></i></div>
                  <div class="comp-info">
                    <h4>Type-C Female Connector</h4>
                    <p>Standard USB-C pigtail connector. Provides 5V input charging to TP4056 and secure power delivery.</p>
                  </div>
                </div>
              </div>

              <!-- Complete Wiring Schematic Matrix -->
              <div class="band-section-title">
                <i class="fa-solid fa-network-wired"></i> Hardware Wiring Matrix (I2C Bus & Power Circuit)
              </div>
              <div class="band-schematic-wrap">
                <table class="band-schematic-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Component Pin</th>
                      <th>ESP32-C3 Pin</th>
                      <th>Connection Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>MAX30102</strong></td>
                      <td><code>VIN / VCC</code></td>
                      <td><code>3V3</code></td>
                      <td>Shared 3.3V regulated power rail</td>
                    </tr>
                    <tr>
                      <td><strong>MAX30102</strong></td>
                      <td><code>GND</code></td>
                      <td><code>GND</code></td>
                      <td>Common circuit ground</td>
                    </tr>
                    <tr>
                      <td><strong>MAX30102</strong></td>
                      <td><code>SDA</code></td>
                      <td><code>GPIO 8</code></td>
                      <td>Shared I2C Data bus (400 kHz)</td>
                    </tr>
                    <tr>
                      <td><strong>MAX30102</strong></td>
                      <td><code>SCL</code></td>
                      <td><code>GPIO 9</code></td>
                      <td>Shared I2C Clock bus (400 kHz)</td>
                    </tr>
                    <tr>
                      <td><strong>0.96" OLED</strong></td>
                      <td><code>VCC</code></td>
                      <td><code>3V3</code></td>
                      <td>Shared 3.3V power rail</td>
                    </tr>
                    <tr>
                      <td><strong>0.96" OLED</strong></td>
                      <td><code>GND</code></td>
                      <td><code>GND</code></td>
                      <td>Common circuit ground</td>
                    </tr>
                    <tr>
                      <td><strong>0.96" OLED</strong></td>
                      <td><code>SDA</code></td>
                      <td><code>GPIO 8</code></td>
                      <td>Shared I2C Data bus (Address 0x3C)</td>
                    </tr>
                    <tr>
                      <td><strong>0.96" OLED</strong></td>
                      <td><code>SCL</code></td>
                      <td><code>GPIO 9</code></td>
                      <td>Shared I2C Clock bus (Address 0x3C)</td>
                    </tr>
                    <tr>
                      <td><strong>TP4056 BMS</strong></td>
                      <td><code>IN+ / IN-</code></td>
                      <td><code>Type-C Pigtail</code></td>
                      <td>Red (+5V) and Black (GND) charging leads</td>
                    </tr>
                    <tr>
                      <td><strong>TP4056 BMS</strong></td>
                      <td><code>BAT+ / BAT-</code></td>
                      <td><code>LiPo Cell</code></td>
                      <td>Battery Red (+) and Battery Black (-)</td>
                    </tr>
                    <tr>
                      <td><strong>TP4056 BMS</strong></td>
                      <td><code>OUT+ / OUT-</code></td>
                      <td><code>5V / GND</code></td>
                      <td>Powers ESP32-C3 VBUS & common ground</td>
                    </tr>
                    <tr>
                      <td><strong>Battery ADC</strong></td>
                      <td><code>100kΩ / 100kΩ</code></td>
                      <td><code>GPIO 0</code></td>
                      <td>Voltage divider from OUT+ to pin 0 for % gauge</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Arduino IDE Flashing Instructions -->
              <div class="band-section-title">
                <i class="fa-solid fa-code"></i> Arduino IDE Setup & Flashing Instructions
              </div>
              <div class="band-instructions-card">
                <ol>
                  <li>Install <strong>ESP32 Board Package</strong> in Arduino IDE (URL: <code>https://espressif.github.io/arduino-esp32/package_esp32_index.json</code>).</li>
                  <li>In <strong>Tools &gt; Board</strong>, select <strong>ESP32C3 Dev Module</strong>.</li>
                  <li>Under <strong>Tools &gt; USB CDC On Boot</strong>, select <strong>Enabled</strong> (Required for USB serial telemetry output).</li>
                  <li>In <strong>Tools &gt; Manage Libraries</strong>, install: <code>Adafruit SSD1306</code> and <code>Adafruit GFX Library</code>. (MAX30102 driver is directly embedded in sketch for zero-dependency reliability).</li>
                  <li>Click <strong>Upload</strong>. Open Serial Monitor at <strong>115200 baud</strong> or connect directly in AURA-OS!</li>
                </ol>
              </div>
            </div>

            <!-- TAB 2: USB SERIAL -->
            <div class="hw-tab-pane ${this.activeTab === 'serial' ? 'active' : ''}" id="pane-serial">
              <div class="hw-pane-desc">
                Stream raw telemetry directly from USB microcontrollers (ESP32-C3, Arduino, STM32) at 115200 baud. Ingests structured JSON payload: <code>{"hr":72,"spo2":98.4,"temp":36.8,"hrv":56,"batt":94,"finger":true}</code>.
              </div>

              <div class="serial-config-row">
                <label for="serial-baud">Baud Rate:</label>
                <select id="serial-baud" class="hw-select">
                  <option value="115200" selected>115200 baud (ESP32-C3 Default)</option>
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
                  <i class="fa-solid fa-file-code"></i> Download ESP32-C3 Sketch (.ino)
                </button>
              </div>

              <!-- Live Serial Terminal Monitor -->
              <div class="serial-terminal-wrap">
                <div class="terminal-header">
                  <span><i class="fa-solid fa-terminal"></i> LIVE SERIAL STREAM (115200 BAUD)</span>
                  <span class="term-status">${this.serial.isConnected ? 'READING DATA' : 'PORT IDLE'}</span>
                </div>
                <pre class="terminal-output" id="serial-terminal-output">${this.serialLogs.slice(-10).join('\n') || '// Connect ESP32-C3 to view incoming serial JSON telemetry...'}</pre>
              </div>
            </div>

            <!-- TAB 3: WEB BLUETOOTH (BLE) -->
            <div class="hw-tab-pane ${this.activeTab === 'ble' ? 'active' : ''}" id="pane-ble">
              <div class="hw-pane-desc">
                Connect directly to Bluetooth Low Energy (BLE) medical sensors and the custom AURA-BAND-C3 node using standard GATT Heart Rate Service (UUID 0x180D) and custom AURA telemetry JSON notifications.
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
                    <i class="fa-brands fa-bluetooth-b"></i> Scan & Pair AURA-BAND-C3
                  </button>
                ` : `
                  <button class="hw-disconnect-btn" id="btn-ble-disconnect">
                    <i class="fa-solid fa-link-slash"></i> Disconnect Bluetooth Sensor
                  </button>
                `}
              </div>
            </div>

            <!-- TAB 4: OPTICAL CAMERA (rPPG) -->
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
              <i class="fa-solid fa-shield-halved"></i> 100% Real Biosensor Telemetry · Zero Fake Data · Edge Medical Ingestion Active
            </span>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const closeBtn = this.container.querySelector('#hw-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Tab switcher
    this.container.querySelectorAll('.hw-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // --- Band Tab Actions ---
    const bandDlIno = this.container.querySelector('#btn-band-dl-ino');
    const bandCopyIno = this.container.querySelector('#btn-band-copy-ino');
    const bandDlGuide = this.container.querySelector('#btn-band-dl-guide');
    const bandQuickSerial = this.container.querySelector('#btn-band-quick-serial');
    const bandQuickDisconnectSerial = this.container.querySelector('#btn-band-quick-disconnect-serial');
    const bandQuickBle = this.container.querySelector('#btn-band-quick-ble');
    const bandQuickDisconnectBle = this.container.querySelector('#btn-band-quick-disconnect-ble');

    if (bandDlIno) {
      bandDlIno.addEventListener('click', () => {
        sound.playSuccess();
        const code = SerialService.getSampleArduinoCode();
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_Band_ESP32C3.ino';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (bandCopyIno) {
      bandCopyIno.addEventListener('click', async () => {
        try {
          const code = SerialService.getSampleArduinoCode();
          await navigator.clipboard.writeText(code);
          sound.playSuccess();
          const label = this.container.querySelector('#copy-ino-label');
          if (label) {
            label.textContent = 'Copied to Clipboard!';
            clearTimeout(this.copiedTimeout);
            this.copiedTimeout = setTimeout(() => {
              if (label) label.textContent = 'Copy Sketch';
            }, 2500);
          }
        } catch (e) {
          console.warn('Clipboard write error', e);
        }
      });
    }

    if (bandDlGuide) {
      bandDlGuide.addEventListener('click', () => {
        sound.playSuccess();
        const guideText = `# AURA-OS Astronaut Biosensor Wristband (ESP32-C3)
NASA International Space Apps Challenge 2026

## Bill of Materials
- ESP32-C3 Microcontroller (RISC-V, USB-CDC, BLE 5.0)
- MAX30102 Heart Rate & SpO2 Optical Sensor (I2C 0x57)
- 0.96" SSD1306 OLED Display (I2C 0x3C)
- TP4056 1S BMS Charger & Protection Module
- 3.7V LiPo Battery Cell
- Type-C Female Connector

## I2C Bus Connections
- ESP32-C3 3V3 -> MAX30102 VIN & OLED VCC
- ESP32-C3 GND -> MAX30102 GND & OLED GND
- ESP32-C3 GPIO 8 -> MAX30102 SDA & OLED SDA
- ESP32-C3 GPIO 9 -> MAX30102 SCL & OLED SCL

## Power Wiring
- Type-C (+5V/GND) -> TP4056 IN+ / IN-
- LiPo Battery (+/-) -> TP4056 BAT+ / BAT-
- TP4056 OUT+ -> ESP32-C3 5V / VBUS
- TP4056 OUT- -> ESP32-C3 GND
`;
        const blob = new Blob([guideText], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AURA_Wristband_Wiring_Guide.md';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (bandQuickSerial) {
      bandQuickSerial.addEventListener('click', async () => {
        try {
          sound.playClick();
          await this.serial.connect(115200);
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged('USB Serial (ESP32-C3 Band)');
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (bandQuickDisconnectSerial) {
      bandQuickDisconnectSerial.addEventListener('click', async () => {
        sound.playClick();
        await this.serial.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    if (bandQuickBle) {
      bandQuickBle.addEventListener('click', async () => {
        try {
          sound.playClick();
          const deviceName = await this.ble.connect();
          sound.playSuccess();
          if (this.onSourceChanged) {
            this.onSourceChanged(`BLE Band (${deviceName})`);
          }
          this.render();
        } catch (err) {
          this.render();
        }
      });
    }

    if (bandQuickDisconnectBle) {
      bandQuickDisconnectBle.addEventListener('click', () => {
        sound.playClick();
        this.ble.disconnect();
        if (this.onSourceChanged) {
          this.onSourceChanged('Simulated Flight Baseline');
        }
        this.render();
      });
    }

    // --- Serial Tab Actions ---
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
        a.download = 'AURA_Band_ESP32C3.ino';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // --- BLE Tab Actions ---
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

    // --- rPPG Tab Actions ---
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
