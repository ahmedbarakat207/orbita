// Interactive Countermeasure Execution Hub & Protocol Executor
import { sound } from '../services/sound.js';

export class CountermeasureModal {
  constructor(containerElement, onActionCompleted) {
    this.container = containerElement;
    this.onActionCompleted = onActionCompleted;
    this.timerInterval = null;
    this.secondsRemaining = 0;
    this.currentProtocol = null;
  }

  open(protocol) {
    this.currentProtocol = protocol;
    sound.playClick();
    this.render();
  }

  close() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.container.innerHTML = '';
  }

  render() {
    const p = this.currentProtocol;
    if (!p) return;

    let detailsHtml = '';
    let defaultDurationSec = 60; // 60 seconds demo timer

    if (p.id === 'lbnp' || p.id === 'head_elevate') {
      defaultDurationSec = 45;
      detailsHtml = `
        <div class="protocol-visual">
          <div class="lbnp-gauge">
            <span class="gauge-title">SUCTION PRESSURE</span>
            <div class="gauge-value">-35 <span class="unit">mmHg</span></div>
            <div class="gauge-sub">Venous Blood Translocation: Cephalic &rarr; Splanchnic/Femoral</div>
          </div>
          <div class="protocol-meta-box">
            <p><strong>Primary Objective:</strong> Lower intracranial pressure (ICP) and decompress retrobulbar optic nerve sheath to mitigate SANS.</p>
            <p><strong>Target Heart Rate:</strong> 65 - 85 BPM (Monitor for vasovagal pre-syncope).</p>
          </div>
        </div>
      `;
    } else if (p.id === 'shelter' || p.id === 'radioprotectant') {
      defaultDurationSec = 30;
      detailsHtml = `
        <div class="protocol-visual shelter-mode">
          <div class="alert-banner">CRITICAL SOLAR PARTICLE STORM PROTOCOL</div>
          <ul class="checklist">
            <li><input type="checkbox" checked id="chk1"> <label for="chk1">Seal Module 3 Storm Haven hatch</label></li>
            <li><input type="checkbox" checked id="chk2"> <label for="chk2">Deploy H₂O Water-Wall shielding curtain</label></li>
            <li><input type="checkbox" id="chk3"> <label for="chk3">Ingest Oral Radioprotectant Antioxidant Pack</label></li>
            <li><input type="checkbox" id="chk4"> <label for="chk4">Activate high-sensitivity personal ionizing dosimeter</label></li>
          </ul>
        </div>
      `;
    } else if (p.id === 'ared' || p.id === 'ared_heavy') {
      defaultDurationSec = 60;
      detailsHtml = `
        <div class="protocol-visual">
          <div class="exercise-stats-grid">
            <div class="stat-pill"><span class="k">LOAD</span><span class="v">185 kg-force</span></div>
            <div class="stat-pill"><span class="k">TARGET</span><span class="v">4 Sets &times; 10 Reps</span></div>
            <div class="stat-pill"><span class="k">AXIAL STRAIN</span><span class="v">+1.8 G Effective</span></div>
          </div>
          <div class="protocol-meta-box">
            <p><strong>Primary Objective:</strong> Induce piezoelectric bone remodeling signal in femoral neck & lumbar vertebrae to arrest osteoclastic resorption.</p>
          </div>
        </div>
      `;
    } else {
      defaultDurationSec = 40;
      detailsHtml = `
        <div class="protocol-visual">
          <div class="protocol-meta-box">
            <p><strong>Protocol Name:</strong> ${p.title}</p>
            <p><strong>Prescription Context:</strong> Autonomous edge-AI recommendation based on real-time physiological telemetry analysis.</p>
          </div>
        </div>
      `;
    }

    this.secondsRemaining = defaultDurationSec;

    this.container.innerHTML = `
      <div class="countermeasure-backdrop">
        <div class="countermeasure-modal">
          <div class="modal-header">
            <div class="modal-title-group">
              <span class="modal-badge ${p.urgency}">${p.urgency.toUpperCase()} COUNTERMEASURE</span>
              <h3>${p.title}</h3>
            </div>
            <button class="modal-close-btn" id="modal-close" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="modal-body">
            ${detailsHtml}

            <div class="timer-section">
              <div class="timer-display" id="protocol-timer">${this.formatTime(this.secondsRemaining)}</div>
              <div class="timer-controls">
                <button class="btn-ctrl start" id="timer-toggle"><i class="fa-solid fa-play"></i> START PROTOCOL</button>
                <button class="btn-ctrl complete" id="btn-force-complete"><i class="fa-solid fa-check"></i> COMPLETE & RECORD</button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <span class="telemetry-note">Autonomously syncs with Ares Flight Telemetry & Medical Record</span>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  attachEvents() {
    const closeBtn = this.container.querySelector('#modal-close');
    const timerToggle = this.container.querySelector('#timer-toggle');
    const completeBtn = this.container.querySelector('#btn-force-complete');
    const timerDisplay = this.container.querySelector('#protocol-timer');

    closeBtn.addEventListener('click', () => {
      sound.playClick();
      this.close();
    });

    let running = false;
    timerToggle.addEventListener('click', () => {
      sound.playClick();
      if (!running) {
        running = true;
        timerToggle.textContent = 'PAUSE';
        timerToggle.className = 'btn-ctrl pause';
        this.timerInterval = setInterval(() => {
          this.secondsRemaining--;
          if (this.secondsRemaining <= 0) {
            clearInterval(this.timerInterval);
            this.handleCompletion();
          } else {
            timerDisplay.textContent = this.formatTime(this.secondsRemaining);
          }
        }, 1000);
      } else {
        running = false;
        timerToggle.textContent = 'RESUME';
        timerToggle.className = 'btn-ctrl start';
        clearInterval(this.timerInterval);
      }
    });

    completeBtn.addEventListener('click', () => {
      sound.playSuccess();
      this.handleCompletion();
    });
  }

  handleCompletion() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    sound.playSuccess();
    if (this.onActionCompleted) {
      this.onActionCompleted(this.currentProtocol);
    }
    this.close();
  }
}
