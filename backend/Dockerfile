# Stage 1: build the .NET backend
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build

WORKDIR /src

# Copy csproj files and restore first (better caching)
COPY backend/TreadmillControl.Core/TreadmillControl.Core.csproj backend/TreadmillControl.Core/
COPY backend/TreadmillControl.WebApi/TreadmillControl.WebApi.csproj backend/TreadmillControl.WebApi/
RUN dotnet restore backend/TreadmillControl.WebApi/TreadmillControl.WebApi.csproj

# Copy the rest of the source
COPY backend/ ./backend/

# Build
RUN dotnet publish backend/TreadmillControl.WebApi/TreadmillControl.WebApi.csproj \
    -c Release -o /app/publish

# Stage 2: runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0

# Install Bluetooth stack/libs so InTheHand can use BlueZ via D-Bus
RUN apt-get update && apt-get install -y \
    bluez bluez-hcidump dbus libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish .

# Expose HTTP port (Kestrel)
EXPOSE 5227

# Force ASP.NET to listen on 5227
ENV ASPNETCORE_URLS=http://0.0.0.0:5227

ENTRYPOINT ["dotnet", "TreadmillControl.WebApi.dll"]
