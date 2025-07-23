#!/bin/bash

echo "🎭 Dapr E-commerce Demo Scenarios"
echo "=================================="

# Base URLs
USER_SERVICE="http://localhost:3001"
PRODUCT_SERVICE="http://localhost:3002"
ORDER_SERVICE="http://localhost:3003"
PAYMENT_SERVICE="http://localhost:3004"
INVENTORY_SERVICE="http://localhost:3005"
NOTIFICATION_SERVICE="http://localhost:3006"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Function to make HTTP requests with error handling
make_request() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    
    print_step "$description"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\\n%{http_code}" "$url")
    else
        response=$(curl -s -w "\\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        print_success "Success (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        echo
        return 0
    else
        print_error "Failed (HTTP $http_code)"
        echo "$body"
        echo
        return 1
    fi
}

# Check if services are running
check_services() {
    print_step "Checking if all services are running..."
    
    services=("$USER_SERVICE/health" "$PRODUCT_SERVICE/health" "$ORDER_SERVICE/health" "$PAYMENT_SERVICE/health" "$INVENTORY_SERVICE/health" "$NOTIFICATION_SERVICE/health")
    
    for service in "${services[@]}"; do
        if ! curl -s "$service" > /dev/null; then
            print_error "Service $service is not responding"
            echo "Please make sure all services are running with './scripts/run-services.sh'"
            exit 1
        fi
    done
    
    print_success "All services are running!"
    echo
}

# Scenario 1: Complete Order Flow
scenario_1() {
    echo "🎯 SCENARIO 1: Complete Order Flow"
    echo "=================================="
    echo
    
    # Step 1: Create a user
    print_step "Step 1: Creating a new user..."
    user_data='{
        "name": "Ahmet Yılmaz",
        "email": "ahmet@example.com",
        "phone": "+90-555-123-4567"
    }'
    
    if make_request "POST" "$USER_SERVICE/users" "$user_data" "Creating user Ahmet Yılmaz"; then
        user_id=$(echo "$body" | jq -r '.id')
        print_info "User ID: $user_id"
    else
        return 1
    fi
    
    # Step 2: List products
    make_request "GET" "$PRODUCT_SERVICE/products" "" "Fetching available products"
    
    # Step 3: Check product availability
    make_request "POST" "$PRODUCT_SERVICE/products/1/check-availability" '{"quantity": 2}' "Checking availability for MacBook Pro (2 units)"
    
    # Step 4: Create an order
    print_step "Step 4: Creating an order..."
    order_data="{
        \"userId\": \"$user_id\",
        \"items\": [
            {\"productId\": \"1\", \"quantity\": 1},
            {\"productId\": \"2\", \"quantity\": 1}
        ],
        \"shippingAddress\": {
            \"street\": \"Atatürk Cad. No: 123\",
            \"city\": \"Istanbul\",
            \"country\": \"Turkey\",
            \"zipCode\": \"34000\"
        },
        \"paymentMethod\": \"credit_card\"
    }"
    
    if make_request "POST" "$ORDER_SERVICE/orders" "$order_data" "Creating order"; then
        order_id=$(echo "$body" | jq -r '.id')
        print_info "Order ID: $order_id"
    else
        return 1
    fi
    
    # Step 5: Process payment
    print_step "Step 5: Processing payment..."
    payment_data='{
        "paymentDetails": {
            "cardNumber": "4111111111111111",
            "expiryMonth": "12",
            "expiryYear": "2025",
            "cvv": "123"
        }
    }'
    
    make_request "POST" "$ORDER_SERVICE/orders/$order_id/process-payment" "$payment_data" "Processing payment for order"
    
    # Step 6: Check order status
    make_request "GET" "$ORDER_SERVICE/orders/$order_id" "" "Checking final order status"
    
    # Step 7: Check inventory changes
    make_request "GET" "$INVENTORY_SERVICE/inventory/1" "" "Checking MacBook inventory after order"
    make_request "GET" "$INVENTORY_SERVICE/inventory/2" "" "Checking iPhone inventory after order"
    
    print_success "Scenario 1 completed successfully! 🎉"
    echo
}

