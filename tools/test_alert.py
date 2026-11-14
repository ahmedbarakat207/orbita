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
        # Read C_NEW_ALERT first
        v = await c.read_gatt_char(C_NEW_ALERT)
        print("C_NEW_ALERT read:", v.hex())
        # Try sending a brief New Alert notification (category=0x05, count=1, text="AURA-OS LINKED")
        try:
            await c.write_gatt_char(C_NEW_ALERT, b"\x05\x01AURA-OS LINKED", response=True)
            print("wrote C_NEW_ALERT ok")
        except Exception as e:
            print("err C_NEW_ALERT:", e)
asyncio.run(main())
