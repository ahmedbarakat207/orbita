import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import { CREW_MEMBERS } from './data/astronauts.js';
import { MISSION_SCENARIOS } from './data/scenarios.js';
import { sound } from './services/sound.js';
import { EcgOscilloscope } from './components/ecgCanvas.js';
import { BodyHologram } from './components/bodyHologram.js';
import { PvtTestModal } from './components/pvtTest.js';
import { SymptomLogger } from './components/symptomLogger.js';
import { CountermeasureModal } from './components/countermeasureModal.js';
import { ReportModal } from './components/reportModal.js';

class App {
  constructor() {
    this.crewMembers = CREW_MEMBERS;
    this.activeCrew = this.crewMembers[0];
    this.currentScenarioKey = 'nominal';
    this.currentScenario = MISSION_SCENARIOS.nominal;
    
    // Dynamic vitals tracking
    this.currentVitals = { ...this.activeCrew.baseVitals };
    this.symptomLogs = [];

    // Component references
    this.ecg = null;
    this.hologram = null;
    this.pvtModal = null;
    this.cmModal = null;
    this.reportModal = null;
    this.symptomLogger = null;

    // Hotspot info database
    this.hotspotDetails = {
      brain: {
        title: 'Cerebrovascular & Intracranial Pressure (ICP)',
        description: 'Microgravity eliminates the head-to-toe hydrostatic gradient, translocating ~2 liters of blood and interstitial fluid cephalad. This elevates intracranial pressure and impairs glymphatic waste clearance during sleep.'
      },
      ocular: {
        title: 'Spaceflight Associated Neuro-ocular Syndrome (SANS)',
        description: 'Cephalad venous congestion and retrobulbar optic nerve sheath distention lead to choroidal folds, optic disc edema, and hyperopic refractive shifts in over 70% of long-duration astronauts.'
      },
      cardio: {
        title: 'Cardiovascular Remodeling & Arrhythmia Risk',
        description: 'Cardiac shape rounds into a more spherical morphology due to reduced mechanical pre-load. Total circulating plasma volume decreases by ~15-20%, heightening risk of post-landing orthostatic intolerance.'
      },
      spine: {
        title: 'Spinal Axial Elongation & Disc Decompression',
        description: 'Absence of gravity unloads intervertebral discs, causing water absorption and spinal elongation (crew can grow 5-7 cm in flight), inducing back pain and post-mission lumbar disc herniation risk.'
      },
      renal: {
        title: 'Hypercalciuria & Nephrolithiasis (Kidney Stone) Susceptibility',
        description: 'Massive osteoclastic bone resorption dumps calcium into the circulatory system. Filtered through kidneys, it precipitates into calcium oxalate/phosphate crystals in dehydrated flight environments.'
      },
      musculoskeletal: {
        title: 'Trabecular Bone Demineralization & Soleus Muscle Atrophy',
        description: 'Weight-bearing postural muscles (soleus, gastrocnemius, quadriceps) atrophy up to 20% without heavy mechanical loading. Femoral neck and lumbar bone density degrades at 1.0-1.5% per month.'
      }
    };

    this.init();
  }

  init() {
    this.renderLayout();
    this.initEcg();
    this.initHologram();
    this.initModals();
    this.initSymptomLogger();
    this.attachEventListeners();
    this.startTelemetryLoop();
    this.startMetClock();
  }