# Scenario 2: Order Cancellation
scenario_2() {
    echo "🎯 SCENARIO 2: Order Cancellation Flow"
    echo "======================================"
    echo
    
    # Create a user for this scenario
    user_data='{
        "name": "Mehmet Demir",
        "email": "mehmet@example.com",
        "phone": "+90-555-987-6543"
    }'
    
    if make_request "POST" "$USER_SERVICE/users" "$user_data" "Creating user for cancellation scenario"; then
        user_id=$(echo "$body" | jq -r '.id')
    else
        return 1
    fi
    
    # Create an order
    order_data="{
        \"userId\": \"$user_id\",
        \"items\": [
            {\"productId\": \"3\", \"quantity\": 2}
        ],
        \"paymentMethod\": \"credit_card\"
    }"
    
    if make_request "POST" "$ORDER_SERVICE/orders" "$order_data" "Creating order to cancel"; then
        order_id=$(echo "$body" | jq -r '.id')
    else
        return 1
    fi
    
    # Cancel the order
    cancel_data='{
        "reason": "Customer changed mind"
    }'
    
    make_request "DELETE" "$ORDER_SERVICE/orders/$order_id" "$cancel_data" "Cancelling the order"
    
    # Check final order status
    make_request "GET" "$ORDER_SERVICE/orders/$order_id" "" "Checking cancelled order status"
    
    print_success "Scenario 2 completed successfully! 🎉"
    echo
}

# Scenario 3: Inventory Management
scenario_3() {
    echo "🎯 SCENARIO 3: Inventory Management"
    echo "=================================="
    echo
    
    # Check current inventory
    make_request "GET" "$INVENTORY_SERVICE/inventory/1" "" "Checking current MacBook inventory"
    
    # Update inventory
    inventory_data='{
        "quantity": 50,
        "location": "Warehouse-B",
        "reorderLevel": 10
    }'
    
    make_request "PUT" "$INVENTORY_SERVICE/inventory/1" "$inventory_data" "Updating MacBook inventory"
    
    # Check low stock items
    make_request "GET" "$INVENTORY_SERVICE/inventory/alerts/low-stock" "" "Checking for low stock alerts"
    
    print_success "Scenario 3 completed successfully! 🎉"
    echo
}

# Scenario 4: Notification Testing
scenario_4() {
    echo "🎯 SCENARIO 4: Notification System"
    echo "================================="
    echo
    
    # Send a test email notification
    email_data='{
        "type": "email",
        "recipient": "test@example.com",
        "subject": "Test Notification",
        "content": "This is a test notification from the Dapr demo system.",
        "metadata": {
            "source": "demo-script",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
        }
    }'
    
    if make_request "POST" "$NOTIFICATION_SERVICE/notifications/send" "$email_data" "Sending test email notification"; then
        notification_id=$(echo "$body" | jq -r '.notificationId')
        
        # Check notification status
        make_request "GET" "$NOTIFICATION_SERVICE/notifications/$notification_id" "" "Checking notification status"
    fi
    
    # Send bulk notifications
    bulk_data='{
        "notifications": [
            {
                "type": "email",
                "recipient": "user1@example.com",
                "subject": "Bulk Test 1",
                "content": "First bulk notification"
            },
            {
                "type": "sms",
                "recipient": "+90-555-000-0001",
                "content": "SMS bulk notification"
            },
            {
                "type": "push",
                "recipient": "device_token_123",
                "content": "Push notification test"
            }
        ]
    }'
    
    make_request "POST" "$NOTIFICATION_SERVICE/notifications/bulk" "$bulk_data" "Sending bulk notifications"
    
    print_success "Scenario 4 completed successfully! 🎉"
    echo
}

