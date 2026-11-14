import asyncio
from bleak import BleakClient, BleakScanner
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

ADDR = "A87348B3-9DAE-DB0A-558B-C148C3665C5D"
C_AUTH = "00000009-0000-3512-2118-0009af100700"
C_HRM  = "00002a37-0000-1000-8000-00805f9b34fb"
C_HRC  = "00002a39-0000-1000-8000-00805f9b34fb"
C_TIME = "00002a2b-0000-1000-8000-00805f9b34fb"
C_CFG  = "00000003-0000-3512-2118-0009af100700"

KEY = bytes.fromhex("3b16adb63b559a05b5b4918952b15c1c")

def aes_ecb_encrypt(data_16, key_16):
    cipher = Cipher(algorithms.AES(key_16), modes.ECB())
    enc = cipher.encryptor()
    return enc.update(data_16) + enc.finalize()

async def main():
    d = await BleakScanner.find_device_by_address(ADDR, timeout=15)
    if not d:
        print("Watch not found")
        return
    print("Connecting...")
    async with BleakClient(d, timeout=30) as c:
        print("Connected!")
        auth_future = asyncio.get_running_loop().create_future()

        def auth_cb(_, v):
            data = bytes(v)
            print(f"[AUTH NOTIFY] {data.hex()} (len={len(data)})", flush=True)
            if len(data) >= 3 and data[0] == 0x10:
                step = data[1]
                status = data[2]
                if (step & 0x0f) == 0x02 and status == 0x01 and len(data) >= 19:
                    challenge = data[3:19]
                    print(f"Challenge received: {challenge.hex()}")
                    enc = aes_ecb_encrypt(challenge, KEY)
                    resp_cmd = (step & 0x80) | 0x03
                    resp_pkt = bytes([resp_cmd, 0x00]) + enc
                    print(f"Sending response: {resp_pkt.hex()}")
                    asyncio.create_task(c.write_gatt_char(C_AUTH, resp_pkt, response=False))
                elif (step & 0x0f) == 0x03:
                    if status == 0x01:
                        print("===> AUTHENTICATION SUCCESSFUL! <===")
                        auth_future.set_result(True)
                    else:
                        print(f"===> AUTHENTICATION FAILED (status={status:02x}) <===")
                        auth_future.set_result(False)

        await c.start_notify(C_AUTH, auth_cb)

        print("Requesting 16B challenge...")
        await c.write_gatt_char(C_AUTH, b"\x82\x00\x02\x01\x00", response=False)

        res = await asyncio.wait_for(auth_future, timeout=8)
        print(f"Auth result: {res}")

        if res:
            # Expose HR to third party
            await c.write_gatt_char(C_CFG, b"\x06\x1f\x00\x01", response=False)
            await asyncio.sleep(0.5)

            # Subscribe to Heart Rate Measurement
            def hr_cb(_, v):
                print(f"[HR NOTIFY] raw={v.hex()} bpm={v[1] if len(v)>1 else 0}", flush=True)
            
            try:
                await c.start_notify(C_HRM, hr_cb)
                print("===> Subscribed to 0x2A37 Heart Rate successfully! <===")
            except Exception as e:
                print(f"Failed to subscribe to 0x2A37: {e}")

            # Send continuous HR start commands
            try:
                await c.write_gatt_char(C_HRC, b"\x15\x02\x00", response=True)
                await c.write_gatt_char(C_HRC, b"\x15\x01\x01", response=True)
                print("Sent continuous HR start commands to 0x2A39")
            except Exception as e:
                print(f"HRC write err: {e}")

            print("Listening for HR for 10 seconds (wear the watch or place finger on sensor)...")
            for _ in range(10):
                await asyncio.sleep(1)
                try:
                    await c.write_gatt_char(C_HRC, b"\x16", response=True)
                except Exception:
                    pass

asyncio.run(main())
