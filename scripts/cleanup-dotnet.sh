#!/bin/bash

echo "🧹 Cleaning up .NET Dapr services..."

# Stop Dapr applications
echo "🛑 Stopping .NET Dapr applications..."

# Read PIDs and stop services
if [ -f /tmp/dapr-dotnet-pids.txt ]; then
    while read pid; do
        if [ ! -z "$pid" ]; then
            kill $pid 2>/dev/null
        fi
    done < /tmp/dapr-dotnet-pids.txt
    rm -f /tmp/dapr-dotnet-pids.txt
fi

# Stop Dapr sidecars for .NET services
dapr stop --app-id user-service-dotnet 2>/dev/null
dapr stop --app-id product-service-dotnet 2>/dev/null

# Kill any remaining .NET processes
pkill -f "dotnet run" 2>/dev/null
pkill -f "user-service-dotnet" 2>/dev/null
pkill -f "product-service-dotnet" 2>/dev/null

echo "🧹 Cleaning up .NET build artifacts..."
find services-dotnet -name "bin" -type d -exec rm -rf {} + 2>/dev/null
find services-dotnet -name "obj" -type d -exec rm -rf {} + 2>/dev/null

echo "✅ .NET services cleanup completed!"
echo ""
echo "To restart .NET services:"
echo "1. Run './scripts/run-services-dotnet.sh'"
