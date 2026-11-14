/**
 * Estimates for channels the watch cannot measure (blood pressure, respiration,
 * body temperature). These are rough models driven by the live heart rate and
 * stress reading around a generic adult baseline. They are NOT measurements and
 * the UI labels them "est.".
 */

const BASE = { hr: 70, bpSys: 118, bpDia: 76, temp: 36.8, respRate: 14, stress: 25 };

export class PhysiologicalEngine {
  reset() {}

  derive({ hr, stress, caloriesKcal }) {
    hr = Number(hr);
    if (!hr || hr <= 0) return null;
    const stressVal = stress > 0 ? Number(stress) : BASE.stress;
    const kcal = Number(caloriesKcal) || 0;

    const baseMap = (BASE.bpSys + 2 * BASE.bpDia) / 3;
    const map = baseMap + 0.32 * (hr - BASE.hr) + 0.22 * (stressVal - BASE.stress);
    const pp = Math.max(30, (BASE.bpSys - BASE.bpDia) + 0.16 * (hr - BASE.hr));

    return {
      bpSys: Math.round(map + (2 / 3) * pp),
      bpDia: Math.round(map - (1 / 3) * pp),
      map: Math.round(map),
      respRate: Math.max(9, Math.min(28, Math.round(BASE.respRate + 0.1 * (hr - BASE.hr) + 0.04 * (stressVal - BASE.stress)))),
      temp: Number(Math.max(36.4, Math.min(39.2, BASE.temp + 0.01 * (hr - BASE.hr) + Math.min(0.4, (kcal / 400) * 0.25))).toFixed(1))
    };
  }
}

export const physiologicalEngine = new PhysiologicalEngine();