  renderLayout() {
    const appEl = document.querySelector('#app');
    appEl.innerHTML = `
      <!-- Aerospace Header -->
      <header class="mission-header" id="mission-header">
        <div class="header-top-row">
          <div class="brand-group">
            <span class="nasa-meatball-badge">NASA · HRP</span>
            <div class="brand-text">
              <h1>AURA-OS <span class="sub-title">BioFlight</span></h1>
              <div class="brand-tagline">Autonomous Deep Space Crew Health & Countermeasure System</div>
            </div>
          </div>

          <div class="header-telemetry-pills">
            <div class="telemetry-pill">
              <span class="status-chip" id="env-pulse-dot"><i class="fa-solid fa-satellite-dish"></i> AUTONOMOUS</span>
              <span class="pill-lbl">DSN Latency:</span>
              <span class="pill-val">22m 14s (Local Edge-AI Active)</span>
            </div>
            <div class="telemetry-pill">
              <span class="pill-lbl">Cabin ppCO₂:</span>
              <span class="pill-val" id="hud-ppco2">2.7 mmHg</span>
            </div>
            <div class="telemetry-pill">
              <span class="pill-lbl">Rad Flux:</span>
              <span class="pill-val" id="hud-rad-flux">1.35 mSv/d</span>
            </div>
            <div class="telemetry-pill">
              <span class="pill-lbl">MET:</span>
              <span class="pill-val" id="met-clock">Sol 142 · 09:42:15 UTC</span>
            </div>
          </div>
        </div>

        <div class="header-toolbar-row">
          <div class="toolbar-left">
            <div class="sim-selector-wrap">
              <label for="sim-scenario-select"><i class="fa-solid fa-sliders"></i> <strong>SIMULATION EVENT:</strong></label>
              <select id="sim-scenario-select" class="sim-select">
                <option value="nominal">Nominal Baseline Flight</option>
                <option value="solar_particle_event">[SPE] Solar Particle Event (Radiation Alarm)</option>
                <option value="sans_fluid_shift">[SANS] Cephalad Intracranial Pressure Surge</option>
                <option value="cognitive_exhaustion">[FATIGUE] Circadian Desynchrony & Sleep Debt</option>
                <option value="hypercalciuria_bone">[BONE] Hypercalciuria & Accelerated Demineralization</option>
              </select>
            </div>

            <div class="crew-toggle-group">
              <button class="crew-toggle-btn active" id="btn-crew-elena" data-crew="elena_vance">
                <i class="fa-solid fa-user-astronaut"></i> Cmdr Vance
              </button>
              <button class="crew-toggle-btn" id="btn-crew-marcus" data-crew="marcus_reid">
                <i class="fa-solid fa-user-doctor"></i> Dr. Reid
              </button>
            </div>
          </div>

          <div class="toolbar-right">
            <button class="icon-action-btn" id="btn-toggle-sound" title="Toggle Biometric Audio Synthesizer">
              <i id="sound-icon" class="fa-solid fa-volume-xmark"></i>
              <span id="sound-label">Audio: Muted</span>
            </button>
            <button class="icon-action-btn btn-nasa-report" id="btn-open-report">
              <i class="fa-solid fa-file-waveform"></i>
              <span>Generate NASA Telemetry Record</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Alert Banner (shown during critical events) -->
      <div id="alert-banner-container"></div>

      <!-- Main Three-Column Dashboard Grid -->
      <main class="dashboard-grid">
        <!-- COLUMN 1: Crew Dossier & Physiological Hologram Avatar -->
        <section class="col-crew" aria-label="Astronaut Profile & Anatomy">
          <section class="console-panel" aria-label="Astronaut Profile">
            <div class="panel-header">
              <h2><i class="fa-solid fa-user-astronaut"></i> Crew Profile & Physiological Model</h2>
              <span class="header-tag" id="crew-badge-status">FLIGHT COMMANDER</span>
            </div>

            <div class="panel-body">
              <div class="astronaut-dossier">
                <div class="astronaut-portrait-wrap">
                  <img id="astronaut-img" class="astronaut-portrait-img" src="${this.activeCrew.photo}" alt="${this.activeCrew.name}" />
                </div>
                <div class="dossier-info">
                  <h3 id="astronaut-name">${this.activeCrew.name}</h3>
                  <div class="dossier-role" id="astronaut-role">${this.activeCrew.role}</div>
                  <div class="dossier-callsign" id="astronaut-callsign">${this.activeCrew.callsign} · ${this.activeCrew.bloodType}</div>
                </div>
              </div>

              <!-- Flat Data Table (Banning Nested Cards) -->
              <div class="dossier-data-table">
                <div class="dossier-cell">
                  <span class="lbl">Zero-G Exposure</span>
                  <span class="val" id="meta-zero-g">${this.activeCrew.daysInMicrogravity} Sols</span>
                </div>
                <div class="dossier-cell">
                  <span class="lbl">Mass Delta</span>
                  <span class="val" id="meta-mass-delta">${this.activeCrew.massLossSinceLaunch}</span>
                </div>
                <div class="dossier-cell">
                  <span class="lbl">Baseline VO₂ Max</span>
                  <span class="val" id="meta-vo2">${this.activeCrew.baselineVO2Max}</span>
                </div>
                <div class="dossier-cell">
                  <span class="lbl">Total EVA Time</span>
                  <span class="val" id="meta-eva">${this.activeCrew.evaHoursTotal}</span>
                </div>
              </div>

              <!-- Anatomical Hologram Avatar -->
              <div id="body-hologram-mount"></div>

              <!-- Hotspot Explanation Panel -->
              <div class="hotspot-detail-panel" id="hotspot-panel">
                <h3 id="hotspot-title">Cerebrovascular & Intracranial Pressure (ICP)</h3>
                <p id="hotspot-desc">Microgravity eliminates the head-to-toe hydrostatic gradient, translocating fluid cephalad and raising intracranial pressure.</p>
              </div>
            </div>
          </section>

          <!-- NASA R.I.D.G.E Risk Radar -->
          <section class="console-panel" aria-label="NASA Spaceflight Risk Index">
            <div class="panel-header">
              <h2><i class="fa-solid fa-satellite-dish"></i> NASA R.I.D.G.E. Spaceflight Risk Index</h2>
              <span class="header-tag">HRP Standard</span>
            </div>

            <div class="panel-body">
              <div class="ridge-risk-bars">
                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>[R] Radiation Exposure</span>
                    <span id="risk-val-r">14% Career Cap</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill cyan" id="risk-fill-r" style="width: 14%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>[I] Isolation & Stress Index</span>
                    <span id="risk-val-i">18% Low</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill violet" id="risk-fill-i" style="width: 18%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>[D] Distance / AI Autonomy Need</span>
                    <span>95% High</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill cyan" style="width: 95%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>[G] Microgravity Deconditioning</span>
                    <span id="risk-val-g">22% Moderate</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill amber" id="risk-fill-g" style="width: 22%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>[E] Closed Environment Hazard</span>
                    <span id="risk-val-e">12% Nominal</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill cyan" id="risk-fill-e" style="width: 12%;"></div></div>
                </div>
              </div>
            </div>
          </section>
        </section>

        <!-- COLUMN 2: Live Physiological Telemetry & Autonomous AI Diagnostics -->
        <section class="col-telemetry" aria-label="Biometric Telemetry & Diagnostics">
          <!-- Real-Time Oscilloscope Panel -->
          <section class="console-panel" aria-label="Continuous Physiological Stream">
            <div class="panel-header">
              <h2><i class="fa-solid fa-wave-square"></i> Continuous Physiological Stream</h2>
              <div class="header-tag" id="sweep-speed-badge">LEAD II · 25 mm/s</div>
            </div>

            <div class="panel-body">
              <div class="ecg-canvas-wrapper">
                <canvas id="ecg-canvas"></canvas>
                <div class="canvas-legends">
                  <div class="legend-item"><span class="legend-color cyan"></span> Lead II ECG</div>
                  <div class="legend-item"><span class="legend-color emerald"></span> PPG Plethysmogram</div>
                </div>
              </div>

              <!-- Vital Signs Workstation Grid (Flat Grid, No Nested Container Cards) -->
              <div class="vitals-grid">
                <div class="vital-box" id="box-hr">
                  <div class="vital-label-row">
                    <span class="vital-name">Heart Rate</span>
                    <span class="vital-icon"><i class="fa-solid fa-heart-pulse"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-hr">68</span>
                    <span class="vital-unit">BPM</span>
                  </div>
                  <div class="vital-status-sub" id="sub-hr">Resting Bradycardia</div>
                </div>

                <div class="vital-box" id="box-bp">
                  <div class="vital-label-row">
                    <span class="vital-name">Blood Press</span>
                    <span class="vital-icon"><i class="fa-solid fa-droplet"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-bp">116/74</span>
                    <span class="vital-unit">mmHg</span>
                  </div>
                  <div class="vital-status-sub" id="sub-bp">MAP: 88 mmHg</div>
                </div>

                <div class="vital-box" id="box-spo2">
                  <div class="vital-label-row">
                    <span class="vital-name">Oxygen Sat</span>
                    <span class="vital-icon"><i class="fa-solid fa-lungs"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-spo2">98.4</span>
                    <span class="vital-unit">%</span>
                  </div>
                  <div class="vital-status-sub" id="sub-spo2">Optimal Perfusion</div>
                </div>

                <div class="vital-box" id="box-icp">
                  <div class="vital-label-row">
                    <span class="vital-name">ICP Est.</span>
                    <span class="vital-icon"><i class="fa-solid fa-brain"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-icp">12.2</span>
                    <span class="vital-unit">mmHg</span>
                  </div>
                  <div class="vital-status-sub" id="sub-icp">Cephalad Gradient Ok</div>
                </div>

                <div class="vital-box" id="box-hrv">
                  <div class="vital-label-row">
                    <span class="vital-name">HRV (SDNN)</span>
                    <span class="vital-icon"><i class="fa-solid fa-bolt"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-hrv">62</span>
                    <span class="vital-unit">ms</span>
                  </div>
                  <div class="vital-status-sub" id="sub-hrv">Parasympathetic Dom.</div>
                </div>

                <div class="vital-box" id="box-temp">
                  <div class="vital-label-row">
                    <span class="vital-name">Core Temp</span>
                    <span class="vital-icon"><i class="fa-solid fa-temperature-half"></i></span>
                  </div>
                  <div class="vital-value-row">
                    <span class="vital-number" id="val-temp">36.9</span>
                    <span class="vital-unit">°C</span>
                  </div>
                  <div class="vital-status-sub" id="sub-temp">Spaceflight Baseline</div>
                </div>
              </div>
            </div>
          </section>

          <!-- Autonomous Edge-AI Diagnostic Engine -->
          <section class="console-panel" aria-label="Autonomous Clinical Diagnostics">
            <div class="panel-header">
              <h2><i class="fa-solid fa-microchip"></i> Autonomous Clinical Diagnostic Engine</h2>
              <span class="header-tag">Edge AI Decision Model v4.2</span>
            </div>

            <div class="panel-body">
              <div class="diagnostics-list" id="diagnostics-container">
                <!-- Dynamically rendered diagnostic cards -->
              </div>
            </div>
          </section>

          <!-- Self-Reporting Symptom Logger Mount -->
          <div id="symptom-logger-mount"></div>
        </section>

        <!-- COLUMN 3: Actionable Countermeasures & Clinical Actions -->
        <section class="col-actions" aria-label="Actionable Countermeasures Hub">
          <!-- Cognitive PVT Launcher Banner -->
          <div class="pvt-launcher-box">
            <div class="pvt-launcher-text">
              <h3><i class="fa-solid fa-stopwatch"></i> Psychomotor Vigilance Task (PVT-B)</h3>
              <p>Assess sustained reaction speed & operational readiness</p>
            </div>
            <button class="pvt-launch-btn" id="btn-launch-pvt">
              <i class="fa-solid fa-play"></i> RUN PVT TEST
            </button>
          </div>

          <!-- Active Prescribed Countermeasures -->
          <section class="console-panel" aria-label="Prescribed Countermeasures">
            <div class="panel-header">
              <h2><i class="fa-solid fa-shield-halved"></i> Prescribed Countermeasures</h2>
              <span class="header-tag">Act On Health</span>
            </div>

            <div class="panel-body">
              <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 0.875rem;">
                Autonomous clinical protocols prescribed for direct execution by the astronaut to arrest physiological degradation.
              </p>

              <div class="countermeasures-list" id="countermeasures-container">
                <!-- Dynamically populated countermeasures -->
              </div>
            </div>
          </section>

          <!-- Countermeasure Adherence & Weekly Progress -->
          <section class="console-panel" aria-label="Daily Protocol Adherence">
            <div class="panel-header">
              <h2><i class="fa-solid fa-chart-column"></i> Daily Protocol Adherence</h2>
              <span class="header-tag">Sol 142 Targets</span>
            </div>

            <div class="panel-body">
              <div class="ridge-risk-bars" id="adherence-bars">
                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>ARED Resistive Exercise (2.5 hr target)</span>
                    <span id="adh-ared-val">100% (Logged)</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill emerald" id="adh-ared-bar" style="width: 100%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>LBNP Suction Session (45 min)</span>
                    <span id="adh-lbnp-val">45% (In Progress)</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill cyan" id="adh-lbnp-bar" style="width: 45%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>Phototherapy / Circadian Light</span>
                    <span id="adh-photo-val">Pending Evening</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill violet" id="adh-photo-bar" style="width: 20%;"></div></div>
                </div>

                <div class="risk-bar-row">
                  <div class="risk-label-row">
                    <span>Hydration Electrolyte Target (2.8L)</span>
                    <span id="adh-hyd-val">2.2L / 2.8L</span>
                  </div>
                  <div class="risk-track"><div class="risk-fill cyan" style="width: 78%;"></div></div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>

      <!-- Footer -->
      <footer class="mission-footer">
        <div class="footer-left">
          <span>NASA International Space Apps Challenge 2026</span>
          <span>&bull;</span>
          <span class="footer-tag">Challenge: Health Monitoring Software for Astronauts on Space Missions</span>
        </div>
        <div>
          <span>Autonomous Edge-AI Decision System &bull; Offline Deep-Space Architecture</span>
        </div>
      </footer>

      <!-- Modals Container -->
      <div id="modal-container"></div>
    `;
  }

