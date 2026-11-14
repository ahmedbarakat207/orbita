import asyncio
from bleak import BleakClient, BleakScanner

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
C_IMM_ALERT = "00002a06-0000-1000-8000-00805f9b34fb"
C_NEW_ALERT = "00002a46-0000-1000-8000-00805f9b34fb"

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    async with BleakClient(d, timeout=30) as c:
        await c.write_gatt_char(C_IMM_ALERT, b"\x01", response=False)
        await asyncio.sleep(0.5)
        await c.write_gatt_char(C_IMM_ALERT, b"\x00", response=False)
        await c.write_gatt_char(C_NEW_ALERT, b"\x05\x01AURA-OS TELEMETRY ONLINE", response=True)
        print("Vibe + alert sent OK")
asyncio.run(main())
