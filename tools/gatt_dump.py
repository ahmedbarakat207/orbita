import asyncio, sys, json
from bleak import BleakClient, BleakScanner
ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d: print("not found"); return
    async with BleakClient(d, timeout=30) as c:
        out = {}
        for s in c.services:
            print(f"SERVICE {s.uuid} ({s.description})")
            for ch in s.characteristics:
                line = f"  CHAR {ch.uuid} [{','.join(ch.properties)}] {ch.description}"
                if "read" in ch.properties:
                    try:
                        v = await c.read_gatt_char(ch)
                        line += f" = {v.hex()} {bytes(v)!r}"
                        out[ch.uuid] = v.hex()
                    except Exception as e:
                        line += f" read-err: {e}"
                print(line)
        json.dump(out, open("gatt_reads.json","w"), indent=1)
asyncio.run(main())
