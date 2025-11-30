import asyncio
import string
from bleak import BleakScanner, BleakClient

# ===== CONFIG =====

DEVICE_NAME_SUBSTR = "LJJ-"   # substring of the advertised name

# From your characteristics dump:
CONTROL_UUID = "0000ffb2-0000-1000-8000-00805f9b34fb"  # write-without-response
DATA_UUID    = "0000ffb1-0000-1000-8000-00805f9b34fb"  # notify


# ===== COMMAND BUILDERS =====

START_CMD = bytes([0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF3, 0x04])
STOP_CMD  = bytes([0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF4, 0x05])


def build_speed_command(speed_kmh: float) -> bytes:
    speed_code = int(round(speed_kmh * 10))  # 1.1 -> 11, 4.0 -> 40
    checksum = (speed_code + 0x22) & 0xFF
    return bytes([
        0xFA, 0xEF, 0x11,
        0x00, 0x00, 0x00,
        speed_code,
        0x11,
        checksum
    ])


# ===== NOTIFICATION HANDLER =====

def notification_handler(sender: int, data: bytearray):
    hex_str = " ".join(f"{b:02X}" for b in data)
    print(f"[NOTIFY] sender={sender} data={hex_str}")


# ===== UTILITIES FOR DEBUG OUTPUT =====

def _to_printable_ascii(data: bytes) -> str:
    if not data:
        return ""
    # Only show ASCII if all bytes are printable-ish or whitespace
    if all(chr(b) in string.printable for b in data):
        try:
            return data.decode("ascii", errors="replace")
        except Exception:
            return ""
    return ""


def _fmt_ints(data: bytes) -> str:
    """Try to show a few integer interpretations of small buffers."""
    n = len(data)
    parts = []
    if n in (1, 2, 4):
        le = int.from_bytes(data, byteorder="little", signed=False)
        be = int.from_bytes(data, byteorder="big", signed=False)
        parts.append(f"u{8*n}-LE={le}")
        parts.append(f"u{8*n}-BE={be}")
    return ", ".join(parts)


async def read_all_readable_characteristics(client: BleakClient):
    """
    Iterate all services/characteristics and read every characteristic
    that has the 'read' property. Print useful debug info.
    """
    print("\n=== Reading all readable characteristics ===")
    for service in client.services:
        print(f"[Service] {service.uuid}")
        for char in service.characteristics:
            if "read" not in char.properties:
                continue

            handle = getattr(char, "handle", None)
            print(f"  [Char] UUID={char.uuid} handle={handle} props={char.properties}")

            try:
                value = await client.read_gatt_char(char)
            except Exception as e:
                print(f"    [READ ERROR] {e}")
                continue

            hex_str = " ".join(f"{b:02X}" for b in value)
            ascii_str = _to_printable_ascii(value)
            ints_str = _fmt_ints(value)

            print(f"    len={len(value)}  hex={hex_str}")
            if ascii_str:
                print(f"    ascii='{ascii_str}'")
            if ints_str:
                print(f"    ints: {ints_str}")


# ===== MAIN =====

async def main():
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover(timeout=5.0)

    target = None
    for d in devices:
        print(f"Found: {d.name} [{d.address}]")
        if d.name and DEVICE_NAME_SUBSTR in d.name:
            target = d

    if not target:
        print(f"\nCould not find device containing '{DEVICE_NAME_SUBSTR}'.")
        return

    print(f"\nUsing device: {target.name} [{target.address}]")

    async with BleakClient(target.address) as client:
        connected = client.is_connected
        print(f"Connected: {connected}")
        if not connected:
            return

        # Services are already populated automatically on macOS.
        print("\n=== Services & Characteristics ===")
        for service in client.services:
            print(f"[Service] {service.uuid}")
            for char in service.characteristics:
                handle = getattr(char, "handle", None)
                print(f"  [Char] UUID={char.uuid} handle={handle} props={char.properties}")

        # ---- NEW: read all readable characteristics ----
        await read_all_readable_characteristics(client)

        # Find the characteristics by UUID
        control_char = client.services.get_characteristic(CONTROL_UUID)
        data_char    = client.services.get_characteristic(DATA_UUID)

        if not control_char:
            print(f"ERROR: control UUID {CONTROL_UUID} not found")
            return

        print(f"\nControl characteristic: UUID={control_char.uuid} handle={getattr(control_char,'handle',None)}")

        if data_char:
            print(f"Data characteristic: UUID={data_char.uuid} handle={getattr(data_char,'handle',None)}")
            try:
                await client.start_notify(data_char.uuid, notification_handler)
                print("Subscribed to notifications.")
            except Exception as e:
                print(f"Could not start notifications: {e}")
        else:
            print("No data characteristic found (skipping notifications).")

        # ==== SEND COMMANDS ====
        run_movement_test = False

        if run_movement_test:
            print("\n=== Sending START ===")
            await client.write_gatt_char(control_char, START_CMD, response=False)
            await asyncio.sleep(2)

            # Set speed: 2.0 km/h
            cmd = build_speed_command(2.0)
            print("\n=== Setting speed to 2.0 km/h ===")
            print("Bytes:", " ".join(f"{b:02X}" for b in cmd))
            await client.write_gatt_char(control_char, cmd, response=False)
            await asyncio.sleep(5)

            # Set speed: 4.0 km/h
            cmd = build_speed_command(4.0)
            print("\n=== Setting speed to 4.0 km/h ===")
            await client.write_gatt_char(control_char, cmd, response=False)
            await asyncio.sleep(5)

            # Set speed: 1.5 km/h
            cmd = build_speed_command(1.5)
            print("\n=== Setting speed to 1.5 km/h ===")
            await client.write_gatt_char(control_char, cmd, response=False)
            await asyncio.sleep(5)

            # Stop
            print("\n=== Sending STOP ===")
            await client.write_gatt_char(control_char, STOP_CMD, response=False)
            await asyncio.sleep(3)

        if data_char:
            await client.stop_notify(data_char.uuid)

        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
