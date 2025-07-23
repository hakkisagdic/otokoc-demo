const express = require('express');
const { DaprClient } = require('@dapr/dapr');

const app = express();
const port = process.env.PORT || 3005;
const daprPort = process.env.DAPR_HTTP_PORT || 3505;

// Dapr client
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });

app.use(express.json());

// State store names
const INVENTORY_STORE = 'inventory-store';

// Sample inventory data
const sampleInventory = [
  { productId: '1', quantity: 10, reserved: 0, location: 'Warehouse-A', reorderLevel: 5 },
  { productId: '2', quantity: 25, reserved: 0, location: 'Warehouse-A', reorderLevel: 10 },
  { productId: '3', quantity: 50, reserved: 0, location: 'Warehouse-B', reorderLevel: 20 }
];

// Initialize sample data
async function initializeSampleData() {
  try {
    const existingInventory = await daprClient.state.get(INVENTORY_STORE, '1');
    if (!existingInventory) {
      console.log('Initializing sample inventory data...');
      
      const stateOperations = sampleInventory.map(item => ({
        key: item.productId,
        value: {
          ...item,
          lastUpdated: new Date().toISOString()
        }
      }));
      
      await daprClient.state.save(INVENTORY_STORE, stateOperations);
      console.log('Sample inventory data initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
}

// API Endpoints

// Get inventory for a product
app.get('/inventory/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const inventory = await daprClient.state.get(INVENTORY_STORE, productId);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found for product' });
    }
    
    res.json({
      productId,
      ...inventory,
      available: inventory.quantity - inventory.reserved
    });
  } catch (error) {
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update inventory
app.put('/inventory/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, location, reorderLevel } = req.body;
    
    const existingInventory = await daprClient.state.get(INVENTORY_STORE, productId);
    
    if (!existingInventory) {
      // Create new inventory record
      const newInventory = {
        productId,
        quantity: parseInt(quantity) || 0,
        reserved: 0,
        location: location || 'Warehouse-A',
        reorderLevel: parseInt(reorderLevel) || 5,
        lastUpdated: new Date().toISOString()
      };
      
      await daprClient.state.save(INVENTORY_STORE, [
        {
          key: productId,
          value: newInventory
        }
      ]);
      
      console.log(`New inventory created for product: ${productId}`);
      res.status(201).json(newInventory);
    } else {
      // Update existing inventory
      const updatedInventory = {
        ...existingInventory,
        quantity: quantity !== undefined ? parseInt(quantity) : existingInventory.quantity,
        location: location || existingInventory.location,
        reorderLevel: reorderLevel !== undefined ? parseInt(reorderLevel) : existingInventory.reorderLevel,
        lastUpdated: new Date().toISOString()
      };
      
      await daprClient.state.save(INVENTORY_STORE, [
        {
          key: productId,
          value: updatedInventory
        }
      ]);
      
      console.log(`Inventory updated for product: ${productId}`);
      
      // Publish inventory updated event
      await daprClient.pubsub.publish('order-pubsub', 'inventory-updated', {
        productId,
        newStock: updatedInventory.quantity,
        location: updatedInventory.location
      });
      
      res.json({
        productId,
        ...updatedInventory,
        available: updatedInventory.quantity - updatedInventory.reserved
      });
    }
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reserve inventory
app.post('/inventory/:productId/reserve', async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, orderId } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }
    
    const inventory = await daprClient.state.get(INVENTORY_STORE, productId);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found for product' });
    }
    
    const available = inventory.quantity - inventory.reserved;
    
    if (available < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient inventory',
        available,
        requested: quantity
      });
    }
    
    // Reserve the inventory
    inventory.reserved += parseInt(quantity);
    inventory.lastUpdated = new Date().toISOString();
    
    await daprClient.state.save(INVENTORY_STORE, [
      {
        key: productId,
        value: inventory
      }
    ]);
    
    console.log(`Inventory reserved: ${quantity} units of product ${productId} for order ${orderId}`);
    
    // Publish inventory reserved event
    await daprClient.pubsub.publish('order-pubsub', 'inventory-reserved', {
      productId,
      quantity: parseInt(quantity),
      orderId,
      remainingAvailable: inventory.quantity - inventory.reserved
    });
    
    res.json({
      message: 'Inventory reserved successfully',
      productId,
      reservedQuantity: parseInt(quantity),
      remainingAvailable: inventory.quantity - inventory.reserved,
      orderId
    });
  } catch (error) {
    console.error('Error reserving inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Release reserved inventory
app.post('/inventory/:productId/release', async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, orderId } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }
    
    const inventory = await daprClient.state.get(INVENTORY_STORE, productId);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found for product' });
    }
    
    if (inventory.reserved < quantity) {
      return res.status(400).json({ 
        error: 'Cannot release more than reserved',
        reserved: inventory.reserved,
        requested: quantity
      });
    }
    
    // Release the reserved inventory
    inventory.reserved -= parseInt(quantity);
    inventory.lastUpdated = new Date().toISOString();
    
    await daprClient.state.save(INVENTORY_STORE, [
      {
        key: productId,
        value: inventory
      }
    ]);
    
    console.log(`Inventory released: ${quantity} units of product ${productId} for order ${orderId}`);
    
    // Publish inventory released event
    await daprClient.pubsub.publish('order-pubsub', 'inventory-released', {
      productId,
      quantity: parseInt(quantity),
      orderId,
      availableQuantity: inventory.quantity - inventory.reserved
    });
    
    res.json({
      message: 'Inventory released successfully',
      productId,
      releasedQuantity: parseInt(quantity),
      availableQuantity: inventory.quantity - inventory.reserved,
      orderId
    });
  } catch (error) {
    console.error('Error releasing inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fulfill order (remove from actual inventory)
app.post('/inventory/:productId/fulfill', async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, orderId } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }
    
    const inventory = await daprClient.state.get(INVENTORY_STORE, productId);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found for product' });
    }
    
    if (inventory.reserved < quantity) {
      return res.status(400).json({ 
        error: 'Cannot fulfill more than reserved',
        reserved: inventory.reserved,
        requested: quantity
      });
    }
    
    // Fulfill the order by reducing both reserved and total quantity
    inventory.quantity -= parseInt(quantity);
    inventory.reserved -= parseInt(quantity);
    inventory.lastUpdated = new Date().toISOString();
    
    await daprClient.state.save(INVENTORY_STORE, [
      {
        key: productId,
        value: inventory
      }
    ]);
    
    console.log(`Order fulfilled: ${quantity} units of product ${productId} for order ${orderId}`);
    
    // Check if reorder is needed
    if (inventory.quantity <= inventory.reorderLevel) {
      await daprClient.pubsub.publish('order-pubsub', 'reorder-needed', {
        productId,
        currentQuantity: inventory.quantity,
        reorderLevel: inventory.reorderLevel,
        suggestedReorderQuantity: inventory.reorderLevel * 3
      });
    }
    
    // Publish order fulfilled event
    await daprClient.pubsub.publish('order-pubsub', 'order-fulfilled', {
      productId,
      quantity: parseInt(quantity),
      orderId,
      remainingQuantity: inventory.quantity
    });
    
    res.json({
      message: 'Order fulfilled successfully',
      productId,
      fulfilledQuantity: parseInt(quantity),
      remainingQuantity: inventory.quantity,
      orderId
    });
  } catch (error) {
    console.error('Error fulfilling order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get low stock items
app.get('/inventory/alerts/low-stock', async (req, res) => {
  try {
    // For demo purposes, we'll check the sample products
    const lowStockItems = [];
    
    for (const item of sampleInventory) {
      const inventory = await daprClient.state.get(INVENTORY_STORE, item.productId);
      if (inventory && inventory.quantity <= inventory.reorderLevel) {
        lowStockItems.push({
          productId: inventory.productId || item.productId,
          currentQuantity: inventory.quantity,
          reorderLevel: inventory.reorderLevel,
          available: inventory.quantity - inventory.reserved,
          location: inventory.location
        });
      }
    }
    
    res.json({
      lowStockItems,
      count: lowStockItems.length
    });
  } catch (error) {
    console.error('Error getting low stock items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'inventory-service',
    timestamp: new Date().toISOString()
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'reserve-inventory',
      route: '/events/reserve-inventory'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'order-cancelled',
      route: '/events/order-cancelled'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'order-shipped',
      route: '/events/order-shipped'
    }
  ]);
});

// Handle reserve inventory events
app.post('/events/reserve-inventory', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Reserve inventory event received:', data);
    
    const { orderId, items } = data;
    
    // Reserve inventory for all items in the order
    for (const item of items) {
      try {
        const response = await fetch(`http://localhost:${port}/inventory/${item.productId}/reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: item.quantity,
            orderId
          })
        });
        
        if (!response.ok) {
          console.error(`Failed to reserve inventory for product ${item.productId}`);
        }
      } catch (error) {
        console.error(`Error reserving inventory for product ${item.productId}:`, error);
      }
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling reserve inventory event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle order cancelled events
app.post('/events/order-cancelled', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order cancelled event received:', data);
    
    const { orderId, order } = data;
    
    // Release reserved inventory for all items in the cancelled order
    for (const item of order.items) {
      try {
        const response = await fetch(`http://localhost:${port}/inventory/${item.productId}/release`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: item.quantity,
            orderId
          })
        });
        
        if (!response.ok) {
          console.error(`Failed to release inventory for product ${item.productId}`);
        }
      } catch (error) {
        console.error(`Error releasing inventory for product ${item.productId}:`, error);
      }
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order cancelled event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle order shipped events
app.post('/events/order-shipped', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order shipped event received:', data);
    
    const { orderId, order } = data;
    
    // Fulfill order by removing inventory from stock
    for (const item of order.items) {
      try {
        const response = await fetch(`http://localhost:${port}/inventory/${item.productId}/fulfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: item.quantity,
            orderId
          })
        });
        
        if (!response.ok) {
          console.error(`Failed to fulfill inventory for product ${item.productId}`);
        }
      } catch (error) {
        console.error(`Error fulfilling inventory for product ${item.productId}:`, error);
      }
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order shipped event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Start server
const server = app.listen(port, async () => {
  console.log(`Inventory Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
  
  // Initialize sample data
  await initializeSampleData();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Inventory Service stopped');
    process.exit(0);
  });
});

module.exports = app;
