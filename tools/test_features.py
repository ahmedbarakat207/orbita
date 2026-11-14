import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
C_CFG    = "00000003-0000-3512-2118-0009af100700"
C_USER   = "00000008-0000-3512-2118-0009af100700"
C_WORK   = "0000000f-0000-3512-2118-0009af100700"
C_EVT    = "00000010-0000-3512-2118-0009af100700"
C_2021W  = "00000016-0000-3512-2118-0009af100700"
C_2021R  = "00000017-0000-3512-2118-0009af100700"
C_STEPS  = "00000007-0000-3512-2118-0009af100700"
C_BATT   = "00000006-0000-3512-2118-0009af100700"

def make_chunk2021(endpoint, payload, handle=1, ext=True):
    # Single unencrypted chunk: 0x03, flags=0x07 (first|last|ack), [0 if ext], handle, count=0, len(4B LE), endpoint(2B LE), payload
    length = len(payload)
    hdr = bytearray([0x03, 0x07])
    if ext:
        hdr.append(0x00)
    hdr.extend([handle & 0xff, 0x00])
    hdr.extend(length.to_bytes(4, 'little'))
    hdr.extend(endpoint.to_bytes(2, 'little'))
    return bytes(hdr) + payload

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    async with BleakClient(d, timeout=30) as c:
        for u in [C_CFG, C_USER, C_WORK, C_EVT, C_2021W, C_2021R, C_STEPS, C_BATT]:
            await c.start_notify(u, lambda ch, v: print(f"[NOTIFY {ch.uuid[:8]}] {v.hex()} ({bytes(v)!r})", flush=True))

        # Request GPS version on C_CFG: 0x06, 0x0e, 0x00
        await c.write_gatt_char(C_CFG, b"\x06\x0e\x00", response=False)
        # Request alarms on C_CFG: 0x06, 0x0d, 0x00
        await c.write_gatt_char(C_CFG, b"\x06\x0d\x00", response=False)
        # Try 2021 endpoints (steps get=0x0016 cmd 0x03, steps realtime=0x0016 cmd 0x05 0x01, hr realtime=0x001d cmd 0x04 0x01, battery=0x0029 cmd 0x03)
        for h, (ep, data) in enumerate([
            (0x0016, b"\x03"),
            (0x0016, b"\x05\x01"),
            (0x001d, b"\x04\x01"),
            (0x0029, b"\x03"),
            (0x0090, b"\x00\x06\x0e\x00"),
        ], start=1):
            pkt = make_chunk2021(ep, data, handle=h, ext=True)
            await c.write_gatt_char(C_2021W, pkt, response=False)
            await asyncio.sleep(0.2)
            pkt2 = make_chunk2021(ep, data, handle=h+10, ext=False)
            await c.write_gatt_char(C_2021W, pkt2, response=False)
            await asyncio.sleep(0.2)

        await asyncio.sleep(4)
asyncio.run(main())
