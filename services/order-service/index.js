const express = require('express');
const { DaprClient } = require('@dapr/dapr');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3003;
const daprPort = process.env.DAPR_HTTP_PORT || 3503;

// Dapr client
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });

app.use(express.json());

// State store names
const ORDER_STORE = 'order-store';

// Order statuses
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

// API Endpoints

// Create order
app.post('/orders', async (req, res) => {
  try {
    const { userId, items, shippingAddress, paymentMethod } = req.body;
    
    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'User ID and items are required' });
    }
    
    // Validate user exists using Dapr service invocation
    let user;
    try {
      const userResponse = await daprClient.invoker.invoke(
        'user-service',
        `users/${userId}`,
        'GET'
      );
      user = userResponse;
    } catch (error) {
      console.error('Error validating user:', error);
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Validate products and calculate total using Dapr service invocation
    let totalAmount = 0;
    const validatedItems = [];
    
    for (const item of items) {
      try {
        // Check product availability
        const availabilityResponse = await daprClient.invoker.invoke(
          'product-service',
          `products/${item.productId}/check-availability`,
          'POST',
          { quantity: item.quantity }
        );
        
        if (!availabilityResponse.available) {
          return res.status(400).json({ 
            error: `Product ${item.productId} is not available in requested quantity`,
            availableStock: availabilityResponse.availableStock,
            requestedQuantity: item.quantity
          });
        }
        
        const itemTotal = availabilityResponse.product.price * item.quantity;
        totalAmount += itemTotal;
        
        validatedItems.push({
          productId: item.productId,
          productName: availabilityResponse.product.name,
          quantity: item.quantity,
          unitPrice: availabilityResponse.product.price,
          totalPrice: itemTotal
        });
        
      } catch (error) {
        console.error(`Error validating product ${item.productId}:`, error);
        return res.status(400).json({ error: `Invalid product ID: ${item.productId}` });
      }
    }
    
    const orderId = uuidv4();
    const order = {
      id: orderId,
      userId,
      userName: user.name,
      userEmail: user.email,
      items: validatedItems,
      totalAmount,
      status: ORDER_STATUS.PENDING,
      shippingAddress: shippingAddress || {},
      paymentMethod: paymentMethod || 'credit_card',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Save order to state store
    await daprClient.state.save(ORDER_STORE, [
      {
        key: orderId,
        value: order
      }
    ]);
    
    // Update order list for user
    const userOrdersKey = `user-orders-${userId}`;
    const userOrders = await daprClient.state.get(ORDER_STORE, userOrdersKey) || [];
    userOrders.push(orderId);
    await daprClient.state.save(ORDER_STORE, [
      {
        key: userOrdersKey,
        value: userOrders
      }
    ]);
    
    console.log(`Order created: ${orderId}`);
    
    // Publish order created event
    await daprClient.pubsub.publish('order-pubsub', 'order-created', {
      orderId,
      order
    });
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order by ID
app.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await daprClient.state.get(ORDER_STORE, id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get orders for a user
app.get('/users/:userId/orders', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    
    // Get user's order IDs
    const userOrdersKey = `user-orders-${userId}`;
    const orderIds = await daprClient.state.get(ORDER_STORE, userOrdersKey) || [];
    
    // Get order details
    const orders = [];
    for (const orderId of orderIds) {
      const order = await daprClient.state.get(ORDER_STORE, orderId);
      if (order) {
        // Filter by status if provided
        if (!status || order.status === status) {
          orders.push(order);
        }
      }
    }
    
    // Sort by creation date (newest first)
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    res.json({
      orders: paginatedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: orders.length,
        totalPages: Math.ceil(orders.length / limit)
      },
      filters: {
        userId,
        status
      }
    });
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status
app.patch('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!Object.values(ORDER_STATUS).includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses: Object.values(ORDER_STATUS)
      });
    }
    
    const order = await daprClient.state.get(ORDER_STORE, id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const previousStatus = order.status;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    
    if (notes) {
      order.statusNotes = order.statusNotes || [];
      order.statusNotes.push({
        status,
        notes,
        timestamp: new Date().toISOString()
      });
    }
    
    // Save updated order
    await daprClient.state.save(ORDER_STORE, [
      {
        key: id,
        value: order
      }
    ]);
    
    console.log(`Order status updated: ${id} -> ${status}`);
    
    // Publish order status updated event
    await daprClient.pubsub.publish('order-pubsub', 'order-status-updated', {
      orderId: id,
      order,
      previousStatus,
      newStatus: status
    });
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process payment for order
app.post('/orders/:id/process-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentDetails } = req.body;
    
    const order = await daprClient.state.get(ORDER_STORE, id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.status !== ORDER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Order is not in pending status' });
    }
    
    try {
      // Call payment service using Dapr service invocation
      const paymentResponse = await daprClient.invoker.invoke(
        'payment-service',
        'payments/process',
        'POST',
        {
          orderId: id,
          amount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentDetails
        }
      );
      
      // Update order with payment information
      order.status = ORDER_STATUS.CONFIRMED;
      order.paymentId = paymentResponse.paymentId;
      order.paidAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(ORDER_STORE, [
        {
          key: id,
          value: order
        }
      ]);
      
      console.log(`Payment processed for order: ${id}`);
      
      // Publish payment processed event
      await daprClient.pubsub.publish('order-pubsub', 'payment-processed', {
        orderId: id,
        order,
        payment: paymentResponse
      });
      
      res.json({
        message: 'Payment processed successfully',
        order,
        payment: paymentResponse
      });
      
    } catch (error) {
      console.error('Payment processing failed:', error);
      res.status(400).json({ error: 'Payment processing failed' });
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel order
app.delete('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const order = await daprClient.state.get(ORDER_STORE, id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if ([ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel shipped or delivered orders' });
    }
    
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = new Date().toISOString();
    order.cancellationReason = reason;
    order.updatedAt = new Date().toISOString();
    
    await daprClient.state.save(ORDER_STORE, [
      {
        key: id,
        value: order
      }
    ]);
    
    console.log(`Order cancelled: ${id}`);
    
    // Publish order cancelled event
    await daprClient.pubsub.publish('order-pubsub', 'order-cancelled', {
      orderId: id,
      order,
      reason
    });
    
    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'order-service',
    timestamp: new Date().toISOString()
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'payment-completed',
      route: '/events/payment-completed'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'inventory-reserved',
      route: '/events/inventory-reserved'
    }
  ]);
});