  initEcg() {
    const canvas = document.querySelector('#ecg-canvas');
    if (canvas) {
      this.ecg = new EcgOscilloscope(canvas, {
        bpm: this.currentVitals.hr,
        onBeat: (bpm) => {
          sound.playHeartbeat();
          const hrBox = document.querySelector('#box-hr');
          if (hrBox) {
            hrBox.classList.add('pulse-beat');
            setTimeout(() => hrBox.classList.remove('pulse-beat'), 160);
          }
        }
      });
      this.ecg.start();
    }
  }

  initHologram() {
    const mount = document.querySelector('#body-hologram-mount');
    if (mount) {
      this.hologram = new BodyHologram(mount, (hotspot) => {
        sound.playClick();
        const detail = this.hotspotDetails[hotspot];
        if (detail) {
          const titleEl = document.querySelector('#hotspot-title');
          const descEl = document.querySelector('#hotspot-desc');
          if (titleEl) titleEl.textContent = detail.title;
          if (descEl) descEl.textContent = detail.description;
        }
      });
    }
  }

  initModals() {
    const modalMount = document.querySelector('#modal-container');
    this.cmModal = new CountermeasureModal(modalMount, (completedProtocol) => {
      this.handleCountermeasureSuccess(completedProtocol);
    });

    this.reportModal = new ReportModal(modalMount);
  }

