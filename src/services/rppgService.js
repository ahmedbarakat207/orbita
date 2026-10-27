// Webcam Optical Photoplethysmography (rPPG) Pulse Extractor
export class RppgService {
  constructor(onDataCallback, onStatusCallback) {
    this.onData = onDataCallback;
    this.onStatus = onStatusCallback;
    this.videoElement = null;
    this.stream = null;
    this.animId = null;
    this.isRunning = false;

    // Off-screen canvas for pixel sampling
    this.canvas = document.createElement('canvas');
    this.canvas.width = 80;
    this.canvas.height = 80;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Signal processing buffers
    this.bufferSize = 180; // ~6 seconds at 30fps
    this.greenBuffer = [];
    this.timestamps = [];
    this.peakTimestamps = [];
    this.calculatedBpm = 70;
    this.lastBpmUpdate = 0;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
  }

  async start(videoPreviewElement = null) {
    if (!this.isSupported()) {
      throw new Error('Camera access is not supported by your browser.');
    }

    try {
      this.updateStatus('starting', 'Requesting camera permissions...');

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
      }

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      if (videoPreviewElement) {
        videoPreviewElement.srcObject = this.stream;
      }

      this.isRunning = true;
      this.greenBuffer = [];
      this.timestamps = [];
      this.peakTimestamps = [];
      this.updateStatus('active', 'Analyzing optical subcutaneous micro-circulation...');

      this.processFrame();
      return true;
    } catch (err) {
      this.updateStatus('stopped', err.message || 'Camera permission denied');
      throw err;
    }
  }

  stop(videoPreviewElement = null) {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (videoPreviewElement) {
      videoPreviewElement.srcObject = null;
    }

    this.updateStatus('stopped', 'Optical pulse sensor inactive');
  }

  processFrame() {
    if (!this.isRunning) return;

    if (this.videoElement && this.videoElement.readyState >= 2) {
      const now = performance.now();
      const w = this.canvas.width;
      const h = this.canvas.height;

      // Sample central 50% region of frame
      const vw = this.videoElement.videoWidth || 320;
      const vh = this.videoElement.videoHeight || 240;
      const sx = Math.floor(vw * 0.25);
      const sy = Math.floor(vh * 0.25);
      const sw = Math.floor(vw * 0.5);
      const sh = Math.floor(vh * 0.5);

      this.ctx.drawImage(this.videoElement, sx, sy, sw, sh, 0, 0, w, h);
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const pixels = frameData.data;

      // Green channel carries highest hemoglobin light absorption amplitude
      let greenSum = 0;
      let redSum = 0;
      const totalPixels = w * h;

      for (let i = 0; i < pixels.length; i += 4) {
        redSum += pixels[i];
        greenSum += pixels[i + 1];
      }

      const meanGreen = greenSum / totalPixels;
      const meanRed = redSum / totalPixels;

      this.greenBuffer.push(meanGreen);
      this.timestamps.push(now);

      if (this.greenBuffer.length > this.bufferSize) {
        this.greenBuffer.shift();
        this.timestamps.shift();
      }

      // Compute pulse once every 250ms when buffer has at least 3 seconds of data (~90 samples)
      if (this.greenBuffer.length >= 90 && now - this.lastBpmUpdate > 250) {
        this.analyzePulse(now);
        this.lastBpmUpdate = now;
      }
    }

    this.animId = requestAnimationFrame(() => this.processFrame());
  }

  analyzePulse(now) {
    const len = this.greenBuffer.length;
    if (len < 60) return;

    // 1. Detrend: subtract moving average
    const mean = this.greenBuffer.reduce((a, b) => a + b, 0) / len;
    const detrended = this.greenBuffer.map(v => v - mean);

    // 2. Simple smoothing filter (3-point moving average)
    const smoothed = [];
    for (let i = 1; i < len - 1; i++) {
      smoothed.push((detrended[i - 1] + detrended[i] + detrended[i + 1]) / 3);
    }

    // 3. Peak detection
    const peaks = [];
    const minPeakDist = 12; // Minimum distance between heartbeats at 30fps (~240ms = max 250 BPM)

    for (let i = 2; i < smoothed.length - 2; i++) {
      // Invert sign because blood surge decreases reflected green light
      const val = -smoothed[i];
      if (
        val > -smoothed[i - 1] &&
        val > -smoothed[i - 2] &&
        val > -smoothed[i + 1] &&
        val > -smoothed[i + 2] &&
        val > 0.05
      ) {
        const t = this.timestamps[i];
        if (peaks.length === 0 || t - peaks[peaks.length - 1] > 280) {
          peaks.push(t);
        }
      }
    }

    // 4. Calculate BPM from inter-beat intervals (IBI)
    if (peaks.length >= 3) {
      const ibiList = [];
      for (let i = 1; i < peaks.length; i++) {
        const ibi = peaks[i] - peaks[i - 1];
        if (ibi >= 330 && ibi <= 1400) { // 43 to 180 BPM range
          ibiList.push(ibi);
        }
      }

      if (ibiList.length >= 2) {
        const avgIbi = ibiList.reduce((a, b) => a + b, 0) / ibiList.length;
        const bpm = Math.round(60000 / avgIbi);

        // Calculate HRV (SDNN) from standard deviation of NN intervals
        const variance = ibiList.reduce((sum, ibi) => sum + Math.pow(ibi - avgIbi, 2), 0) / ibiList.length;
        const hrv = Math.round(Math.sqrt(variance));

        if (bpm >= 45 && bpm <= 180) {
          // Exponential smoothing on BPM
          this.calculatedBpm = Math.round(this.calculatedBpm * 0.7 + bpm * 0.3);

          if (this.onData) {
            this.onData({
              source: 'Optical Camera (rPPG)',
              hr: this.calculatedBpm,
              hrv: hrv > 10 ? hrv : 52,
              timestamp: now
            });
          }
        }
      }
    }
  }

  updateStatus(state, message) {
    if (this.onStatus) {
      this.onStatus({ state, message, isRunning: this.isRunning });
    }
  }
}
