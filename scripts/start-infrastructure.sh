#!/bin/bash

echo "🚀 Starting Otokar Dapr E-commerce Demo Infrastructure..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Dapr CLI is installed
if ! command -v dapr &> /dev/null; then
    echo "❌ Dapr CLI is not installed. Please install Dapr CLI first."
    echo "Visit: https://docs.dapr.io/getting-started/install-dapr-cli/"
    exit 1
fi

# Start Redis for state store and pub/sub
echo "📦 Starting Redis..."
docker run -d --name dapr_redis -p 6379:6379 redis:latest

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
sleep 5

# Start Zipkin for distributed tracing
echo "📊 Starting Zipkin for tracing..."
docker run -d --name dapr_zipkin -p 9411:9411 openzipkin/zipkin

# Initialize Dapr
echo "🔧 Initializing Dapr..."
dapr init

# Verify installations
echo ""
echo "✅ Infrastructure started successfully!"
echo ""
echo "Services:"
echo "  📦 Redis: localhost:6379"
echo "  📊 Zipkin: http://localhost:9411"
echo "  🎛️ Dapr Dashboard: Run 'dapr dashboard' to access"
echo ""
echo "Next steps:"
echo "  1. Run './scripts/run-services.sh' to start all microservices"
echo "  2. Run './scripts/demo-scenarios.sh' to test demo scenarios"
echo ""

# Optional: Start Dapr dashboard
read -p "📱 Do you want to start Dapr dashboard? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🎛️ Starting Dapr dashboard..."
    dapr dashboard &
    echo "Dashboard will be available at: http://localhost:8080"
fi
