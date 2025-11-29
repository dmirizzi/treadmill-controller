using InTheHand.Bluetooth;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;

namespace TreadmillControl.Core;

public class BluetoothTreadmillService : ITreadmillService
{
    private const string TargetNameFragment = "LJJ-";

    // Service / characteristic UUIDs from your sniffing + Bleak dump
    private static readonly Guid ServiceFfb0Guid = new("0000ffb0-0000-1000-8000-00805f9b34fb");
    private static readonly Guid CharControlGuid = new("0000ffb2-0000-1000-8000-00805f9b34fb");
    private static readonly Guid CharNotifyGuid  = new("0000ffb1-0000-1000-8000-00805f9b34fb");

    private BluetoothDevice? _device;
    private RemoteGattServer? _gatt;
    private GattCharacteristic? _controlChar;
    private GattCharacteristic? _notifyChar;

    private readonly SemaphoreSlim _connectionLock = new(1, 1);

    // simple local status (can be enriched later from notifications)
    private bool _isConnected;
    private bool _isRunning;
    private double _currentSpeedKmh;

    public TreadmillStatus GetStatus()
    {
        // Adjust property names here if your TreadmillStatus is different
        return new TreadmillStatus(
            IsConnected: _isConnected,
            IsRunning: _isRunning,
            CurrentSpeedKmh: _currentSpeedKmh
        );
    }

    // ---------- Public API (matches ITreadmillService) ----------

    public async Task ConnectAsync()
    {
        if (_isConnected)
            return;

        await _connectionLock.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_isConnected)
                return;

            await ConnectInternalAsync().ConfigureAwait(false);
        }
        finally
        {
            _connectionLock.Release();
        }
    }

