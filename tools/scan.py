import asyncio
from bleak import BleakScanner
async def main():
    seen = await BleakScanner.discover(timeout=12, return_adv=True)
    for addr,(d,a) in sorted(seen.items(), key=lambda x:-x[1][1].rssi):
        print(f"{a.rssi:4} {d.name or a.local_name or '-':28} {addr} svc={a.service_uuids} mfr={ {k:v.hex() for k,v in a.manufacturer_data.items()} }")
asyncio.run(main())
