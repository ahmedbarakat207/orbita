import asyncio
from bleak import BleakClient, BleakScanner
ADDR="A87348B3-9DAE-DB0A-558B-C148C3665C5D"
HR_M="00002a37-0000-1000-8000-00805f9b34fb"; HR_C="00002a39-0000-1000-8000-00805f9b34fb"
BATT="00002a19-0000-1000-8000-00805f9b34fb"
async def main():
    d=await BleakScanner.find_device_by_address(ADDR,timeout=15)
    async with BleakClient(d,timeout=30) as c:
        await c.start_notify(HR_M, lambda _,v: print("HR", v.hex(), "bpm=",v[1] if len(v)>1 else None, flush=True))
        await c.start_notify(BATT, lambda _,v: print("BATT", v[0], flush=True))
        for cmd in (b"\x15\x02\x00", b"\x15\x01\x00", b"\x15\x01\x01"):
            try:
                await c.write_gatt_char(HR_C, cmd, response=True); print("wrote", cmd.hex(), flush=True)
            except Exception as e: print("write err", cmd.hex(), e, flush=True)
        for i in range(10):
            await asyncio.sleep(2)
            try: await c.write_gatt_char(HR_C, b"\x16", response=True)  # keep-alive
            except Exception as e: print("ka err", e); break
        try: await c.write_gatt_char(HR_C, b"\x15\x01\x00", response=True)
        except Exception: pass
asyncio.run(main())