  initSymptomLogger() {
    const mount = document.querySelector('#symptom-logger-mount');
    if (mount) {
      this.symptomLogger = new SymptomLogger(mount, (newEntry) => {
        this.symptomLogs.unshift(newEntry);
        if (newEntry.severity >= 3) {
          this.currentVitals.hrv = Math.max(30, this.currentVitals.hrv - 6);
          this.currentVitals.hr = Math.min(110, this.currentVitals.hr + 4);
          this.updateVitalsDisplay();
        }
      });
    }
  }

  attachEventListeners() {
    // Scenario selector
    const scenarioSelect = document.querySelector('#sim-scenario-select');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        sound.playClick();
        this.setScenario(e.target.value);
      });
    }

    // Crew switcher
    const elenaBtn = document.querySelector('#btn-crew-elena');
    const marcusBtn = document.querySelector('#btn-crew-marcus');

    if (elenaBtn && marcusBtn) {
      elenaBtn.addEventListener('click', () => {
        sound.playClick();
        elenaBtn.classList.add('active');
        marcusBtn.classList.remove('active');
        this.switchCrew(this.crewMembers[0]);
      });

      marcusBtn.addEventListener('click', () => {
        sound.playClick();
        marcusBtn.classList.add('active');
        elenaBtn.classList.remove('active');
        this.switchCrew(this.crewMembers[1]);
      });
    }

    // Audio Mute toggle
    const soundBtn = document.querySelector('#btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isMuted = sound.toggleMute();
        const icon = document.querySelector('#sound-icon');
        const label = document.querySelector('#sound-label');
        if (icon && label) {
          icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
          label.textContent = isMuted ? 'Audio: Muted' : 'Audio: Active';
        }
      });
    }

    // PVT Launch button
    const pvtBtn = document.querySelector('#btn-launch-pvt');
    if (pvtBtn) {
      pvtBtn.addEventListener('click', () => {
        sound.playClick();
        const mount = document.querySelector('#modal-container');
        this.pvtModal = new PvtTestModal(mount, (results) => {
          this.handlePvtCompletion(results);
        });
      });
    }

    // NASA Report Generator button
    const reportBtn = document.querySelector('#btn-open-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        this.reportModal.open(
          this.activeCrew,
          this.currentScenario,
          this.currentVitals,
          this.symptomLogger ? this.symptomLogger.logs : []
        );
      });
    }
  }

  switchCrew(crew) {
    this.activeCrew = crew;
    document.querySelector('#astronaut-img').src = crew.photo;
    document.querySelector('#astronaut-img').alt = crew.name;
    document.querySelector('#astronaut-name').textContent = crew.name;
    document.querySelector('#astronaut-role').textContent = crew.role;
    document.querySelector('#astronaut-callsign').textContent = `${crew.callsign} · ${crew.bloodType}`;
    document.querySelector('#meta-zero-g').textContent = `${crew.daysInMicrogravity} Sols`;
    document.querySelector('#meta-mass-delta').textContent = crew.massLossSinceLaunch;
    document.querySelector('#meta-vo2').textContent = crew.baselineVO2Max;
    document.querySelector('#meta-eva').textContent = crew.evaHoursTotal;

    this.currentVitals = { ...crew.baseVitals };
    this.applyScenario(this.currentScenario);
  }

  setScenario(scenarioKey) {
    this.currentScenarioKey = scenarioKey;
    this.currentScenario = MISSION_SCENARIOS[scenarioKey] || MISSION_SCENARIOS.nominal;
    this.applyScenario(this.currentScenario);
  }

  applyScenario(sc) {
    const bannerContainer = document.querySelector('#alert-banner-container');
    const radFluxHud = document.querySelector('#hud-rad-flux');
    const ppco2Hud = document.querySelector('#hud-ppco2');
    const pulseDot = document.querySelector('#env-pulse-dot');

    if (sc.severity === 'critical') {
      sound.playAlarm();
      if (pulseDot) {
        pulseDot.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> SPE CRITICAL';
        pulseDot.classList.add('alert');
      }
      bannerContainer.innerHTML = `
        <div class="critical-alert-banner">
          <div class="alert-content">
            <span class="alert-badge"><i class="fa-solid fa-radiation"></i> MISSION CRITICAL</span>
            <span class="alert-msg">${sc.description}</span>
          </div>
          <button class="alert-cta-btn" id="btn-banner-action"><i class="fa-solid fa-shield-halved"></i> EXECUTE SHELTER PROTOCOL</button>
        </div>
      `;
      const bannerAction = bannerContainer.querySelector('#btn-banner-action');
      if (bannerAction) {
        bannerAction.addEventListener('click', () => {
          this.cmModal.open(sc.countermeasures[0]);
        });
      }
    } else {
      if (pulseDot) {
        pulseDot.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> AUTONOMOUS';
        pulseDot.classList.remove('alert');
      }
      bannerContainer.innerHTML = '';
    }

    if (radFluxHud) radFluxHud.textContent = `${sc.radiationFlux} mSv/d`;
    if (ppco2Hud) ppco2Hud.textContent = `${sc.environmental.ppco2} mmHg`;

    this.currentVitals.hr = sc.vitalsDelta.hr;
    this.currentVitals.bpSys = sc.vitalsDelta.bpSys;
    this.currentVitals.bpDia = sc.vitalsDelta.bpDia;
    this.currentVitals.spo2 = sc.vitalsDelta.spo2;
    this.currentVitals.icp = sc.vitalsDelta.icp;
    this.currentVitals.hrv = sc.vitalsDelta.hrv;
    this.currentVitals.temp = sc.vitalsDelta.temp;

    if (this.ecg) {
      const stress = sc.severity === 'critical' ? 0.8 : (sc.severity === 'warning' ? 0.4 : 0);
      this.ecg.setBpm(this.currentVitals.hr, stress);
    }

    this.renderDiagnostics(sc.diagnostics);
    this.renderCountermeasures(sc.countermeasures);
    this.updateRiskRadar(sc);
    this.updateVitalsDisplay();
  }

  renderDiagnostics(diags) {
    const mount = document.querySelector('#diagnostics-container');
    if (!mount) return;

    mount.innerHTML = diags.map(d => `
      <div class="diagnostic-card ${d.severity}">
        <div class="diag-header">
          <h3 class="diag-title">${d.title}</h3>
          <span class="diag-badge ${d.severity}">${d.severity}</span>
        </div>
        <div class="diag-body">${d.summary}</div>
        <div class="diag-action-rec">
          <strong>Protocol Guidance:</strong> ${d.action}
        </div>
      </div>
    `).join('');
  }

  renderCountermeasures(cms) {
    const mount = document.querySelector('#countermeasures-container');
    if (!mount) return;

    mount.innerHTML = cms.map(cm => `
      <div class="countermeasure-item" id="cm-${cm.id}">
        <div class="cm-info">
          <h3 class="cm-title"><i class="${cm.icon}"></i> ${cm.title}</h3>
          <div class="cm-meta">
            <span><i class="fa-solid fa-stopwatch"></i> ${cm.duration}</span>
            <span>&bull;</span>
            <span style="color: ${cm.urgency === 'immediate' ? 'var(--color-crimson-text)' : 'var(--color-text-cyan)'}; text-transform: uppercase;">
              ${cm.urgency}
            </span>
          </div>
        </div>
        <button class="cm-act-btn ${cm.urgency}" data-cmid="${cm.id}">
          <span>ACT NOW</span>
        </button>
      </div>
    `).join('');

    mount.querySelectorAll('.cm-act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cmid;
        const cm = cms.find(c => c.id === id);
        if (cm) {
          this.cmModal.open(cm);
        }
      });
    });
  }

  updateRiskRadar(sc) {
    const rFill = document.querySelector('#risk-fill-r');
    const rVal = document.querySelector('#risk-val-r');
    const iFill = document.querySelector('#risk-fill-i');
    const iVal = document.querySelector('#risk-val-i');
    const gFill = document.querySelector('#risk-fill-g');
    const gVal = document.querySelector('#risk-val-g');

    if (sc.id === 'solar_particle_event') {
      if (rFill) { rFill.style.width = '88%'; rFill.className = 'risk-fill crimson'; }
      if (rVal) rVal.textContent = '88% CRITICAL FLUX';
    } else {
      if (rFill) { rFill.style.width = '14%'; rFill.className = 'risk-fill cyan'; }
      if (rVal) rVal.textContent = '14% Career Cap';
    }

    if (sc.id === 'cognitive_exhaustion') {
      if (iFill) { iFill.style.width = '78%'; iFill.className = 'risk-fill amber'; }
      if (iVal) iVal.textContent = '78% High Fatigue';
    } else {
      if (iFill) { iFill.style.width = '18%'; iFill.className = 'risk-fill violet'; }
      if (iVal) iVal.textContent = '18% Low';
    }

    if (sc.id === 'sans_fluid_shift' || sc.id === 'hypercalciuria_bone') {
      if (gFill) { gFill.style.width = '68%'; gFill.className = 'risk-fill amber'; }
      if (gVal) gVal.textContent = '68% Elevated Shift';
    } else {
      if (gFill) { gFill.style.width = '22%'; gFill.className = 'risk-fill amber'; }
      if (gVal) gVal.textContent = '22% Moderate';
    }
  }

  updateVitalsDisplay() {
    const hrEl = document.querySelector('#val-hr');
    const bpEl = document.querySelector('#val-bp');
    const spo2El = document.querySelector('#val-spo2');
    const icpEl = document.querySelector('#val-icp');
    const hrvEl = document.querySelector('#val-hrv');
    const tempEl = document.querySelector('#val-temp');

    const boxHr = document.querySelector('#box-hr');
    const boxIcp = document.querySelector('#box-icp');
    const boxHrv = document.querySelector('#box-hrv');

    if (hrEl) hrEl.textContent = Math.round(this.currentVitals.hr);
    if (bpEl) bpEl.textContent = `${Math.round(this.currentVitals.bpSys)}/${Math.round(this.currentVitals.bpDia)}`;
    if (spo2El) spo2El.textContent = this.currentVitals.spo2.toFixed(1);
    if (icpEl) icpEl.textContent = this.currentVitals.icp.toFixed(1);
    if (hrvEl) hrvEl.textContent = Math.round(this.currentVitals.hrv);
    if (tempEl) tempEl.textContent = this.currentVitals.temp.toFixed(1);

    if (boxHr) {
      boxHr.className = this.currentVitals.hr > 90 ? 'vital-box critical-state' : (this.currentVitals.hr > 80 ? 'vital-box warning-state' : 'vital-box');
    }
    if (boxIcp) {
      boxIcp.className = this.currentVitals.icp > 18 ? 'vital-box critical-state' : (this.currentVitals.icp > 15 ? 'vital-box warning-state' : 'vital-box');
    }
    if (boxHrv) {
      boxHrv.className = this.currentVitals.hrv < 40 ? 'vital-box warning-state' : 'vital-box';
    }
  }

  handleCountermeasureSuccess(protocol) {
    const item = document.querySelector(`#cm-${protocol.id}`);
    if (item) {
      const btn = item.querySelector('.cm-act-btn');
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> COMPLETED';
        btn.style.background = 'var(--color-emerald)';
        btn.style.borderColor = 'var(--color-emerald)';
        btn.style.color = '#ffffff';
        btn.disabled = true;
      }
    }

    if (protocol.id === 'lbnp' || protocol.id === 'head_elevate') {
      this.currentVitals.icp = Math.max(12.5, this.currentVitals.icp - 4.5);
      this.currentVitals.hrv = Math.min(65, this.currentVitals.hrv + 10);
      const adhBar = document.querySelector('#adh-lbnp-bar');
      const adhVal = document.querySelector('#adh-lbnp-val');
      if (adhBar) adhBar.style.width = '100%';
      if (adhVal) adhVal.textContent = '100% (Completed)';
    } else if (protocol.id === 'shelter' || protocol.id === 'radioprotectant') {
      this.currentVitals.hr = Math.max(72, this.currentVitals.hr - 15);
      this.currentVitals.hrv = Math.min(55, this.currentVitals.hrv + 12);
    } else if (protocol.id === 'ared' || protocol.id === 'ared_heavy') {
      const adhBar = document.querySelector('#adh-ared-bar');
      const adhVal = document.querySelector('#adh-ared-val');
      if (adhBar) adhBar.style.width = '100%';
      if (adhVal) adhVal.textContent = '100% (Logged)';
    }

    this.updateVitalsDisplay();
  }

  handlePvtCompletion(results) {
    const pvLauncher = document.querySelector('.pvt-launcher-text p');
    if (pvLauncher) {
      pvLauncher.textContent = `Recent PVT: Mean RT ${results.meanRt} ms (${results.lapses} lapses)`;
    }

    if (results.lapses > 1 || results.meanRt > 400) {
      this.currentVitals.hrv = Math.max(30, this.currentVitals.hrv - 5);
      this.updateVitalsDisplay();
    }
  }

  startTelemetryLoop() {
    setInterval(() => {
      const hrJitter = (Math.random() - 0.5) * 1.5;
      const bpJitter = (Math.random() - 0.5) * 1.0;
      const spo2Jitter = (Math.random() - 0.5) * 0.1;

      this.currentVitals.hr = Math.max(45, Math.min(160, this.currentVitals.hr + hrJitter * 0.2));
      this.currentVitals.bpSys = Math.max(90, Math.min(180, this.currentVitals.bpSys + bpJitter * 0.1));
      this.currentVitals.spo2 = Math.max(94.0, Math.min(100.0, this.currentVitals.spo2 + spo2Jitter * 0.05));

      if (this.ecg) {
        this.ecg.setBpm(this.currentVitals.hr);
      }

      this.updateVitalsDisplay();
    }, 1800);
  }

  startMetClock() {
    const clockEl = document.querySelector('#met-clock');
    if (!clockEl) return;

    setInterval(() => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      clockEl.textContent = `Sol ${this.activeCrew.missionSol} · ${h}:${m}:${s} UTC`;
    }, 1000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
