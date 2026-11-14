/**
 * ORBITA Add User Modal
 * Interactive modal to register a new user/subject profile,
 * assign a wearable Orbita watch or pair a new Web Bluetooth device.
 */

export class AddUserModal {
  constructor(mountElement, userManager, deviceManager, bleService, onUserCreated) {
    this.container = mountElement;
    this.userManager = userManager;
    this.deviceManager = deviceManager;
    this.bleService = bleService;
    this.onUserCreated = onUserCreated;
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
    const ws = this.bleService?.watchState || {};

    const deviceOptionsHtml = devices.map((d) => {
      const isConnected = d.connected || (d.sourceType === 'bridge' && Boolean(ws.connected));
      const connTag = isConnected ? '● ONLINE' : '○ STANDBY';
      return `<option value="${d.id}">${this.escapeHtml(d.customName)} (${d.defaultName} - ${connTag})</option>`;
    }).join('');

    this.container.innerHTML = `
      <div class="modal-backdrop" id="add-user-backdrop">
        <div class="modal-window add-user-modal-window">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <h2><i class="fa-solid fa-user-plus"></i> // REGISTER NEW USER PROFILE</h2>
              <span class="modal-sub">[ BIOMETRIC SUBJECT ONBOARDING ]</span>
            </div>
            <button class="modal-close-btn" id="btn-close-add-user" title="Close Modal">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="add-user-form" class="modal-form">
            <div class="form-section">
              <label class="form-label" for="input-user-name">
                <i class="fa-solid fa-id-card"></i> FULL NAME / SUBJECT IDENTIFIER *
              </label>
              <input
                type="text"
                id="input-user-name"
                class="form-input"
                placeholder="e.g. Dr. Marcus Vance, Elena Rostova, User 2"
                required
                autofocus
              />
            </div>

            <div class="form-section">
              <label class="form-label" for="input-user-role">
                <i class="fa-solid fa-user-astronaut"></i> ROLE / MISSION TITLE
              </label>
              <input
                type="text"
                id="input-user-role"
                class="form-input"
                placeholder="e.g. Commander, Flight Engineer, Biometric Subject"
                value="Biometric Subject"
              />
            </div>

            <div class="form-section">
              <label class="form-label" for="select-user-device">
                <i class="fa-solid fa-clock"></i> ASSIGNED ORBITA WATCH
              </label>
              <div class="device-select-row">
                <select id="select-user-device" class="form-select">
                  ${deviceOptionsHtml}
                  <option value="">-- No Device Assigned (Standby) --</option>
                </select>
                <button type="button" class="action-btn-small" id="btn-pair-new-ble" title="Scan and pair a new Web Bluetooth device">
                  <i class="fa-brands fa-bluetooth-b"></i> PAIR NEW BLE
                </button>
              </div>
              <div class="form-hint" id="pair-ble-status">Select an existing watch or pair an additional Bluetooth device.</div>
            </div>

            <div class="modal-actions-footer">
              <button type="button" class="modal-btn-secondary" id="btn-cancel-add-user">
                CANCEL
              </button>
              <button type="submit" class="modal-btn-primary" id="btn-submit-add-user">
                <i class="fa-solid fa-check"></i> CREATE USER & MONITOR
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const backdrop = this.container.querySelector('#add-user-backdrop');
    const closeBtn = this.container.querySelector('#btn-close-add-user');
    const cancelBtn = this.container.querySelector('#btn-cancel-add-user');
    const form = this.container.querySelector('#add-user-form');
    const pairBleBtn = this.container.querySelector('#btn-pair-new-ble');
    const bleStatus = this.container.querySelector('#pair-ble-status');

    const handleClose = () => this.close();

    closeBtn?.addEventListener('click', handleClose);
    cancelBtn?.addEventListener('click', handleClose);
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) handleClose();
    });

    // Pair new BLE device from inside add user modal
    pairBleBtn?.addEventListener('click', async () => {
      if (!navigator.bluetooth) {
        if (bleStatus) bleStatus.innerHTML = '<span style="color:#ef4444;">Web Bluetooth is not supported in this browser.</span>';
        return;
      }
      try {
        if (bleStatus) bleStatus.innerHTML = '<span style="color:#38bdf8;">Opening Bluetooth device picker...</span>';
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['heart_rate', 'battery_service', '0000fee0-0000-1000-8000-00805f9b34fb']
        });

        const newId = 'ble-' + (device.id || Date.now());
        const devName = device.name || 'Orbita Bluetooth Watch';
        const registered = this.deviceManager.registerDevice({
          id: newId,
          defaultName: devName,
          sourceType: 'web-ble',
          address: device.id
        });

        if (bleStatus) {
          bleStatus.innerHTML = `<span style="color:#10b981;">✓ Paired: ${this.escapeHtml(registered.customName)}</span>`;
        }

        // Re-render select with newly added watch
        const select = this.container.querySelector('#select-user-device');
        if (select) {
          const opt = document.createElement('option');
          opt.value = registered.id;
          opt.textContent = `${registered.customName} (${registered.defaultName} - ● ONLINE)`;
          opt.selected = true;
          select.prepend(opt);
        }
      } catch (err) {
        if (bleStatus) bleStatus.innerHTML = `<span style="color:#f59e0b;">Pairing cancelled: ${this.escapeHtml(err.message || '')}</span>`;
      }
    });

    // Submit form
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = this.container.querySelector('#input-user-name');
      const roleInput = this.container.querySelector('#input-user-role');
      const deviceSelect = this.container.querySelector('#select-user-device');

      const name = nameInput ? nameInput.value : '';
      const role = roleInput ? roleInput.value : '';
      const assignedDeviceId = deviceSelect ? deviceSelect.value : null;

      if (!name.trim()) return;

      const newUser = this.userManager.addUser({
        name,
        role,
        assignedDeviceId: assignedDeviceId || null
      });

      this.close();

      if (this.onUserCreated) {
        this.onUserCreated(newUser);
      }
    });
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
