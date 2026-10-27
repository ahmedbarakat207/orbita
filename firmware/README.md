# AURA-OS Astronaut Biosensor Wristband (ESP32-C3)
**NASA International Space Apps Challenge 2026**  
*Challenge: Health Monitoring Software for Astronauts on Space Missions*

This directory contains the production-grade embedded C++ firmware for the physical **AURA-OS Biosensor Wristband**. The firmware reads physical photoplethysmography (PPG) waveforms directly from the **MAX30102** sensor, calculates true Heart Rate, $\text{SpO}_2$, and $\text{HRV}$ ($\text{SDNN}$), renders the on-wrist HUD on a **0.96" SSD1306 OLED**, and broadcasts live telemetry simultaneously over **USB Serial (115200 baud)** and **Bluetooth Low Energy (BLE GATT)**.

---

## 1. Bill of Materials (BOM)

| Component | Function | Operating Specs |
| :--- | :--- | :--- |
| **ESP32-C3** | Microcontroller Core | 32-bit RISC-V @ 160MHz, BLE 5.0, USB-CDC |
| **MAX30102 / MAX30100** | Optical Pulse Oximeter & HR | Red ($660\,\text{nm}$) + IR ($880\,\text{nm}$) LEDs, I2C `0x57` |
| **0.96" I2C OLED Display** | On-Wrist Local Display | $128 \times 64$ monochrome, SSD1306, I2C `0x3C` |
| **TP4056 1S BMS Module** | LiPo Charger & Protection | 5V 1A CC/CV charge, 2.5V cut-off protection |
| **3.7V LiPo Battery Cell** | Portable Power Source | 1S 3.7V nominal ($4.2\,\text{V}$ max) |
| **Type-C Female Connector** | Charging Port | 5V VBUS power input to TP4056 |

---

## 2. Complete Wiring Schematic

Both the **MAX30102** sensor and the **0.96" OLED display** operate on the shared high-speed I2C bus ($400\,\text{kHz}$).

### I2C Sensor & Display Bus
```
ESP32-C3              MAX30102                 0.96" SSD1306 OLED
3.3V   ────────────── VIN / VCC ────────────── VCC
GND    ────────────── GND      ────────────── GND
GPIO 8 ────────────── SDA      ────────────── SDA
GPIO 9 ────────────── SCL      ────────────── SCL
```
*(Note: If using a Seeed XIAO ESP32-C3 board, set `I2C_SDA_PIN` to `GPIO 6` and `I2C_SCL_PIN` to `GPIO 7`).*

### Power Management & Battery Wiring
```
Type-C Female        TP4056 BMS Module        LiPo Battery (3.7V)      ESP32-C3
[VBUS] Red  ───────> IN+
[GND] Black ───────> IN-
                     BAT+ <────────────────── Battery Red (+)
                     BAT- <────────────────── Battery Black (-)
                     OUT+ ───────────────────────────────────────────> 5V / VIN / VBUS
                     OUT- ───────────────────────────────────────────> GND
```

### Battery Voltage Sensing (Optional Battery % Indicator)
```
LiPo (+) ───[ 100kΩ ]───┬───[ 100kΩ ]─── GND
                        │
                        └───> ESP32-C3 GPIO 0 (ADC)
```

---

## 3. Real Biosensor Signal Processing Pipeline

The firmware contains **no fake numbers, no decay, and no synthetic drift**:

1. **Finger / Skin Contact Detection:**  
   The firmware monitors raw Infrared counts:
   $$\text{IR}_{\text{raw}} \ge 35{,}000 \implies \text{Skin Contact Established}$$
   $$\text{IR}_{\text{raw}} < 35{,}000 \implies \text{Off-Wrist (Outputs 0 BPM, 0% SpO2, Status: OFF\_WRIST)}$$
2. **AC/DC Hemoglobin Extraction:**  
   Applies a dynamic high-pass filter ($0.5\,\text{Hz}$) to remove DC tissue absorption and an adaptive peak detector to isolate systolic arterial pulses.
3. **True Heart Rate (BPM):**  
   Calculates exact Inter-Beat Interval (IBI) in milliseconds:
   $$\text{BPM} = \frac{60{,}000}{\text{IBI}}$$
4. **Heart Rate Variability ($\text{SDNN}$):**  
   Calculates the standard deviation of valid NN intervals over the previous 10 beats:
   $$\text{SDNN} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (\text{NN}_i - \overline{\text{NN}})^2}$$
5. **Real-time $\text{SpO}_2$ Calculation:**  
   Computes the Ratio-of-Ratios $R$ from peak-to-peak AC amplitudes and DC baselines:
   $$R = \frac{\text{AC}_{\text{red}} / \text{DC}_{\text{red}}}{\text{AC}_{\text{ir}} / \text{DC}_{\text{ir}}}$$
   $$\text{SpO}_2 = 104.0 - 17.0 \times R$$

---

## 4. Telemetry Stream Protocol

The firmware broadcasts telemetry at 5 Hz ($200\,\text{ms}$ interval) across both interfaces:

### USB Serial Output (115200 baud)
```json
{"hr":72.4,"spo2":98.3,"temp":36.8,"hrv":56,"batt":94,"finger":true,"ir":65400,"red":58100}
```
When off-wrist:
```json
{"hr":0.0,"spo2":0.0,"temp":36.2,"hrv":0,"batt":94,"finger":false,"ir":1200,"red":850}
```

### Bluetooth Low Energy (BLE GATT)
- **Advertised Name:** `AURA-BAND-C3`
- **Heart Rate Service:** UUID `0x180D` $\rightarrow$ Characteristic `0x2A37` (Standard BLE Heart Rate Measurement with RR-interval timestamps)
- **Battery Service:** UUID `0x180F` $\rightarrow$ Characteristic `0x2A19`
- **AURA-OS Telemetry Service:** UUID `4fafc201-1fb5-459e-8fcc-c5c9c331914b` $\rightarrow$ Characteristic `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Transmits complete JSON packet)

---

## 5. Arduino IDE Flashing Guide

1. **Install ESP32 Board Support:**
   - Go to **Tools** $\rightarrow$ **Board** $\rightarrow$ **Boards Manager**.
   - Search for `esp32` by Espressif Systems and install version `2.0.14` or later (supports ESP32-C3).
2. **Install Required Library:**
   - Go to **Sketch** $\rightarrow$ **Include Library** $\rightarrow$ **Manage Libraries**.
   - Search and install: **Adafruit SSD1306** (and accept dependencies like **Adafruit GFX Library**).
   *(Note: The MAX30102 driver is fully self-contained in the sketch and requires no extra sensor library!).*
3. **Board Settings:**
   - **Board:** `ESP32C3 Dev Module` (or `XIAO_ESP32C3`)
   - **USB CDC On Boot:** `Enabled` (Crucial for native USB serial on ESP32-C3)
   - **Flash Frequency:** `80MHz`
   - **Upload Speed:** `921600` or `115200`
4. **Compile & Upload:**
   - Plug the ESP32-C3 into your computer via USB-C.
   - Select the COM/tty port and click **Upload**.
5. **Connect to AURA-OS:**
   - Open AURA-OS in Chrome/Edge at `http://localhost:5173/`.
   - Click **"Sensor I/O: Hardware Interface"**.
   - Select **USB Serial** and click **Connect USB Port**, or select **Web Bluetooth** and pair with **AURA-BAND-C3**.
