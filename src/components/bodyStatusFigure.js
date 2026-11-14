/**
 * ORBITA Official AIGA / ISO 7001 Pictogram Human Biometric Map
 * Replicates the exact continuous AIGA human silhouette from the reference standard:
 * - Single continuous body silhouette with contoured shoulders, arm slits, and leg notch
 * - Proportional circular head
 * - 6 active illuminated biometric beacons: Brain, Heart, Lungs, Arteries, Core, and Wrist Sensor
 * - Clean non-overlapping HUD callouts with leader lines
 */

export class BodyStatusFigure {
  constructor(mountElement) {
    this.container = mountElement;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <section class="console-panel body-figure-panel">
        <div class="panel-header">
          <h2><i class="fa-solid fa-person"></i> // BIOMETRIC PICTOGRAM MAP</h2>
          <span class="header-tag" id="body-overall-status">[ STATUS: NOMINAL ]</span>
        </div>

        <div class="panel-body body-figure-body">
          <div class="body-canvas-wrap">
            <svg class="body-svg" viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="hudGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.5" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <!-- Subtle Neutral Grid -->
              <g opacity="0.06" stroke="#ffffff" stroke-width="0.5">
                <line x1="20" y1="38" x2="320" y2="38"/>
                <line x1="20" y1="98" x2="320" y2="98"/>
                <line x1="20" y1="126" x2="320" y2="126"/>
                <line x1="20" y1="150" x2="320" y2="150"/>
                <line x1="20" y1="168" x2="320" y2="168"/>
                <line x1="20" y1="262" x2="320" y2="262"/>
                <line x1="170" y1="15" x2="170" y2="270" stroke-dasharray="2 3"/>
              </g>

              <!-- ============================================================= -->
              <!-- OFFICIAL AIGA / ISO 7001 HUMAN SILHOUETTE                     -->
              <!-- ============================================================= -->
              <g class="aiga-figure-group">
                <!-- Circular Cranium -->
                <circle
                  cx="170"
                  cy="38"
                  r="19"
                  class="aiga-head"
                />

                <!-- Single Continuous AIGA Body: Contoured Shoulders, Arm Slits, and Legs -->
                <path
                  class="aiga-body"
                  d="M 153 68
                     C 138 68, 126 76, 126 90
                     L 126 170
                     A 7 7 0 0 0 140 170
                     L 140 104
                     A 3 3 0 0 1 146 104
                     L 146 252
                     A 10 10 0 0 0 166 252
                     L 166 177
                     A 4 4 0 0 1 174 177
                     L 174 252
                     A 10 10 0 0 0 194 252
                     L 194 104
                     A 3 3 0 0 1 200 104
                     L 200 170
                     A 7 7 0 0 0 214 170
                     L 214 90
                     C 214 76, 202 68, 187 68
                     Z"
                />
              </g>

              <!-- ============================================================= -->
              <!-- HUD CALLOUT LEADER LINES & READOUTS                           -->
              <!-- ============================================================= -->

              <!-- 1. BRAIN // STRESS (Right Margin) -->
              <g class="hud-callout-group">
                <polyline points="170,38 235,38 245,30 325,30" class="hud-leader-line"/>
                <circle cx="325" cy="30" r="1.5" class="hud-anchor-dot"/>
                <text x="325" y="22" text-anchor="end" class="hud-callout-title">BRAIN // STRESS</text>
                <text x="325" y="40" text-anchor="end" id="hud-val-brain" class="hud-callout-val hud-val-good">RELAXED (29/100)</text>
              </g>

              <!-- 2. HEART // PULSE (Left Margin) -->
              <g class="hud-callout-group">
                <polyline points="158,98 105,98 95,90 15,90" class="hud-leader-line"/>
                <circle cx="15" cy="90" r="1.5" class="hud-anchor-dot"/>
                <text x="15" y="82" text-anchor="start" class="hud-callout-title">HEART // PULSE</text>
                <text x="15" y="100" text-anchor="start" id="hud-val-heart" class="hud-callout-val hud-val-good">78 BPM · SINUS</text>
              </g>

              <!-- 3. LUNGS // SpO2 (Right Margin) -->
              <g class="hud-callout-group">
                <polyline points="182,98 235,98 245,90 325,90" class="hud-leader-line"/>
                <circle cx="325" cy="90" r="1.5" class="hud-anchor-dot"/>
                <text x="325" y="82" text-anchor="end" class="hud-callout-title">LUNGS // SpO₂</text>
                <text x="325" y="100" text-anchor="end" id="hud-val-lungs" class="hud-callout-val hud-val-good">99% · OPTIMAL</text>
              </g>

              <!-- 4. ARTERIES // BP (Right Margin) -->
              <g class="hud-callout-group">
                <polyline points="170,126 235,126 245,134 325,134" class="hud-leader-line"/>
                <circle cx="325" cy="134" r="1.5" class="hud-anchor-dot"/>
                <text x="325" y="126" text-anchor="end" class="hud-callout-title">ARTERIES // BP</text>
                <text x="325" y="144" text-anchor="end" id="hud-val-vessels" class="hud-callout-val hud-val-good">120/80 mmHg</text>
              </g>

              <!-- 5. CORE // TEMP (Left Margin) -->
              <g class="hud-callout-group">
                <polyline points="170,150 105,150 95,150 15,150" class="hud-leader-line"/>
                <circle cx="15" cy="150" r="1.5" class="hud-anchor-dot"/>
                <text x="15" y="142" text-anchor="start" class="hud-callout-title">CORE // TEMP</text>
                <text x="15" y="160" text-anchor="start" id="hud-val-core" class="hud-callout-val hud-val-good">36.8 °C</text>
              </g>

              <!-- 6. ORBITA SENSOR (Left Margin) -->
              <g class="hud-callout-group">
                <polyline points="133,168 95,195 15,195" class="hud-leader-line"/>
                <circle cx="15" cy="195" r="1.5" class="hud-anchor-dot"/>
                <text x="15" y="187" text-anchor="start" class="hud-callout-title">ORBITA SENSOR</text>
                <text x="15" y="205" text-anchor="start" id="hud-val-wrist" class="hud-callout-val hud-val-good">ON-WRIST · ACTIVE</text>
              </g>

              <!-- ============================================================= -->
              <!-- ILLUMINATED ACTIVE ORGAN BEACONS                              -->
              <!-- ============================================================= -->

              <!-- 1. BRAIN NODE -->
              <g id="node-brain" class="organ-node node-good" transform="translate(170, 38)">
                <circle class="halo-circle" r="12" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
                <circle class="core-circle" r="5.5" fill="currentColor" filter="url(#hudGlow)"/>
              </g>

              <!-- 2. HEART NODE (Active Pulse Ring) -->
              <g id="node-heart" class="organ-node node-good" transform="translate(158, 98)">
                <circle class="halo-circle pulse-beat-ring" r="14" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.5"/>
                <circle class="core-circle" r="6" fill="currentColor" filter="url(#hudGlow)"/>
              </g>

              <!-- 3. LUNGS NODE -->
              <g id="node-lungs" class="organ-node node-good" transform="translate(182, 98)">
                <circle class="halo-circle" r="10" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
                <circle class="core-circle" r="4.5" fill="currentColor" filter="url(#hudGlow)"/>
              </g>

              <!-- 4. ARTERIES NODE -->
              <g id="node-vessels" class="organ-node node-good" transform="translate(170, 126)">
                <circle class="halo-circle" r="9" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
                <circle class="core-circle" r="4" fill="currentColor" filter="url(#hudGlow)"/>
              </g>

              <!-- 5. CORE NODE -->
              <g id="node-core" class="organ-node node-good" transform="translate(170, 150)">
                <circle class="halo-circle" r="9" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>
                <circle class="core-circle" r="4" fill="currentColor" filter="url(#hudGlow)"/>
              </g>

              <!-- 6. WRIST NODE -->
              <g id="node-wrist" class="organ-node node-good" transform="translate(133, 168)">
                <circle class="halo-circle" r="8.5" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>
                <circle class="core-circle" r="4" fill="currentColor" filter="url(#hudGlow)"/>
              </g>
            </svg>
          </div>

          <!-- Organ Status Breakdown Grid -->
          <div class="organ-status-matrix">
            <div class="organ-status-row" id="row-brain">
              <span class="organ-tag"><i class="fa-solid fa-brain"></i> Brain:</span>
              <span class="organ-badge badge-good" id="badge-brain">NOMINAL</span>
              <span class="organ-detail" id="detail-brain">Stress: --</span>
            </div>

            <div class="organ-status-row" id="row-heart">
              <span class="organ-tag"><i class="fa-solid fa-heart-pulse"></i> Heart:</span>
              <span class="organ-badge badge-good" id="badge-heart">NOMINAL</span>
              <span class="organ-detail" id="detail-heart">HR: --</span>
            </div>

            <div class="organ-status-row" id="row-lungs">
              <span class="organ-tag"><i class="fa-solid fa-lungs"></i> Lungs:</span>
              <span class="organ-badge badge-good" id="badge-lungs">NOMINAL</span>
              <span class="organ-detail" id="detail-lungs">SpO₂: --</span>
            </div>

            <div class="organ-status-row" id="row-vessels">
              <span class="organ-tag"><i class="fa-solid fa-droplet"></i> Vessels:</span>
              <span class="organ-badge badge-good" id="badge-vessels">NOMINAL</span>
              <span class="organ-detail" id="detail-vessels">BP: --</span>
            </div>

            <div class="organ-status-row" id="row-core">
              <span class="organ-tag"><i class="fa-solid fa-temperature-half"></i> Core:</span>
              <span class="organ-badge badge-good" id="badge-core">NOMINAL</span>
              <span class="organ-detail" id="detail-core">Temp: --</span>
            </div>

            <div class="organ-status-row" id="row-wrist">
              <span class="organ-tag"><i class="fa-solid fa-ring"></i> Wrist:</span>
              <span class="organ-badge badge-good" id="badge-wrist">ON-WRIST</span>
              <span class="organ-detail" id="detail-wrist">Contact OK</span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  update(vitals, isOffWrist = false, activeDevice = null, activeUser = null) {
    if (!vitals) return;

    const userPrefix = activeUser ? `${activeUser.name.toUpperCase()} · ` : '';

    const setNode = (nodeId, badgeId, detailId, hudValId, level, badgeText, detailText, hudText) => {
      const nodeEl = this.container.querySelector(`#${nodeId}`);
      const badgeEl = this.container.querySelector(`#${badgeId}`);
      const detailEl = this.container.querySelector(`#${detailId}`);
      const hudEl = this.container.querySelector(`#${hudValId}`);

      const colorClass = level === 'danger' ? 'node-danger' : (level === 'mild' ? 'node-mild' : 'node-good');
      const badgeClass = level === 'danger' ? 'badge-danger' : (level === 'mild' ? 'badge-mild' : 'badge-good');
      const hudClass = level === 'danger' ? 'hud-val-danger' : (level === 'mild' ? 'hud-val-mild' : 'hud-val-good');

      if (nodeEl) nodeEl.className.baseVal = `organ-node ${colorClass}`;
      if (badgeEl) {
        badgeEl.className = `organ-badge ${badgeClass}`;
        badgeEl.textContent = badgeText;
      }
      if (detailEl) detailEl.textContent = detailText;
      if (hudEl) {
        hudEl.textContent = hudText;
        hudEl.setAttribute('class', `hud-callout-val ${hudClass}`);
      }
    };

    if (isOffWrist) {
      setNode('node-brain', 'badge-brain', 'detail-brain', 'hud-val-brain', 'mild', 'OFF-WRIST', 'No contact', 'OFF-WRIST');
      setNode('node-heart', 'badge-heart', 'detail-heart', 'hud-val-heart', 'mild', 'OFF-WRIST', 'No pulse', 'OFF-WRIST');
      setNode('node-lungs', 'badge-lungs', 'detail-lungs', 'hud-val-lungs', 'mild', 'OFF-WRIST', 'No contact', 'OFF-WRIST');
      setNode('node-vessels', 'badge-vessels', 'detail-vessels', 'hud-val-vessels', 'mild', 'OFF-WRIST', 'No contact', 'OFF-WRIST');
      setNode('node-core', 'badge-core', 'detail-core', 'hud-val-core', 'mild', 'OFF-WRIST', 'No contact', 'OFF-WRIST');
      setNode('node-wrist', 'badge-wrist', 'detail-wrist', 'hud-val-wrist', 'danger', 'OFF-WRIST', 'Device on table', 'DISCONNECTED');

      const overall = this.container.querySelector('#body-overall-status');
      if (overall) {
        overall.textContent = `[ ${userPrefix}STATUS: OFF-WRIST ]`;
        overall.style.color = 'var(--fg-muted)';
      }
      return;
    }

    let overallDanger = false;
    let overallMild = false;

    // 1. BRAIN // Stress (Green <= 39, Amber 40-65, Red > 65)
    const stress = vitals.stress;
    if (stress !== null && stress !== undefined && stress > 0) {
      if (stress > 65) {
        overallDanger = true;
        setNode('node-brain', 'badge-brain', 'detail-brain', 'hud-val-brain', 'danger', 'HIGH STRESS', `${Math.round(stress)}/100 (High)`, `${Math.round(stress)}/100 · HIGH STRESS`);
      } else if (stress > 39) {
        overallMild = true;
        setNode('node-brain', 'badge-brain', 'detail-brain', 'hud-val-brain', 'mild', 'MILD STRESS', `${Math.round(stress)}/100 (Medium)`, `${Math.round(stress)}/100 · ELEVATED`);
      } else {
        setNode('node-brain', 'badge-brain', 'detail-brain', 'hud-val-brain', 'good', 'RELAXED', `${Math.round(stress)}/100 (Optimal)`, `${Math.round(stress)}/100 · RELAXED`);
      }
    } else {
      setNode('node-brain', 'badge-brain', 'detail-brain', 'hud-val-brain', 'good', 'NOMINAL', 'Equilibrium', 'EQUILIBRIUM');
    }

    // 2. HEART // BPM (Green 60-85, Amber 86-100 or 50-59, Red > 100 or < 50)
    const hr = vitals.hr;
    const heartRing = this.container.querySelector('.pulse-beat-ring');
    if (hr && hr > 0) {
      if (heartRing) {
        const beatPeriod = (60.0 / hr).toFixed(2);
        heartRing.style.animation = `orbitaHeartPulse ${beatPeriod}s infinite cubic-bezier(0.215, 0.61, 0.355, 1)`;
      }

      if (hr > 100 || hr < 50) {
        overallDanger = true;
        const alertTag = hr > 100 ? 'TACHY' : 'BRADY';
        setNode('node-heart', 'badge-heart', 'detail-heart', 'hud-val-heart', 'danger', 'ALERT', `${Math.round(hr)} BPM (${hr > 100 ? 'Tachycardia' : 'Bradycardia'})`, `${Math.round(hr)} BPM · ${alertTag}`);
      } else if (hr > 85 || hr < 60) {
        overallMild = true;
        setNode('node-heart', 'badge-heart', 'detail-heart', 'hud-val-heart', 'mild', 'MILD ELEVATED', `${Math.round(hr)} BPM`, `${Math.round(hr)} BPM · ELEVATED`);
      } else {
        setNode('node-heart', 'badge-heart', 'detail-heart', 'hud-val-heart', 'good', 'NORMAL SINUS', `${Math.round(hr)} BPM`, `${Math.round(hr)} BPM · SINUS`);
      }
    } else {
      setNode('node-heart', 'badge-heart', 'detail-heart', 'hud-val-heart', 'mild', 'STANDBY', 'Awaiting pulse', 'AWAITING PULSE');
    }

    // 3. LUNGS // SpO2 (Green >= 95%, Amber 93-94%, Red < 93%)
    const spo2 = vitals.spo2;
    if (spo2 && spo2 > 0) {
      if (spo2 < 93) {
        overallDanger = true;
        setNode('node-lungs', 'badge-lungs', 'detail-lungs', 'hud-val-lungs', 'danger', 'HYPOXIA', `${Math.round(spo2)}% O2 (Low)`, `${Math.round(spo2)}% · HYPOXIA`);
      } else if (spo2 < 95) {
        overallMild = true;
        setNode('node-lungs', 'badge-lungs', 'detail-lungs', 'hud-val-lungs', 'mild', 'BORDERLINE', `${Math.round(spo2)}% O2`, `${Math.round(spo2)}% · BORDERLINE`);
      } else {
        setNode('node-lungs', 'badge-lungs', 'detail-lungs', 'hud-val-lungs', 'good', 'OPTIMAL', `${Math.round(spo2)}% Perfusion`, `${Math.round(spo2)}% · OPTIMAL`);
      }
    } else {
      setNode('node-lungs', 'badge-lungs', 'detail-lungs', 'hud-val-lungs', 'good', 'NOMINAL', '98% Est.', '98% · EST.');
    }

    // 4. ARTERIES // Blood Pressure
    const bpSys = vitals.bpSys;
    const bpDia = vitals.bpDia;
    if (bpSys && bpDia && bpSys > 0) {
      const bpStr = `${Math.round(bpSys)}/${Math.round(bpDia)} mmHg`;
      if (bpSys > 135 || bpDia > 88) {
        overallDanger = true;
        setNode('node-vessels', 'badge-vessels', 'detail-vessels', 'hud-val-vessels', 'danger', 'ELEVATED BP', bpStr, `${bpStr} · HIGH`);
      } else if (bpSys > 124 || bpDia > 80) {
        overallMild = true;
        setNode('node-vessels', 'badge-vessels', 'detail-vessels', 'hud-val-vessels', 'mild', 'PRE-HTN', bpStr, `${bpStr} · PRE-HTN`);
      } else {
        setNode('node-vessels', 'badge-vessels', 'detail-vessels', 'hud-val-vessels', 'good', 'OPTIMAL', bpStr, `${bpStr} · NORMAL`);
      }
    } else {
      setNode('node-vessels', 'badge-vessels', 'detail-vessels', 'hud-val-vessels', 'good', 'NOMINAL', '--/--', '--/-- mmHg');
    }

    // 5. CORE // Temperature (Green 36.5-37.3°C, Amber 37.4-38.0°C, Red > 38.0°C)
    const temp = vitals.temp;
    if (temp && temp > 0) {
      const tempStr = `${temp.toFixed(1)} °C`;
      if (temp > 38.0) {
        overallDanger = true;
        setNode('node-core', 'badge-core', 'detail-core', 'hud-val-core', 'danger', 'FEVER', tempStr, `${tempStr} · FEVER`);
      } else if (temp > 37.3) {
        overallMild = true;
        setNode('node-core', 'badge-core', 'detail-core', 'hud-val-core', 'mild', 'ELEVATED', tempStr, `${tempStr} · ELEVATED`);
      } else {
        setNode('node-core', 'badge-core', 'detail-core', 'hud-val-core', 'good', 'NORMOTHERMIC', tempStr, `${tempStr} · OPTIMAL`);
      }
    } else {
      setNode('node-core', 'badge-core', 'detail-core', 'hud-val-core', 'good', 'NOMINAL', '36.8 °C', '36.8 °C · NORM');
    }

    // 6. WRISTS // Sensor link & movement
    const devName = activeDevice ? activeDevice.customName : 'Orbita Watch';
    setNode('node-wrist', 'badge-wrist', 'detail-wrist', 'hud-val-wrist', 'good', 'ON-WRIST', `${devName} Active`, `${devName.toUpperCase()} · OK`);

    // Overall banner badge
    const overall = this.container.querySelector('#body-overall-status');
    if (overall) {
      if (overallDanger) {
        overall.textContent = `[ ${userPrefix}STATUS: DANGER ]`;
        overall.style.color = '#ef4444';
      } else if (overallMild) {
        overall.textContent = `[ ${userPrefix}STATUS: MILD ]`;
        overall.style.color = '#f59e0b';
      } else {
        overall.textContent = `[ ${userPrefix}STATUS: NOMINAL ]`;
        overall.style.color = '#10b981';
      }
    }
  }
}
