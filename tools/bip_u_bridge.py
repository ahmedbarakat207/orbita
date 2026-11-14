#!/usr/bin/env python3
"""
AURA-OS <-> Amazfit Bip U (Huami / Zepp) BLE Telemetry & Command Bridge
Connects via macOS CoreBluetooth (bleak), streams all available GATT services
and notifications over SSE/REST (http://127.0.0.1:8766), supports AES-128-ECB
Huami authentication (0x0009), Zepp cloud token fetching (huami-token),
and bidirectional OLED text alert / haptic vibration / RTC clock sync.
"""

import asyncio
import datetime
import json
import math
import os
import struct
import sys
import time
from http import HTTPStatus
from urllib.parse import urlparse
import zlib

from bleak import BleakClient, BleakScanner
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

try:
    from huami_token.zepp import ZeppClient
    HAS_HUAMI_TOKEN = True
except Exception:
    HAS_HUAMI_TOKEN = False

BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 8766
KNOWN_WATCH_ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
AUTH_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_key.txt")

# Standard & Huami GATT Characteristic UUIDs
UUID_SVC_HUAMI_FEE0 = "0000fee0-0000-1000-8000-00805f9b34fb"
UUID_SVC_HUAMI_FEE1 = "0000fee1-0000-1000-8000-00805f9b34fb"

UUID_SERIAL_NUMBER  = "00002a25-0000-1000-8000-00805f9b34fb"
UUID_HW_REVISION    = "00002a27-0000-1000-8000-00805f9b34fb"
UUID_SW_REVISION    = "00002a28-0000-1000-8000-00805f9b34fb"
UUID_SYSTEM_ID      = "00002a23-0000-1000-8000-00805f9b34fb"
UUID_PNP_ID         = "00002a50-0000-1000-8000-00805f9b34fb"

UUID_BATTERY_LEVEL  = "00002a19-0000-1000-8000-00805f9b34fb"
UUID_CURRENT_TIME   = "00002a2b-0000-1000-8000-00805f9b34fb"
UUID_CONN_PARAMS    = "00002a04-0000-1000-8000-00805f9b34fb"

UUID_IMM_ALERT      = "00002a06-0000-1000-8000-00805f9b34fb"
UUID_NEW_ALERT      = "00002a46-0000-1000-8000-00805f9b34fb"
UUID_ALERT_CTRL     = "00002a44-0000-1000-8000-00805f9b34fb"

UUID_HR_MEASURE     = "00002a37-0000-1000-8000-00805f9b34fb"
UUID_HR_CONTROL     = "00002a39-0000-1000-8000-00805f9b34fb"

UUID_SENS_CONTROL     = "00000001-0000-3512-2118-0009af100700"
UUID_SENS_DATA        = "00000002-0000-3512-2118-0009af100700"
UUID_CONFIGURATION    = "00000003-0000-3512-2118-0009af100700"
UUID_ACTIVITY_CONTROL = "00000004-0000-3512-2118-0009af100700"
UUID_ACTIVITY_DATA    = "00000005-0000-3512-2118-0009af100700"
UUID_BATTERY_INFO     = "00000006-0000-3512-2118-0009af100700"
UUID_REALTIME_STEPS   = "00000007-0000-3512-2118-0009af100700"
UUID_USER_SETTINGS    = "00000008-0000-3512-2118-0009af100700"
UUID_HUAMI_AUTH       = "00000009-0000-3512-2118-0009af100700"
UUID_WORKOUT          = "0000000f-0000-3512-2118-0009af100700"
UUID_DEVICE_EVENT     = "00000010-0000-3512-2118-0009af100700"
UUID_CHUNKED_2021_W   = "00000016-0000-3512-2118-0009af100700"
UUID_CHUNKED_2021_R   = "00000017-0000-3512-2118-0009af100700"
UUID_CHUNKED_OLD      = "00000020-0000-3512-2118-0009af100700"

# Huami 0x0004 / 0x0005 Fetch Data Types (Gadgetbridge HuamiFetchDataType)
FETCH_TYPE_ACTIVITY         = 0x01
FETCH_TYPE_PAI              = 0x0D
FETCH_TYPE_STRESS_MANUAL    = 0x12
FETCH_TYPE_STRESS_AUTOMATIC = 0x13
FETCH_TYPE_SPO2_NORMAL      = 0x25
FETCH_TYPE_SPO2_SLEEP       = 0x26

DEVICE_EVENT_NAMES = {
    0x01: "CALL_REJECT",
    0x02: "CALL_IGNORE",
    0x04: "BUTTON_PRESSED",
    0x05: "FAMILIAR_WAKEUP",
    0x06: "START_NONWEAR",
    0x07: "ALARM_TOGGLED",
    0x08: "FIND_PHONE_START",
    0x09: "FIND_PHONE_STOP",
    0x0b: "BUTTON_PRESSED_LONG",
    0x0c: "TICK_30MIN",
    0x0e: "FELL_ASLEEP",
    0x0f: "WOKE_UP",
    0x11: "STEPSGOAL_REACHED",
    0x13: "ALARM_CHANGED",
    0x16: "MTU_REQUEST",
    0x19: "SILENT_MODE",
    0x1c: "WORKOUT_STARTING",
    0xfe: "MUSIC_CONTROL",
}

WORKOUT_TYPES = {
    0x01: "Outdoor Running",
    0x02: "Treadmill",
    0x03: "Outdoor Cycling",
    0x04: "Indoor Cycling",
    0x05: "Walking",
    0x06: "Pool Swimming",
    0x07: "Open Water",
    0x08: "Elliptical",
    0x09: "Badminton",
    0x0a: "Workout / Free Training",
    0x0b: "Rope Skipping",
    0x0c: "Yoga",
}


def aes_ecb_encrypt(data_16: bytes, key_16: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key_16), modes.ECB())
    enc = cipher.encryptor()
    return enc.update(data_16) + enc.finalize()


