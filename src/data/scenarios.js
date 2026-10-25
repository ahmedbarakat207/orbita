// Deep space health scenarios for simulation and autonomous diagnosis validation
export const MISSION_SCENARIOS = {
  nominal: {
    id: 'nominal',
    name: 'Nominal Operations',
    tag: 'STABLE BASELINE',
    severity: 'nominal', // nominal, warning, critical
    icon: 'fa-solid fa-shield-halved',
    description: 'Routine deep space transit conditions. Microgravity adaptation within expected flight parameters.',
    radiationFlux: 1.35, // mSv/day
    vitalsDelta: {
      hr: 68,
      bpSys: 118,
      bpDia: 76,
      spo2: 98.4,
      temp: 36.9,
      icp: 12.2,
      hrv: 62,
      respRate: 14
    },
    diagnostics: [
      {
        id: 'diag-0',
        title: 'Microgravity Cardiovascular Equilibrium',
        severity: 'info',
        summary: 'Cardiac output stable. Mild cephalic blood redistribution managed via daily exercise.',
        action: 'Maintain daily 2.5-hour ARED resistive loading and cycle ergometer protocol.'
      }
    ],
    countermeasures: [
      { id: 'ared', title: 'Daily ARED Resistance Protocol', urgency: 'routine', duration: '90 min', icon: 'fa-solid fa-dumbbell' },
      { id: 'cycle', title: 'T2 Cycle Ergometer Aerobic', urgency: 'routine', duration: '45 min', icon: 'fa-solid fa-heart-pulse' },
      { id: 'hydration', title: 'Hydration Target (2.5L/day)', urgency: 'routine', duration: 'Continuous', icon: 'fa-solid fa-droplet' }
    ],
    environmental: {
      ppco2: 2.7, // mmHg (safe is <3.0)
      pressure: 14.7, // psi
      o2Percent: 21.1,
      tempCabin: 22.4, // C
      radiationAlarm: false
    }
  },

  solar_particle_event: {
    id: 'solar_particle_event',
    name: 'Solar Particle Event (SPE Class X2.8)',
    tag: 'RADIATION THREAT',
    severity: 'critical',
    icon: 'fa-solid fa-radiation',
    description: 'External dosimeters detect coronal mass ejection shockwave. High proton flux breaching unshielded hull sections.',
    radiationFlux: 48.6, // mSv/day (Severe acute spike!)
    vitalsDelta: {
      hr: 92,
      bpSys: 136,
      bpDia: 88,
      spo2: 97.2,
      temp: 37.4,
      icp: 14.5,
      hrv: 34,
      respRate: 19
    },
    diagnostics: [
      {
        id: 'diag-spe',
        title: 'CRITICAL: Acute Solar Particle Event Radiation Influx',
        severity: 'critical',
        summary: 'Deep Space Ionization Sensor Array reading 48.6 mSv/day. Risk of acute radiation syndrome, lymphocyte depletion, and DNA double-strand breaks.',
        action: 'IMMEDIATE CREW ACTION: Retreat to central water-shielded crew storm haven. Deploy auxiliary polyethylene panels.'
      },
      {
        id: 'diag-stress',
        title: 'Autonomic Sympathetic Hyper-arousal',
        severity: 'warning',
        summary: 'Elevated resting HR (92 BPM) and depressed HRV (34 ms) consistent with acute physiological stress response.',
        action: 'Initiate guided acoustic pacing and tactical breathing protocol.'
      }
    ],
    countermeasures: [
      { id: 'shelter', title: 'Deploy Water-Wall Radiation Shelter', urgency: 'immediate', duration: 'Until All-Clear', icon: 'fa-solid fa-shield-halved' },
      { id: 'radioprotectant', title: 'Ingest Radioprotective Antioxidant Pack (Amifostine/Vitamin E)', urgency: 'immediate', duration: 'Stat dose', icon: 'fa-solid fa-pills' },
      { id: 'personal_dosimeter', title: 'Recalibrate Personal Luminescent Dosimeter Badge', urgency: 'high', duration: '5 min', icon: 'fa-solid fa-satellite-dish' }
    ],
    environmental: {
      ppco2: 3.1,
      pressure: 14.6,
      o2Percent: 21.0,
      tempCabin: 23.8,
      radiationAlarm: true
    }
  },

  sans_fluid_shift: {
    id: 'sans_fluid_shift',
    name: 'SANS & Cephalad Venous Stasis',
    tag: 'NEURO-OCULAR RISK',
    severity: 'warning',
    icon: 'fa-solid fa-eye',
    description: 'Loss of gravitational hydrostatic pressure gradient causes upwards fluid redistribution, elevating intracranial pressure and distending optic nerve sheaths.',
    radiationFlux: 1.38,
    vitalsDelta: {
      hr: 75,
      bpSys: 132,
      bpDia: 86,
      spo2: 98.1,
      temp: 37.0,
      icp: 21.4, // Marked ICP increase
      hrv: 46,
      respRate: 15
    },
    diagnostics: [
      {
        id: 'diag-sans',
        title: 'Spaceflight-Associated Neuro-Ocular Syndrome (SANS) Grade II',
        severity: 'warning',
        summary: 'Optic nerve sheath diameter (ONSD) estimated at 6.3 mm (Threshold: >5.8 mm). Retinal nerve fiber layer thickening detected via optical coherence tomography proxy.',
        action: 'Conduct urgent 45-minute Lower Body Negative Pressure (LBNP) chamber protocol at -35 mmHg to draw venous blood down into pelvis and calves.'
      },
      {
        id: 'diag-icp',
        title: 'Cephalad Intracranial Hyper-pressure (21.4 mmHg)',
        severity: 'warning',
        summary: 'Impaired glymphatic clearance and elevated cerebral venous sinus pressure causing frontal sinus fullness and visual acuity blur (-0.75 diopter shift).',
        action: 'Restrict high-sodium rations and administer venous flow countermeasure.'
      }
    ],
    countermeasures: [
      { id: 'lbnp', title: 'Lower Body Negative Pressure (LBNP -35 mmHg)', urgency: 'high', duration: '45 min', icon: 'fa-solid fa-compress' },
      { id: 'chorioretinal_scan', title: 'Perform Fundoscopy & ONSD Ultrasound Scan', urgency: 'high', duration: '20 min', icon: 'fa-solid fa-eye' },
      { id: 'head_elevate', title: 'Attach Dynamic Venous Restrictive Neck Collar', urgency: 'medium', duration: '60 min', icon: 'fa-solid fa-life-ring' }
    ],
    environmental: {
      ppco2: 2.8,
      pressure: 14.7,
      o2Percent: 21.0,
      tempCabin: 22.1,
      radiationAlarm: false
    }
  },

  cognitive_exhaustion: {
    id: 'cognitive_exhaustion',
    name: 'Circadian Desynchrony & Severe Fatigue',
    tag: 'BEHAVIORAL RISK',
    severity: 'warning',
    icon: 'fa-solid fa-bed',
    description: 'Disrupted orbital day/night cycles, EVA schedule shifts, and habitat noise induce chronic slow-wave sleep deficit and cognitive vigilance degradation.',
    radiationFlux: 1.36,
    vitalsDelta: {
      hr: 82,
      bpSys: 126,
      bpDia: 84,
      spo2: 97.6,
      temp: 36.7,
      icp: 13.8,
      hrv: 38,
      respRate: 17
    },
    diagnostics: [
      {
        id: 'diag-pvt',
        title: 'Psychomotor Vigilance Impairment (>390ms Reaction Latency)',
        severity: 'warning',
        summary: 'Psychomotor Vigilance Task (PVT) shows 4 lapses (>500ms response window) over past 12 hours. High operational risk for robotic arm or docking procedures.',
        action: 'Mandatory flight duty pause. Administer 40-minute scheduled nap and blue-enriched 480nm circadian light therapy.'
      },
      {
        id: 'diag-sleep',
        title: 'Sleep Architecture Fragmentation (REM <12%)',
        severity: 'warning',
        summary: 'Crew sleep monitor recorded 4.2 hours total sleep with zero consolidated deep slow-wave stage.',
        action: 'Engage habitat acoustic dampening white-noise generator and melatonin release schedule.'
      }
    ],
    countermeasures: [
      { id: 'pvt_test', title: 'Run Immediate 1-Minute PVT Fatigue Test', urgency: 'immediate', duration: '1 min', icon: 'fa-solid fa-stopwatch' },
      { id: 'phototherapy', title: 'Blue Spectrum 480nm Phototherapy Lightbox', urgency: 'high', duration: '30 min', icon: 'fa-solid fa-sun' },
      { id: 'sleep_sanctuary', title: 'Scheduled Sleep Pod Isolation with Active Noise Cancel', urgency: 'high', duration: '90 min', icon: 'fa-solid fa-bed' }
    ],
    environmental: {
      ppco2: 3.2,
      pressure: 14.7,
      o2Percent: 21.1,
      tempCabin: 22.8,
      radiationAlarm: false
    }
  },

  hypercalciuria_bone: {
    id: 'hypercalciuria_bone',
    name: 'Accelerated Bone Loss & Renal Lithiasis Risk',
    tag: 'MUSCULOSKELETAL',
    severity: 'warning',
    icon: 'fa-solid fa-bone',
    description: 'Absence of gravity-induced mechanical strain uncouples osteoblasts and osteoclasts, releasing bone calcium into blood and kidneys.',
    radiationFlux: 1.34,
    vitalsDelta: {
      hr: 70,
      bpSys: 122,
      bpDia: 78,
      spo2: 98.2,
      temp: 36.9,
      icp: 12.6,
      hrv: 55,
      respRate: 14
    },
    diagnostics: [
      {
        id: 'diag-bone',
        title: 'Trabecular Demineralization (-1.4% Monthly BMD)',
        severity: 'warning',
        summary: 'Proximal femur and lumbar DEXA proxy indicates accelerated bone resorption. Serum ionized calcium elevated to 1.38 mmol/L.',
        action: 'Increase ARED axial compressive load by +15% and verify bisphosphonate dosing compliance.'
      },
      {
        id: 'diag-kidney',
        title: 'High Risk for Calcium Oxalate Nephrolithiasis (Kidney Stones)',
        severity: 'warning',
        summary: 'Urinary calcium excretion elevated with urine specific gravity > 1.028. High risk of incapacitating renal colic during deep space flight.',
        action: 'Mandatory 3.5L fluid titration with potassium citrate alkalinization.'
      }
    ],
    countermeasures: [
      { id: 'ared_heavy', title: 'ARED High-Resistance Axial Loading (Squat/Heel Raise)', urgency: 'high', duration: '60 min', icon: 'fa-solid fa-dumbbell' },
      { id: 'citrate', title: 'Administer Potassium Citrate 20 mEq Oral Pack', urgency: 'high', duration: 'Stat', icon: 'fa-solid fa-pills' },
      { id: 'fluid_load', title: 'Targeted Hydration Infusion (Electrolyte Electrolysis)', urgency: 'high', duration: '3.5L Target', icon: 'fa-solid fa-droplet' }
    ],
    environmental: {
      ppco2: 2.7,
      pressure: 14.7,
      o2Percent: 21.0,
      tempCabin: 22.0,
      radiationAlarm: false
    }
  }
};
