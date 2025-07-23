#!/usr/bin/env zsh

# .NET Services Runner for Dapr E-commerce Demo
set -e

echecho "📋 URLs: user(3001), product(3002), order(3003), payment(3004), inventory(3005), notification(3006)"
echo "� Dapr Dashboard: http://localhost:8080"
echo "🔄 Press Ctrl+C to stop all services..."

while true; do
    sleep 1
donetarting all .NET microservices with Dapr..."

# Service configurations
SERVICES=(
    "user-service:3001:3501"
    "product-service:3002:3502" 
    "order-service:3003:3503"
    "payment-service:3004:3504"
    "inventory-service:3005:3505"
    "notification-service:3006:3506"
)

# Check infrastructure
check_infrastructure() {
    if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo "📋 Starting Dapr dashboard..."
        dapr dashboard -p 8080 &
        sleep 2
    fi
    echo "✅ Infrastructure is ready!"
}

# Start a service
start_service() {
    local service_config=$1
    local service_name=$(echo $service_config | cut -d: -f1)
    local app_port=$(echo $service_config | cut -d: -f2)
    local dapr_port=$(echo $service_config | cut -d: -f3)
    
    echo "🔄 Starting $service_name..."
    
    cd "services-dotnet/$service_name"
    
    dapr run \
        --app-id "$service_name" \
        --app-port "$app_port" \
        --dapr-http-port "$dapr_port" \
        --dapr-grpc-port "$((dapr_port + 1000))" \
        --resources-path "/Users/hakkisagdic/Documents/GitHub/otokoc-demo/dapr-components/redis" \
        --config "/Users/hakkisagdic/Documents/GitHub/otokoc-demo/dapr-components/redis/config.yaml" \
        --log-level info \
        -- dotnet run --urls="http://localhost:$app_port" &
    
    cd - > /dev/null
    sleep 3
    echo "✅ $service_name started!"
}
# Cleanup function
cleanup() {
    echo "🛑 Stopping all services..."
    for service_config in "${SERVICES[@]}"; do
        local service_name=$(echo $service_config | cut -d: -f1)
        dapr stop --app-id "$service_name" 2>/dev/null || true
    done
    pkill -f "dotnet run" 2>/dev/null || true
    echo "✅ All services stopped!"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main execution
check_infrastructure

echo ""
echo "Starting .NET services with Dapr sidecars..."
echo "============================================="

for service_config in "${SERVICES[@]}"; do
    start_service "$service_config"
done

echo ""
echo "🎉 All .NET services started!"
echo "📋 URLs: user(3001), product(3002), order(3003), payment(3004), inventory(3005), notification(3006)"
echo "� Dapr Dashboard: http://localhost:8080"
echo "🔄 Press Ctrl+C to stop all services..."

while true; do
    sleep 1
done