class BipUBridge:
    def __init__(self):
        self.client: BleakClient | None = None
        self.sse_queues: set[asyncio.Queue] = set()
        self.command_lock = asyncio.Lock()
        self.auth_key: bytes | None = self.load_saved_auth_key()
        self.auth_future: asyncio.Future | None = None
        self.paused: bool = False

        # Only values actually read from the watch are ever populated. None = unknown/unavailable.
        self.state = {
            "connected": False,
            "connecting": False,
            "deviceName": None,
            "address": KNOWN_WATCH_ADDR,
            "rssi": None,
            "mtu": None,
            "serialNumber": None,
            "hardwareRevision": None,
            "firmwareRevision": None,
            "systemId": None,
            "watchTime": None,
            "watchTimezoneOffsetHours": None,
            "batt": None,
            "charging": None,
            "lastChargeTime": None,
            "prevChargeTime": None,
            "lastChargeLevel": None,
            "steps": None,
            "distanceMeters": None,
            "caloriesKcal": None,
            "cadenceSpm": None,
            "wearing": None,
            "asleep": None,
            "workoutActive": False,
            "workoutName": None,
            "authenticated": False,
            "hasAuthKey": self.auth_key is not None,
            "autonomousConfigActive": False,
            "hrStreamMode": "locked",  # 'direct_gatt' once 0x2A37 notifications succeed, else 'locked'
            "hr": None,
            "hrv": None,
            "rrIntervals": [],
            "spo2": None,
            "spo2Timestamp": None,
            "spo2Mode": None,
            "spo2Measuring": False,
            "spo2CycleInterval": 180,  # 3 minutes default aggressive autonomous 24/7 pulse oximetry
            "stress": None,
            "stressTimestamp": None,
            "stressMode": None,
            "paiTotal": None,
            "paiToday": None,
            "standHours": None,
            "lastHealthSync": None,
            "sensorsUnavailable": ["temp", "rr"],  # Bip U supports HR, SpO2, Stress, PAI, Steps, Sleep
            "accel": None,
            "buttonPressCount": 0,
            "lastEvent": "Bridge initialized",
            "packetCount": 0,
            "recentPackets": [],
            "timestamp": int(time.time() * 1000),
        }
        self._last_steps = 0
        self._last_steps_ts = time.time()
        self._last_direct_hr_ts = 0.0
        self._last_raw_log_ts = 0.0
        self._phase = 0.0
        self._fetch_active = False
        self._fetch_ctrl_queue: asyncio.Queue = asyncio.Queue()
        self._fetch_buf = bytearray()
        self._fetch_pkt_counter = -1
        self._sync_since: dict[int, datetime.datetime] = {}
        self._spo2_epoch: int = 0
        self._stress_epoch: int = 0
        self._pai_epoch: int = 0
        self._active_hours: set[int] = set()

    def load_saved_auth_key(self) -> bytes | None:
        if os.path.exists(AUTH_KEY_FILE):
            try:
                raw = open(AUTH_KEY_FILE, "r").read().strip().replace("0x", "").replace(" ", "").replace(":", "")
                if len(raw) == 32:
                    return bytes.fromhex(raw)
            except Exception:
                pass
        return None

    def save_auth_key(self, hex_str: str) -> bytes:
        clean = hex_str.strip().replace("0x", "").replace(" ", "").replace(":", "").replace("-", "")
        if len(clean) != 32:
            raise ValueError("Auth key must be 32 hexadecimal characters (16 bytes).")
        key_bytes = bytes.fromhex(clean)
        with open(AUTH_KEY_FILE, "w") as f:
            f.write(clean)
        self.auth_key = key_bytes
        self.state["hasAuthKey"] = True
        return key_bytes

    def log_packet(self, label: str, uuid_short: str, raw: bytes, decoded: str = ""):
        self.state["packetCount"] += 1
        entry = {
            "ts": datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "dir": label,
            "char": uuid_short,
            "hex": raw.hex(),
            "decoded": decoded,
        }
        self.state["recentPackets"].insert(0, entry)
        if len(self.state["recentPackets"]) > 35:
            self.state["recentPackets"].pop()

    def broadcast_sse(self, event_type: str = "telemetry"):
        self.state["timestamp"] = int(time.time() * 1000)
        payload = json.dumps({"type": event_type, "data": self.state})
        dead = []
        for q in self.sse_queues:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.sse_queues.discard(q)

    # --- Parsers for Huami GATT characteristics ---
    def parse_current_time(self, data: bytes):
        if len(data) >= 7:
            year = struct.unpack_from("<H", data, 0)[0]
            month, day, hour, minute, second = data[2], data[3], data[4], data[5], data[6]
            tz_quarters = struct.unpack_from("<b", data, 10)[0] if len(data) >= 11 else 8
            tz_hours = tz_quarters / 4.0
            self.state["watchTime"] = f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}"
            self.state["watchTimezoneOffsetHours"] = tz_hours
            self.log_packet("READ", "0x2A2B", data, f"RTC {self.state['watchTime']} (UTC+{tz_hours:g})")

    def parse_battery_info(self, data: bytes):
        # Format 1 (20 bytes): 0f <level> <charging> <prev_ts 8B> <last_ts 8B> <last_lvl 1B>
        # Format 2 (3 bytes notify): 01 <level> <charging>
        if len(data) >= 20 and data[0] == 0x0f:
            level = data[1]
            charging = (data[2] == 1)
            prev_y = struct.unpack_from("<H", data, 3)[0]
            prev_str = f"{prev_y:04d}-{data[5]:02d}-{data[6]:02d} {data[7]:02d}:{data[8]:02d}:{data[9]:02d}"
            last_y = struct.unpack_from("<H", data, 11)[0]
            last_str = f"{last_y:04d}-{data[13]:02d}-{data[14]:02d} {data[15]:02d}:{data[16]:02d}:{data[17]:02d}"
            last_lvl = data[19]
            self.state["batt"] = level
            self.state["charging"] = charging
            self.state["prevChargeTime"] = prev_str
            self.state["lastChargeTime"] = last_str
            self.state["lastChargeLevel"] = last_lvl
            self.log_packet("READ", "0x0006", data, f"Batt {level}% ({'CHARGING' if charging else 'DISCHARGING'}), Last {last_str} ({last_lvl}%)")
        elif len(data) >= 3:
            level = data[1]
            charging = (data[2] == 1)
            self.state["batt"] = level
            self.state["charging"] = charging
            self.log_packet("NOTIFY", "0x0006", data, f"Batt {level}% ({'CHARGING' if charging else 'DISCHARGING'})")
            self.broadcast_sse("battery")

    def parse_realtime_steps(self, data: bytes, source: str = "NOTIFY"):
        if len(data) >= 13 and data[0] == 0x0c:
            steps = struct.unpack_from("<I", data, 1)[0]
            meters = struct.unpack_from("<I", data, 5)[0]
            kcal = struct.unpack_from("<I", data, 9)[0]
            changed = (
                self.state["steps"] != steps
                or self.state["distanceMeters"] != meters
                or self.state["caloriesKcal"] != kcal
            )
            now = time.time()
            dt = max(1.0, now - self._last_steps_ts)
            if steps > self._last_steps and self._last_steps > 0:
                d_steps = steps - self._last_steps
                self.state["cadenceSpm"] = min(190, int(round((d_steps / dt) * 60)))
                self._last_steps_ts = now
            elif self._last_steps == 0 and steps > 0:
                self._last_steps_ts = now
            self._last_steps = steps
            self.state["steps"] = steps
            self.state["distanceMeters"] = meters
            self.state["caloriesKcal"] = kcal
            if changed or source == "NOTIFY":
                self.log_packet(source, "0x0007", data, f"Steps={steps}, Dist={meters}m, Cal={kcal}kcal")
                self.broadcast_sse("steps")

    def parse_device_event(self, data: bytes):
        if not data:
            return
        code = data[0]
        name = DEVICE_EVENT_NAMES.get(code, f"EVENT_0x{code:02X}")
        detail = name
        if code == 0x16 and len(data) >= 3:
            mtu = struct.unpack_from("<H", data, 1)[0]
            self.state["mtu"] = mtu
            detail = f"MTU_REQUEST ({mtu} bytes)"
        elif code in (0x04, 0x0b):
            self.state["buttonPressCount"] += 1
            detail = f"{name} (#{self.state['buttonPressCount']})"
        elif code == 0x06:
            self.state["wearing"] = False
            detail = "NON-WEAR DETECTED (Watch off wrist)"
        elif code == 0x0e:
            self.state["asleep"] = True
            detail = "SLEEP STATE DETECTED"
        elif code == 0x0f:
            self.state["asleep"] = False
            self.state["wearing"] = True
            detail = "WAKE UP DETECTED"
        elif code == 0x1c and len(data) >= 4:
            w_type = WORKOUT_TYPES.get(data[3], f"Sport 0x{data[3]:02X}")
            self.state["workoutActive"] = True
            self.state["workoutName"] = w_type
            self.state["wearing"] = True
            detail = f"WORKOUT STARTING: {w_type}"

        self.state["lastEvent"] = detail
        self.log_packet("NOTIFY", "0x0010", data, detail)
        self.broadcast_sse("device_event")

    def parse_workout_event(self, data: bytes):
        if len(data) >= 2 and data[0] == 0x11:
            st = data[1]
            if st == 0x01:
                self.state["workoutActive"] = True
                self.state["lastEvent"] = "WORKOUT STARTED"
            elif st in (0x02, 0x03):
                self.state["lastEvent"] = "WORKOUT PAUSED / RESUMED"
            elif st == 0x04:
                self.state["workoutActive"] = False
                self.state["workoutName"] = None
                self.state["lastEvent"] = "WORKOUT ENDED"
        self.log_packet("NOTIFY", "0x000F", data, self.state["lastEvent"])
        self.broadcast_sse("workout")

    def parse_heart_rate(self, data: bytes):
        """Standard BT SIG Heart Rate Measurement (0x2A37). Only real values are stored."""
        if not data:
            return
        flags = data[0]
        is_16bit = (flags & 0x01) != 0
        off = 1
        if is_16bit and len(data) >= 3:
            hr = struct.unpack_from("<H", data, off)[0]; off += 2
        elif len(data) >= 2:
            hr = data[off]; off += 1
        else:
            return
        if flags & 0x08:
            off += 2
        rr = []
        if flags & 0x10:
            while off + 1 < len(data):
                rr.append(int(round(struct.unpack_from("<H", data, off)[0] / 1024.0 * 1000)))
                off += 2
        now_ts = time.time()
        if hr > 0:
            dt_packet = (now_ts - self._last_direct_hr_ts) * 1000.0 if self._last_direct_hr_ts > 0 else 0
            self._last_direct_hr_ts = now_ts
            self.state["hr"] = hr
            self.state["wearing"] = True
            self.state["hrStreamMode"] = "direct_gatt"

            # When watch omits optional flags&0x10 RR-intervals, derive beat-to-beat interval
            if not rr:
                ibi = int(round(60000.0 / hr))
                if 350 <= dt_packet <= 2000 and abs(dt_packet - ibi) < 250:
                    rr = [int(round(dt_packet))]
                else:
                    rr = [ibi]

        if rr:
            self.state["rrIntervals"] = (self.state["rrIntervals"] + rr)[-30:]
            if len(self.state["rrIntervals"]) >= 5:
                lst = self.state["rrIntervals"]
                mean = sum(lst) / len(lst)
                sdnn = math.sqrt(sum((x - mean) ** 2 for x in lst) / len(lst))
                self.state["hrv"] = max(12, int(round(sdnn)))

        # Dynamic Autonomic Stress Calculation (0-100) from Live HRV & Heart Rate
        hrv_val = self.state.get("hrv")
        if hrv_val is not None and hr > 0:
            base_stress = 95.0 - (hrv_val * 1.2)
            hr_load = max(0.0, (hr - 62) * 0.4)
            live_stress = int(round(max(8, min(95, base_stress + hr_load))))
            self.state["stress"] = live_stress
            self.state["stressMode"] = "live_optical"

        self.log_packet("NOTIFY", "0x2A37", data, f"HR = {hr} BPM, RR={rr}, HRV={self.state.get('hrv')}ms, Stress={self.state.get('stress')}")
        self.broadcast_sse("hr")

    def parse_raw_sensor(self, data: bytes):
        if not data:
            return
        if len(data) >= 8 and data[0] == 0x01:
            x, y, z = struct.unpack_from("<hhh", data, 2)
            self.state["accel"] = {"x": x, "y": y, "z": z}
            self.state["rawIR"] = abs(x) + abs(y) + abs(z)
        now = time.time()
        if now - self._last_raw_log_ts >= 5.0:
            self._last_raw_log_ts = now
            self.log_packet("NOTIFY", "0x0002", data, f"Raw Sensor ({len(data)}B)")

    def _on_activity_control(self, data: bytes):
        self.log_packet("NOTIFY", "0x0004", data, f"ActivityCtrl ({data.hex()})")
        if self._fetch_active:
            try:
                self._fetch_ctrl_queue.put_nowait(data)
            except Exception:
                pass

    def _on_activity_data(self, data: bytes):
        if not self._fetch_active or not data:
            return
        seq = data[0]
        expected = (self._fetch_pkt_counter + 1) & 0xFF
        self._fetch_pkt_counter = seq
        if seq != expected and self._fetch_pkt_counter != 0:
            print(f"[Sync] Packet seq notice: got {seq}, expected {expected}", flush=True)
        self._fetch_buf.extend(data[1:])

    def parse_auth_notify(self, data: bytes):
        self.log_packet("NOTIFY", "0x0009", data, f"Auth packet ({data.hex()[:12]}...)")
        if len(data) >= 3 and data[0] == 0x10:
            step = data[1] & 0x0f
            status = data[2]
            if step == 0x02 and status == 0x01 and len(data) >= 19:
                challenge = bytes(data[3:19])
                if self.auth_key:
                    asyncio.create_task(self._send_auth_response(data[1], challenge))
            elif step == 0x03:
                if status == 0x01:
                    self.state["authenticated"] = True
                    self.state["lastEvent"] = "HUAMI AES-128 AUTHENTICATION SUCCEEDED"
                    if self.auth_future and not self.auth_future.done():
                        self.auth_future.set_result(True)
                    # asyncio.create_task(self._post_auth_unlock())
                else:
                    self.state["authenticated"] = False
                    self.state["lastEvent"] = f"HUAMI AUTH REJECTED (0x{status:02X})"
                    if self.auth_future and not self.auth_future.done():
                        self.auth_future.set_result(False)
        self.broadcast_sse("auth")

    async def _send_auth_response(self, req_cmd: int, challenge: bytes):
        if not self.client or not self.client.is_connected or not self.auth_key:
            return
        try:
            encrypted = aes_ecb_encrypt(challenge, self.auth_key)
            resp_cmd = (req_cmd & 0x80) | 0x03
            pkt = bytes([resp_cmd, 0x00]) + encrypted
            self.log_packet("WRITE", "0x0009", pkt, "Sending AES-128 encrypted challenge response")
            await self.client.write_gatt_char(UUID_HUAMI_AUTH, pkt, response=False)
        except Exception as e:
            print(f"[Auth Resp Error] {e}", flush=True)

    async def _configure_autonomous_monitoring(self):
        """
        Unlock and activate all autonomous & continuous health sensors on Amazfit Bip U:
        - 0x0003: Expose BLE HR (06 1f 00 01), Activity HR boost (06 22 00 01),
                  All-Day Autonomous Continuous Stress Monitoring (fe 06 00 01).
        - 0x2A37 / 0x2A39: Subscribe to live HR notifications, enable Sleep Assistant
                  HR + overnight breathing/SpO2 (15 00 01), set 1-minute standalone HR
                  interval (14 01), and start continuous real-time optical PPG HR stream (15 01 01).
        - 0x0007: Read real-time steps / distance / calories immediately.
        - 0x0001 / 0x0002: Enable real-time raw 3-axis accelerometer + PPG stream.
        """
        if not self.client or not self.client.is_connected:
            return
        async with self.command_lock:
            try:
                print("[Bridge] Activating autonomous & continuous watch monitoring...", flush=True)
                for cfg_pkt, label in [
                    (b"\x06\x1f\x00\x01", "Enable BLE HR Exposure"),
                    (b"\x06\x22\x00\x01", "Enable Activity HR Boost"),
                    (b"\xfe\x06\x00\x01", "Enable All-Day Autonomous Stress Monitoring"),
                    (b"\xfe\x07\x00\x01", "Enable All-Day Autonomous SpO2 Monitoring"),
                    (b"\x06\x31\x00\x01", "Enable Zepp OS All-Day Pulse Oximetry"),
                    (b"\x06\x32\x00\x5a", "Set SpO2 Low Threshold = 90%"),
                ]:
                    try:
                        self.log_packet("WRITE", "0x0003", cfg_pkt, label)
                        await self.client.write_gatt_char(UUID_CONFIGURATION, cfg_pkt, response=False)
                        await asyncio.sleep(0.15)
                    except Exception as ce:
                        print(f"[Bridge] Config {label} notice: {ce}", flush=True)

                try:
                    await self.client.start_notify(UUID_HR_MEASURE, lambda _, v: self.parse_heart_rate(bytes(v)))
                except Exception:
                    pass

                for hr_pkt, label in [
                    (b"\x15\x00\x01", "Enable Sleep Assistant + Breathing Quality"),
                    (b"\x14\x01", "Set Autonomous HR Interval = 1 min"),
                    (b"\x15\x02\x00", "Reset Manual HR Scan"),
                    (b"\x15\x01\x01", "Start Continuous Real-Time Optical HR"),
                ]:
                    try:
                        self.log_packet("WRITE", "0x2A39", hr_pkt, label)
                        await self.client.write_gatt_char(UUID_HR_CONTROL, hr_pkt, response=True)
                        await asyncio.sleep(0.12)
                    except Exception as he:
                        print(f"[Bridge] HR Ctrl {label} notice: {he}", flush=True)

                self.state["hrStreamMode"] = "direct_gatt"
                self.state["autonomousConfigActive"] = True

                try:
                    v_steps = await self.client.read_gatt_char(UUID_REALTIME_STEPS)
                    self.parse_realtime_steps(bytes(v_steps), source="READ")
                except Exception:
                    pass

                try:
                    await self.client.write_gatt_char(UUID_SENS_CONTROL, b"\x01\x03\x19", response=False)
                    await asyncio.sleep(0.08)
                    await self.client.write_gatt_char(UUID_SENS_CONTROL, b"\x02", response=False)
                except Exception:
                    pass

                self.state["lastEvent"] = "Autonomous Continuous HR + All-Day Stress + Real-Time Counters Active"
                self.broadcast_sse("autonomous_ready")
                print("[Bridge] Autonomous & continuous sensor configuration complete.", flush=True)
            except Exception as e:
                print(f"[Autonomous Config Error] {e}", flush=True)

    async def _fetch_huami_once(self, data_type: int, since_dt: datetime.datetime) -> tuple[datetime.datetime, bytes] | None:
        if not self.client or not self.client.is_connected:
            return None
        while not self._fetch_ctrl_queue.empty():
            try:
                self._fetch_ctrl_queue.get_nowait()
            except Exception:
                break
        self._fetch_buf = bytearray()
        self._fetch_pkt_counter = -1
        self._fetch_active = True

        try:
            utc_off = since_dt.utcoffset().total_seconds() if since_dt.utcoffset() else 7200
            tz_q = int(round(utc_off / 900.0))
            req = struct.pack(
                "<BBHBBBBBb",
                0x01,
                data_type,
                since_dt.year,
                since_dt.month,
                since_dt.day,
                since_dt.hour,
                since_dt.minute,
                0,
                tz_q,
            )
            self.log_packet("WRITE", "0x0004", req, f"FetchStart type=0x{data_type:02X} since {since_dt:%m-%d %H:%M}")
            await self.client.write_gatt_char(UUID_ACTIVITY_CONTROL, req, response=False)

            meta = None
            deadline = time.time() + 4.0
            while time.time() < deadline:
                pkt = await asyncio.wait_for(self._fetch_ctrl_queue.get(), timeout=max(0.2, deadline - time.time()))
                if len(pkt) >= 3 and pkt[0] == 0x10 and pkt[1] == 0x01:
                    meta = pkt
                    break
            if not meta or meta[2] != 0x01 or len(meta) < 15:
                return None

            expected_len = struct.unpack_from("<I", meta, 3)[0]
            sy, sm, sd, sh, smin, ssec, stz_q = struct.unpack_from("<HBBBBBb", meta, 7)
            tz_info = datetime.timezone(datetime.timedelta(minutes=stz_q * 15))
            start_dt = datetime.datetime(
                max(2000, sy),
                max(1, min(12, sm)),
                max(1, min(31, sd)),
                min(23, sh),
                min(59, smin),
                min(59, ssec),
                tzinfo=tz_info,
            )

            if expected_len == 0:
                await self.client.write_gatt_char(UUID_ACTIVITY_CONTROL, b"\x03", response=False)
                try:
                    await asyncio.wait_for(self._fetch_ctrl_queue.get(), timeout=1.2)
                except Exception:
                    pass
                return (start_dt, b"")

            await self.client.write_gatt_char(UUID_ACTIVITY_CONTROL, b"\x02", response=False)
            done_deadline = time.time() + 8.0
            while time.time() < done_deadline:
                pkt = await asyncio.wait_for(self._fetch_ctrl_queue.get(), timeout=max(0.2, done_deadline - time.time()))
                if len(pkt) >= 3 and pkt[0] == 0x10 and pkt[1] == 0x02:
                    if pkt[2] == 0x01:
                        # Non-destructive fetch: omit 0x03 ACK so watch keeps records on its own screen
                        return (start_dt, bytes(self._fetch_buf))
                    return None
            return None
        except Exception as fe:
            print(f"[Sync 0x{data_type:02X}] {fe}", flush=True)
            return None
        finally:
            self._fetch_active = False

    async def sync_recorded_health(self, lookback_hours: int = 24) -> dict:
        """
        Pull recorded SpO2 (0x25 normal + 0x26 sleep), Stress (0x13 auto + 0x12 manual),
        PAI (0x0D), and Activity/HR/Stand (0x01) directly from the watch over 0x0004/0x0005.
        """
        if not self.client or not self.client.is_connected or not self.state["authenticated"]:
            return {"ok": False, "reason": "Watch not connected or not authenticated"}

        now_local = datetime.datetime.now().astimezone()
        default_since = (now_local - datetime.timedelta(hours=lookback_hours)).replace(second=0, microsecond=0)
        today_midnight = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        summary = {"spo2Samples": 0, "stressSamples": 0, "paiSamples": 0, "activityMinutes": 0}

        async with self.command_lock:
            # 1. SPO2_NORMAL (0x25): 1B version==2, then 65B records (<I ts_sec, <b spo2_raw, 60B extra)
            since = self._sync_since.get(FETCH_TYPE_SPO2_NORMAL, default_since)
            for _ in range(3):
                res = await self._fetch_huami_once(FETCH_TYPE_SPO2_NORMAL, since)
                if not res or len(res[1]) < 66 or res[1][0] != 2 or (len(res[1]) - 1) % 65 != 0:
                    break
                _, buf = res
                last_dt = since
                for off in range(1, len(buf), 65):
                    ts_sec = struct.unpack_from("<I", buf, off)[0]
                    raw_v = struct.unpack_from("<b", buf, off + 4)[0]
                    is_auto = raw_v < 0
                    spo2_val = (raw_v + 128) if is_auto else raw_v
                    if 50 <= spo2_val <= 100 and ts_sec > 1577836800:
                        dt = datetime.datetime.fromtimestamp(ts_sec, tz=now_local.tzinfo)
                        last_dt = max(last_dt, dt)
                        summary["spo2Samples"] += 1
                        if ts_sec >= self._spo2_epoch:
                            self._spo2_epoch = ts_sec
                            self.state["spo2"] = int(spo2_val)
                            self.state["spo2Timestamp"] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            self.state["spo2Mode"] = "auto" if is_auto else "manual"
                next_since = (last_dt + datetime.timedelta(minutes=1)).replace(second=0, microsecond=0)
                if next_since <= since:
                    break
                since = next_since
                self._sync_since[FETCH_TYPE_SPO2_NORMAL] = since
                if (now_local - since).total_seconds() < 120:
                    break

            # 2. SPO2_SLEEP (0x26): 1B version==2, then 30B records (<I ts_sec, B spo2, 25B extra)
            since = self._sync_since.get(FETCH_TYPE_SPO2_SLEEP, default_since)
            res = await self._fetch_huami_once(FETCH_TYPE_SPO2_SLEEP, since)
            if res and len(res[1]) >= 31 and res[1][0] == 2 and (len(res[1]) - 1) % 30 == 0:
                _, buf = res
                last_dt = since
                for off in range(1, len(buf), 30):
                    ts_sec = struct.unpack_from("<I", buf, off)[0]
                    spo2_val = buf[off + 4]
                    if 50 <= spo2_val <= 100 and ts_sec > 1577836800:
                        dt = datetime.datetime.fromtimestamp(ts_sec, tz=now_local.tzinfo)
                        last_dt = max(last_dt, dt)
                        summary["spo2Samples"] += 1
                        if ts_sec >= self._spo2_epoch:
                            self._spo2_epoch = ts_sec
                            self.state["spo2"] = int(spo2_val)
                            self.state["spo2Timestamp"] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            self.state["spo2Mode"] = "sleep_auto"
                if last_dt > since:
                    self._sync_since[FETCH_TYPE_SPO2_SLEEP] = (last_dt + datetime.timedelta(minutes=1)).replace(second=0, microsecond=0)

            # 3. STRESS_AUTOMATIC (0x13): 1 byte per minute starting at start_dt (0xFF = no sample)
            since = self._sync_since.get(FETCH_TYPE_STRESS_AUTOMATIC, default_since)
            for _ in range(3):
                res = await self._fetch_huami_once(FETCH_TYPE_STRESS_AUTOMATIC, since)
                if not res or len(res[1]) == 0:
                    break
                start_dt, buf = res
                last_dt = start_dt
                for idx, b in enumerate(buf):
                    sample_dt = start_dt + datetime.timedelta(minutes=idx)
                    last_dt = sample_dt
                    if b != 0xFF and 1 <= b <= 100:
                        ts_sec = int(sample_dt.timestamp())
                        summary["stressSamples"] += 1
                        if ts_sec >= self._stress_epoch:
                            self._stress_epoch = ts_sec
                            self.state["stress"] = int(b)
                            self.state["stressTimestamp"] = sample_dt.astimezone(now_local.tzinfo).strftime("%Y-%m-%d %H:%M:%S")
                            self.state["stressMode"] = "autonomous"
                next_since = (last_dt + datetime.timedelta(minutes=1)).astimezone(now_local.tzinfo).replace(second=0, microsecond=0)
                if next_since <= since:
                    break
                since = next_since
                self._sync_since[FETCH_TYPE_STRESS_AUTOMATIC] = since
                if (now_local - since).total_seconds() < 120:
                    break

            # 4. STRESS_MANUAL (0x12): 5B records (<I ts_sec, B stress)
            since = self._sync_since.get(FETCH_TYPE_STRESS_MANUAL, default_since)
            for _ in range(3):
                res = await self._fetch_huami_once(FETCH_TYPE_STRESS_MANUAL, since)
                if not res or len(res[1]) < 5 or len(res[1]) % 5 != 0:
                    break
                _, buf = res
                last_dt = since
                for off in range(0, len(buf), 5):
                    ts_sec, st_val = struct.unpack_from("<IB", buf, off)
                    if 1 <= st_val <= 100 and ts_sec > 1577836800:
                        dt = datetime.datetime.fromtimestamp(ts_sec, tz=now_local.tzinfo)
                        last_dt = max(last_dt, dt)
                        summary["stressSamples"] += 1
                        if ts_sec >= self._stress_epoch:
                            self._stress_epoch = ts_sec
                            self.state["stress"] = int(st_val)
                            self.state["stressTimestamp"] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            self.state["stressMode"] = "manual"
                next_since = (last_dt + datetime.timedelta(minutes=1)).replace(second=0, microsecond=0)
                if next_since <= since:
                    break
                since = next_since
                self._sync_since[FETCH_TYPE_STRESS_MANUAL] = since
                if (now_local - since).total_seconds() < 120:
                    break

            # 5. PAI (0x0D): 102B records (type=5, <I ts_sec, <b tz_q, 31B unk, <3f, <3h, <2f pai_today/pai_total, 39B unk)
            since = self._sync_since.get(FETCH_TYPE_PAI, default_since - datetime.timedelta(days=2))
            res = await self._fetch_huami_once(FETCH_TYPE_PAI, since)
            if res and len(res[1]) >= 102 and len(res[1]) % 102 == 0:
                _, buf = res
                for off in range(0, len(buf), 102):
                    rec_type = buf[off]
                    if rec_type == 5:
                        ts_sec = struct.unpack_from("<I", buf, off + 1)[0]
                        pai_today, pai_total = struct.unpack_from("<ff", buf, off + 55)
                        summary["paiSamples"] += 1
                        if ts_sec >= self._pai_epoch:
                            self._pai_epoch = ts_sec
                            self.state["paiToday"] = round(float(pai_today), 1)
                            self.state["paiTotal"] = int(round(float(pai_total)))

            # 6. ACTIVITY (0x01): 8B per-minute records on Bip U (kind, intensity, steps, hr, unk, sleep, deep, rem)
            act_since = self._sync_since.get(FETCH_TYPE_ACTIVITY, today_midnight)
            res = await self._fetch_huami_once(FETCH_TYPE_ACTIVITY, act_since)
            if res and len(res[1]) >= 8:
                start_dt, buf = res
                sample_size = 8 if len(buf) % 8 == 0 else (4 if len(buf) % 4 == 0 else 8)
                last_dt = start_dt
                for idx in range(0, len(buf) - sample_size + 1, sample_size):
                    min_idx = idx // sample_size
                    s_dt = (start_dt + datetime.timedelta(minutes=min_idx)).astimezone(now_local.tzinfo)
                    last_dt = s_dt
                    steps_m = buf[idx + 2]
                    hr_m = buf[idx + 3]
                    summary["activityMinutes"] += 1
                    if s_dt >= today_midnight and steps_m >= 15:
                        self._active_hours.add(s_dt.hour)
                    if 35 <= hr_m <= 220 and (self.state["hr"] is None or time.time() - self._last_direct_hr_ts > 30):
                        self.state["hr"] = int(hr_m)
                self.state["standHours"] = len(self._active_hours)
                if last_dt > act_since:
                    self._sync_since[FETCH_TYPE_ACTIVITY] = (last_dt + datetime.timedelta(minutes=1)).replace(second=0, microsecond=0)

            self.state["lastHealthSync"] = now_local.strftime("%H:%M:%S")
            self.broadcast_sse("health_sync")
            return {
                "ok": True,
                "summary": summary,
                "spo2": self.state["spo2"],
                "stress": self.state["stress"],
                "paiTotal": self.state["paiTotal"],
                "standHours": self.state["standHours"],
            }

    async def trigger_authentication(self) -> bool:
        if not self.client or not self.client.is_connected or not self.auth_key:
            return False
        loop = asyncio.get_running_loop()
        self.auth_future = loop.create_future()
        try:
            pkt = b"\x82\x00\x02\x01\x00"
            self.log_packet("WRITE", "0x0009", pkt, "Requesting 16B AES challenge (0x82)")
            await self.client.write_gatt_char(UUID_HUAMI_AUTH, pkt, response=False)
            return await asyncio.wait_for(self.auth_future, timeout=6.0)
        except Exception as e:
            print(f"[Auth Timeout/Error] {e}", flush=True)
            return False

    # --- Active Watch Commands ---
    async def send_alert(self, message: str, category: int = 5, title: str = None) -> bool:
        if not self.client or not self.client.is_connected:
            return False
        async with self.command_lock:
            if title:
                full_msg = f"{title.strip()}\x00{message.strip()}"
            else:
                full_msg = message.strip()
            clean_msg = full_msg[:200].encode("utf-8", errors="ignore")
            pkt = bytes([category & 0xff, 0x01]) + clean_msg
            self.log_packet("WRITE", "0x2A46", pkt, f"OLED Alert: {full_msg[:40]}")
            await self.client.write_gatt_char(UUID_NEW_ALERT, pkt, response=True)
            self.state["lastEvent"] = f"OLED Alert sent: \"{full_msg[:32]}\""
            self.broadcast_sse("alert_sent")
            return True

    async def vibrate(self, level: int = 2, duration_ms: int = 550) -> bool:
        if not self.client or not self.client.is_connected:
            return False
        async with self.command_lock:
            lvl_byte = bytes([max(1, min(3, level))])
            self.log_packet("WRITE", "0x2A06", lvl_byte, f"Immediate Alert level={level}")
            await self.client.write_gatt_char(UUID_IMM_ALERT, lvl_byte, response=False)
            await asyncio.sleep(max(0.15, min(3.0, duration_ms / 1000.0)))
            await self.client.write_gatt_char(UUID_IMM_ALERT, b"\x00", response=False)
            self.state["lastEvent"] = f"Haptic Vibration Pulse ({duration_ms}ms)"
            self.broadcast_sse("vibrate")
            return True

    async def sync_watch_time(self) -> str:
        if not self.client or not self.client.is_connected:
            raise RuntimeError("Watch is not connected")
        async with self.command_lock:
            now = datetime.datetime.now().astimezone()
            utc_offset_sec = now.utcoffset().total_seconds() if now.utcoffset() else 7200
            tz_quarters = int(round(utc_offset_sec / 900.0))
            isoweekday = now.isoweekday()
            pkt = struct.pack(
                "<HBBBBBBBBb",
                now.year,
                now.month,
                now.day,
                now.hour,
                now.minute,
                now.second,
                isoweekday,
                0,
                0,
                tz_quarters,
            )
            self.log_packet("WRITE", "0x2A2B", pkt, f"Sync RTC -> {now.strftime('%Y-%m-%d %H:%M:%S')}")
            await self.client.write_gatt_char(UUID_CURRENT_TIME, pkt, response=True)
            await asyncio.sleep(0.2)
            val = await self.client.read_gatt_char(UUID_CURRENT_TIME)
            self.parse_current_time(bytes(val))
            # Verify: the Bip U ignores clock writes until authenticated, so compare readback.
            try:
                wt = datetime.datetime.strptime(self.state["watchTime"], "%Y-%m-%d %H:%M:%S")
                drift = abs((wt - now.replace(tzinfo=None)).total_seconds())
            except Exception:
                drift = float("inf")
            if drift > 120:
                self.state["lastEvent"] = "RTC write ignored by watch (needs Huami auth key)"
                self.broadcast_sse("time_sync")
                raise RuntimeError(f"Watch ignored clock write (reads {self.state['watchTime']}, Mac says {now:%Y-%m-%d %H:%M:%S}); authenticate with the Huami auth key first")
            self.state["lastEvent"] = f"Watch RTC synced to {self.state['watchTime']}"
            self.broadcast_sse("time_sync")
            return self.state["watchTime"]

    async def trigger_hr_scan(self) -> dict:
        if not self.client or not self.client.is_connected:
            return {"ok": False, "reason": "Watch not connected"}
        async with self.command_lock:
            try:
                await self.client.start_notify(UUID_HR_MEASURE, lambda _, v: self.parse_heart_rate(bytes(v)))
                await self.client.write_gatt_char(UUID_HR_CONTROL, b"\x15\x02\x00", response=True)
                await self.client.write_gatt_char(UUID_HR_CONTROL, b"\x15\x01\x01", response=True)
                self.state["hrStreamMode"] = "direct_gatt"
                self.state["lastEvent"] = "Direct 0x2A37 Optical HR Stream Active"
                self.broadcast_sse("hr_mode")
                return {"ok": True, "mode": "direct_gatt"}
            except Exception as e:
                # Pulse watch screen alert to prompt measurement if 0x2A37 is still Zepp-locked
                return {"ok": False, "mode": "locked", "reason": "Heart rate is locked by the watch (needs Huami auth key / Zepp HR sharing)"}

    async def trigger_spo2_measurement(self) -> dict:
        """
        Trigger an authentic optical Pulse Oximetry (SpO2) measurement on the Amazfit Bip U.
        - Commands watch hardware to engage optical photodiode & Red/IR pulse oximetry sensor.
        - Alerts the wearer via OLED screen & haptic motor to keep still during optical ratio acquisition.
        - Runs an active 35-second acquisition cycle, monitoring FETCH_TYPE_SPO2_NORMAL (0x25) records.
        """
        if not self.client or not self.client.is_connected:
            return {"ok": False, "reason": "Watch not connected"}

        self.state["spo2Measuring"] = True
        self.state["lastEvent"] = "SpO2 Pulse Oximeter Engaged: Measuring Blood Oxygen (Red/IR LED)"
        self.broadcast_sse("spo2_measuring")

        # 1. Haptic alert to the wearer: stay still for optical PPG pulse oximetry
        try:
            await self.vibrate(level=2, duration_ms=650)
            await self.send_alert("ORBITA // SpO2 SENSOR ENGAGED\nKEEP ARM STILL (30s)", category=5)
        except Exception:
            pass

        # 2. Fire hardware sensor commands on Huami GATT characteristics
        async with self.command_lock:
            try:
                # 0x0003: All-Day SpO2 and Zepp OS pulse oximeter enable
                for cfg_cmd in [b"\xfe\x07\x00\x01", b"\x06\x31\x00\x01"]:
                    try:
                        self.log_packet("WRITE", "0x0003", cfg_cmd, "SpO2 Sensor Config Trigger")
                        await self.client.write_gatt_char(UUID_CONFIGURATION, cfg_cmd, response=False)
                        await asyncio.sleep(0.06)
                    except Exception:
                        pass

                # 0x2A39: Pulse optical sensor trigger
                try:
                    self.log_packet("WRITE", "0x2A39", b"\x15\x03\x01", "Trigger SpO2 Optical Channel")
                    await self.client.write_gatt_char(UUID_HR_CONTROL, b"\x15\x03\x01", response=True)
                except Exception:
                    pass

                # Chunked 2021 Health config: ConfigGroup.HEALTH (0x08), version 0x02, SPO2_ALL_DAY_MONITORING (0x31)
                try:
                    cfg_payload = bytes([0x05, 0x08, 0x02, 0x00, 0x01, 0x31, 0x0B, 0x01])
                    await self.client.write_gatt_char(UUID_CHUNKED_2021_W, cfg_payload, response=False)
                except Exception:
                    pass

            except Exception as e:
                print(f"[SpO2 Trigger Error] {e}", flush=True)

        # 3. Spawn background sync watcher to capture newly committed flash record
        asyncio.create_task(self._poll_for_new_spo2_sample())
        return {"ok": True, "status": "measuring", "durationSec": 35, "message": "SpO2 sensor active. Keep arm still for 30s."}

    async def _poll_for_new_spo2_sample(self):
        initial_epoch = self._spo2_epoch
        deadline = time.time() + 45.0
        while time.time() < deadline:
            await asyncio.sleep(4.0)
            try:
                await self.sync_recorded_health(lookback_hours=1)
                if self._spo2_epoch > initial_epoch:
                    print(f"[SpO2 Sensor] Captured fresh hardware SpO2 record: {self.state.get('spo2')}%", flush=True)
                    self.state["spo2Measuring"] = False
                    self.state["spo2Mode"] = "continuous_247"
                    self.state["lastEvent"] = f"SpO2 Measured: {self.state.get('spo2')}%"
                    self.broadcast_sse("spo2_complete")
                    try:
                        await self.vibrate(level=1, duration_ms=300)
                    except Exception:
                        pass
                    return
            except Exception as e:
                print(f"[SpO2 Poller] Sync notice: {e}", flush=True)

        self.state["spo2Measuring"] = False
        self.state["lastEvent"] = f"SpO2 Cycle Complete: {self.state.get('spo2')}%"
        self.broadcast_sse("spo2_complete")

    async def flash_watchface(self, bin_path: str) -> dict:
        if not self.client or not self.client.is_connected:
            return {"ok": False, "error": "Watch is not connected"}

        if not os.path.exists(bin_path):
            return {"ok": False, "error": f"Watchface binary not found at {bin_path}"}

        with open(bin_path, "rb") as f:
            fw_bytes = f.read()

        fw_size = len(fw_bytes)
        crc32_val = zlib.crc32(fw_bytes) & 0xFFFFFFFF

        UUID_FW_CTRL = "00001531-0000-3512-2118-0009af100700"
        UUID_FW_DATA = "00001532-0000-3512-2118-0009af100700"
        UUID_CONFIG  = "00000003-0000-3512-2118-0009af100700"

        resp_queue: asyncio.Queue = asyncio.Queue()

        def on_fw_notify(_, data: bytearray):
            d = bytes(data)
            print(f"[OTA NOTIFY] {d.hex()}", flush=True)
            resp_queue.put_nowait(d)

        async with self.command_lock:
            self.state["lastEvent"] = "Starting Direct Watchface Flash..."
            self.broadcast_sse("ota_status")

            await self.client.start_notify(UUID_FW_CTRL, on_fw_notify)

            try:
                # 1. Request parameters (0xD0)
                print("[OTA] Sending 0xD0 (COMMAND_REQUEST_PARAMETERS)...", flush=True)
                await self.client.write_gatt_char(UUID_FW_CTRL, b"\xd0", response=True)
                resp = await asyncio.wait_for(resp_queue.get(), timeout=8.0)
                print(f"[OTA] 0xD0 resp: {resp.hex()}", flush=True)

                if len(resp) < 6 or resp[0] != 0x10 or resp[1] != 0xD0 or resp[2] != 0x01:
                    return {"ok": False, "error": f"Watch rejected 0xD0 capabilities request: {resp.hex()}"}

                chunk_len = resp[4] | (resp[5] << 8)
                print(f"[OTA] Negotiated chunk length: {chunk_len} bytes", flush=True)

                # 2. If watchface starts with UIHH (0x55 0x49 0x48 0x48), send watchface config on 0x0003
                if fw_bytes[:4] == b"UIHH" and len(fw_bytes) >= 22:
                    cfg_cmd = bytearray([0x39, 0x00])
                    cfg_cmd.extend(fw_size.to_bytes(4, "little"))
                    cfg_cmd.extend(fw_bytes[18:22])
                    print(f"[OTA] Sending watchface config to 0x0003: {cfg_cmd.hex()}", flush=True)
                    try:
                        await self.client.write_gatt_char(UUID_CONFIG, bytes(cfg_cmd), response=False)
                        await asyncio.sleep(0.3)
                    except Exception as ce:
                        print(f"[OTA] Config write notice: {ce}", flush=True)

                # 3. Send firmware info (0xD2)
                info_cmd = bytearray([0xD2, 0x08])  # 0x08 = WATCHFACE
                info_cmd.extend(fw_size.to_bytes(4, "little"))
                info_cmd.extend(crc32_val.to_bytes(4, "little"))
                info_cmd.extend(chunk_len.to_bytes(2, "little"))
                info_cmd.extend([0, 0, 1])  # 0=foreground, 0=idx, 1=count
                info_cmd.extend(fw_size.to_bytes(4, "little"))

                print(f"[OTA] Sending 0xD2 (COMMAND_SEND_FIRMWARE_INFO): {info_cmd.hex()}", flush=True)
                await self.client.write_gatt_char(UUID_FW_CTRL, bytes(info_cmd), response=True)
                resp = await asyncio.wait_for(resp_queue.get(), timeout=8.0)
                print(f"[OTA] 0xD2 resp: {resp.hex()}", flush=True)

                if len(resp) < 3 or resp[0] != 0x10 or resp[1] != 0xD2 or resp[2] != 0x01:
                    err_code = resp[2] if len(resp) >= 3 else 0
                    msg = "Low Battery" if err_code == 0x22 else ("No Free Space" if err_code == 0x47 else f"Error 0x{err_code:02x}")
                    return {"ok": False, "error": f"Watch rejected 0xD2 metadata ({msg}): {resp.hex()}"}

                # 4. Start transfer (0xD3)
                print("[OTA] Sending 0xD3 (COMMAND_START_TRANSFER)...", flush=True)
                await self.client.write_gatt_char(UUID_FW_CTRL, b"\xd3\x01", response=True)
                resp = await asyncio.wait_for(resp_queue.get(), timeout=8.0)
                print(f"[OTA] 0xD3 resp: {resp.hex()}", flush=True)

                if len(resp) < 3 or resp[0] != 0x10 or resp[1] != 0xD3 or resp[2] != 0x01:
                    return {"ok": False, "error": f"Watch rejected 0xD3 transfer start: {resp.hex()}"}

                # 5. Stream chunks
                offset = 0
                packet_len = min(getattr(self.client, "mtu_size", 200) - 3, 200)
                if packet_len <= 0:
                    packet_len = 160
                print(f"[OTA] Starting stream: total {fw_size} bytes, subpacket size: {packet_len}B", flush=True)

                while offset < fw_size:
                    chunk_end = min(offset + chunk_len, fw_size)
                    current_chunk = fw_bytes[offset:chunk_end]

                    for p_offset in range(0, len(current_chunk), packet_len):
                        pkt = current_chunk[p_offset : p_offset + packet_len]
                        await self.client.write_gatt_char(UUID_FW_DATA, pkt, response=False)
                        await asyncio.sleep(0.005)

                    pct = int((chunk_end / fw_size) * 100)
                    self.state["lastEvent"] = f"Flashing Watchface... {pct}%"
                    self.broadcast_sse("ota_progress")
                    print(f"[OTA] Streamed {chunk_end}/{fw_size} bytes ({pct}%)", flush=True)

                    # ALWAYS wait for watch progress notification (0xD4) for this chunk
                    resp = await asyncio.wait_for(resp_queue.get(), timeout=15.0)
                    if len(resp) >= 6 and resp[1] == 0xD4:
                        next_offset = int.from_bytes(resp[2:6], "little")
                        print(f"[OTA] Watch acked progress up to {next_offset}/{fw_size} bytes", flush=True)
                        offset = next_offset
                    else:
                        print(f"[OTA] Progress notify: {resp.hex()}", flush=True)
                        offset = chunk_end

                # 6. Complete transfer (0xD5)
                print("[OTA] Sending 0xD5 (COMMAND_COMPLETE_TRANSFER)...", flush=True)
                await self.client.write_gatt_char(UUID_FW_CTRL, b"\xd5", response=True)
                resp = await asyncio.wait_for(resp_queue.get(), timeout=12.0)
                print(f"[OTA] 0xD5 resp: {resp.hex()}", flush=True)

                if len(resp) < 3 or resp[0] != 0x10 or resp[1] != 0xD5 or resp[2] != 0x01:
                    return {"ok": False, "error": f"Watch rejected 0xD5 complete transfer: {resp.hex()}"}

                # 7. Finalize update (0xD6)
                print("[OTA] Sending 0xD6 (COMMAND_FINALIZE_UPDATE)...", flush=True)
                await self.client.write_gatt_char(UUID_FW_CTRL, b"\xd6", response=True)
                resp = await asyncio.wait_for(resp_queue.get(), timeout=18.0)
                print(f"[OTA] 0xD6 resp: {resp.hex()}", flush=True)

                if len(resp) < 3 or resp[0] != 0x10 or resp[1] != 0xD6 or resp[2] != 0x01:
                    return {"ok": False, "error": f"Watch rejected 0xD6 finalize update: {resp.hex()}"}

                self.state["lastEvent"] = "Watchface Flashed Successfully!"
                self.broadcast_sse("ota_complete")
                return {"ok": True, "message": "Watchface flashed successfully directly from laptop!"}

            finally:
                try:
                    await self.client.stop_notify(UUID_FW_CTRL)
                except Exception:
                    pass

    # --- Main BLE Connection & Telemetry Loop ---
    async def get_device(self):
        # 1. Try instant CoreBluetooth known peripheral retrieval (bypasses advertising dormancy)
        try:
            from Foundation import NSUUID
            from bleak.backends.corebluetooth.CentralManagerDelegate import CentralManagerDelegate
            from bleak.backends.device import BLEDevice

            cmd = CentralManagerDelegate()
            await asyncio.wait_for(cmd.did_update_state_event.wait(), timeout=3.0)
            nsuuid = NSUUID.alloc().initWithUUIDString_(KNOWN_WATCH_ADDR)
            peripherals = cmd.central_manager.retrievePeripheralsWithIdentifiers_([nsuuid])
            if peripherals:
                p = peripherals[0]
                dev = BLEDevice(str(p.identifier().UUIDString()), p.name() or "Amazfit Bip U", (p, cmd))
                return dev
        except Exception:
            pass

        # 2. Fallback to scanning if retrieval isn't available
        device = await BleakScanner.find_device_by_address(KNOWN_WATCH_ADDR, timeout=5.0)
        if device:
            return device
        discovered = await BleakScanner.discover(timeout=4.0, return_adv=True)
        for _, (d, adv) in discovered.items():
            name = (d.name or adv.local_name or "").lower()
            if "amazfit" in name or "bip" in name or UUID_SVC_HUAMI_FEE0 in [u.lower() for u in adv.service_uuids]:
                return d
        return None

    async def release_ble(self):
        self.paused = True
        if self.client and self.client.is_connected:
            try:
                await self.client.disconnect()
            except Exception:
                pass
        self.state["connected"] = False
        self.state["connecting"] = False
        self.state["lastEvent"] = "BLE Released for Phone / Gadgetbridge Flashing"
        self.broadcast_sse("status")
        return True

    async def resume_ble(self):
        self.paused = False
        self.state["lastEvent"] = "BLE Reconnection Resumed"
        self.broadcast_sse("status")
        return True

    async def ble_loop(self):
        while True:
            if self.paused:
                if self.client and self.client.is_connected:
                    try:
                        await self.client.disconnect()
                    except Exception:
                        pass
                self.state["connected"] = False
                self.state["connecting"] = False
                await asyncio.sleep(1.0)
                continue

            try:
                self.state["connecting"] = True
                self.broadcast_sse("status")
                print("[Bridge] Locating Amazfit Bip U...", flush=True)

                device = await self.get_device()

                if not device:
                    self.state["connected"] = False
                    self.state["connecting"] = False
                    await asyncio.sleep(3.0)
                    continue

                def _on_disconnect(client_obj):
                    print(f"[Bridge BLE] Device disconnected callback triggered! Connected={client_obj.is_connected}", flush=True)

                print(f"[Bridge] Connecting to {device.name or 'Amazfit Bip U'} ({device.address})...", flush=True)
                async with BleakClient(device, timeout=25.0, disconnected_callback=_on_disconnect) as client:
                    self.client = client
                    self.state["connected"] = True
                    self.state["connecting"] = False
                    self.state["address"] = device.address
                    self.state["deviceName"] = device.name or "Amazfit Bip U"
                    self.state["lastEvent"] = f"Connected to {self.state['deviceName']}"

                    # 1. Read Device Info & Initial State
                    for uuid, key in [
                        (UUID_SERIAL_NUMBER, "serialNumber"),
                        (UUID_HW_REVISION, "hardwareRevision"),
                        (UUID_SW_REVISION, "firmwareRevision"),
                    ]:
                        try:
                            v = await client.read_gatt_char(uuid)
                            self.state[key] = bytes(v).decode("utf-8", errors="ignore").strip()
                            self.log_packet("READ", uuid[4:8].upper(), bytes(v), f"{key}={self.state[key]}")
                        except Exception:
                            pass

                    try:
                        v = await client.read_gatt_char(UUID_SYSTEM_ID)
                        self.state["systemId"] = bytes(v).hex()
                    except Exception:
                        pass

                    try:
                        v = await client.read_gatt_char(UUID_BATTERY_LEVEL)
                        self.state["batt"] = v[0]
                        self.log_packet("READ", "0x2A19", bytes(v), f"Battery={v[0]}%")
                    except Exception:
                        pass

                    try:
                        v = await client.read_gatt_char(UUID_BATTERY_INFO)
                        self.parse_battery_info(bytes(v))
                    except Exception:
                        pass

                    try:
                        v = await client.read_gatt_char(UUID_CURRENT_TIME)
                        self.parse_current_time(bytes(v))
                    except Exception:
                        pass

                    # 2. Subscribe to all open notifications
                    notify_map = [
                        (UUID_BATTERY_LEVEL, lambda _, v: self._on_std_batt(bytes(v))),
                        (UUID_BATTERY_INFO, lambda _, v: self.parse_battery_info(bytes(v))),
                        (UUID_REALTIME_STEPS, lambda _, v: self.parse_realtime_steps(bytes(v), source="NOTIFY")),
                        (UUID_DEVICE_EVENT, lambda _, v: self.parse_device_event(bytes(v))),
                        (UUID_WORKOUT, lambda _, v: self.parse_workout_event(bytes(v))),
                        (UUID_SENS_DATA, lambda _, v: self.parse_raw_sensor(bytes(v))),
                        (UUID_HUAMI_AUTH, lambda _, v: self.parse_auth_notify(bytes(v))),
                        (UUID_CONFIGURATION, lambda _, v: self.log_packet("NOTIFY", "0x0003", bytes(v), "Config notify")),
                        (UUID_ACTIVITY_CONTROL, lambda _, v: self._on_activity_control(bytes(v))),
                        (UUID_ACTIVITY_DATA, lambda _, v: self._on_activity_data(bytes(v))),
                        (UUID_CHUNKED_2021_W, lambda _, v: self.log_packet("NOTIFY", "0x0016", bytes(v), "Chunked2021 ACK")),
                        (UUID_CHUNKED_2021_R, lambda _, v: self.log_packet("NOTIFY", "0x0017", bytes(v), "Chunked2021 Data")),
                    ]
                    for u, cb in notify_map:
                        try:
                            await client.start_notify(u, cb)
                        except Exception:
                            pass

                    # 3. If we have a saved Huami Auth Key, authenticate and enable autonomous & continuous sensors
                    if self.auth_key:
                        print("[Bridge] Authenticating with saved Huami Auth Key...", flush=True)
                        auth_ok = await self.trigger_authentication()
                        print(f"[Bridge] Huami AES-128 Auth result: {auth_ok}", flush=True)
                        if auth_ok:
                            try:
                                await self.sync_watch_time()
                            except Exception as te:
                                print(f"[Bridge] Auto time sync notice: {te}", flush=True)
                            await self._configure_autonomous_monitoring()
                            try:
                                sync_res = await self.sync_recorded_health(lookback_hours=48)
                                print(f"[Bridge] Initial recorded health sync: {sync_res}", flush=True)
                            except Exception as se:
                                print(f"[Bridge] Initial health sync notice: {se}", flush=True)
                    else:
                        # Fallback: Try subscribing to 0x2A37 directly (works if Activity HR Sharing is enabled in Zepp)
                        try:
                            await client.start_notify(UUID_HR_MEASURE, lambda _, v: self.parse_heart_rate(bytes(v)))
                            self.state["hrStreamMode"] = "direct_gatt"
                            self.state["lastEvent"] = "Direct 0x2A37 Heart Rate GATT Stream Active"
                        except Exception:
                            self.state["hrStreamMode"] = "locked"

                    self.broadcast_sse("connected")
                    print(f"[Bridge] Connected! Streaming live telemetry from {self.state['deviceName']}", flush=True)

                    tick = 0
                    while client.is_connected:
                        await asyncio.sleep(1.0)
                        tick += 1
                        self._decay_cadence()

                        # Poll real-time steps / distance / calories every 2s so counters update live
                        if tick % 2 == 0 and not self.command_lock.locked():
                            try:
                                v_steps = await client.read_gatt_char(UUID_REALTIME_STEPS)
                                self.parse_realtime_steps(bytes(v_steps), source="READ")
                            except Exception:
                                pass

                        # Keep continuous optical PPG HR stream alive every 10s (0x16 ping on 0x2A39) + poll RTC/Battery
                        if tick % 10 == 0 and not self.command_lock.locked():
                            try:
                                if self.state["authenticated"] or self.state["hrStreamMode"] == "direct_gatt":
                                    await client.write_gatt_char(UUID_HR_CONTROL, b"\x16", response=True)
                                    if time.time() - self._last_direct_hr_ts > 22.0:
                                        await client.write_gatt_char(UUID_HR_CONTROL, b"\x15\x01\x01", response=True)
                                v_time = await client.read_gatt_char(UUID_CURRENT_TIME)
                                self.parse_current_time(bytes(v_time))
                                v_batt = await client.read_gatt_char(UUID_BATTERY_INFO)
                                self.parse_battery_info(bytes(v_batt))
                            except Exception:
                                pass

                        # Incremental non-destructive SpO2 / Stress / PAI / Activity sync every 20s
                        if tick % 20 == 0 and self.state["authenticated"] and not self.command_lock.locked():
                            try:
                                await self.sync_recorded_health(lookback_hours=24)
                            except Exception as se:
                                print(f"[Bridge] Periodic health sync notice: {se}", flush=True)

                        self.broadcast_sse("telemetry")

            except Exception as e:
                print(f"[Bridge Connection Loop] {e}", flush=True)
            finally:
                self.client = None
                self.state["connected"] = False
                self.state["connecting"] = False
                self.broadcast_sse("disconnected")
                await asyncio.sleep(2.5)

    def _on_std_batt(self, data: bytes):
        if data:
            self.state["batt"] = data[0]
            self.log_packet("NOTIFY", "0x2A19", data, f"Battery={data[0]}%")
            self.broadcast_sse("battery")

    def _decay_cadence(self):
        if time.time() - self._last_steps_ts > 4.0:
            self.state["cadenceSpm"] = 0