public async Task DisconnectAsync()
{
    await _connectionLock.WaitAsync().ConfigureAwait(false);
    try
    {
        try
        {
            if (_gatt != null)
            {
                // RemoteGattServer has a synchronous Disconnect() method
                _gatt.Disconnect();
            }
        }
        catch
        {
            // ignore disconnect errors
        }

        if (_notifyChar != null)
        {
            try
            {
                _notifyChar.CharacteristicValueChanged -= NotifyCharOnCharacteristicValueChanged;
                await _notifyChar.StopNotificationsAsync().ConfigureAwait(false);
            }
            catch
            {
                // ignore
            }
        }

        _controlChar = null;
        _notifyChar = null;
        _gatt = null;
        _device = null;
        _isConnected = false;
        _isRunning = false;
        _currentSpeedKmh = 0.0;
    }
    finally
    {
        _connectionLock.Release();
    }
}

    public async Task StartAsync()
    {
        await EnsureConnectedAsync().ConfigureAwait(false);
        await SendCommandAsync(BuildStartCommand()).ConfigureAwait(false);
        _isRunning = true;
    }

    public async Task StopAsync()
    {
        await EnsureConnectedAsync().ConfigureAwait(false);
        await SendCommandAsync(BuildStopCommand()).ConfigureAwait(false);
        _isRunning = false;
        _currentSpeedKmh = 0.0;
    }

    public async Task SetSpeedAsync(double speedKmh)
    {
        await EnsureConnectedAsync().ConfigureAwait(false);

        // Clamp for safety; adjust bounds to your treadmill
        if (speedKmh < 1.0) speedKmh = 1.0;
        if (speedKmh > 6.0) speedKmh = 6.0;

        var cmd = BuildSpeedCommand(speedKmh);
        await SendCommandAsync(cmd).ConfigureAwait(false);

        _currentSpeedKmh = speedKmh;
        _isRunning = speedKmh > 0.0;
    }

    // ---------- Internals ----------

    private async Task EnsureConnectedAsync()
    {
        if (_isConnected)
            return;

        await ConnectAsync().ConfigureAwait(false);
    }

    private async Task ConnectInternalAsync()
    {
        var available = await Bluetooth.GetAvailabilityAsync().ConfigureAwait(false);
        if (!available)
            throw new InvalidOperationException("Bluetooth not available or turned off on this machine.");

        // Scan for devices and pick the treadmill by name fragment
        var options = new RequestDeviceOptions
        {
            AcceptAllDevices = true
        };

        var devices = await Bluetooth.ScanForDevicesAsync(options).ConfigureAwait(false);
        var device = devices.FirstOrDefault(d =>
            !string.IsNullOrWhiteSpace(d.Name) &&
            d.Name.Contains(TargetNameFragment, StringComparison.OrdinalIgnoreCase));

        if (device == null)
            throw new InvalidOperationException($"Could not find treadmill with name containing '{TargetNameFragment}'.");

        _device = device;
        _gatt = device.Gatt;

        await _gatt.ConnectAsync().ConfigureAwait(false);

        // Get FFB0 service
        var serviceUuid = BluetoothUuid.FromGuid(ServiceFfb0Guid);
        var service = await _gatt.GetPrimaryServiceAsync(serviceUuid).ConfigureAwait(false)
                        ?? throw new InvalidOperationException("FFB0 service not found on treadmill.");

        // Control characteristic (FFB2)
        var controlUuid = BluetoothUuid.FromGuid(CharControlGuid);
        _controlChar = await service.GetCharacteristicAsync(controlUuid).ConfigureAwait(false)
                        ?? throw new InvalidOperationException("Control characteristic FFB2 not found.");

        // Notification characteristic (FFB1) – optional but nice to have
        var notifyUuid = BluetoothUuid.FromGuid(CharNotifyGuid);
        _notifyChar = await service.GetCharacteristicAsync(notifyUuid).ConfigureAwait(false);

        if (_notifyChar != null)
        {
            _notifyChar.CharacteristicValueChanged += NotifyCharOnCharacteristicValueChanged;
            try
            {
                await _notifyChar.StartNotificationsAsync().ConfigureAwait(false);
            }
            catch
            {
                // Not fatal if notifications can't be enabled
            }
        }

        _isConnected = true;
    }

    private void NotifyCharOnCharacteristicValueChanged(object? sender, GattCharacteristicValueChangedEventArgs e)
    {
        // TODO: decode the treadmill's notification payload here.
        // e.Value is a byte[] of the data from FFB1.
        //
        // Once decoded, you can update:
        //   _currentSpeedKmh
        //   _isRunning
        // and maybe extend TreadmillStatus with more fields.
    }

    private async Task SendCommandAsync(byte[] payload)
    {
        if (_controlChar == null)
            throw new InvalidOperationException("Control characteristic not initialized.");

        await _controlChar.WriteValueWithoutResponseAsync(payload).ConfigureAwait(false);
    }

    // ---------- Command building (based on your sniff) ----------

    private static byte[] BuildStartCommand()
    {
        // fa ef 11 00 00 00 00 f3 04
        return [0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF3, 0x04];
    }

    private static byte[] BuildStopCommand()
    {
        // fa ef 11 00 00 00 00 f4 05
        return [0xFA, 0xEF, 0x11, 0x00, 0x00, 0x00, 0x00, 0xF4, 0x05];
    }

    private static byte[] BuildSpeedCommand(double kmh)
    {
        // From your captures, we know:
        //   speedCode ≈ speed_kmh * 10 (with a small offset at low end)
        //   checksum = speedCode + 0x22
        //
        // Example from sniff:
        //   1.1 km/h -> speedCode 0x0B, checksum 0x2D
        //   1.5 km/h -> speedCode 0x0F, checksum 0x31
        //   2.0 km/h -> speedCode 0x14, checksum 0x36
        //   4.0 km/h -> speedCode 0x28, checksum 0x4A

        var tenths = (int)Math.Round(kmh * 10.0);

        byte speedCode;
        if (tenths <= 14)      // up to ~1.4 km/h, offset by +1 matches your examples
            speedCode = (byte)(tenths + 1);
        else
            speedCode = (byte)tenths;

        var checksum = (byte)(speedCode + 0x22);

        return new byte[]
        {
            0xFA, 0xEF, 0x11,
            0x00, 0x00, 0x00,
            speedCode,
            0x11,
            checksum
        };
    }
}
