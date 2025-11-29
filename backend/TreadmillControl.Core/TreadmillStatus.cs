namespace TreadmillControl.Core;

public record TreadmillStatus
(
    bool IsConnected,
    bool IsRunning,
    double CurrentSpeedKmh
);