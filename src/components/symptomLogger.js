// Self-Reporting Symptom Diary & Instant Edge-AI Diagnostic Triager
import { sound } from '../services/sound.js';

export class SymptomLogger {
  constructor(containerElement, onEntryAdded) {
    this.container = containerElement;
    this.onEntryAdded = onEntryAdded;
    this.logs = [
      {
        id: 'log-1',
        time: 'Sol 142 07:15 UTC',
        symptom: 'Slight visual blur when reading cockpit instrument display',
        category: 'Ocular / SANS',
        severity: 2,
        actionTaken: 'Flagged for Fundoscopy + LBNP countermeasure',
        resolved: false
      },
      {
        id: 'log-2',
        time: 'Sol 141 21:40 UTC',
        symptom: 'Mild lumbar tension after EVA suit ingress',
        category: 'Spinal Elongation',
        severity: 2,
        actionTaken: 'Fetal position decompression in sleeping berth',
        resolved: true
      }
    ];

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <section class="console-panel" aria-label="Astronaut Self-Reporting Log">
        <div class="panel-header">
          <h2><i class="fa-solid fa-clipboard-user"></i> Astronaut Self-Reporting & Clinical Log</h2>
          <span class="header-tag">Crew Autonomous Input</span>
        </div>
        <div class="panel-body">

        <form class="symptom-form" id="symptom-form">
          <div class="quick-symptoms-row">
            <span class="quick-label">Clinical Quick-Tags:</span>
            <button type="button" class="tag-btn" data-symptom="Ocular Blur / Focus Shift" data-cat="Ocular / SANS" data-sev="2">
              <i class="fa-solid fa-eye"></i> Visual Blur
            </button>
            <button type="button" class="tag-btn" data-symptom="Cephalad Facial Fullness / Stuffy Sinuses" data-cat="Fluid Shift" data-sev="1">
              <i class="fa-solid fa-head-side-virus"></i> Cephalad Fullness
            </button>
            <button type="button" class="tag-btn" data-symptom="Retinal Cosmic Ray Light Flashes (Phosphenes)" data-cat="Radiation" data-sev="3">
              <i class="fa-solid fa-radiation"></i> Phosphenes
            </button>
            <button type="button" class="tag-btn" data-symptom="Vestibular Disorientation / Otolith Nausea" data-cat="Neuro-Vestibular" data-sev="2">
              <i class="fa-solid fa-arrows-spin"></i> Space Sickness
            </button>
            <button type="button" class="tag-btn" data-symptom="Intervertebral Back Ache (Elongation)" data-cat="Spinal Axis" data-sev="2">
              <i class="fa-solid fa-bone"></i> Spine Ache
            </button>
          </div>

          <div class="input-group">
            <input type="text" id="symptom-text" placeholder="Describe symptoms or physical sensations..." required />
          </div>

          <div class="form-controls-row">
            <div class="severity-picker">
              <label for="severity-range">Severity: <span id="severity-val" class="sev-2">Moderate (2/5)</span></label>
              <input type="range" id="severity-range" min="1" max="5" value="2" />
            </div>

            <button type="submit" class="submit-symptom-btn">
              <i class="fa-solid fa-microchip"></i> <span>Log Entry & Analyze</span>
            </button>
          </div>
        </form>

        <div class="symptom-history" id="symptom-history">
          ${this.renderLogItems()}
        </div>
        </div>
      </section>
    `;

    this.attachEvents();
  }

  renderLogItems() {
    return this.logs.map(log => `
      <div class="log-item ${log.resolved ? 'resolved' : 'active'}" id="${log.id}">
        <div class="log-header">
          <span class="log-time">${log.time}</span>
          <span class="log-cat">${log.category}</span>
          <span class="log-sev sev-${log.severity}">Sev: ${log.severity}/5</span>
        </div>
        <div class="log-body">${log.symptom}</div>
        <div class="log-action">
          <span class="action-tag"><i class="fa-solid fa-robot"></i> Recommendation:</span> ${log.actionTaken}
        </div>
      </div>
    `).join('');
  }

  attachEvents() {
    const form = this.container.querySelector('#symptom-form');
    const input = this.container.querySelector('#symptom-text');
    const sevRange = this.container.querySelector('#severity-range');
    const sevVal = this.container.querySelector('#severity-val');
    const tagBtns = this.container.querySelectorAll('.tag-btn');

    tagBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sound.playClick();
        input.value = btn.dataset.symptom;
        sevRange.value = btn.dataset.sev;
        updateSevLabel(btn.dataset.sev);
      });
    });

    const updateSevLabel = (val) => {
      const labels = {
        '1': 'Mild (1/5)',
        '2': 'Moderate (2/5)',
        '3': 'Elevated (3/5)',
        '4': 'Severe (4/5)',
        '5': 'Critical (5/5)'
      };
      sevVal.textContent = labels[val] || val;
      sevVal.className = `sev-${val}`;
    };

    sevRange.addEventListener('input', (e) => updateSevLabel(e.target.value));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sound.playSuccess();

      const text = input.value.trim();
      const sev = parseInt(sevRange.value, 10);
      if (!text) return;

      let action = 'Logged for routine medical officer review.';
      let category = 'General Health';

      const lower = text.toLowerCase();
      if (lower.includes('blur') || lower.includes('eye') || lower.includes('vision') || lower.includes('focus')) {
        category = 'Ocular / SANS';
        action = 'Initiate OCT fundoscopy and 45-min LBNP chamber session (-35 mmHg).';
      } else if (lower.includes('flash') || lower.includes('phosphene') || lower.includes('radiation')) {
        category = 'Radiation / Cosmic Ray';
        action = 'Verify dosimeter badge reading; check spacecraft SPE storm telemetry.';
      } else if (lower.includes('head') || lower.includes('fullness') || lower.includes('sinus')) {
        category = 'Fluid Shift';
        action = 'Cephalad redistribution detected. Schedule lower extremity resistance set.';
      } else if (lower.includes('sick') || lower.includes('nausea') || lower.includes('vestibular')) {
        category = 'Neuro-Vestibular';
        action = 'Administer promethazine pack if emesis persists; limit rapid head pitch.';
      } else if (lower.includes('spine') || lower.includes('back')) {
        category = 'Spinal Axis';
        action = 'Spinal elongation decompressive posture recommended; verify ARED load.';
      }

      const now = new Date();
      const newLog = {
        id: `log-${Date.now()}`,
        time: `Sol 142 ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`,
        symptom: text,
        category,
        severity: sev,
        actionTaken: action,
        resolved: false
      };

      this.logs.unshift(newLog);
      input.value = '';
      this.container.querySelector('#symptom-history').innerHTML = this.renderLogItems();

      if (this.onEntryAdded) {
        this.onEntryAdded(newLog);
      }
    });
  }
}
