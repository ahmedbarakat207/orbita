# 🛰️ Orbita — Autonomous Crew Health Telemetry Station

> **NASA Space Apps Challenge 2026** · Crew Health & Exploration Biometrics track

Orbita is a real-time bioastronautics telemetry platform that pairs a commercial off-the-shelf (COTS) smartwatch with a local BLE bridge and a browser dashboard — no cloud required. It monitors crew vitals in-flight and dispatches danger alerts to both the mission controller's screen and directly to the crewmember's wrist.

---

## 🌌 NASA HRP Hazard Coverage

Orbita targets four of NASA's five [Human Research Program hazards](https://www.nasa.gov/hrp/hazards/):

| Hazard | Orbita Feature |
|---|---|
| **Altered Gravity Fields** | HRV (SDNN) orthostatic stress index, autonomic load monitor |
| **Hostile Closed Environments** | Continuous HR + SpO₂ baseline drift detection |
| **Distance from Earth** | 100 % offline edge autonomy — zero cloud dependency |
| **Radiation** | *(future)* Integration hook ready for CSA dosimetry sensor |
| **Isolation & Confinement** | Multi-crew selector, session recorder for longitudinal trend review |

**Reference resources:**
- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) — NASA HRP
- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/) — NASA HRP
- [Ongoing HRP Research in Space](https://www.nasa.gov/hrp/ongoing-hrp-research/) — NASA HRP
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) — CSA
- [Why Do We Conduct Science Experiments in Space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) — CSA

> **Disclaimer:** NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.

---

## 🏗️ Architecture

```
Amazfit Bip U (BLE)
      │  GATT / AES-128 auth
      ▼
Python BLE Bridge  ◄──────────────────────────────────────────┐
(tools/bip_u_bridge.py)                                       │
      │  HTTP REST (localhost:8766)                           │
      ▼                                                       │
Vite Dashboard  ──── danger alert ──► Desktop Notification    │
(index.html / src/)  ──────────────► Watch Haptic + Alert ───┘
```

**Hardware:** Amazfit Bip U — COTS philosophy (same approach NASA uses with iPads on the ISS)

---

## ✨ Feature Highlights

- **Live telemetry** — HR, HRV (SDNN from reconstructed RR), autonomic stress index, SpO₂, steps, calories, PAI score
- **5-min rolling oscilloscope** — HR / SpO₂ / HRV / Stress channels, real hardware data only
- **Danger dispatcher** — desktop notification (`Orbita - Danger` heading + issue body) + watch vibration + audio alarm
- **Multi-crew selector** — switch between crew profiles, track baselines per individual
- **Flight recorder** — session export as CSV / JSON for post-mission review
- **Custom watchface** — Orbita palette watchface (`.bin`) OTA-flashed to the watch via BLE
- **ESP32-C3 firmware** — `firmware/AURA_Band_ESP32C3.ino` for future standalone sensor band

---

## 🚀 Setup

### One-click run (recommended)

```bash
npm install                                  # dashboard deps
cd tools && python3 -m venv .venv && .venv/bin/pip install bleak aiohttp && cd ..   # bridge deps
npm run app                                  # builds Orbita.app
```

Then **double-click `Orbita.app`**. It starts the BLE bridge, starts the dashboard, waits for the watch link, opens the dashboard in your browser, and keeps both modules supervised (auto-restarts them if they crash). Everything is idempotent — modules already running are left alone, so you can still run `npm run bridge` / `npm run dev` manually.

- First launch: if macOS asks for **Bluetooth permission, click Allow**.
- Logs: `~/Library/Logs/Orbita/` (`launcher.log`, `bridge.log`, `dashboard.log`)
- Stop everything: `pkill -f "Orbita.app/Contents/MacOS/Orbita"; pkill -f bip_u_bridge`
- Rebuild the app after code changes: `npm run app`

> Note: the app bundle's launcher is compiled as a native arm64 stub because LaunchServices runs script-only app bundles under Rosetta on some Macs, which breaks the arm64-only Python wheels in `tools/.venv`.

### Manual run (equivalent, for development)

Prerequisites: Node.js ≥ 18, Python ≥ 3.11, macOS (BLE stack), Amazfit Bip U watch.

```bash
# 1. Install dashboard dependencies
npm install

# 2. Set up Python bridge venv
cd tools
python3 -m venv .venv
.venv/bin/pip install bleak aiohttp

# 3. Start the BLE bridge (connects to watch)
.venv/bin/python bip_u_bridge.py

# 4. Start the dashboard (separate terminal)
cd ..
npm run dev
```

Open `http://localhost:5173` — the dashboard auto-connects to the bridge.

### Flash the Orbita Watchface

```bash
cd tools/watchface_builder
python3 generate_aura_watchface.py        # regenerate preview + .bin
# Then use the dashboard Hardware → Flash Watchface button (OTA BLE)
```

---

## 📁 Repository Structure

```
fasa/
├── index.html                  # Main dashboard shell
├── src/
│   ├── main.js                 # App entrypoint
│   ├── style.css               # Design tokens + layout
│   ├── components/             # UI panels (modals, charts, figures)
│   └── services/               # BLE, notifications, physiology engine
├── public/
│   ├── aura_os_health.bin      # Compiled Orbita watchface binary
│   └── aura_os_health_preview.png
├── firmware/
│   └── AURA_Band_ESP32C3.ino  # ESP32-C3 standalone sensor firmware
├── tools/
│   ├── bip_u_bridge.py         # BLE ↔ HTTP bridge
│   └── watchface_builder/      # Watchface generator (Pillow)
└── 3d/                         # 3D model assets
```

---

## 📡 Bridge API (localhost:8766)

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Watch connection status + battery |
| `/api/vitals` | GET | Latest HR, SpO₂, stress, steps, calories, PAI |
| `/api/alert` | POST | Send haptic + notification to watch |
| `/api/flash` | POST | OTA watchface flash (multipart) |

---

## 🛡️ Design Principles

1. **Zero fake data** — all vitals from real hardware or explicitly marked `(est.)`
2. **Edge autonomy** — works without internet; no telemetry leaves the local network
3. **Transparent limitations** — SpO₂ polling cadence noted; HRV uses reconstructed RR intervals
4. **COTS philosophy** — built on consumer hardware to demonstrate affordable crew health monitoring

---

*Built for NASA Space Apps Challenge 2026 — Crew Health & Exploration Biometrics*
