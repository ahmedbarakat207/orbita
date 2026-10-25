// Crew profiles with biomedical baselines and spaceflight telemetry
export const CREW_MEMBERS = [
  {
    id: 'elena_vance',
    name: 'Cmdr. Elena Vance, Ph.D.',
    callsign: 'ARES-1',
    role: 'Mission Commander & Systems Specialist',
    photo: '/astronaut_elena.jpg',
    age: 41,
    bloodType: 'O-Negative',
    daysInMicrogravity: 142,
    missionSol: 142,
    baselineVO2Max: '49.2 mL/kg/min',
    evaHoursTotal: '38.5 hrs',
    bodyMass: 62.4, // kg
    massLossSinceLaunch: '-1.8 kg',
    geneticRadiationRisk: 'Standard',
    status: 'Nominal',
    baseVitals: {
      hr: 68,
      hrRange: [64, 73],
      bpSys: 116,
      bpDia: 74,
      spo2: 98.4,
      temp: 36.9,
      respRate: 14,
      hrv: 62, // ms SDNN
      icp: 12.1, // mmHg (Intracranial pressure proxy)
      radiationAccumulated: 84.6, // mSv
      radiationFlux: 1.35, // mSv/day
      boneLossRate: 0.9, // % per month
      muscleMassIndex: 94.2, // % of baseline
      sleepScore: 84, // out of 100
      cognitiveReadiness: 92, // %
    },
    countermeasuresActive: [
      { id: 'ared', name: 'ARED Resistive Exercise', progress: 100, schedule: '08:00 UTC', status: 'Completed' },
      { id: 'lbnp', name: 'LBNP Decompression Session', progress: 45, schedule: '14:30 UTC', status: 'In Progress' },
      { id: 'phototherapy', name: 'Blue-Spectrum Circadian Regimen', progress: 0, schedule: '19:00 UTC', status: 'Pending' }
    ]
  },
  {
    id: 'marcus_reid',
    name: 'Dr. Marcus Reid, M.D., Ph.D.',
    callsign: 'ARES-2',
    role: 'Crew Medical Officer & Astrobiologist',
    photo: '/astronaut_marcus.jpg',
    age: 46,
    bloodType: 'A-Positive',
    daysInMicrogravity: 142,
    missionSol: 142,
    baselineVO2Max: '46.8 mL/kg/min',
    evaHoursTotal: '24.0 hrs',
    bodyMass: 78.1, // kg
    massLossSinceLaunch: '-2.3 kg',
    geneticRadiationRisk: 'Mild Elevated (GCLC Polymorphism)',
    status: 'Elevated ICP / SANS Risk',
    baseVitals: {
      hr: 74,
      hrRange: [71, 80],
      bpSys: 128,
      bpDia: 82,
      spo2: 97.9,
      temp: 37.1,
      respRate: 16,
      hrv: 48,
      icp: 16.8, // Mild elevation
      radiationAccumulated: 88.2,
      radiationFlux: 1.42,
      boneLossRate: 1.1,
      muscleMassIndex: 91.8,
      sleepScore: 71,
      cognitiveReadiness: 81,
    },
    countermeasuresActive: [
      { id: 'ared', name: 'ARED Resistive Exercise', progress: 60, schedule: '10:00 UTC', status: 'In Progress' },
      { id: 'lbnp', name: 'LBNP SANS Fluid Shift Decompression', progress: 0, schedule: '15:00 UTC', status: 'Recommended Urgent' },
      { id: 'potassium_citrate', name: 'Renal Alkalinization Protocol', progress: 100, schedule: '07:30 UTC', status: 'Completed' }
    ]
  }
];
