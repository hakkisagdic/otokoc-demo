#!/bin/bash

echo "🚀 Starting all microservices with Dapr..."

# Get the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if infrastructure is running
if ! docker ps | grep -q "dapr_redis"; then
    echo "❌ Infrastructure not running. Please run './scripts/start-infrastructure.sh' first."
    exit 1
fi

# Function to install npm dependencies for a service
install_dependencies() {
    local service_dir=$1
    echo "📦 Installing dependencies for $(basename "$service_dir")..."
    cd "$service_dir"
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    cd "$PROJECT_ROOT"
}

# Install dependencies for all services
echo "📦 Installing dependencies for all services..."
for service_dir in "$PROJECT_ROOT"/services/*/; do
    if [ -f "$service_dir/package.json" ]; then
        install_dependencies "$service_dir"
    fi
done

# Start services with Dapr
echo ""
echo "🚀 Starting services with Dapr sidecars..."

# Start User Service
echo "👤 Starting User Service..."
cd "$PROJECT_ROOT/services/user-service"
dapr run --app-id user-service --app-port 3001 --dapr-http-port 3501 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
USER_PID=$!

sleep 3

# Start Product Service
echo "📦 Starting Product Service..."
cd "$PROJECT_ROOT/services/product-service"
dapr run --app-id product-service --app-port 3002 --dapr-http-port 3502 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
PRODUCT_PID=$!

sleep 3

# Start Order Service
echo "📋 Starting Order Service..."
cd "$PROJECT_ROOT/services/order-service"
dapr run --app-id order-service --app-port 3003 --dapr-http-port 3503 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
ORDER_PID=$!

sleep 3

# Start Payment Service
echo "💳 Starting Payment Service..."
cd "$PROJECT_ROOT/services/payment-service"
dapr run --app-id payment-service --app-port 3004 --dapr-http-port 3504 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
PAYMENT_PID=$!

sleep 3

# Start Inventory Service
echo "📊 Starting Inventory Service..."
cd "$PROJECT_ROOT/services/inventory-service"
dapr run --app-id inventory-service --app-port 3005 --dapr-http-port 3505 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
INVENTORY_PID=$!

sleep 3

# Start Notification Service
echo "📧 Starting Notification Service..."
cd "$PROJECT_ROOT/services/notification-service"
dapr run --app-id notification-service --app-port 3006 --dapr-http-port 3506 --components-path ../../dapr-components --config ../../dapr-components/config.yaml npm start &
NOTIFICATION_PID=$!

sleep 5

echo ""
echo "✅ All services started successfully!"
echo ""
echo "🌐 Service Endpoints:"
echo "  👤 User Service:         http://localhost:3001"
echo "  📦 Product Service:      http://localhost:3002"
echo "  📋 Order Service:        http://localhost:3003"
echo "  💳 Payment Service:      http://localhost:3004"
echo "  📊 Inventory Service:    http://localhost:3005"
echo "  📧 Notification Service: http://localhost:3006"
echo ""
echo "🎛️ Dapr Endpoints:"
echo "  👤 User Service Dapr:    http://localhost:3501"
echo "  📦 Product Service Dapr: http://localhost:3502"
echo "  📋 Order Service Dapr:   http://localhost:3503"
echo "  💳 Payment Service Dapr: http://localhost:3504"
echo "  📊 Inventory Service Dapr: http://localhost:3505"
echo "  📧 Notification Service Dapr: http://localhost:3506"
echo ""
echo "📊 Monitoring:"
echo "  🎛️ Dapr Dashboard: http://localhost:8080 (run 'dapr dashboard')"
echo "  📊 Zipkin Tracing: http://localhost:9411"
echo ""
echo "Press Ctrl+C to stop all services..."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    
    # Stop Dapr applications
    dapr stop --app-id user-service
    dapr stop --app-id product-service
    dapr stop --app-id order-service
    dapr stop --app-id payment-service
    dapr stop --app-id inventory-service
    dapr stop --app-id notification-service
    
    echo "✅ All services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
