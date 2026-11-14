import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
C_SENS_CTRL = "00000001-0000-3512-2118-0009af100700"
C_SENS_DATA = "00000002-0000-3512-2118-0009af100700"
C_STEPS     = "00000007-0000-3512-2118-0009af100700"
C_EVENT     = "00000010-0000-3512-2118-0009af100700"
C_HR_CTRL   = "00002a39-0000-1000-8000-00805f9b34fb"

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    async with BleakClient(d, timeout=30) as c:
        for u in [C_SENS_CTRL, C_SENS_DATA, C_STEPS, C_EVENT]:
            await c.start_notify(u, lambda ch, v: print(f"[NOTIFY {ch.uuid[:8]}] {v.hex()}", flush=True))

        for cmd in [b"\x01\x03\x19", b"\x01\x01\x19", b"\x01\x02\x19", b"\x02"]:
            try:
                await c.write_gatt_char(C_SENS_CTRL, cmd, response=False)
                print("wrote SENS_CTRL", cmd.hex(), flush=True)
            except Exception as e:
                print("err SENS_CTRL", cmd.hex(), e, flush=True)
            await asyncio.sleep(0.5)

        await asyncio.sleep(5)
        try:
            await c.write_gatt_char(C_SENS_CTRL, b"\x03", response=False)
        except Exception:
            pass
asyncio.run(main())
