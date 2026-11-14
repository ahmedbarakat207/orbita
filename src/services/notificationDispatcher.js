/**
 * ORBITA Real-Time Notification & Emergency Dispatcher
 * Multi-channel critical alert engine:
 * 1. OS / Browser Native Desktop Notifications (Notification API)
 * 2. Physical Watch Haptic Vibration & OLED Text Alert (BLE / Bridge)
 * 3. Synthesized Biomedical Emergency Audio Alarm (Web Audio API)
 * 4. High-Visibility On-Screen Danger HUD Banner & Floating Toast
 */

import { sound } from './sound.js';

export class NotificationDispatcher {
  constructor(bleService) {
    this.bleService = bleService;
    this.lastDangerTime = 0;
    this.dangerCooldownMs = 12000; // Throttle watch buzz & OS push to once every 12s
    this.activeDangerState = false;
    this.isSnoozed = false;
    this.snoozeUntil = 0;
    this.soundEnabled = true;

    // Check notification permission state
    this.permissionState = ('Notification' in window) ? Notification.permission : 'unsupported';

    // Mount banner container in DOM
    this.initBannerDom();

    // Auto-request notification permission if not yet decided
    if (this.permissionState === 'default') {
      // We can request or prompt user
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      this.permissionState = 'unsupported';
      return 'unsupported';
    }
    try {
      const perm = await Notification.requestPermission();
      this.permissionState = perm;
      return perm;
    } catch (_) {
      this.permissionState = Notification.permission;
      return this.permissionState;
    }
  }

  initBannerDom() {
    let mount = document.querySelector('#orbita-alert-banner-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'orbita-alert-banner-mount';
      mount.className = 'orbita-alert-banner-mount';
      document.body.prepend(mount);
    }
    this.bannerMount = mount;
  }

  /**
   * Handle incoming health evaluation
   * @param {Object} options
   * @param {string} options.userName - Monitored Subject Name
   * @param {string} options.deviceName - Watch Name
   * @param {Object} options.vitals - Live vitals
   * @param {Object} options.healthEval - Result from evaluateHealth()
   * @param {boolean} options.isOffWrist
   */
  processTelemetry({ userName, deviceName, vitals, healthEval, isOffWrist }) {
    const isDanger = !isOffWrist && healthEval && healthEval.level === 'danger';
    const now = Date.now();

    if (this.isSnoozed && now < this.snoozeUntil) {
      return;
    } else if (this.isSnoozed && now >= this.snoozeUntil) {
      this.isSnoozed = false;
    }

    if (isDanger) {
      const reasonsStr = (healthEval.reasons && healthEval.reasons.length)
        ? healthEval.reasons.join(', ')
        : 'Critical threshold breach';

      // 1. Show or update on-screen Danger Banner
      this.showDangerBanner({
        userName,
        deviceName,
        vitals,
        reasonsStr
      });

      // 2. Dispatch hardware & OS notifications on cooldown
      if (!this.activeDangerState || (now - this.lastDangerTime >= this.dangerCooldownMs)) {
        this.lastDangerTime = now;
        this.activeDangerState = true;

        // A. Desktop OS Notification
        this.dispatchDesktopNotification({
          userName,
          deviceName,
          vitals,
          reasonsStr
        });

        // B. Physical Watch Haptic Vibration & OLED Text Alert
        this.dispatchWatchHardwareAlert({
          reasonsStr,
          vitals
        });

        // C. Biomedical Audio Alarm Tone
        if (this.soundEnabled) {
          this.playEmergencyAudioAlarm();
        }
      }
    } else {
      // Clear danger state when vitals return to normal
      if (this.activeDangerState) {
        this.activeDangerState = false;
        this.hideDangerBanner();
      }
    }
  }

  /**
   * Send Native Desktop Notification
   */
  dispatchDesktopNotification({ userName, deviceName, vitals, reasonsStr }) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const title = 'Orbita - Danger';
    const issueText = reasonsStr || 'Physiological threshold breach detected.';
    const crewInfo = userName ? `Crew: ${userName}` : '';
    const body = crewInfo ? `${issueText}\n${crewInfo}` : issueText;

