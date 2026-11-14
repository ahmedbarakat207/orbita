// AURA-OS Mission Telemetry Session Recorder & Playback Engine
// NASA International Space Apps Challenge 2026

export class SessionRecorder {
  constructor(onUpdate) {
    this.onUpdate = onUpdate; // Callback on record/playback state updates
    this.isRecording = false;
    this.isPlaying = false;
    this.playbackSpeed = 1; // 1x or 5x
    this.recordedFrames = [];
    this.startTime = null;
    this.timerInterval = null;
    this.playbackTimer = null;
    this.playbackIndex = 0;
    this.onPlaybackFrame = null;
    this.activeCrewId = 'elena_vance';
    this.currentSol = 142;
  }

  setContext(crewId, sol) {
    this.activeCrewId = crewId;
    this.currentSol = sol;
  }

  startRecording() {
    if (this.isPlaying) this.stopPlayback();
    this.isRecording = true;
    this.recordedFrames = [];
    this.startTime = Date.now();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.notifyUpdate();
    }, 500);

    this.notifyUpdate();
  }

  stopRecording() {
    this.isRecording = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.notifyUpdate();
    return this.recordedFrames.length;
  }

  recordFrame(vitals, hardwareSource = null, isOffWrist = false) {
    if (!this.isRecording) return;

    const now = Date.now();
    const elapsedSec = ((now - this.startTime) / 1000).toFixed(1);

    const frame = {
      timestamp: new Date(now).toISOString(),
      elapsedSec: parseFloat(elapsedSec),
      sol: this.currentSol,
      crewId: this.activeCrewId,
      hr: (vitals.hr && vitals.hr > 0) ? Math.round(vitals.hr) : null,
      spo2: (vitals.spo2 && vitals.spo2 > 0) ? parseFloat(vitals.spo2.toFixed(1)) : null,
      respRate: (vitals.respRate && vitals.respRate > 0) ? Math.round(vitals.respRate) : null,
      hrv: (vitals.hrv && vitals.hrv > 0) ? Math.round(vitals.hrv) : null,
      pnn50: (vitals.pnn50 !== undefined && vitals.pnn50 !== null) ? parseFloat(vitals.pnn50.toFixed(1)) : null,
      temp: (vitals.temp && vitals.temp > 0) ? parseFloat(vitals.temp.toFixed(1)) : null,
      icp: (vitals.icp && vitals.icp > 0) ? parseFloat(vitals.icp.toFixed(1)) : null,
      bpSys: (vitals.bpSys && vitals.bpSys > 0) ? Math.round(vitals.bpSys) : null,
      bpDia: (vitals.bpDia && vitals.bpDia > 0) ? Math.round(vitals.bpDia) : null,
      contact: !isOffWrist,
      hardwareSource: hardwareSource || 'Flight Baseline Simulation'
    };

    this.recordedFrames.push(frame);

    // Keep memory capped at 7200 frames (approx 2 hours of continuous logging)
    if (this.recordedFrames.length > 7200) {
      this.recordedFrames.shift();
    }
  }

  getDurationSeconds() {
    if (!this.startTime) return 0;
    if (this.isRecording) {
      return Math.floor((Date.now() - this.startTime) / 1000);
    }
    if (this.recordedFrames.length > 0) {
      return Math.floor(this.recordedFrames[this.recordedFrames.length - 1].elapsedSec);
    }
    return 0;
  }

  getSampleCount() {
    return this.recordedFrames.length;
  }

  getStats() {
    if (this.recordedFrames.length === 0) {
      return { samples: 0, meanHr: 0, minSpo2: 0, meanHrv: 0, meanResp: 0 };
    }

    const validFrames = this.recordedFrames.filter(f => f.contact && f.hr > 0);
    const pool = validFrames.length > 0 ? validFrames : this.recordedFrames;

    const sumHr = pool.reduce((acc, f) => acc + f.hr, 0);
    const sumHrv = pool.reduce((acc, f) => acc + f.hrv, 0);
    const sumResp = pool.reduce((acc, f) => acc + f.respRate, 0);
    const minSpo2 = pool.reduce((min, f) => (f.spo2 > 0 && f.spo2 < min ? f.spo2 : min), 100);

    return {
      samples: this.recordedFrames.length,
      meanHr: Math.round(sumHr / pool.length),
      minSpo2: minSpo2 < 100 ? minSpo2 : 98.0,
      meanHrv: Math.round(sumHrv / pool.length),
      meanResp: Math.round(sumResp / pool.length)
    };
  }

  exportCSV() {
    if (this.recordedFrames.length === 0) return null;

    const stats = this.getStats();
    let csv = '';
    // Metadata Header
    csv += '# ====================================================================\n';
    csv += '# NASA HUMAN RESEARCH PROGRAM (HRP) - AURA-OS BIOMETRIC FLIGHT RECORD\n';
    csv += `# Export Generated: ${new Date().toISOString()}\n`;
    csv += `# Crew Subject: ${this.activeCrewId} | Mission Sol: ${this.currentSol}\n`;
    csv += `# Total Samples: ${stats.samples} | Avg HR: ${stats.meanHr} BPM | Min SpO2: ${stats.minSpo2}%\n`;
    csv += '# BioSensor Hardware: ESP32-C3 RISC-V + MAX30102 PPG Optical Subsystem\n';
    csv += '# ====================================================================\n';
    
    // Column Header
    csv += 'Timestamp,Elapsed_Seconds,Sol,Crew_ID,Heart_Rate_BPM,SpO2_Percent,Resp_Rate_BrPM,HRV_SDNN_ms,pNN50_Percent,Temp_C,ICP_mmHg,BP_Systolic,BP_Diastolic,Skin_Contact,Telemetry_Source\n';

    // Rows
    const v = (val) => (val === null || val === undefined ? '' : val);
    this.recordedFrames.forEach(f => {
      csv += `${f.timestamp},${f.elapsedSec},${f.sol},${f.crewId},${v(f.hr)},${v(f.spo2)},${v(f.respRate)},${v(f.hrv)},${v(f.pnn50)},${v(f.temp)},${v(f.icp)},${v(f.bpSys)},${v(f.bpDia)},${f.contact},"${f.hardwareSource}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AURA_Telemetry_Sol${this.currentSol}_${this.activeCrewId}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  exportJSON() {
    if (this.recordedFrames.length === 0) return null;

    const payload = {
      mission: 'NASA International Space Apps Challenge 2026',
      program: 'AURA-OS Autonomous Astronaut Telemetry System',
      hardwareTarget: 'ESP32-C3 Biosensor Band with MAX30102 Optical PPG',
      exportedAt: new Date().toISOString(),
      crewSubject: this.activeCrewId,
      missionSol: this.currentSol,
      summaryStats: this.getStats(),
      telemetryFrames: this.recordedFrames
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AURA_Telemetry_Sol${this.currentSol}_${this.activeCrewId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  startPlayback(onFrameCallback, speed = 1) {
    if (this.recordedFrames.length === 0) return false;
    if (this.isRecording) this.stopRecording();

    this.isPlaying = true;
    this.playbackSpeed = speed;
    this.playbackIndex = 0;
    this.onPlaybackFrame = onFrameCallback;

    const intervalMs = Math.max(40, Math.floor(200 / this.playbackSpeed));

    if (this.playbackTimer) clearInterval(this.playbackTimer);
    this.playbackTimer = setInterval(() => {
      if (this.playbackIndex >= this.recordedFrames.length) {
        this.stopPlayback();
        return;
      }

      const frame = this.recordedFrames[this.playbackIndex];
      if (this.onPlaybackFrame) {
        this.onPlaybackFrame(frame);
      }
      this.playbackIndex++;
      this.notifyUpdate();
    }, intervalMs);

    this.notifyUpdate();
    return true;
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.notifyUpdate();
  }

  notifyUpdate() {
    if (this.onUpdate) {
      this.onUpdate({
        isRecording: this.isRecording,
        isPlaying: this.isPlaying,
        playbackIndex: this.playbackIndex,
        totalFrames: this.recordedFrames.length,
        durationSec: this.getDurationSeconds(),
        stats: this.getStats()
      });
    }
  }
}
