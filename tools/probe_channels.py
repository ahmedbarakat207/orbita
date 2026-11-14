import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    async with BleakClient(d, timeout=30) as c:
        def make_cb(uuid):
            def cb(_, data):
                print(f"[NOTIFY] {uuid}: {data.hex()} ({list(data)})", flush=True)
            return cb

        for s in c.services:
            for ch in s.characteristics:
                if "notify" in ch.properties and ch.uuid != "00002a37-0000-1000-8000-00805f9b34fb":
                    try:
                        await c.start_notify(ch, make_cb(ch.uuid))
                    except Exception as e:
                        pass

        # Read readable chars of interest
        for uuid in [
            "00002a19-0000-1000-8000-00805f9b34fb",
            "00002a2b-0000-1000-8000-00805f9b34fb",
            "00000006-0000-3512-2118-0009af100700",
            "00000009-0000-3512-2118-0009af100700",
            "00000020-0000-3512-2118-0009af100700",
            "00000012-0000-3512-2118-0009af100700",
        ]:
            try:
                v = await c.read_gatt_char(uuid)
                print(f"[READ] {uuid}: {v.hex()} ({list(v)})", flush=True)
            except Exception as e:
                print(f"[READ ERR] {uuid}: {e}", flush=True)

        print("Listening for 8 seconds...", flush=True)
        await asyncio.sleep(8)
asyncio.run(main())
