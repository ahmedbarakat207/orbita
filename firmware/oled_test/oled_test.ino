/* =============================================================
   AURA-OS | ESP32-C3 Hot-Plug & Unsoldered-Pin Self-Healing OLED
   Target Wiring:
     GPIO 0 -> OLED GND  (Max-sink software GND)
     GPIO 1 -> OLED VDD  (Max-drive software 3.3V)
     GPIO 2 -> OLED SCK  (I2C SCL — auto-swaps with GPIO 3 if needed)
     GPIO 3 -> OLED SDA  (I2C SDA — auto-swaps with GPIO 2 if needed)
   Onboard Blue LED (GPIO 8, active LOW):
     - Slow short blink = Loose pin / waiting for I2C contact
     - SOLID ON         = All 4 pins making contact & OLED driven!
   ============================================================= */

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include "driver/gpio.h"

#define PIN_GND  0
#define PIN_VDD  1
#define PIN_SCK  2
#define PIN_SDA  3
#define PIN_LED  8   // ESP32-C3 SuperMini onboard blue LED (LOW = ON)

// Single U8g2 instance; we manage Wire pins explicitly (calling Wire.end() first!)
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

bool is_connected = false;
uint8_t active_sda = PIN_SDA;
uint8_t active_scl = PIN_SCK;
uint8_t active_addr = 0x3C;
unsigned long frame_num = 0;
unsigned long last_full_init_ms = 0;
unsigned long ack_streak = 0;

void enforcePowerRails() {
  pinMode(PIN_GND, OUTPUT);
  digitalWrite(PIN_GND, LOW);
  gpio_set_drive_capability((gpio_num_t)PIN_GND, GPIO_DRIVE_CAP_3); // ~40mA sink

  pinMode(PIN_VDD, OUTPUT);
  digitalWrite(PIN_VDD, HIGH);
  gpio_set_drive_capability((gpio_num_t)PIN_VDD, GPIO_DRIVE_CAP_3); // ~40mA source
}

bool startWireOn(uint8_t sda, uint8_t scl) {
  Wire.end();
  pinMode(sda, INPUT_PULLUP);
  pinMode(scl, INPUT_PULLUP);
  bool ok = Wire.begin((int)sda, (int)scl, 50000UL); // 50kHz tolerates unsoldered contact resistance
  Wire.setTimeOut(20);
  return ok;
}

bool pingAddr(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

bool findDisplay(uint8_t &out_sda, uint8_t &out_scl, uint8_t &out_addr) {
  const uint8_t pairs[2][2] = {
    {PIN_SDA, PIN_SCK}, // Normal: SDA=3, SCK=2
    {PIN_SCK, PIN_SDA}  // Swapped: SDA=2, SCK=3
  };
  const uint8_t addrs[2] = {0x3C, 0x3D};

  for (int p = 0; p < 2; p++) {
    uint8_t sda = pairs[p][0];
    uint8_t scl = pairs[p][1];
    startWireOn(sda, scl);
    delay(2);
    for (int a = 0; a < 2; a++) {
      if (pingAddr(addrs[a])) {
        out_sda = sda;
        out_scl = scl;
        out_addr = addrs[a];
        return true;
      }
    }
  }
  return false;
}

// Glitchless wake-up commands in case a microsecond VDD bounce reset the OLED
void sendKeepAliveWakeup(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(0x00); // Command stream
  Wire.write(0x8D); // Charge pump setting
  Wire.write(0x14); // Enable charge pump
  Wire.write(0xA4); // Resume to RAM content display
  Wire.write(0xAF); // Display ON
  Wire.endTransmission();
}

void fullInitOLED() {
  enforcePowerRails();
  delay(30); // Let OLED VDD bypass cap charge cleanly
  startWireOn(active_sda, active_scl);

  u8g2.getU8x8()->pins[U8X8_PIN_I2C_CLOCK] = active_scl;
  u8g2.getU8x8()->pins[U8X8_PIN_I2C_DATA]  = active_sda;
  u8g2.setI2CAddress(active_addr * 2);
  u8g2.setBusClock(50000UL);
  u8g2.initDisplay();
  u8g2.clearDisplay();
  u8g2.setPowerSave(0);
  u8g2.setContrast(200); // Crisp & bright while keeping GPIO 1 current <8mA
  sendKeepAliveWakeup(active_addr);
  last_full_init_ms = millis();
}

void drawTestScreen() {
  u8g2.clearBuffer();

  // Outer alignment frame (shifted inward by 2px so both SSD1306 & SH1106 show all 4 edges)
  u8g2.drawFrame(2, 0, 124, 64);

  // Header bar
  u8g2.drawBox(2, 0, 124, 13);
  u8g2.setDrawColor(0);
  u8g2.setFont(u8g2_font_6x10_tr);
  char hdr[26];
  snprintf(hdr, sizeof(hdr), "C3 0x%02X SCK:%u SDA:%u", active_addr, active_scl, active_sda);
  u8g2.drawStr(6, 10, hdr);

  // Main message (sparse bright pixels = minimal VDD current draw on GPIO 1)
  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_ncenB12_tr);
  u8g2.drawStr(10, 33, "OLED LIVE!");

  u8g2.setFont(u8g2_font_6x10_tr);
  char line1[26];
  snprintf(line1, sizeof(line1), "Frame #%lu  Up:%lus", frame_num, millis() / 1000);
  u8g2.drawStr(8, 48, line1);

  // Moving progress bar at bottom
  int barX = 6 + (frame_num * 4) % 92;
  u8g2.drawFrame(6, 54, 116, 6);
  u8g2.drawBox(barX, 55, 22, 4);

  u8g2.sendBuffer();
}

