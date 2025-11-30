import asyncio
import logging

import subprocess
from typing import Optional
from bleak import BleakClient, BleakScanner
from fastapi import logger

from models import TreadmillStatus

# ----- Logging setup --------
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Avoid duplicate handlers if app is reloaded
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# -------- TreadmillController class --------
class TreadmillController:
    TARGET_NAME_FRAGMENT = "LJJ-"

    SERVICE_UUID = "0000ffb0-0000-1000-8000-00805f9b34fb"
    CONTROL_CHAR_UUID = "0000ffb2-0000-1000-8000-00805f9b34fb"
    NOTIFY_CHAR_UUID  = "0000ffb1-0000-1000-8000-00805f9b34fb"

    NOTIFICATION_SPEED_RANGE = 0x90
    NOTIFICATION_TYPE_SPEED_SET = 0x91
    NOTIFICATION_TYPE_STATUS_UPDATE = 0x95

    def __init__(self, status_queue: Optional[asyncio.Queue] = None) -> None:        
        self._client: Optional[BleakClient] = None
        self._lock = asyncio.Lock()
        self._is_running = False
        self._current_speed_kmh = 0.0
        self._elapsed_time_seconds = 0
        self._burned_calories = 0
        self._total_distance_km = 0.0
        self.min_speed_kmh = 0.0
        self.max_speed_kmh = 0.0

        self.status_queue = status_queue

    # -------- internal helpers --------

    async def _ensure_connected(self) -> None:
        # If we have a client but it's not connected anymore, clean it up
        if self._client and not self._client.is_connected:
            logger.info("Existing BLE client is not connected anymore, resetting client")
            try:
                await self._client.disconnect()
            except Exception:
                logger.warning("Error while disconnecting stale client", exc_info=True)
            self._client = None

        # If still connected, we're good
        if self._client and self._client.is_connected:
            return

        # We'll try up to 2 attempts:
        #  - attempt 1: normal connect
        #  - on failure OR device not found: reset adapter, attempt 2
        for attempt in (1, 2):
            logger.info(f"BLE connect attempt {attempt}/2")

            logger.info("Scanning for treadmill devices...")
            devices = await BleakScanner.discover()
            for d in devices:
                logger.info(f"Found device: name={d.name!r}, address={d.address!r}")

            device = next(
                (d for d in devices
                 if d.name and self.TARGET_NAME_FRAGMENT.lower() in d.name.lower()),
                None
            )

            if device is None:
                msg = f"Could not find treadmill with name containing '{self.TARGET_NAME_FRAGMENT}'"
                logger.warning(msg)

                if attempt == 1:
                    logger.info("No treadmill found, resetting adapter before retrying scan")
                    try:
                        await self._reset_bluetooth_adapter()
                    except Exception:
                        logger.exception("Failed to reset Bluetooth adapter after device-not-found")
                        raise RuntimeError("Could not find treadmill and adapter reset failed")
                    # loop continues to attempt 2
                    continue
                else:
                    # second attempt, still no device -> give up
                    raise RuntimeError("Could not find treadmill after adapter reset")

            logger.info(f"Connecting to treadmill: name={device.name!r}, address={device.address!r}")
            client = BleakClient(device)

            try:
                await client.connect()
                logger.info("Connected to treadmill via BLE")

                try:
                    await client.start_notify(self.NOTIFY_CHAR_UUID, self._notification_handler)
                    logger.info("Subscribed to treadmill notifications")
                except Exception:
                    logger.warning("Could not enable notifications on treadmill (FFB1)", exc_info=True)

                self._client = client
                return  # success, we're done

            except Exception as e:
                logger.exception(f"Failed to connect to treadmill on attempt {attempt}: {e}")

                # Best-effort cleanup
                try:
                    await client.disconnect()
                except Exception:
                    pass

                if attempt == 1:
                    logger.info("Attempting Bluetooth adapter reset before retrying connect")
                    try:
                        await self._reset_bluetooth_adapter()
                    except Exception:
                        logger.exception("Failed to reset Bluetooth adapter")
                        raise RuntimeError("Failed to connect and failed to reset adapter") from e
                    # loop continues to attempt 2
                else:
                    # second attempt also failed -> give up
                    raise RuntimeError("Failed to connect to treadmill after adapter reset") from e

    async def _reset_bluetooth_adapter(self) -> None:
        """
        Reset the Bluetooth adapter from inside the container.

        Requires:
        - Container running with --privileged
        - bluez tools installed (bluetoothctl / hciconfig)
        - /var/run/dbus mounted so bluetoothctl can talk to bluetoothd
        """
        loop = asyncio.get_running_loop()

        def _do_reset():
            # Option A: via bluetoothctl (clean, talks to bluetoothd)
            logger.info("Resetting Bluetooth adapter via bluetoothctl (power off/on)")
            try:
                # Power off
                subprocess.run(
                    ["bluetoothctl", "power", "off"],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            except subprocess.CalledProcessError as e:
                logger.warning(
                    "Error powering off adapter via bluetoothctl: %s", e.stderr.strip()
                )

            # Small delay to make sure power-off is processed
            subprocess.run(["sleep", "2"])

            try:
                # Power on
                subprocess.run(
                    ["bluetoothctl", "power", "on"],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            except subprocess.CalledProcessError as e:
                logger.warning(
                    "Error powering on adapter via bluetoothctl: %s", e.stderr.strip()
                )

            # Option B (alternative): hciconfig hci0 reset
            # Uncomment if you prefer this route or bluetoothctl is unreliable:
            # logger.info("Resetting Bluetooth adapter via hciconfig hci0 reset")
            # try:
            #     subprocess.run(
            #         ["hciconfig", "hci0", "reset"],
            #         check=True,
            #         stdout=subprocess.PIPE,
            #         stderr=subprocess.PIPE,
            #         text=True,
            #     )
            # except subprocess.CalledProcessError as e:
            #     logger.warning("Error resetting adapter via hciconfig: %s", e.stderr.strip())

        # Run blocking operations in a thread so we don't block the event loop
        await loop.run_in_executor(None, _do_reset)
        logger.info("Bluetooth adapter reset sequence finished")

    def _notification_handler(self, _char_handle: int, data: bytearray) -> None:     
        # TODO: decode FFB1 notifications if you want live speed/metrics.
        # For now we just ignore or could log:
        # print("Notification:", data.hex())

        notification_type = data[2]

        if notification_type == self.NOTIFICATION_TYPE_SPEED_SET:
            self._current_speed_kmh = data[6] / 10.0
            logger.info("Treadmill speed set notification: speed=%.1f km/h", self._current_speed_kmh)

        if notification_type == self.NOTIFICATION_TYPE_STATUS_UPDATE:
            seconds_hi = data[3] 
            seconds_lo = data[4] 
            self._elapsed_time_seconds = (seconds_hi << 8) | seconds_lo

            flags = data[5]

            distance_lo = data[6]
            distance_hi = data[7]
            self._total_distance_km = ((distance_hi << 8) | distance_lo) / 100.0

            calories_lo = data[8]
            calories_hi = data[9]
            self._burned_calories = (calories_hi << 8) | calories_lo

            logger.info(
                "Treadmill workout update: time=%d sec, distance=%.2f km, calories=%d kcal, flags=0x%02X",
                self._elapsed_time_seconds,
                self._total_distance_km,
                self._burned_calories,
                flags,
            )

        if notification_type == 0x92:
            self._current_speed_kmh = data[6] / 10.0
            logger.info("Treadmill current speed notification: speed=%.1f km/h", self._current_speed_kmh)

        if notification_type == self.NOTIFICATION_SPEED_RANGE:
            self.min_speed_kmh = data[5] / 10.0
            self.max_speed_kmh = data[6] / 10.0
            logger.info("Treadmill speed range notification: lowest=%.1f km/h, highest=%.1f km/h",
                        self.min_speed_kmh,
                        self.max_speed_kmh)
        
        if self.status_queue is not None:
            # Push updated status to the queue for SSE
            loop = asyncio.get_running_loop()
            status = self.get_status()
            loop.call_soon_threadsafe(self.status_queue.put_nowait, status)

        #logger.info("Notification from treadmill: %s\n", data.hex())

    async def _send_command(self, payload: bytes) -> None:
        if not self._client or not self._client.is_connected:
            raise RuntimeError("Not connected to treadmill")

        await self._client.write_gatt_char(
            self.CONTROL_CHAR_UUID,
            payload,
            response=False,  # write without response
        )

    # -------- public API used by FastAPI --------

    async def connect(self) -> None:
        async with self._lock:
            await self._ensure_connected()

    async def disconnect(self) -> None:
        async with self._lock:
            if self._client:
                try:
                    # Try to stop notifications first (best effort)
                    try:
                        logger.info("Stopping treadmill notifications before disconnect")
                        await self._client.stop_notify(self.NOTIFY_CHAR_UUID)
                    except Exception:
                        logger.warning("Error while stopping notifications", exc_info=True)

                    await self._client.disconnect()
                    logger.info("Disconnected from treadmill")
                except Exception:
                    logger.warning("Error while disconnecting client", exc_info=True)

            self._client = None
            self._is_running = False
            self._current_speed_kmh = 0.0


    async def start(self) -> None:
        async with self._lock:
            await self._ensure_connected()
            await self._send_command(self._build_start_command())
            self._is_running = True

    async def stop(self) -> None:
        async with self._lock:
            await self._ensure_connected()
            await self._send_command(self._build_stop_command())
            self._is_running = False
            self._current_speed_kmh = 0.0

    async def set_speed(self, speed_kmh: float) -> None:
        async with self._lock:
            await self._ensure_connected()

            # Clamp for safety (adjust per your treadmill’s range)
            if speed_kmh < 1.0:
                speed_kmh = 1.0
            if speed_kmh > 6.0:
                speed_kmh = 6.0

            cmd = self._build_speed_command(speed_kmh)
            await self._send_command(cmd)
            self._current_speed_kmh = speed_kmh
            self._is_running = speed_kmh > 0.0

    def get_status(self) -> TreadmillStatus:
        return TreadmillStatus(
            isConnected=bool(self._client and self._client.is_connected),
            isRunning=self._is_running,
            currentSpeedKmh=self._current_speed_kmh,
            elapsedTimeSeconds=self._elapsed_time_seconds,
            burnedCalories=self._burned_calories,
            totalDistanceKm=self._total_distance_km,
            minSpeedKmh=self.min_speed_kmh,
            maxSpeedKmh=self.max_speed_kmh,
        )

    # -------- command builders (matching what we used before) --------

    @staticmethod
    def _build_start_command() -> bytes:
        # fa ef 11 00 00 00 00 f3 04
        return bytes([0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF3, 0x04])

    @staticmethod
    def _build_stop_command() -> bytes:
        # fa ef 11 00 00 00 00 f4 05
        return bytes([0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF4, 0x05])

    @staticmethod
    def _build_speed_command(kmh: float) -> bytes:
        speed_code = int(round(kmh * 10.0))
        speed_code_byte = speed_code & 0xFF
        checksum = (speed_code_byte + 0x22) & 0xFF

        return bytes(
            [
                0xFA,
                0xEF,
                0x11,
                0x00,
                0x00,
                0x00,
                speed_code_byte,
                0x11,
                checksum,
            ]
        )
