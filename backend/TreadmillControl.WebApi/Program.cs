using TreadmillControl.Core;

var builder = WebApplication.CreateBuilder(args);

// Register our treadmill service
builder.Services.AddSingleton<ITreadmillService, BluetoothTreadmillService>();

var app = builder.Build();

// For later: serves Angular static files from wwwroot (safe to leave now)
app.UseDefaultFiles();
app.UseStaticFiles();

// ===== API endpoints =====

app.MapGet("/api/status", (ITreadmillService svc) =>
{
    var status = svc.GetStatus();
    return Results.Ok(status);
});

app.MapPost("/api/connect", async (ITreadmillService svc) =>
{
    await svc.ConnectAsync();
    return Results.Ok(svc.GetStatus());
});

app.MapPost("/api/disconnect", async (ITreadmillService svc) =>
{
    await svc.DisconnectAsync();
    return Results.Ok(svc.GetStatus());
});

app.MapPost("/api/start", async (ITreadmillService svc) =>
{
    await svc.StartAsync();
    return Results.Ok(svc.GetStatus());
});

app.MapPost("/api/stop", async (ITreadmillService svc) =>
{
    await svc.StopAsync();
    return Results.Ok(svc.GetStatus());
});

app.MapPost("/api/speed", async (ITreadmillService svc, SpeedRequest req) =>
{
    await svc.SetSpeedAsync(req.SpeedKmh);
    return Results.Ok(svc.GetStatus());
});

// SPA fallback: if you request any non-/api path, serve Angular's index.html
app.MapFallbackToFile("index.html");

app.Run();

public record SpeedRequest(double SpeedKmh);
