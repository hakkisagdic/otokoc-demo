const express = require('express');
const { DaprClient, DaprServer } = require('@dapr/dapr');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3001;
const daprPort = process.env.DAPR_HTTP_PORT || 3501;

// Dapr clients
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });
const daprServer = new DaprServer({
  serverHost: '127.0.0.1',
  serverPort: port,
  clientOptions: {
    daprHost: '127.0.0.1',
    daprPort
  }
});

app.use(express.json());

// State store names
const USER_STORE = 'user-store';

// Users database simulation
const users = new Map();

// API Endpoints

// Create user
app.post('/users', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const userId = uuidv4();
    const user = {
      id: userId,
      name,
      email,
      phone,
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    // Save to Dapr state store
    await daprClient.state.save(USER_STORE, [
      {
        key: userId,
        value: user
      }
    ]);

    console.log(`User created: ${userId}`);
    
    // Publish user created event
    await daprClient.pubsub.publish('order-pubsub', 'user-created', {
      userId,
      user
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get from Dapr state store
    const result = await daprClient.state.get(USER_STORE, id);
    
    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users
app.get('/users', async (req, res) => {
  try {
    // In a real scenario, you'd implement pagination
    // For demo purposes, we'll keep it simple
    const { page = 1, limit = 10 } = req.query;
    
    // Since Dapr doesn't provide list all functionality out of the box,
    // we'll maintain a user list separately for demo purposes
    const userList = await daprClient.state.get(USER_STORE, 'user-list') || [];
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = userList.slice(startIndex, endIndex);
    
    res.json({
      users: paginatedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: userList.length
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Get existing user
    const existingUser = await daprClient.state.get(USER_STORE, id);
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = {
      ...existingUser,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Save to Dapr state store
    await daprClient.state.save(USER_STORE, [
      {
        key: id,
        value: updatedUser
      }
    ]);

    console.log(`User updated: ${id}`);
    
    // Publish user updated event
    await daprClient.pubsub.publish('order-pubsub', 'user-updated', {
      userId: id,
      user: updatedUser,
      changes: updates
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const existingUser = await daprClient.state.get(USER_STORE, id);
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete from Dapr state store
    await daprClient.state.delete(USER_STORE, id);

    console.log(`User deleted: ${id}`);
    
    // Publish user deleted event
    await daprClient.pubsub.publish('order-pubsub', 'user-deleted', {
      userId: id,
      user: existingUser
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'user-service',
    timestamp: new Date().toISOString()
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'order-created',
      route: '/events/order-created'
    }
  ]);
});

// Handle order created events
app.post('/events/order-created', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order created event received:', data);
    
    // You could update user statistics, send notifications, etc.
    // For demo purposes, we'll just log it
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order created event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Start server
const server = app.listen(port, () => {
  console.log(`User Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('User Service stopped');
    process.exit(0);
  });
});

module.exports = app;