// Handle payment completed events
app.post('/events/payment-completed', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Payment completed event received:', data);
    
    const { orderId } = data;
    
    // Update order status to processing
    const order = await daprClient.state.get(ORDER_STORE, orderId);
    if (order && order.status === ORDER_STATUS.CONFIRMED) {
      order.status = ORDER_STATUS.PROCESSING;
      order.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(ORDER_STORE, [
        {
          key: orderId,
          value: order
        }
      ]);
      
      console.log(`Order moved to processing: ${orderId}`);
      
      // Request inventory reservation
      await daprClient.pubsub.publish('order-pubsub', 'reserve-inventory', {
        orderId,
        items: order.items
      });
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling payment completed event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle inventory reserved events
app.post('/events/inventory-reserved', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Inventory reserved event received:', data);
    
    const { orderId } = data;
    
    // Update order status to shipped (simplified for demo)
    const order = await daprClient.state.get(ORDER_STORE, orderId);
    if (order && order.status === ORDER_STATUS.PROCESSING) {
      order.status = ORDER_STATUS.SHIPPED;
      order.shippedAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(ORDER_STORE, [
        {
          key: orderId,
          value: order
        }
      ]);
      
      console.log(`Order shipped: ${orderId}`);
      
      // Publish order shipped event
      await daprClient.pubsub.publish('order-pubsub', 'order-shipped', {
        orderId,
        order
      });
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling inventory reserved event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Start server
const server = app.listen(port, () => {
  console.log(`Order Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Order Service stopped');
    process.exit(0);
  });
});

module.exports = app;