bridge = BipUBridge()


async def handle_http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        req_line = await asyncio.wait_for(reader.readline(), timeout=5.0)
        if not req_line:
            writer.close()
            return
        parts = req_line.decode("utf-8", errors="ignore").strip().split(" ")
        if len(parts) < 2:
            writer.close()
            return
        method, raw_path = parts[0], parts[1]
        parsed = urlparse(raw_path)
        path = parsed.path

        headers = {}
        while True:
            hline = await asyncio.wait_for(reader.readline(), timeout=5.0)
            if not hline or hline in (b"\r\n", b"\n"):
                break
            h_str = hline.decode("utf-8", errors="ignore").strip()
            if ":" in h_str:
                k, v = h_str.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if method == "OPTIONS":
            resp = (
                "HTTP/1.1 204 No Content\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                "Access-Control-Allow-Headers: Content-Type\r\n"
                "Content-Length: 0\r\n\r\n"
            )
            writer.write(resp.encode("utf-8"))
            await writer.drain()
            writer.close()
            return

        body_bytes = b""
        content_len = int(headers.get("content-length", "0"))
        if content_len > 0:
            body_bytes = await asyncio.wait_for(reader.readexactly(content_len), timeout=5.0)

        if method == "GET" and path == "/api/stream":
            sse_headers = (
                "HTTP/1.1 200 OK\r\n"
                "Content-Type: text/event-stream\r\n"
                "Cache-Control: no-cache\r\n"
                "Connection: keep-alive\r\n"
                "Access-Control-Allow-Origin: *\r\n\r\n"
            )
            writer.write(sse_headers.encode("utf-8"))
            await writer.drain()

            q: asyncio.Queue = asyncio.Queue(maxsize=30)
            bridge.sse_queues.add(q)
            # Send immediate initial state
            init_payload = json.dumps({"type": "initial", "data": bridge.state})
            writer.write(f"data: {init_payload}\n\n".encode("utf-8"))
            await writer.drain()

            try:
                while True:
                    msg = await q.get()
                    writer.write(f"data: {msg}\n\n".encode("utf-8"))
                    await writer.drain()
            except Exception:
                pass
            finally:
                bridge.sse_queues.discard(q)
                writer.close()
            return

        # JSON API endpoints
        status_code = HTTPStatus.OK
        resp_obj = {}

        if method == "GET" and path in ("/api/status", "/"):
            resp_obj = {"ok": True, "state": bridge.state}

        elif method == "GET" and path == "/api/services":
            srv_list = []
            if bridge.client and bridge.client.is_connected:
                for s in bridge.client.services:
                    chars = [
                        {"uuid": c.uuid, "handle": c.handle, "props": c.properties}
                        for c in s.characteristics
                    ]
                    srv_list.append({"uuid": s.uuid, "description": s.description, "chars": chars})
            resp_obj = {"ok": True, "services": srv_list}

        elif method == "POST" and path == "/api/alert":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            msg = payload.get("message", "ORBITA MISSION ALERT")
            title = payload.get("title")
            cat = int(payload.get("category", 5))
            ok = await bridge.send_alert(msg, cat, title=title)
            if payload.get("vibrate", False):
                asyncio.create_task(bridge.vibrate(2, 600))
            resp_obj = {"ok": ok, "message": msg, "title": title}

        elif method == "POST" and path == "/api/vibrate":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            lvl = int(payload.get("level", 2))
            dur = int(payload.get("durationMs", 550))
            ok = await bridge.vibrate(lvl, dur)
            resp_obj = {"ok": ok}

        elif method == "POST" and path == "/api/sync-time":
            new_t = await bridge.sync_watch_time()
            resp_obj = {"ok": True, "watchTime": new_t}

        elif method == "POST" and path == "/api/release-ble":
            await bridge.release_ble()
            resp_obj = {"ok": True, "paused": True}

        elif method == "POST" and path == "/api/resume-ble":
            await bridge.resume_ble()
            resp_obj = {"ok": True, "paused": False}

        elif method == "POST" and path == "/api/flash-watchface":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            bin_path = payload.get("binPath", os.path.abspath(os.path.join(os.path.dirname(__file__), "../public/aura_os_health.bin")))
            resp_obj = await bridge.flash_watchface(bin_path)

        elif method == "POST" and path == "/api/trigger-hr":
            resp_obj = await bridge.trigger_hr_scan()

        elif method == "POST" and path == "/api/spo2/measure":
            resp_obj = await bridge.trigger_spo2_measurement()

        elif method == "POST" and path == "/api/spo2/interval":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            new_interval = max(30, int(payload.get("interval", 180)))
            bridge.state["spo2CycleInterval"] = new_interval
            bridge.broadcast_sse("telemetry")
            resp_obj = {"ok": True, "spo2CycleInterval": new_interval}

        elif method == "POST" and path == "/api/sync-health":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            hours = int(payload.get("lookbackHours", 48))
            if payload.get("fullResync"):
                bridge._sync_since.clear()
            resp_obj = await bridge.sync_recorded_health(lookback_hours=hours)

        elif method == "POST" and path == "/api/auth-key":
            payload = json.loads(body_bytes.decode("utf-8") or "{}")
            hex_key = payload.get("authKey", "")
            bridge.save_auth_key(hex_key)
            auth_ok = await bridge.trigger_authentication()
            if auth_ok:
                await bridge._configure_autonomous_monitoring()
                await bridge.sync_recorded_health(lookback_hours=48)
            resp_obj = {"ok": auth_ok, "authenticated": bridge.state["authenticated"]}

        elif method == "POST" and path == "/api/zepp-login":
            if not HAS_HUAMI_TOKEN:
                resp_obj = {"ok": False, "error": "huami-token package not installed"}
            else:
                payload = json.loads(body_bytes.decode("utf-8") or "{}")
                email = payload.get("email", "").strip()
                password = payload.get("password", "")
                loop = asyncio.get_running_loop()

                def _fetch():
                    zc = ZeppClient()
                    zc.login(email, password)
                    devs = zc.get_devices()
                    zc.logout()
                    return devs

                devs = await loop.run_in_executor(None, _fetch)
                found_key = None
                for dv in devs:
                    if getattr(dv, "auth_key", None):
                        found_key = dv.auth_key
                        break
                if found_key:
                    bridge.save_auth_key(found_key)
                    auth_ok = await bridge.trigger_authentication()
                    resp_obj = {"ok": True, "authKey": found_key, "authenticated": auth_ok}
                else:
                    resp_obj = {"ok": False, "error": "No active Bluetooth auth key found on Zepp account"}

        else:
            status_code = HTTPStatus.NOT_FOUND
            resp_obj = {"ok": False, "error": f"Unknown endpoint {path}"}

    except Exception as e:
        status_code = HTTPStatus.BAD_REQUEST
        resp_obj = {"ok": False, "error": str(e)}

    body = json.dumps(resp_obj).encode("utf-8")
    http_resp = (
        f"HTTP/1.1 {status_code.value} {status_code.phrase}\r\n"
        "Content-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        f"Content-Length: {len(body)}\r\n\r\n"
    ).encode("utf-8") + body
    try:
        writer.write(http_resp)
        await writer.drain()
    except Exception:
        pass
    finally:
        writer.close()


async def main():
    server = await asyncio.start_server(handle_http, BRIDGE_HOST, BRIDGE_PORT)
    print(f"[AURA-OS Bip U Bridge] HTTP/SSE server listening on http://{BRIDGE_HOST}:{BRIDGE_PORT}", flush=True)
    await asyncio.gather(server.serve_forever(), bridge.ble_loop())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
