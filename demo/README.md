# 🛰️ Orbita — NASA Space Apps Challenge 2026 (Vercel Demo)

This directory contains a **100% self-contained, zero-dependency web demo** of **Orbita (AURA-OS)**, ready for instant deployment to [Vercel](https://vercel.com) to showcase the project to NASA Space Apps Challenge judges.

---

## 🚀 How to Deploy to Vercel (Choose Any Method)

### Method 1: Vercel CLI (Fastest, 10 seconds)
Run this from your terminal:
```bash
# 1. Enter the demo directory
cd demo

# 2. Deploy directly to Vercel
npx vercel
```
*Follow the interactive prompts (use default settings, root directory = `.`, framework preset = `Other` / static).*

For production:
```bash
npx vercel --prod
```

---

### Method 2: Git Repository (GitHub / GitLab / Bitbucket)
1. Push your repository to GitHub.
2. In your Vercel Dashboard, click **"Add New Project"** and select the repository.
3. In the project configuration:
   - **Root Directory:** click **Edit** and set it to `demo`.
   - **Framework Preset:** select **Other** (Static Site).
4. Click **Deploy**. Vercel will build and give you a public URL (e.g., `https://orbita-nasa.vercel.app`).

---

### Method 3: Drag & Drop Deploy
You can drag and drop the `demo` folder directly into [vercel.com/new](https://vercel.com/new) if using the dashboard drag-and-drop feature.

---

## 🧪 Local Preview (Test Before Deploying)
You don't need any build steps! You can preview it locally using any static HTTP server:

```bash
cd demo
# Using Python:
python3 -m http.server 3000

# Or using npx:
npx serve .
```
Then open `http://localhost:3000` in your browser.

---

## 🌟 What This Demo Shows the Judges

1. **COTS Bioastronautics Philosophy:**
   - Demonstrates pairing an affordable $40 Amazfit Bip U smartwatch with an aerospace telemetry console, mirroring NASA's ISS COTS strategy.
2. **Reverse-Engineered Huami BLE Protocol:**
   - Real-time GATT frame terminal showing the offline AES-128 cryptographic challenge-response (`0x0009`), continuous optical PPG frames (`0x2A37`), wear state events (`0x0010`), and alert dispatch (`0x2A46`).
3. **Interactive Smartwatch Bezel Simulator:**
   - Authentic 302×320 screen ratio running the custom Orbita astronaut watchface with live pulse load gauge, SpO₂ saturation, stress bar, and ticking mission clock.
4. **Bidirectional Danger Dispatcher:**
   - Judges can click quick emergency alerts (e.g. *Cabin Hypoxia Alert*, *Tachycardia Surge*, *EVA Exertion Warning*) or type a custom message.
   - The watch immediately vibrates (CSS haptic animation) and displays the alert on its OLED screen with sound alarms.
5. **Real-Time 4-Channel Sweep Oscilloscope:**
   - Canvas-based phosphor oscilloscope displaying real-time PPG arterial pulse, SpO₂ perfusion curve, and autonomic stress spectrum.
6. **NASA HRP (Human Research Program) Hazards Matrix:**
   - Interactive breakdown of how Orbita mitigates the 5 major deep-space risks: Distance from Earth (100% offline edge autonomy), Altered Gravity, Hostile Closed Environments, Isolation & Confinement, and Radiation.
7. **Flight Session Recorder & NASA CMOS Export:**
   - Record mission telemetry and download structured NASA CMOS JSON or CSV files for telemetry downlink simulation.
8. **Real Hardware Support (Web-Bluetooth):**
   - In Chrome or Edge, judges can even pair physical Bluetooth heart rate monitors or wearables live.
