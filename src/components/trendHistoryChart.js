// AURA-OS 5-Minute Continuous Multi-Channel Trend History Chart
// High-performance Canvas renderer with aerospace grid, reticle inspection, and channel toggles

export class TrendHistoryChart {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.maxPoints = options.maxPoints || 300; // 5 minutes at 1 sample/sec
    this.history = [];
    
    // Active channel visibility - Tactical Telemetry Archetype
    this.channels = {
      hr: { name: 'Heart Rate', color: '#eaeaea', unit: 'BPM', min: 40, max: 160, enabled: true },
      spo2: { name: 'SpO2 Oxygen', color: '#4af626', unit: '%', min: 88, max: 100, enabled: true },
      stress: { name: 'Stress', color: '#f59e0b', unit: '/100', min: 0, max: 100, enabled: true },
      rr: { name: 'Resp Rate', color: '#38bdf8', unit: 'BrPM', min: 8, max: 32, enabled: false },
      hrv: { name: 'HRV (SDNN)', color: '#ff2a2a', unit: 'ms', min: 10, max: 120, enabled: false }
    };

    this.hoverPos = null;
    this.isHovering = false;

    this.initEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.isHovering = true;
      this.draw();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.hoverPos = null;
      this.draw();
    });
  }

  resize() {
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, rect.width || 600);
    const height = Math.max(160, rect.height || 180);

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.draw();
  }

  toggleChannel(channelKey) {
    if (this.channels[channelKey]) {
      this.channels[channelKey].enabled = !this.channels[channelKey].enabled;
      this.draw();
      return this.channels[channelKey].enabled;
    }
    return false;
  }

  appendPoint(vitals) {
    const point = {
      timestamp: Date.now(),
      hr: (vitals.hr && vitals.hr > 0) ? vitals.hr : null,
      spo2: (vitals.spo2 && vitals.spo2 > 0) ? vitals.spo2 : null,
      stress: (vitals.stress && vitals.stress > 0) ? vitals.stress : null,
      rr: (vitals.respRate && vitals.respRate > 0) ? vitals.respRate : ((vitals.rr && vitals.rr > 0) ? vitals.rr : null),
      hrv: (vitals.hrv && vitals.hrv > 0) ? vitals.hrv : null
    };

    this.history.push(point);
    if (this.history.length > this.maxPoints) {
      this.history.shift();
    }

    this.draw();
  }

  clear() {
    this.history = [];
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.logicalWidth || this.canvas.width;
    const h = this.logicalHeight || this.canvas.height;
    if (!w || !h) return;

    // Background clearing - CRT deep substrate
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, w, h);

    const padLeft = 46;
    const padRight = 16;
    const padTop = 20;
    const padBottom = 26;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    // Draw Tactical Grid
    this.drawGrid(ctx, padLeft, padTop, graphW, graphH);

    // If no data points yet, render awaiting status
    if (this.history.length < 2) {
      ctx.fillStyle = '#666666';
      ctx.font = '10px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ ACCUMULATING TELEMETRY BUFFER // STANDBY ]', padLeft + graphW / 2, padTop + graphH / 2);
      return;
    }

    // Plot each enabled channel
    Object.keys(this.channels).forEach((key) => {
      const ch = this.channels[key];
      if (!ch.enabled) return;
      this.plotSeries(ctx, key, ch, padLeft, padTop, graphW, graphH);
    });

    // Reticle & Hover Inspector
    if (this.isHovering && this.hoverPos) {
      this.drawInspector(ctx, padLeft, padTop, graphW, graphH);
    }
  }

  drawGrid(ctx, padLeft, padTop, graphW, graphH) {
    ctx.strokeStyle = 'rgba(234, 234, 234, 0.08)';
    ctx.lineWidth = 1;

    // 4 Horizontal divisions
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (graphH * i) / 4;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + graphW, y);
      ctx.stroke();
    }

    // 5 Vertical time divisions (-5m, -4m, -3m, -2m, -1m, NOW)
    const timeLabels = ['-5M', '-4M', '-3M', '-2M', '-1M', 'NOW'];
    ctx.font = '9px "Space Mono", monospace';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.setLineDash([]);

    for (let i = 0; i <= 5; i++) {
      const x = padLeft + (graphW * i) / 5;
      ctx.strokeStyle = 'rgba(234, 234, 234, 0.06)';
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + graphH);
      ctx.stroke();

      ctx.fillText(timeLabels[i], x, padTop + graphH + 16);
    }

    // Left axis labels for primary Heart Rate (40 to 160)
    ctx.textAlign = 'right';
    const hrScale = [160, 130, 100, 70, 40];
    for (let i = 0; i < 5; i++) {
      const y = padTop + (graphH * i) / 4;
      ctx.fillStyle = '#888888';
      ctx.fillText(`${hrScale[i]}`, padLeft - 6, y + 3);
    }
  }

  plotSeries(ctx, key, ch, padLeft, padTop, graphW, graphH) {
    const pts = this.history;
    const len = pts.length;
    const step = graphW / Math.max(this.maxPoints - 1, len - 1);
    const startX = padLeft + graphW - (len - 1) * step;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';

    let hasDrawn = false;
    let inSegment = false;

    pts.forEach((pt, idx) => {
      const val = pt[key];
      if (val === null || val === undefined || isNaN(val) || val <= 0) {
        inSegment = false;
        return;
      }
      hasDrawn = true;
      const clamped = Math.max(ch.min, Math.min(ch.max, val));
      const norm = (clamped - ch.min) / (ch.max - ch.min);
      const x = startX + idx * step;
      const y = padTop + graphH - norm * graphH;

      if (!inSegment) {
        ctx.moveTo(x, y);
        inSegment = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    if (hasDrawn) {
      ctx.stroke();
    }

    // Sharp square at current tip
    if (len > 0) {
      const lastPt = pts[len - 1];
      const val = lastPt[key];
      if (val !== null && val !== undefined && val > 0) {
        const clamped = Math.max(ch.min, Math.min(ch.max, val));
        const norm = (clamped - ch.min) / (ch.max - ch.min);
        const lastX = padLeft + graphW;
        const lastY = padTop + graphH - norm * graphH;

        ctx.fillStyle = ch.color;
        ctx.fillRect(lastX - 2, lastY - 2, 4, 4);
      }
    }

    ctx.restore();
  }

  drawInspector(ctx, padLeft, padTop, graphW, graphH) {
    const x = Math.max(padLeft, Math.min(padLeft + graphW, this.hoverPos.x));
    
    // Vertical Reticle Line
    ctx.save();
    ctx.strokeStyle = '#eaeaea';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + graphH);
    ctx.stroke();

    // Find closest data point
    const len = this.history.length;
    const step = graphW / Math.max(this.maxPoints - 1, len - 1);
    const startX = padLeft + graphW - (len - 1) * step;
    const idx = Math.round((x - startX) / step);

    if (idx >= 0 && idx < len) {
      const pt = this.history[idx];
      const elapsedAgo = Math.round((Date.now() - pt.timestamp) / 1000);
      const minAgo = Math.floor(elapsedAgo / 60);
      const secAgo = elapsedAgo % 60;
      const timeStr = `-${minAgo}M ${secAgo}S`;

      // Readout Box - Brutalist 90° box, no rounded corners
      const boxW = 128;
      const boxH = 88;
      let boxX = x + 10;
      if (boxX + boxW > padLeft + graphW) boxX = x - boxW - 10;
      const boxY = padTop + 8;

      ctx.fillStyle = '#0e0e0e';
      ctx.strokeStyle = '#eaeaea';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.font = '9px "Space Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888888';
      ctx.fillText(`T // ${timeStr}`, boxX + 8, boxY + 14);

      let lineY = boxY + 28;
      Object.keys(this.channels).forEach((key) => {
        const ch = this.channels[key];
        if (ch.enabled) {
          const raw = pt[key];
          const valStr = (raw !== null && raw !== undefined && raw > 0) ? `${Math.round(raw)} ${ch.unit}` : '--';
          ctx.fillStyle = ch.color;
          ctx.fillText(`${ch.name.slice(0, 4)}: ${valStr}`, boxX + 8, lineY);
          lineY += 13;
        }
      });
    }

    ctx.restore();
  }
}
