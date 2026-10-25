// Interactive NASA Psychomotor Vigilance Task (PVT) Cognitive Readiness Assessor
import { sound } from '../services/sound.js';

export class PvtTestModal {
  constructor(containerElement, onComplete) {
    this.container = containerElement;
    this.onComplete = onComplete;
    this.state = 'idle'; // idle, waiting, running, result, finished
    this.startTime = 0;
    this.timerId = null;
    this.timeoutId = null;
    this.trials = [];
    this.maxTrials = 3;
    this.currentTrial = 0;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="pvt-backdrop">
        <div class="pvt-modal">
          <div class="pvt-header">
            <div class="pvt-title-wrap">
              <span class="pvt-badge">NASA HRP COGNITIVE TEST</span>
              <h3>Psychomotor Vigilance Task (PVT-B)</h3>
            </div>
            <button class="pvt-close-btn" id="pvt-close-btn" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="pvt-instructions">
            When the digital timer starts rapidly counting, press <kbd>SPACE</kbd> or click the target box immediately. Assesses sustained attention, micro-sleep lapses, and sleep debt.
          </div>

          <div class="pvt-screen" id="pvt-screen">
            <div class="pvt-timer-display" id="pvt-timer-display">READY</div>
            <div class="pvt-prompt-text" id="pvt-prompt-text">Click "START TRIAL" to begin</div>
          </div>

          <div class="pvt-footer">
            <div class="pvt-trial-counter" id="pvt-trial-counter">Trial 0 of 3</div>
            <button class="pvt-action-btn" id="pvt-action-btn"><i class="fa-solid fa-play"></i> START TRIAL 1</button>
          </div>

          <div class="pvt-results-summary" id="pvt-results-summary" style="display: none;">
            <h4>Cognitive Readiness Report</h4>
            <div class="pvt-metrics-row">
              <div class="pvt-metric-card">
                <span class="lbl">Mean RT</span>
                <span class="val" id="pvt-mean-rt">-- ms</span>
              </div>
              <div class="pvt-metric-card">
                <span class="lbl">Lapses (>450ms)</span>
                <span class="val" id="pvt-lapses">0</span>
              </div>
              <div class="pvt-metric-card">
                <span class="lbl">Mission Readiness</span>
                <span class="val status-ok" id="pvt-readiness-status">OPTIMAL</span>
              </div>
            </div>
            <button class="pvt-accept-btn" id="pvt-accept-btn"><i class="fa-solid fa-circle-check"></i> LOG SCORE TO CREW PROFILE</button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  attachEvents() {
    const screen = this.container.querySelector('#pvt-screen');
    const actionBtn = this.container.querySelector('#pvt-action-btn');
    const closeBtn = this.container.querySelector('#pvt-close-btn');
    const acceptBtn = this.container.querySelector('#pvt-accept-btn');

    closeBtn.addEventListener('click', () => this.destroy());

    const handleTrigger = () => {
      sound.playClick();
      if (this.state === 'idle' || this.state === 'result') {
        this.startTrial();
      } else if (this.state === 'waiting') {
        // False start / anticipation error!
        this.falseStart();
      } else if (this.state === 'running') {
        this.stopTrial();
      }
    };

    screen.addEventListener('mousedown', handleTrigger);
    actionBtn.addEventListener('click', handleTrigger);

    this.keyHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleTrigger();
      } else if (e.code === 'Escape') {
        this.destroy();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        sound.playSuccess();
        const sum = this.trials.reduce((a, b) => a + b, 0);
        const mean = Math.round(sum / this.trials.length);
        const lapses = this.trials.filter(t => t > 450).length;
        if (this.onComplete) {
          this.onComplete({ meanRt: mean, lapses, trials: this.trials });
        }
        this.destroy();
      });
    }
  }

  startTrial() {
    this.currentTrial++;
    this.state = 'waiting';
    const screen = this.container.querySelector('#pvt-screen');
    const display = this.container.querySelector('#pvt-timer-display');
    const prompt = this.container.querySelector('#pvt-prompt-text');
    const counter = this.container.querySelector('#pvt-trial-counter');
    const actionBtn = this.container.querySelector('#pvt-action-btn');

    counter.textContent = `Trial ${this.currentTrial} of ${this.maxTrials}`;
    display.textContent = '...';
    display.className = 'pvt-timer-display waiting';
    prompt.textContent = 'WAIT FOR TIMER... DO NOT CLICK EARLY';
    actionBtn.textContent = 'WAITING FOR SIGNAL...';
    actionBtn.disabled = true;

    // Random foreperiod between 1.5 and 4.0 seconds
    const delay = Math.random() * 2500 + 1500;
    this.timeoutId = setTimeout(() => {
      this.triggerClock();
    }, delay);
  }

  triggerClock() {
    this.state = 'running';
    this.startTime = performance.now();
    const display = this.container.querySelector('#pvt-timer-display');
    const prompt = this.container.querySelector('#pvt-prompt-text');
    const actionBtn = this.container.querySelector('#pvt-action-btn');

    display.className = 'pvt-timer-display running';
    prompt.textContent = 'PRESS SPACE OR CLICK NOW!';
    actionBtn.textContent = 'CLICK / PRESS SPACE!';
    actionBtn.disabled = false;

    this.timerId = setInterval(() => {
      const elapsed = Math.round(performance.now() - this.startTime);
      display.textContent = `${elapsed} ms`;
    }, 16);
  }

  falseStart() {
    clearTimeout(this.timeoutId);
    this.state = 'result';
    const display = this.container.querySelector('#pvt-timer-display');
    const prompt = this.container.querySelector('#pvt-prompt-text');
    const actionBtn = this.container.querySelector('#pvt-action-btn');

    display.textContent = 'FALSE START';
    display.className = 'pvt-timer-display false-start';
    prompt.textContent = 'Clicked before counter started (anticipation error). Repeat trial.';
    actionBtn.textContent = `RETRY TRIAL ${this.currentTrial}`;
    actionBtn.disabled = false;
    this.currentTrial--;
  }

  stopTrial() {
    clearInterval(this.timerId);
    const rt = Math.round(performance.now() - this.startTime);
    this.trials.push(rt);

    const display = this.container.querySelector('#pvt-timer-display');
    const prompt = this.container.querySelector('#pvt-prompt-text');
    const actionBtn = this.container.querySelector('#pvt-action-btn');

    display.textContent = `${rt} ms`;
    display.className = rt > 450 ? 'pvt-timer-display lapse' : 'pvt-timer-display success';
    prompt.textContent = rt > 450 ? 'Slow response (>450ms lapse detected)' : 'Reaction registered.';

    if (this.currentTrial < this.maxTrials) {
      this.state = 'result';
      actionBtn.textContent = `START TRIAL ${this.currentTrial + 1}`;
    } else {
      this.finishSession();
    }
  }

  finishSession() {
    this.state = 'finished';
    const summary = this.container.querySelector('#pvt-results-summary');
    const actionBtn = this.container.querySelector('#pvt-action-btn');
    const meanSpan = this.container.querySelector('#pvt-mean-rt');
    const lapsesSpan = this.container.querySelector('#pvt-lapses');
    const statusSpan = this.container.querySelector('#pvt-readiness-status');

    actionBtn.style.display = 'none';
    summary.style.display = 'block';

    const sum = this.trials.reduce((a, b) => a + b, 0);
    const mean = Math.round(sum / this.trials.length);
    const lapses = this.trials.filter(t => t > 450).length;

    meanSpan.textContent = `${mean} ms`;
    lapsesSpan.textContent = `${lapses}`;

    if (mean < 260 && lapses === 0) {
      statusSpan.textContent = 'EXCELLENT (PRIME)';
      statusSpan.className = 'val status-prime';
    } else if (mean < 340 && lapses <= 1) {
      statusSpan.textContent = 'NOMINAL (READY)';
      statusSpan.className = 'val status-ok';
    } else {
      statusSpan.textContent = 'FATIGUE DETECTED';
      statusSpan.className = 'val status-warn';
    }
  }

  destroy() {
    clearInterval(this.timerId);
    clearTimeout(this.timeoutId);
    window.removeEventListener('keydown', this.keyHandler);
    this.container.innerHTML = '';
  }
}
