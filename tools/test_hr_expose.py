import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
C_CFG  = "00000003-0000-3512-2118-0009af100700"
C_AUTH = "00000009-0000-3512-2118-0009af100700"
C_HRM  = "00002a37-0000-1000-8000-00805f9b34fb"
C_HRC  = "00002a39-0000-1000-8000-00805f9b34fb"

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    async with BleakClient(d, timeout=30) as c:
        await c.start_notify(C_CFG, lambda _, v: print(f"[CFG] {v.hex()}", flush=True))
        await c.start_notify(C_AUTH, lambda _, v: print(f"[AUTH] {v.hex()}", flush=True))

        # 1. Try COMMAND_ENBALE_HR_CONNECTION (06 1f 00 01) on C_CFG
        await c.write_gatt_char(C_CFG, b"\x06\x1f\x00\x01", response=False)
        await asyncio.sleep(0.5)
        await c.write_gatt_char(C_CFG, b"\x0e", response=False)
        await asyncio.sleep(0.5)

        # 2. Check what C_AUTH returns for standard Gadgetbridge InitOperation steps
        key = bytes(range(0x30, 0x40))
        for pkt in [
            b"\x01\x00" + key,
            b"\x01\x08" + key,
            b"\x82\x00\x02\x01\x00",
            b"\x02\x00",
            b"\x02\x08",
        ]:
            print("writing to C_AUTH:", pkt.hex(), flush=True)
            await c.write_gatt_char(C_AUTH, pkt, response=False)
            await asyncio.sleep(0.8)

        # 3. Try C_HRM notify again
        try:
            await c.start_notify(C_HRM, lambda _, v: print(f"[HRM] {v.hex()}", flush=True))
            print("HRM notify succeeded!", flush=True)
        except Exception as e:
            print("HRM notify err:", e, flush=True)

asyncio.run(main())
