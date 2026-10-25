// High-precision real-time ECG oscilloscope with medical grid and phosphor glow
export class EcgOscilloscope {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onBeat = options.onBeat || null;

    this.bpm = options.bpm || 68;
    this.stressLevel = 0; // 0 to 1
    this.running = false;
    this.animationId = null;

    // Buffer for waveform points
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.sweepX = 0;
    this.history = new Float32Array(this.width);
    this.plethHistory = new Float32Array(this.width);

    // Cardiac cycle timing
    this.cyclePhase = 0; // 0 to 1
    this.lastTimestamp = 0;
    this.isBeating = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.ctx.scale(dpr, dpr);
      
      // re-allocate buffers to fit logical width
      this.logicalWidth = Math.floor(rect.width);
      this.logicalHeight = Math.floor(rect.height);
      this.history = new Float32Array(this.logicalWidth);
      this.plethHistory = new Float32Array(this.logicalWidth);
      this.sweepX = 0;
    }
  }

  setBpm(bpm, stress = 0) {
    this.bpm = Math.max(40, Math.min(180, bpm));
    this.stressLevel = Math.max(0, Math.min(1, stress));
  }

  // Generate realistic P-Q-R-S-T voltage at phase (0 to 1)
  getEcgVoltage(phase) {
    // Normal ECG wave intervals within cardiac cycle
    // 0.00 - 0.10: baseline
    // 0.10 - 0.20: P-wave (atrial depolarization)
    // 0.20 - 0.25: PR segment
    // 0.25 - 0.28: Q-wave (septal depolarization)
    // 0.28 - 0.32: R-wave (ventricular depolarization - sharp peak)
    // 0.32 - 0.36: S-wave (ventricular depolarization - negative dip)
    // 0.36 - 0.46: ST segment
    // 0.46 - 0.65: T-wave (ventricular repolarization)
    // 0.65 - 1.00: baseline diastole

    let val = 0;

    if (phase > 0.08 && phase < 0.20) {
      // P wave
      const p = (phase - 0.08) / 0.12;
      val = Math.sin(p * Math.PI) * 0.15;
    } else if (phase >= 0.25 && phase < 0.28) {
      // Q dip
      const q = (phase - 0.25) / 0.03;
      val = -Math.sin(q * Math.PI) * 0.12;
    } else if (phase >= 0.28 && phase < 0.33) {
      // R spike
      const r = (phase - 0.28) / 0.05;
      val = Math.sin(r * Math.PI) * 1.0;
      if (r > 0.4 && r < 0.6 && !this.isBeating) {
        this.isBeating = true;
        if (this.onBeat) this.onBeat(this.bpm);
      }
    } else if (phase >= 0.33 && phase < 0.37) {
      // S dip
      const s = (phase - 0.33) / 0.04;
      val = -Math.sin(s * Math.PI) * 0.25;
      this.isBeating = false;
    } else if (phase >= 0.44 && phase < 0.62) {
      // T wave
      const t = (phase - 0.44) / 0.18;
      val = Math.sin(t * Math.PI) * 0.28;
    }

    // Add mild high-frequency noise & microgravity motion jitter
    const jitter = (Math.random() - 0.5) * 0.03 * (1 + this.stressLevel * 2);
    return val + jitter;
  }

  // Generate realistic plethysmograph pulse wave (PPG)
  getPlethVoltage(phase) {
    // Pulse arrives slightly delayed after R-wave
    const delayed = (phase + 0.85) % 1.0;
    if (delayed < 0.4) {
      // Systolic upstroke & peak
      const p = delayed / 0.4;
      return Math.sin(p * Math.PI * 0.5);
    } else if (delayed < 0.6) {
      // Dicrotic notch
      const d = (delayed - 0.4) / 0.2;
      return 0.7 - Math.sin(d * Math.PI) * 0.15;
    } else {
      // Diastolic runoff
      const r = (delayed - 0.6) / 0.4;
      return 0.55 * Math.exp(-r * 3);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.animate(this.lastTimestamp);
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate(timestamp) {
    if (!this.running) return;

    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    const width = this.logicalWidth || 600;
    const height = this.logicalHeight || 180;

    // Advance cardiac cycle based on BPM
    // Beats per second = bpm / 60
    const bps = this.bpm / 60;
    this.cyclePhase = (this.cyclePhase + dt * bps) % 1.0;

    // Sweep speed (pixels per second)
    const sweepSpeed = width / 3.0; // 3 seconds per screen sweep
    const pixelsToAdvance = Math.max(1, Math.round(sweepSpeed * dt));

    for (let i = 0; i < pixelsToAdvance; i++) {
      const currentX = (this.sweepX + i) % width;
      const samplePhase = (this.cyclePhase + (i / pixelsToAdvance) * (dt * bps)) % 1.0;
      
      this.history[currentX] = this.getEcgVoltage(samplePhase);
      this.plethHistory[currentX] = this.getPlethVoltage(samplePhase);
    }

    this.sweepX = (this.sweepX + pixelsToAdvance) % width;

    this.draw(width, height);

    this.animationId = requestAnimationFrame((t) => this.animate(t));
  }

  draw(width, height) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw subtle medical oscilloscope grid
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 20;

    ctx.beginPath();
    for (let x = 0; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 2. Draw ECG Lead II Trace (Emerald neon)
    const ecgBaseline = height * 0.45;
    const ecgAmplitude = height * 0.35;

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    let started = false;
    for (let x = 0; x < width; x++) {
      // Erase gap ahead of sweep bar
      const distFromSweep = (x - this.sweepX + width) % width;
      if (distFromSweep < 25) {
        continue; // Blank erase head zone
      }

      const y = ecgBaseline - this.history[x] * ecgAmplitude;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();

    // 3. Draw Plethysmograph Wave (Amber / Pulse Violet)
    const plethBaseline = height * 0.82;
    const plethAmplitude = height * 0.18;

    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#10b981';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    let pStarted = false;
    for (let x = 0; x < width; x++) {
      const distFromSweep = (x - this.sweepX + width) % width;
      if (distFromSweep < 25) continue;

      const y = plethBaseline - this.plethHistory[x] * plethAmplitude;
      if (!pStarted) {
        ctx.moveTo(x, y);
        pStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();

    // 4. Draw Oscilloscope Sweep Bar (Phosphor glowing vertical line)
    const sweepBarGrad = ctx.createLinearGradient(this.sweepX, 0, this.sweepX, height);
    sweepBarGrad.addColorStop(0, 'rgba(0, 242, 254, 0.0)');
    sweepBarGrad.addColorStop(0.5, 'rgba(0, 242, 254, 0.9)');
    sweepBarGrad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

    ctx.fillStyle = sweepBarGrad;
    ctx.fillRect(this.sweepX - 1, 0, 3, height);

    // Glow dot on sweep head
    const sweepY = ecgBaseline - (this.history[this.sweepX] || 0) * ecgAmplitude;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.sweepX, sweepY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
