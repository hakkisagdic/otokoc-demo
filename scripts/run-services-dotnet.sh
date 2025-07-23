#!/bin/bash

echo "🚀 Starting .NET Microservices with Dapr..."

# Check if infrastructure is running
if ! docker ps | grep -q "dapr_redis\|dapr-redis"; then
    echo "❌ Infrastructure not running. Please run './scripts/start-infrastructure.sh' first."
    exit 1
fi

echo "✅ Infrastructure is running"
echo ""

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $port is already in use"
        return 1
    fi
    return 0
}

# Function to start a service
start_service() {
    local service_name=$1
    local app_port=$2
    local dapr_port=$3
    local service_path=$4

    echo "🔧 Starting $service_name (.NET)..."
    
    if ! check_port $app_port; then
        echo "❌ Cannot start $service_name - port $app_port is in use"
        return 1
    fi

    cd "$service_path"
    
    # Build the project first
    echo "📦 Building $service_name..."
    dotnet build --configuration Release --verbosity quiet
    
    if [ $? -ne 0 ]; then
        echo "❌ Build failed for $service_name"
        cd - > /dev/null
        return 1
    fi

    # Start with Dapr
    dapr run \
        --app-id "$service_name-dotnet" \
        --app-port $app_port \
        --dapr-http-port $dapr_port \
        --components-path "../../dapr-components" \
        --config "../../dapr-components/config.yaml" \
        --log-level info \
        -- dotnet run --configuration Release --urls="http://0.0.0.0:$app_port" &

    # Store PID for cleanup
    echo $! >> /tmp/dapr-dotnet-pids.txt
    
    cd - > /dev/null
    
    # Wait a bit for service to start
    sleep 3
    
    # Health check
    for i in {1..10}; do
        if curl -s "http://localhost:$app_port/health" > /dev/null 2>&1; then
            echo "✅ $service_name started successfully on port $app_port"
            return 0
        fi
        sleep 2
    done
    
    echo "⚠️  $service_name may not be fully ready yet (port $app_port)"
    return 0
}

# Clean up any existing PID file
rm -f /tmp/dapr-dotnet-pids.txt

# Start services
echo "🎯 Starting .NET services..."
echo ""

# User Service (.NET)
start_service "user-service" 5001 3521 "services-dotnet/user-service"

# Product Service (.NET)
start_service "product-service" 5002 3522 "services-dotnet/product-service"

# Note: Add other services as they are implemented
echo ""
echo "📝 Note: Only User and Product services are currently implemented in .NET"
echo "🔄 Other services (.NET versions) are under development"

echo ""
echo "✅ .NET Services startup completed!"
echo ""
echo "📋 Service URLs:"
echo "  🔹 User Service (.NET):      http://localhost:5001"
echo "  🔹 Product Service (.NET):   http://localhost:5002"
echo ""
echo "📋 Health Checks:"
echo "  curl http://localhost:5001/health"
echo "  curl http://localhost:5002/health"
echo ""
echo "📋 API Documentation:"
echo "  🔹 User Service Swagger:     http://localhost:5001/swagger"
echo "  🔹 Product Service Swagger:  http://localhost:5002/swagger"
echo ""
echo "🛑 To stop all .NET services, run './scripts/cleanup-dotnet.sh'"
