/**
 * ORBITA Full Telemetry Terminal Logger
 * High-performance terminal console displaying date, exact device name,
 * detailed vitals telemetry, and clinical health classification:
 * - [GOOD] / NOMINAL (Green)
 * - [MILD] / ELEVATED (Amber)
 * - [DANGER] / CRITICAL (Red)
 * 
 * Features: live filtering by level, auto-scroll, pause/resume, clear, and .log export.
 */

export class TerminalLogger {
  constructor(mountElement) {
    this.container = mountElement;
    this.logs = [];
    this.maxLogs = 500;
    this.activeFilter = 'all'; // 'all' | 'good' | 'mild' | 'danger'
    this.autoScroll = true;
    this.isPaused = false;
    this.lastLogTimestamp = 0;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <section class="console-panel terminal-panel">
        <div class="panel-header terminal-header">
          <div class="terminal-title">
            <h2><i class="fa-solid fa-terminal"></i> // ORBITA REALTIME TELEMETRY TERMINAL</h2>
            <span class="terminal-counter" id="terminal-count">[ 0 ENTRIES ]</span>
          </div>

          <div class="terminal-controls">
            <!-- Filter Pills -->
            <div class="terminal-filter-group">
              <button class="term-btn filter-btn active" data-filter="all">ALL</button>
              <button class="term-btn filter-btn filter-good" data-filter="good">● GOOD</button>
              <button class="term-btn filter-btn filter-mild" data-filter="mild">▲ MILD</button>
              <button class="term-btn filter-btn filter-danger" data-filter="danger">✖ DANGER</button>
            </div>

            <!-- Action Buttons -->
            <div class="terminal-actions-group">
              <button class="term-btn" id="term-toggle-scroll" title="Toggle autoscroll">
                <i class="fa-solid fa-arrows-down-to-line"></i> <span id="term-scroll-lbl">SCROLL: ON</span>
              </button>
              <button class="term-btn" id="term-toggle-pause" title="Pause live logging">
                <i class="fa-solid fa-pause" id="term-pause-icon"></i> <span id="term-pause-lbl">PAUSE</span>
              </button>
              <button class="term-btn" id="term-clear" title="Clear terminal output">
                <i class="fa-solid fa-trash-can"></i> CLEAR
              </button>
              <button class="term-btn term-btn-primary" id="term-export" title="Download text log">
                <i class="fa-solid fa-download"></i> EXPORT .LOG
              </button>
            </div>
          </div>
        </div>

        <div class="panel-body terminal-body-wrap">
          <div class="terminal-screen" id="terminal-screen">
            <div class="terminal-welcome-line">
              <span class="term-prompt">[SYSTEM]</span>
              <span class="term-sys-text">ORBITA TELEMETRY TERMINAL INITIALIZED. AWAITING REALTIME BIOSENSOR STREAM...</span>
            </div>
          </div>
        </div>
      </section>
    `;

    this.attachEvents();
  }

  attachEvents() {
    // Filter clicks
    this.container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.filter;
        this.renderVisibleLogs();
      });
    });

    // Toggle scroll
    const scrollBtn = this.container.querySelector('#term-toggle-scroll');
    const scrollLbl = this.container.querySelector('#term-scroll-lbl');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', () => {
        this.autoScroll = !this.autoScroll;
        scrollBtn.classList.toggle('active', this.autoScroll);
        scrollLbl.textContent = this.autoScroll ? 'SCROLL: ON' : 'SCROLL: OFF';
      });
    }

    // Toggle pause
    const pauseBtn = this.container.querySelector('#term-toggle-pause');
    const pauseIcon = this.container.querySelector('#term-pause-icon');
    const pauseLbl = this.container.querySelector('#term-pause-lbl');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        pauseBtn.classList.toggle('active-paused', this.isPaused);
        pauseLbl.textContent = this.isPaused ? 'RESUME' : 'PAUSE';
        pauseIcon.className = this.isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
      });
    }

    // Clear
    const clearBtn = this.container.querySelector('#term-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.logs = [];
        this.renderVisibleLogs();
        this.updateCounter();
      });
    }

    // Export .log
    const exportBtn = this.container.querySelector('#term-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportLogFile();
      });
    }
  }

  /**
   * Append a telemetry log entry
   * @param {Object} options
   * @param {string} options.deviceName - Actual assigned custom name of the watch
   * @param {Object} options.vitals - Live vitals { hr, spo2, stress, bpSys, bpDia, temp, hrv, ... }
   * @param {Object} options.activity - Live activity { batt, steps, cadenceSpm, ... }
   * @param {Object} options.healthEval - Result of deviceManager.evaluateHealth()
   * @param {string} [options.eventMessage] - Optional custom event string
   */
  logEntry({ deviceName, vitals, activity, healthEval, eventMessage = null, isOffWrist = false }) {
    if (this.isPaused) return;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const msStr = String(now.getMilliseconds()).padStart(3, '0');
    const fullTimestamp = `${dateStr} ${timeStr}.${msStr}`;

    const level = isOffWrist ? 'mild' : (healthEval?.level || 'good');
    const devTag = (deviceName || 'ORBITA').toUpperCase();

    let details = '';
    let summary = '';

    if (isOffWrist) {
      details = `OFF-WRIST DETECTED | Batt: ${activity?.batt ?? '--'}%`;
      summary = 'Watch contact lost (device off wrist).';
    } else if (vitals && vitals.hr > 0) {
      const parts = [
        `HR: ${Math.round(vitals.hr)} BPM`,
        vitals.spo2 ? `SpO2: ${Math.round(vitals.spo2)}%` : null,
        vitals.stress !== null && vitals.stress !== undefined ? `Stress: ${Math.round(vitals.stress)}/100` : null,
        vitals.hrv ? `HRV: ${Math.round(vitals.hrv)}ms` : null,
        (vitals.bpSys && vitals.bpDia) ? `BP: ${Math.round(vitals.bpSys)}/${Math.round(vitals.bpDia)} mmHg` : null,
        vitals.temp ? `Temp: ${Number(vitals.temp).toFixed(1)}°C` : null,
        activity?.batt ? `Batt: ${activity.batt}%` : null,
        activity?.steps ? `Steps: ${activity.steps}` : null
      ].filter(Boolean);

      details = parts.join(' | ');
      summary = (healthEval?.reasons && healthEval.reasons.length)
        ? healthEval.reasons.join(', ')
        : 'All vital telemetry nominal.';
    } else {
      details = eventMessage || 'Awaiting optical pulse signal...';
      summary = 'Standby.';
    }

    const logItem = {
      id: Date.now() + Math.random(),
      timestamp: fullTimestamp,
      deviceName: devTag,
      level, // 'good' | 'mild' | 'danger'
      details,
      summary,
      rawText: `[${fullTimestamp}] [${devTag}] [${level.toUpperCase()}] ${details} - ${summary}`
    };

    this.logs.push(logItem);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.updateCounter();

    // If entry matches current filter, append to DOM directly
    if (this.activeFilter === 'all' || this.activeFilter === level) {
      this.appendLineToDom(logItem);
    }
  }

  appendLineToDom(item) {
    const screen = this.container.querySelector('#terminal-screen');
    if (!screen) return;

    const line = document.createElement('div');
    line.className = `term-line term-line-${item.level}`;

    const badgeLabel = item.level === 'danger' ? '✖ DANGER' : (item.level === 'mild' ? '▲ MILD' : '● GOOD');

    line.innerHTML = `
      <span class="term-ts">[${item.timestamp}]</span>
      <span class="term-dev">[${item.deviceName}]</span>
      <span class="term-badge badge-${item.level}">[${badgeLabel}]</span>
      <span class="term-details">${this.escapeHtml(item.details)}</span>
      <span class="term-summary">// ${this.escapeHtml(item.summary)}</span>
    `;

    screen.appendChild(line);

    if (this.autoScroll) {
      screen.scrollTop = screen.scrollHeight;
    }
  }

  renderVisibleLogs() {
    const screen = this.container.querySelector('#terminal-screen');
    if (!screen) return;

    screen.innerHTML = '';
    const visible = this.activeFilter === 'all'
      ? this.logs
      : this.logs.filter((l) => l.level === this.activeFilter);

    if (visible.length === 0) {
      screen.innerHTML = `
        <div class="terminal-welcome-line">
          <span class="term-prompt">[FILTER]</span>
          <span class="term-sys-text">No log entries matching filter '${this.activeFilter.toUpperCase()}'.</span>
        </div>
      `;
      return;
    }

    for (const item of visible) {
      this.appendLineToDom(item);
    }
  }

  updateCounter() {
    const counter = this.container.querySelector('#terminal-count');
    if (counter) {
      counter.textContent = `[ ${this.logs.length} ENTRIES ]`;
    }
  }

  exportLogFile() {
    if (this.logs.length === 0) return;
    const header = [
      '========================================================================',
      'ORBITA HEALTH & TELEMETRY TERMINAL LOG RECORD',
      `Exported: ${new Date().toISOString()}`,
      `Total Log Entries: ${this.logs.length}`,
      '========================================================================\n'
    ].join('\n');

    const body = this.logs.map((l) => l.rawText).join('\n');
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbita-telemetry-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