# Scenario 5: Service Integration Testing
scenario_5() {
    echo "🎯 SCENARIO 5: Service Integration & Events"
    echo "==========================================="
    echo
    
    # Test service-to-service communication
    make_request "GET" "$PRODUCT_SERVICE/categories" "" "Getting product categories"
    
    # Test payment methods
    make_request "GET" "$PAYMENT_SERVICE/payment-methods" "" "Getting available payment methods"
    
    # Create a comprehensive order that will trigger multiple events
    user_data='{
        "name": "Ayşe Kaya",
        "email": "ayse@example.com",
        "phone": "+90-555-111-2222"
    }'
    
    if make_request "POST" "$USER_SERVICE/users" "$user_data" "Creating user for integration test"; then
        user_id=$(echo "$body" | jq -r '.id')
        
        # Create order with multiple items
        order_data="{
            \"userId\": \"$user_id\",
            \"items\": [
                {\"productId\": \"1\", \"quantity\": 1},
                {\"productId\": \"2\", \"quantity\": 2},
                {\"productId\": \"3\", \"quantity\": 1}
            ],
            \"shippingAddress\": {
                \"street\": \"İstiklal Cad. No: 456\",
                \"city\": \"Ankara\",
                \"country\": \"Turkey\",
                \"zipCode\": \"06000\"
            },
            \"paymentMethod\": \"credit_card\"
        }"
        
        if make_request "POST" "$ORDER_SERVICE/orders" "$order_data" "Creating comprehensive order"; then
            order_id=$(echo "$body" | jq -r '.id')
            
            # Process payment
            payment_data='{
                "paymentDetails": {
                    "cardNumber": "4111111111111111",
                    "expiryMonth": "12",
                    "expiryYear": "2025",
                    "cvv": "123"
                }
            }'
            
            make_request "POST" "$ORDER_SERVICE/orders/$order_id/process-payment" "$payment_data" "Processing payment for comprehensive order"
            
            # Update order status to simulate shipping
            sleep 2
            status_data='{
                "status": "shipped",
                "notes": "Order shipped via express delivery"
            }'
            
            make_request "PATCH" "$ORDER_SERVICE/orders/$order_id/status" "$status_data" "Updating order status to shipped"
            
            # Check user's order history
            make_request "GET" "$ORDER_SERVICE/users/$user_id/orders" "" "Checking user's order history"
        fi
    fi
    
    print_success "Scenario 5 completed successfully! 🎉"
    echo
}

# Main execution
main() {
    echo "🎭 Welcome to the Dapr E-commerce Demo!"
    echo "This script will demonstrate various scenarios using our microservices."
    echo
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Please install jq for better JSON formatting."
        echo "On macOS: brew install jq"
        echo "On Ubuntu: sudo apt-get install jq"
        echo
        exit 1
    fi
    
    check_services
    
    echo "Available scenarios:"
    echo "1. Complete Order Flow"
    echo "2. Order Cancellation"
    echo "3. Inventory Management"
    echo "4. Notification System"
    echo "5. Service Integration & Events"
    echo "6. Run All Scenarios"
    echo
    
    read -p "Select scenario (1-6): " choice
    
    case $choice in
        1) scenario_1 ;;
        2) scenario_2 ;;
        3) scenario_3 ;;
        4) scenario_4 ;;
        5) scenario_5 ;;
        6) 
            scenario_1
            scenario_2
            scenario_3
            scenario_4
            scenario_5
            print_success "All scenarios completed! 🚀"
            ;;
        *) 
            print_error "Invalid choice. Please select 1-6."
            exit 1
            ;;
    esac
    
    echo
    print_info "Demo completed! Check the Dapr dashboard and Zipkin for observability data."
    print_info "Dapr Dashboard: http://localhost:8080"
    print_info "Zipkin Tracing: http://localhost:9411"
}

# Run main function
main
