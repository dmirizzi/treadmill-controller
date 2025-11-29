namespace TreadmillControl.Core;

// Dummy implementation for now (no Bluetooth yet)
public class DummyTreadmillService : ITreadmillService
{
    private bool _connected;
    private bool _running;
    private double _speedKmh;

    public Task ConnectAsync()
    {
        _connected = true;
        return Task.CompletedTask;
    }

    public Task DisconnectAsync()
    {
        _connected = false;
        _running = false;
        _speedKmh = 0;
        return Task.CompletedTask;
    }

    public Task StartAsync()
    {
        if (_connected)
            _running = true;
        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        _running = false;
        _speedKmh = 0;
        return Task.CompletedTask;
    }

    public Task SetSpeedAsync(double speedKmh)
    {
        if (_connected && _running)
            _speedKmh = speedKmh;
        return Task.CompletedTask;
    }

    public TreadmillStatus GetStatus()
        => new(_connected, _running, _speedKmh);
}
