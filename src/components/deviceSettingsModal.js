/**
 * ORBITA Device Settings & Multi-Watch / User Manager Modal
 * Allows renaming individual watches, switching active watch,
 * pairing new BLE watches via Web Bluetooth, inspecting hardware details,
 * configuring clinical health thresholds, and managing Subject / User profiles.
 */

export class DeviceSettingsModal {
  constructor(mountElement, deviceManager, userManager, bleService, onSavedCallback, onOpenAddUserCallback) {
    this.container = mountElement;
    this.deviceManager = deviceManager;
    this.userManager = userManager;
    this.bleService = bleService;
    this.onSaved = onSavedCallback;
    this.onOpenAddUser = onOpenAddUserCallback;
    this.isOpen = false;
  }

  open() {
    this.isOpen = true;
    this.render();
  }

  close() {
    this.isOpen = false;
    this.container.innerHTML = '';
  }

  render() {
    const devices = this.deviceManager.getAllDevices();
    const activeDev = this.deviceManager.getActiveDevice();
    const users = this.userManager ? this.userManager.getAllUsers() : [];
    const activeUser = this.userManager ? this.userManager.getActiveUser() : null;
    const th = this.deviceManager.thresholds;
    const ws = this.bleService?.watchState || {};

    // Device cards HTML
    const deviceCardsHtml = devices.map((dev) => {
      const isActive = activeDev && activeDev.id === dev.id;
      const isConnected = dev.connected || (dev.sourceType === 'bridge' && Boolean(ws.connected));
      const battVal = ws.batt ?? dev.activity?.batt;

      return `
        <div class="settings-device-card ${isActive ? 'card-active-device' : ''}" data-device-id="${dev.id}">
          <div class="card-header-row">
            <div class="card-title-group">
              <span class="status-indicator-dot ${isConnected ? 'dot-online' : 'dot-offline'}"></span>
              <strong class="card-orig-name">${dev.defaultName}</strong>
              ${isActive ? '<span class="active-badge">[ ACTIVE WATCH ]</span>' : ''}
            </div>
            <div class="card-batt-info">
              <i class="fa-solid fa-battery-three-quarters"></i>
              <span>${battVal !== null && battVal !== undefined ? `${battVal}%` : '--'}</span>
            </div>
          </div>

          <!-- Rename Input Group -->
          <div class="device-rename-row">
            <label class="rename-label" for="rename-input-${dev.id}">WATCH NAME:</label>
            <div class="rename-input-wrap">
              <input type="text" id="rename-input-${dev.id}" class="rename-input" value="${this.escapeHtml(dev.customName)}" placeholder="e.g. Orbita Alpha" />
              <button class="save-name-btn" data-device-id="${dev.id}">
                <i class="fa-solid fa-check"></i> SAVE
              </button>
            </div>
          </div>

          <!-- Device Hardware Specs -->
          <div class="device-meta-specs">
            <div class="meta-item"><span class="m-lbl">MAC/ADDR:</span> <span class="m-val">${ws.address || dev.address || 'CoreBluetooth Bridge'}</span></div>
            <div class="meta-item"><span class="m-lbl">FW/HW:</span> <span class="m-val">${ws.firmwareRevision || 'V1.0.7.32'} / ${ws.hardwareRevision || 'V0.62.18.49'}</span></div>
            <div class="meta-item"><span class="m-lbl">LINK:</span> <span class="m-val">${dev.sourceType === 'bridge' ? 'Local Bridge (127.0.0.1:8766)' : 'Web Bluetooth GATT'}</span></div>
          </div>

          <!-- Action Buttons -->
          <div class="device-card-actions">
            ${!isActive ? `
              <button class="action-btn-small btn-set-active" data-device-id="${dev.id}">
                <i class="fa-solid fa-crosshairs"></i> SET AS ACTIVE WATCH
              </button>` : `
              <button class="action-btn-small btn-already-active" disabled>
                <i class="fa-solid fa-check"></i> CURRENTLY ACTIVE
              </button>`
            }
            <button class="action-btn-small btn-ping-device" data-device-id="${dev.id}">
              <i class="fa-solid fa-bell"></i> PING ALERT
            </button>
          </div>
        </div>
      `;
    }).join('');

    // User cards HTML
    const userCardsHtml = users.map((user) => {
      const isUserActive = activeUser && activeUser.id === user.id;
      const userAssignedDev = user.assignedDeviceId ? this.deviceManager.devices.get(user.assignedDeviceId) : null;
      const isUserConn = userAssignedDev && (userAssignedDev.connected || (userAssignedDev.sourceType === 'bridge' && Boolean(ws.connected)));

      const deviceSelectOpts = `
        <option value="">-- Unassigned (Standby) --</option>
        ${devices.map((d) => `<option value="${d.id}" ${d.id === user.assignedDeviceId ? 'selected' : ''}>${this.escapeHtml(d.customName)} (${d.defaultName})</option>`).join('')}
      `;

      return `
        <div class="settings-user-card ${isUserActive ? 'card-active-user' : ''}" data-user-id="${user.id}">
          <div class="card-header-row">
            <div class="card-title-group">
              <span class="status-indicator-dot ${isUserConn ? 'dot-online' : 'dot-offline'}"></span>
              <strong class="card-orig-name"><i class="fa-solid fa-user"></i> ${this.escapeHtml(user.name)}</strong>
              <span class="user-role-tag">${this.escapeHtml(user.role || 'Subject')}</span>
              ${isUserActive ? '<span class="active-badge">[ ACTIVE SUBJECT ]</span>' : ''}
            </div>
            <div class="card-user-actions">
              ${!isUserActive ? `
                <button class="action-btn-small btn-switch-user" data-user-id="${user.id}">
                  <i class="fa-solid fa-circle-check"></i> SELECT
                </button>` : ''
              }
              ${users.length > 1 ? `
                <button class="action-btn-small btn-delete-user" data-user-id="${user.id}" title="Remove user profile">
                  <i class="fa-solid fa-trash-can"></i>
                </button>` : ''
              }
            </div>
          </div>

          <div class="user-card-body-row">
            <div class="user-field-group">
              <label class="rename-label">NAME:</label>
              <input type="text" class="rename-input user-rename-input" data-user-id="${user.id}" value="${this.escapeHtml(user.name)}" />
            </div>
            <div class="user-field-group">
              <label class="rename-label">ROLE:</label>
              <input type="text" class="rename-input user-role-input" data-user-id="${user.id}" value="${this.escapeHtml(user.role || '')}" />
            </div>
            <div class="user-field-group device-link-group">
              <label class="rename-label">ASSIGNED WATCH:</label>
              <select class="form-select user-device-select" data-user-id="${user.id}">
                ${deviceSelectOpts}
              </select>
            </div>
            <button class="save-name-btn save-user-btn" data-user-id="${user.id}">
              <i class="fa-solid fa-floppy-disk"></i> UPDATE
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="modal-backdrop" id="settings-backdrop">
        <div class="modal-window settings-modal-window">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <h2><i class="fa-solid fa-sliders"></i> // ORBITA SYSTEM & USER SETTINGS</h2>
              <span class="modal-sub">[ USER PROFILES · MULTI-WATCH CONFIGURATION · THRESHOLDS ]</span>
            </div>
            <button class="modal-close-btn" id="btn-close-settings" title="Close Settings">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="modal-body settings-modal-body">
            <!-- SECTION 1: Subject / User Profiles -->
            <div class="settings-section">
              <div class="section-title-row">
                <h3><i class="fa-solid fa-users"></i> SUBJECT / USER PROFILES</h3>
                <div class="section-header-actions">
                  <button class="action-btn-small btn-primary-highlight" id="btn-modal-add-user">
                    <i class="fa-solid fa-user-plus"></i> ADD USER
                  </button>
                </div>
              </div>
              <p class="section-desc">Manage astronaut / patient profiles, select active user, and map wearable watches to specific users.</p>
              
              <div class="users-cards-list">
                ${userCardsHtml}
              </div>
            </div>

            <!-- SECTION 2: Connected Watches List -->
            <div class="settings-section">
              <div class="section-title-row">
                <h3><i class="fa-solid fa-clock"></i> CONNECTED ORBITA WATCHES</h3>
                <span class="section-badge">${devices.length} REGISTERED</span>
              </div>
              <p class="section-desc">Each watch has an independent hardware address, custom name, and live telemetry channel.</p>
              
              <div class="devices-cards-list">
                ${deviceCardsHtml}
              </div>
            </div>

            <!-- SECTION 3: Pair Additional Watch -->
            <div class="settings-section">
              <div class="section-title-row">
                <h3><i class="fa-brands fa-bluetooth-b"></i> CONNECT ADDITIONAL WATCH</h3>
              </div>
              <div class="pair-actions-row">
                <button class="pair-watch-btn" id="btn-pair-ble">
                  <i class="fa-brands fa-bluetooth-b"></i> PAIR WATCH VIA WEB BLUETOOTH
                </button>
                <button class="pair-watch-btn pair-secondary" id="btn-reconnect-bridge">
                  <i class="fa-solid fa-rotate"></i> RECONNECT LOCAL BRIDGE
                </button>
              </div>
              <div id="pair-status-msg" class="pair-status-text"></div>
            </div>

            <!-- SECTION 4: Clinical Health Thresholds -->
            <div class="settings-section">
              <div class="section-title-row">
                <h3><i class="fa-solid fa-heart-circle-bolt"></i> HEALTH CLASSIFICATION THRESHOLDS</h3>
              </div>
              <p class="section-desc">Configures clinical safety bounds (GOOD, MILD, DANGER) displayed in the terminal logger and anatomical figure.</p>

              <div class="thresholds-grid">
                <!-- Heart Rate -->
                <div class="threshold-card">
                  <h4><i class="fa-solid fa-heart-pulse"></i> HEART RATE (BPM)</h4>
                  <div class="thresh-row">
                    <label>Danger High (>):</label>
                    <input type="number" id="th-hr-danger-high" value="${th.hr.maxDanger}" min="80" max="220" />
                  </div>
                  <div class="thresh-row">
                    <label>Mild High (>):</label>
                    <input type="number" id="th-hr-mild-high" value="${th.hr.maxMild}" min="70" max="150" />
                  </div>
                  <div class="thresh-row">
                    <label>Danger Low (<):</label>
                    <input type="number" id="th-hr-danger-low" value="${th.hr.minDanger}" min="30" max="60" />
                  </div>
                </div>

                <!-- Blood Oxygen SpO2 -->
                <div class="threshold-card">
                  <h4><i class="fa-solid fa-lungs"></i> BLOOD OXYGEN SpO₂ (%)</h4>
                  <div class="thresh-row">
                    <label>Mild Alert (<):</label>
                    <input type="number" id="th-spo2-mild" value="${th.spo2.mildBelow}" min="85" max="98" />
                  </div>
                  <div class="thresh-row">
                    <label>Danger Critical (<):</label>
                    <input type="number" id="th-spo2-danger" value="${th.spo2.dangerBelow}" min="75" max="95" />
                  </div>
                </div>

                <!-- Stress Index -->
                <div class="threshold-card">
                  <h4><i class="fa-solid fa-gauge-high"></i> AUTONOMIC STRESS (/100)</h4>
                  <div class="thresh-row">
                    <label>Mild Stress (>):</label>
                    <input type="number" id="th-stress-mild" value="${th.stress.mildAbove}" min="20" max="60" />
                  </div>
                  <div class="thresh-row">
                    <label>Danger Stress (>):</label>
                    <input type="number" id="th-stress-danger" value="${th.stress.dangerAbove}" min="50" max="90" />
                  </div>
                </div>
              </div>

              <div class="threshold-save-row">
                <button class="save-thresholds-btn" id="btn-save-thresholds">
                  <i class="fa-solid fa-floppy-disk"></i> SAVE THRESHOLD BOUNDS
                </button>
                <span id="thresh-saved-badge" class="thresh-status-badge"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = this.container.querySelector('#settings-backdrop');
    const closeBtn = this.container.querySelector('#btn-close-settings');

    const handleClose = () => this.close();
    closeBtn?.addEventListener('click', handleClose);
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) handleClose();
    });

    // Modal Add User button
    this.container.querySelector('#btn-modal-add-user')?.addEventListener('click', () => {
      this.close();
      if (this.onOpenAddUser) this.onOpenAddUser();
    });

    // Update user button
    this.container.querySelectorAll('.save-user-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        const nameInput = this.container.querySelector(`.user-rename-input[data-user-id="${userId}"]`);
        const roleInput = this.container.querySelector(`.user-role-input[data-user-id="${userId}"]`);
        const devSelect = this.container.querySelector(`.user-device-select[data-user-id="${userId}"]`);

        if (this.userManager && userId) {
          this.userManager.updateUser(userId, {
            name: nameInput ? nameInput.value : '',
            role: roleInput ? roleInput.value : '',
            assignedDeviceId: devSelect ? devSelect.value : null
          });
          btn.innerHTML = '<i class="fa-solid fa-check"></i> SAVED';
          setTimeout(() => {
            if (this.isOpen) this.render();
          }, 600);
          if (this.onSaved) this.onSaved();
        }
      });
    });

    // Switch user
    this.container.querySelectorAll('.btn-switch-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        if (this.userManager && userId) {
          this.userManager.setActiveUser(userId);
          if (this.isOpen) this.render();
          if (this.onSaved) this.onSaved();
        }
      });
    });

    // Delete user
    this.container.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        if (this.userManager && userId) {
          if (confirm('Are you sure you want to delete this user profile?')) {
            this.userManager.deleteUser(userId);
            if (this.isOpen) this.render();
            if (this.onSaved) this.onSaved();
          }
        }
      });
    });

    // Rename Watch buttons
    this.container.querySelectorAll('.save-name-btn[data-device-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const devId = btn.dataset.deviceId;
        const input = this.container.querySelector(`#rename-input-${devId}`);
        if (input && devId) {
          this.deviceManager.renameDevice(devId, input.value);
          btn.innerHTML = '<i class="fa-solid fa-check"></i> SAVED';
          setTimeout(() => {
            if (this.isOpen) this.render();
          }, 600);
          if (this.onSaved) this.onSaved();
        }
      });
    });

    // Set Active Device
    this.container.querySelectorAll('.btn-set-active').forEach((btn) => {
      btn.addEventListener('click', () => {
        const devId = btn.dataset.deviceId;
        if (devId) {
          this.deviceManager.setActiveDevice(devId);
          if (this.isOpen) this.render();
          if (this.onSaved) this.onSaved();
        }
      });
    });

    // Ping device
    this.container.querySelectorAll('.btn-ping-device').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PINGING...';
        try {
          if (this.bleService?.sendWatchAlert) {
            await this.bleService.sendWatchAlert('ORBITA PING: SYSTEM LINK VERIFIED');
          }
          btn.innerHTML = '<i class="fa-solid fa-check"></i> SENT';
        } catch (_) {
          btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ERROR';
        }
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-bell"></i> PING ALERT';
        }, 1500);
      });
    });

    // Pair via Web Bluetooth
    const pairBleBtn = this.container.querySelector('#btn-pair-ble');
    const statusMsg = this.container.querySelector('#pair-status-msg');
    if (pairBleBtn) {
      pairBleBtn.addEventListener('click', async () => {
        if (!navigator.bluetooth) {
          if (statusMsg) {
            statusMsg.textContent = 'Web Bluetooth is not supported or enabled in this browser (use Chrome, Edge, or Brave).';
            statusMsg.style.color = '#ef4444';
          }
          return;
        }

        pairBleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SCANNING...';
        try {
          const device = await navigator.bluetooth.requestDevice({
            filters: [
              { services: ['heart_rate'] },
              { namePrefix: 'Amazfit' },
              { namePrefix: 'Orbita' },
              { namePrefix: 'Mi ' }
            ],
            optionalServices: ['battery_service', '0000fee0-0000-1000-8000-00805f9b34fb']
          });

          const newId = `orbita-ble-${device.id || Date.now()}`;
          this.deviceManager.registerDevice({
            id: newId,
            defaultName: device.name || 'Bluetooth Wearable',
            sourceType: 'web_ble',
            address: device.id
          });
          this.deviceManager.setActiveDevice(newId);

          if (statusMsg) {
            statusMsg.textContent = `Paired ${device.name || 'Device'} successfully!`;
            statusMsg.style.color = '#10b981';
          }
          this.render();
          if (this.onSaved) this.onSaved();
        } catch (err) {
          if (statusMsg) {
            statusMsg.textContent = err.name === 'NotFoundError' ? 'Pairing cancelled.' : `Error: ${err.message}`;
            statusMsg.style.color = '#f59e0b';
          }
          pairBleBtn.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> PAIR WATCH VIA WEB BLUETOOTH';
        }
      });
    }

    // Reconnect Bridge
    const bridgeBtn = this.container.querySelector('#btn-reconnect-bridge');
    if (bridgeBtn) {
      bridgeBtn.addEventListener('click', async () => {
        bridgeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CONNECTING...';
        if (this.bleService?.autoConnectBridge) {
          await this.bleService.autoConnectBridge();
        }
        bridgeBtn.innerHTML = '<i class="fa-solid fa-check"></i> BRIDGE LINKED';
        setTimeout(() => {
          this.render();
          if (this.onSaved) this.onSaved();
        }, 800);
      });
    }

    // Save Thresholds
    const saveThBtn = this.container.querySelector('#btn-save-thresholds');
    const savedBadge = this.container.querySelector('#thresh-saved-badge');
    if (saveThBtn) {
      saveThBtn.addEventListener('click', () => {
        const hrMaxDanger = Number(this.container.querySelector('#th-hr-danger-high')?.value) || 105;
        const hrMaxMild = Number(this.container.querySelector('#th-hr-mild-high')?.value) || 90;
        const hrMinDanger = Number(this.container.querySelector('#th-hr-danger-low')?.value) || 50;
        const spo2Mild = Number(this.container.querySelector('#th-spo2-mild')?.value) || 95;
        const spo2Danger = Number(this.container.querySelector('#th-spo2-danger')?.value) || 93;
        const stressMild = Number(this.container.querySelector('#th-stress-mild')?.value) || 40;
        const stressDanger = Number(this.container.querySelector('#th-stress-danger')?.value) || 65;

        this.deviceManager.saveThresholds({
          hr: { minDanger: hrMinDanger, minMild: 58, maxMild: hrMaxMild, maxDanger: hrMaxDanger },
          spo2: { dangerBelow: spo2Danger, mildBelow: spo2Mild },
          stress: { mildAbove: stressMild, dangerAbove: stressDanger }
        });

        if (savedBadge) {
          savedBadge.textContent = 'Thresholds updated successfully!';
          savedBadge.style.color = '#10b981';
          setTimeout(() => {
            savedBadge.textContent = '';
          }, 3000);
        }
        if (this.onSaved) this.onSaved();
      });
    }
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
