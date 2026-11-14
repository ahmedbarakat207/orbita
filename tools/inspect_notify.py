import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found in scan")
        return
    async with BleakClient(d, timeout=30) as c:
        for s in c.services:
            print(f"SERVICE {s.uuid}")
            for ch in s.characteristics:
                descs = [f"{desc.uuid}(h={desc.handle})" for desc in ch.descriptors]
                print(f"  CHAR h={ch.handle} {ch.uuid} props={ch.properties} descs={descs}")
                if "notify" in ch.properties:
                    try:
                        await c.start_notify(ch, lambda ch_obj, data: print(f"NOTIFY {ch_obj.uuid}: {data.hex()}"))
                        print(f"    -> notify OK on {ch.uuid}")
                    except Exception as e:
                        print(f"    -> notify FAIL on {ch.uuid}: {e}")
        await asyncio.sleep(5)
asyncio.run(main())