void diagnoseDisconnectedPins() {
  Wire.end();
  pinMode(PIN_SCK, INPUT_PULLUP);
  pinMode(PIN_SDA, INPUT_PULLUP);
  delay(1);
  int sckVal = digitalRead(PIN_SCK);
  int sdaVal = digitalRead(PIN_SDA);
  Serial.printf("[NO ACK] Loose pin! GND=0 VDD=1 | GPIO2(SCK)=%d GPIO3(SDA)=%d -> Tilt/press header in holes!\n",
                sckVal, sdaVal);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH); // LED off initially

  enforcePowerRails();
  delay(200);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-C3 HOT-PLUG SELF-HEALING OLED DRIVER");
  Serial.println("  GND=GPIO0 | VDD=GPIO1 | SCK=GPIO2 | SDA=GPIO3");
  Serial.println("=======================================================");
}

unsigned long last_diag_ms = 0;

void loop() {
  enforcePowerRails();

  if (is_connected) {
    // Verify display is still ACKing on active pins
    if (!pingAddr(active_addr)) {
      is_connected = false;
      ack_streak = 0;
      digitalWrite(PIN_LED, HIGH); // LED off
      Serial.println("[DROP] Pin contact lost! Waiting to auto-reinitialize on contact...");
      return;
    }

    ack_streak++;
    frame_num++;
    digitalWrite(PIN_LED, LOW); // Solid BLUE LED = Good contact!

    // Periodically re-run full register init in case a micro-bounce reset OLED registers
    if (ack_streak == 2 || (millis() - last_full_init_ms >= 2000)) {
      u8g2.initDisplay();
      u8g2.setPowerSave(0);
      u8g2.setContrast(200);
      last_full_init_ms = millis();
    } else {
      sendKeepAliveWakeup(active_addr);
    }

    drawTestScreen();

    if (frame_num % 20 == 1) {
      Serial.printf("[LIVE] OLED ACK 0x%02X (SCK:%u SDA:%u) | Frame #%lu | Streak:%lu\n",
                    active_addr, active_scl, active_sda, frame_num, ack_streak);
    }
    delay(40);
  } else {
    // Disconnected: short LED blip every 1s while scanning continuously
    digitalWrite(PIN_LED, (millis() % 1000 < 60) ? LOW : HIGH);

    uint8_t sda, scl, addr;
    if (findDisplay(sda, scl, addr)) {
      active_sda = sda;
      active_scl = scl;
      active_addr = addr;
      is_connected = true;
      ack_streak = 1;
      digitalWrite(PIN_LED, LOW); // Solid ON immediately!

      Serial.printf(">>> CONTACT DETECTED! OLED at 0x%02X (SCK=GPIO%u, SDA=GPIO%u) — Initializing NOW! <<<\n",
                    active_addr, active_scl, active_sda);
      fullInitOLED();
      drawTestScreen();
    } else {
      if (millis() - last_diag_ms >= 1000) {
        diagnoseDisconnectedPins();
        last_diag_ms = millis();
      }
      delay(50);
    }
  }
}