    try {
      const notif = new Notification(title, {
        body,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444"%3E%3Cpath d="M12 2L1 21h22L12 2zm0 4.5l7.5 13H4.5L12 6.5zM11 11v4h2v-4h-2zm0 6v2h2v-2h-2z"/%3E%3C/svg%3E',
        tag: 'orbita-danger-alert',
        requireInteraction: true,
        silent: false
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('[NotificationDispatcher] Desktop notification failed:', e);
    }
  }

  /**
   * Send Physical Vibration & OLED Screen Text to Watch
   */
  async dispatchWatchHardwareAlert({ reasonsStr, vitals }) {
    if (!this.bleService) return;

    try {
      // Vibrate watch with max intensity (level 3) for 800ms
      if (this.bleService.vibrateWatch) {
        await this.bleService.vibrateWatch(3, 800);
      }

      // Send OLED banner text to watch screen with null-byte title separator
      if (this.bleService.sendWatchAlert) {
        const title = 'Orbita - Danger';
        const shortAlert = (reasonsStr || 'Physiological danger').slice(0, 60);
        await this.bleService.sendWatchAlert(shortAlert, 5, title);
      }
    } catch (err) {
      console.warn('[NotificationDispatcher] Watch BLE alert write failed:', err);
    }
  }

  /**
   * Synthesize Urgent Medical Emergency Siren / Alarm
   */
  playEmergencyAudioAlarm() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;
      // High-low alternating medical telemetry beep
      [0, 0.18, 0.36, 0.54].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(idx % 2 === 0 ? 1200 : 900, now + offset);

        gain.gain.setValueAtTime(0.2, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      });
    } catch (_) {}
  }

  /**
   * Render Top HUD Danger Alert Banner
   */
  showDangerBanner({ userName, deviceName, vitals, reasonsStr }) {
    if (!this.bannerMount) return;

    const hrText = vitals.hr ? `${Math.round(vitals.hr)} BPM` : '--';
    const spo2Text = vitals.spo2 ? `${Math.round(vitals.spo2)}%` : '--';

    this.bannerMount.innerHTML = `
      <div class="danger-hud-banner animate-pulse">
        <div class="danger-hud-left">
          <div class="danger-hud-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="danger-hud-text">
            <div class="danger-hud-headline">
              <strong>Orbita - Danger</strong>
              <span class="danger-hud-subject">// SUBJECT: ${this.escapeHtml(userName)} (${this.escapeHtml(deviceName)})</span>
            </div>
            <div class="danger-hud-reasons">${this.escapeHtml(reasonsStr)} &mdash; [ HR: ${hrText} | SpO₂: ${spo2Text} ]</div>
          </div>
        </div>

        <div class="danger-hud-actions">
          <button class="danger-hud-btn" id="btn-banner-buzz-watch" title="Trigger immediate watch vibration">
            <i class="fa-solid fa-mobile-screen-button"></i> BUZZ WATCH
          </button>
          <button class="danger-hud-btn" id="btn-banner-snooze" title="Snooze alerts for 30 seconds">
            <i class="fa-solid fa-clock"></i> SNOOZE (30s)
          </button>
          <button class="danger-hud-btn btn-danger-dismiss" id="btn-banner-dismiss" title="Dismiss Alert Banner">
            <i class="fa-solid fa-xmark"></i> DISMISS
          </button>
        </div>
      </div>
    `;

    this.bannerMount.querySelector('#btn-banner-buzz-watch')?.addEventListener('click', () => {
      this.dispatchWatchHardwareAlert({ reasonsStr, vitals });
      this.playEmergencyAudioAlarm();
    });

    this.bannerMount.querySelector('#btn-banner-snooze')?.addEventListener('click', () => {
      this.snooze(30);
    });

    this.bannerMount.querySelector('#btn-banner-dismiss')?.addEventListener('click', () => {
      this.hideDangerBanner();
    });
  }

  hideDangerBanner() {
    if (this.bannerMount) {
      this.bannerMount.innerHTML = '';
    }
  }

  snooze(seconds = 30) {
    this.isSnoozed = true;
    this.snoozeUntil = Date.now() + (seconds * 1000);
    this.hideDangerBanner();
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
