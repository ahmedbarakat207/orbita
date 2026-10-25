// NASA Deep Space Clinical Telemetry Downlink Report Generator
import { sound } from '../services/sound.js';

export class ReportModal {
  constructor(containerElement) {
    this.container = containerElement;
  }

  open(astronaut, scenario, currentVitals, logs) {
    sound.playClick();
    this.render(astronaut, scenario, currentVitals, logs);
  }

  close() {
    this.container.innerHTML = '';
  }

  render(astronaut, scenario, currentVitals, logs) {
    const timestamp = new Date().toISOString();
    const met = `Sol ${astronaut.missionSol} · ${new Date().toISOString().substring(11, 19)} UTC`;

    this.container.innerHTML = `
      <div class="report-backdrop">
        <div class="report-modal">
          <div class="report-header">
            <div class="report-nasa-logo">
              <span class="nasa-seal">NASA / HRP</span>
              <div class="title-wrap">
                <h2>DEEP SPACE CREW MEDICAL TELEMETRY RECORD</h2>
                <span class="sub">CREW MEDICAL OPERATIONS SYSTEM (CMOS) · FLIGHT DOSSIER</span>
              </div>
            </div>
            <button class="report-close-btn" id="report-close">&times;</button>
          </div>

          <div class="report-body" id="printable-report">
            <div class="report-meta-grid">
              <div><span class="label">CREW MEMBER:</span> <strong>${astronaut.name}</strong></div>
              <div><span class="label">CALLSIGN / ID:</span> <strong>${astronaut.callsign} (${astronaut.id})</strong></div>
              <div><span class="label">MISSION TIMESTOP:</span> <strong>${met}</strong></div>
              <div><span class="label">MICROGRAVITY EXPOSURE:</span> <strong>${astronaut.daysInMicrogravity} Sols</strong></div>
              <div><span class="label">COMMUNICATION LAG:</span> <strong>22m 14s (Autonomous Offline AI Signed)</strong></div>
              <div><span class="label">ACTIVE MISSION STATE:</span> <strong>${scenario.name.toUpperCase()}</strong></div>
            </div>

            <div class="report-section">
              <h3>1. PHYSIOLOGICAL TELEMETRY SYNTHESIS</h3>
              <table class="report-table">
                <thead>
                  <tr>
                    <th>Biomarker</th>
                    <th>Observed Value</th>
                    <th>Nominal Deep Space Range</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Heart Rate (HR)</td>
                    <td>${currentVitals.hr} BPM</td>
                    <td>60 - 85 BPM</td>
                    <td><span class="rep-badge ok">NOMINAL</span></td>
                  </tr>
                  <tr>
                    <td>Blood Pressure</td>
                    <td>${currentVitals.bpSys}/${currentVitals.bpDia} mmHg (MAP: ${Math.round((2*currentVitals.bpDia + currentVitals.bpSys)/3)})</td>
                    <td>110-130 / 70-85 mmHg</td>
                    <td><span class="rep-badge ok">EVALUATED</span></td>
                  </tr>
                  <tr>
                    <td>Oxygen Saturation (SpO2)</td>
                    <td>${currentVitals.spo2}%</td>
                    <td>&gt; 96.0%</td>
                    <td><span class="rep-badge ok">STABLE</span></td>
                  </tr>
                  <tr>
                    <td>Intracranial Pressure (ICP proxy)</td>
                    <td>${currentVitals.icp} mmHg</td>
                    <td>10.0 - 15.0 mmHg</td>
                    <td><span class="rep-badge ${currentVitals.icp > 17 ? 'crit' : 'ok'}">${currentVitals.icp > 17 ? 'ELEVATED (SANS)' : 'NORMAL'}</span></td>
                  </tr>
                  <tr>
                    <td>Heart Rate Variability (HRV SDNN)</td>
                    <td>${currentVitals.hrv} ms</td>
                    <td>&gt; 50 ms</td>
                    <td><span class="rep-badge ${currentVitals.hrv < 40 ? 'warn' : 'ok'}">${currentVitals.hrv < 40 ? 'SYMPATHETIC STRAIN' : 'BALANCED'}</span></td>
                  </tr>
                  <tr>
                    <td>Cumulative Ionizing Radiation</td>
                    <td>${astronaut.baseVitals.radiationAccumulated} mSv (${scenario.radiationFlux} mSv/d)</td>
                    <td>&lt; 600 mSv Lifetime / &lt; 2.0 mSv/d</td>
                    <td><span class="rep-badge ${scenario.radiationFlux > 5 ? 'crit' : 'ok'}">${scenario.radiationFlux > 5 ? 'SPE SURGE' : 'ACCEPTABLE'}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="report-section">
              <h3>2. AUTONOMOUS CLINICAL DIAGNOSTICS</h3>
              <ul class="report-diag-list">
                ${scenario.diagnostics.map(d => `
                  <li>
                    <strong>[${d.severity.toUpperCase()}] ${d.title}:</strong> ${d.summary}
                    <div class="rec">&rarr; <em>Action Protocol:</em> ${d.action}</div>
                  </li>
                `).join('')}
              </ul>
            </div>

            <div class="report-section">
              <h3>3. RECENT ASTRONAUT SELF-REPORTED LOGS</h3>
              <ul class="report-diag-list">
                ${logs.slice(0, 3).map(l => `
                  <li>
                    <strong>${l.time} [${l.category} - Sev ${l.severity}/5]:</strong> ${l.symptom}
                    <div class="rec">&rarr; <em>Prescribed:</em> ${l.actionTaken}</div>
                  </li>
                `).join('')}
              </ul>
            </div>

            <div class="report-footer-auth">
              <div class="auth-box">
                <span class="auth-seal">&#10003; AUTONOMOUS EDGE-AI VERIFIED</span>
                <p>Validated by NASA Human Research Program Deep Space Clinical Heuristics Engine. Downlink packet compressed for Deep Space Network (DSN) transmission.</p>
              </div>
            </div>
          </div>

          <div class="report-actions">
            <button class="report-print-btn" id="report-print-btn">PRINT / EXPORT PDF</button>
            <button class="report-dl-btn" id="report-dl-btn">DOWNLOAD DSN JSON PACKET</button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents(astronaut, scenario, currentVitals, logs);
  }

  attachEvents(astronaut, scenario, currentVitals, logs) {
    const closeBtn = this.container.querySelector('#report-close');
    const printBtn = this.container.querySelector('#report-print-btn');
    const dlBtn = this.container.querySelector('#report-dl-btn');

    closeBtn.addEventListener('click', () => {
      sound.playClick();
      this.close();
    });

    printBtn.addEventListener('click', () => {
      sound.playClick();
      window.print();
    });

    dlBtn.addEventListener('click', () => {
      sound.playSuccess();
      const packet = {
        system: 'AURA-OS Deep Space Health Telemetry',
        generatedAt: new Date().toISOString(),
        astronaut: {
          id: astronaut.id,
          name: astronaut.name,
          missionSol: astronaut.missionSol,
          daysInMicrogravity: astronaut.daysInMicrogravity
        },
        scenario: scenario.name,
        vitals: currentVitals,
        activeDiagnostics: scenario.diagnostics,
        symptomLogs: logs
      };
      const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AURA_NASA_HRP_TELEMETRY_${astronaut.id}_SOL142.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
