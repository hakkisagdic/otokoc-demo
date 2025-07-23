#!/bin/bash

echo "🧹 Cleaning up Dapr E-commerce Demo..."

# Stop all Dapr applications
echo "🛑 Stopping Dapr applications..."
dapr stop --app-id user-service 2>/dev/null
dapr stop --app-id product-service 2>/dev/null
dapr stop --app-id order-service 2>/dev/null
dapr stop --app-id payment-service 2>/dev/null
dapr stop --app-id inventory-service 2>/dev/null
dapr stop --app-id notification-service 2>/dev/null

# Stop Docker containers (check both naming conventions)
echo "🐳 Stopping Docker containers..."
docker stop dapr_redis dapr_zipkin dapr-redis dapr-zipkin 2>/dev/null
docker rm dapr_redis dapr_zipkin dapr-redis dapr-zipkin 2>/dev/null

# Stop Dapr dashboard
echo "🎛️ Stopping Dapr dashboard..."
pkill -f "dapr dashboard" 2>/dev/null
# Alternative dashboard cleanup methods
pgrep -f "dapr dashboard" | xargs kill -9 2>/dev/null
# Stop dashboard on port 8080 if running
lsof -ti :8080 | xargs kill -9 2>/dev/null

# Kill any remaining processes
echo "🔄 Killing remaining processes..."
pkill -f "dapr run"
pkill -f "node.*index.js"
pkill -f "npm start"

# Clean up any remaining Dapr processes
echo "🧹 Cleaning up Dapr processes..."
pkill -f "daprd" 2>/dev/null

echo "✅ Cleanup completed!"
echo ""
echo "To restart the demo:"
echo "1. Run './scripts/start-infrastructure.sh'"
echo "2. Run './scripts/run-services.sh'"
