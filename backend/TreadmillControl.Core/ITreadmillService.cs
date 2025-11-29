namespace TreadmillControl.Core;

public interface ITreadmillService
{
    Task ConnectAsync();
    Task DisconnectAsync();
    Task StartAsync();
    Task StopAsync();
    Task SetSpeedAsync(double speedKmh);
    TreadmillStatus GetStatus();
}