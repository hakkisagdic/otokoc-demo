const express = require('express');
const { DaprClient } = require('@dapr/dapr');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3006;
const daprPort = process.env.DAPR_HTTP_PORT || 3506;

// Dapr client
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });

app.use(express.json());

// State store names
const NOTIFICATION_STORE = 'notification-store';

// Notification types
const NOTIFICATION_TYPES = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app'
};

// Notification statuses
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  DELIVERED: 'delivered'
};

// Simulate sending notifications
function simulateNotificationSending(type, recipient, content) {
  return new Promise((resolve, reject) => {
    // Simulate network delay
    setTimeout(() => {
      // Simulate 95% success rate
      const success = Math.random() > 0.05;
      
      if (success) {
        let provider;
        if (type === NOTIFICATION_TYPES.EMAIL) {
          provider = 'SendGrid';
        } else if (type === NOTIFICATION_TYPES.SMS) {
          provider = 'Twilio';
        } else if (type === NOTIFICATION_TYPES.PUSH) {
          provider = 'Firebase';
        } else {
          provider = 'Internal';
        }
        
        resolve({
          messageId: `msg_${uuidv4()}`,
          sentAt: new Date().toISOString(),
          provider
        });
      } else {
        reject(new Error(`Failed to send ${type} notification`));
      }
    }, Math.random() * 500 + 100); // 100-600ms delay
  });
}

// API Endpoints

// Send notification
app.post('/notifications/send', async (req, res) => {
  try {
    const { type, recipient, subject, content, metadata = {} } = req.body;
    
    if (!type || !recipient || !content) {
      return res.status(400).json({ error: 'Type, recipient, and content are required' });
    }
    
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid notification type',
        validTypes: Object.values(NOTIFICATION_TYPES)
      });
    }
    
    const notificationId = uuidv4();
    
    // Create notification record
    const notification = {
      id: notificationId,
      type,
      recipient,
      subject,
      content,
      metadata,
      status: NOTIFICATION_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    };
    
    // Save to state store
    await daprClient.state.save(NOTIFICATION_STORE, [
      {
        key: notificationId,
        value: notification
      }
    ]);
    
    console.log(`Notification created: ${notificationId} (${type})`);
    
    try {
      // Send notification
      const result = await simulateNotificationSending(type, recipient, content);
      
      // Update notification with success
      notification.status = NOTIFICATION_STATUS.SENT;
      notification.messageId = result.messageId;
      notification.sentAt = result.sentAt;
      notification.provider = result.provider;
      notification.attempts = 1;
      notification.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(NOTIFICATION_STORE, [
        {
          key: notificationId,
          value: notification
        }
      ]);
      
      console.log(`Notification sent: ${notificationId}`);
      
      // Publish notification sent event
      await daprClient.pubsub.publish('order-pubsub', 'notification-sent', {
        notificationId,
        type,
        recipient,
        messageId: result.messageId
      });
      
      res.json({
        notificationId,
        status: notification.status,
        messageId: result.messageId,
        sentAt: result.sentAt
      });
      
    } catch (error) {
      console.error('Notification sending failed:', error);
      
      // Update notification with failure
      notification.status = NOTIFICATION_STATUS.FAILED;
      notification.errorMessage = error.message;
      notification.attempts = 1;
      notification.failedAt = new Date().toISOString();
      notification.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(NOTIFICATION_STORE, [
        {
          key: notificationId,
          value: notification
        }
      ]);
      
      // Publish notification failed event
      await daprClient.pubsub.publish('order-pubsub', 'notification-failed', {
        notificationId,
        type,
        recipient,
        error: error.message
      });
      
      res.status(400).json({
        notificationId,
        status: notification.status,
        error: 'Notification sending failed',
        message: error.message
      });
    }
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get notification by ID
app.get('/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await daprClient.state.get(NOTIFICATION_STORE, id);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(notification);
  } catch (error) {
    console.error('Error getting notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retry failed notification
app.post('/notifications/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await daprClient.state.get(NOTIFICATION_STORE, id);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.status !== NOTIFICATION_STATUS.FAILED) {
      return res.status(400).json({ error: 'Only failed notifications can be retried' });
    }
    
    if (notification.attempts >= notification.maxAttempts) {
      return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
    }
    
    try {
      // Attempt to resend
      const result = await simulateNotificationSending(
        notification.type, 
        notification.recipient, 
        notification.content
      );
      
      // Update notification with success
      notification.status = NOTIFICATION_STATUS.SENT;
      notification.messageId = result.messageId;
      notification.sentAt = result.sentAt;
      notification.provider = result.provider;
      notification.attempts += 1;
      notification.updatedAt = new Date().toISOString();
      delete notification.errorMessage;
      delete notification.failedAt;
      
      await daprClient.state.save(NOTIFICATION_STORE, [
        {
          key: id,
          value: notification
        }
      ]);
      
      console.log(`Notification retry successful: ${id}`);
      
      res.json({
        message: 'Notification retry successful',
        notificationId: id,
        messageId: result.messageId,
        sentAt: result.sentAt
      });
      
    } catch (error) {
      console.error('Notification retry failed:', error);
      
      // Update failed attempt
      notification.attempts += 1;
      notification.errorMessage = error.message;
      notification.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(NOTIFICATION_STORE, [
        {
          key: id,
          value: notification
        }
      ]);
      
      res.status(400).json({
        error: 'Notification retry failed',
        attempts: notification.attempts,
        maxAttempts: notification.maxAttempts
      });
    }
  } catch (error) {
    console.error('Error retrying notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send bulk notifications
app.post('/notifications/bulk', async (req, res) => {
  try {
    const { notifications } = req.body;
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return res.status(400).json({ error: 'Notifications array is required' });
    }
    
    const results = [];
    
    for (const notificationData of notifications) {
      try {
        const response = await fetch(`http://localhost:${port}/notifications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notificationData)
        });
        
        const result = await response.json();
        results.push({
          ...notificationData,
          ...result,
          success: response.ok
        });
      } catch (error) {
        results.push({
          ...notificationData,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      total: notifications.length,
      successful: successCount,
      failed: notifications.length - successCount,
      results
    });
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'notification-service',
    timestamp: new Date().toISOString(),
    providers: {
      email: 'online',
      sms: 'online',
      push: 'online'
    }
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'user-created',
      route: '/events/user-created'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'order-created',
      route: '/events/order-created'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'order-status-updated',
      route: '/events/order-status-updated'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'payment-completed',
      route: '/events/payment-completed'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'order-shipped',
      route: '/events/order-shipped'
    },
    {
      pubsubname: 'order-pubsub',
      topic: 'reorder-needed',
      route: '/events/reorder-needed'
    }
  ]);
});

// Handle user created events
app.post('/events/user-created', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('User created event received:', data);
    
    const { user } = data;
    
    // Send welcome email
    await fetch(`http://localhost:${port}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: NOTIFICATION_TYPES.EMAIL,
        recipient: user.email,
        subject: 'Welcome to our E-commerce Platform!',
        content: `Hello ${user.name},\n\nWelcome to our platform! We're excited to have you on board.\n\nBest regards,\nThe E-commerce Team`,
        metadata: { userId: user.id, eventType: 'user-created' }
      })
    });
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling user created event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle order created events
app.post('/events/order-created', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order created event received:', data);
    
    const { order } = data;
    
    // Send order confirmation email
    const itemsList = order.items.map(item => 
      `- ${item.productName} x${item.quantity} @ $${item.unitPrice}`
    ).join('\n');
    
    await fetch(`http://localhost:${port}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: NOTIFICATION_TYPES.EMAIL,
        recipient: order.userEmail,
        subject: `Order Confirmation - #${order.id}`,
        content: `Hello ${order.userName},\n\nYour order has been created successfully!\n\nOrder Details:\n${itemsList}\n\nTotal: $${order.totalAmount}\n\nThank you for your purchase!\n\nBest regards,\nThe E-commerce Team`,
        metadata: { orderId: order.id, userId: order.userId, eventType: 'order-created' }
      })
    });
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order created event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle order status updated events
app.post('/events/order-status-updated', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order status updated event received:', data);
    
    const { order, newStatus } = data;
    
    let subject, content;
    
    switch (newStatus) {
      case 'confirmed':
        subject = `Order Confirmed - #${order.id}`;
        content = `Hello ${order.userName},\n\nYour order has been confirmed and is being processed.\n\nThank you for your payment!\n\nBest regards,\nThe E-commerce Team`;
        break;
      case 'shipped':
        subject = `Order Shipped - #${order.id}`;
        content = `Hello ${order.userName},\n\nGreat news! Your order has been shipped and is on its way to you.\n\nTracking information will be provided soon.\n\nBest regards,\nThe E-commerce Team`;
        break;
      case 'delivered':
        subject = `Order Delivered - #${order.id}`;
        content = `Hello ${order.userName},\n\nYour order has been delivered! We hope you enjoy your purchase.\n\nPlease consider leaving a review.\n\nBest regards,\nThe E-commerce Team`;
        break;
      case 'cancelled':
        subject = `Order Cancelled - #${order.id}`;
        content = `Hello ${order.userName},\n\nYour order has been cancelled as requested.\n\nAny payments will be refunded within 3-5 business days.\n\nBest regards,\nThe E-commerce Team`;
        break;
      default:
        return res.status(200).send(); // Skip notification for other statuses
    }
    
    await fetch(`http://localhost:${port}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: NOTIFICATION_TYPES.EMAIL,
        recipient: order.userEmail,
        subject,
        content,
        metadata: { orderId: order.id, userId: order.userId, status: newStatus, eventType: 'order-status-updated' }
      })
    });
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order status updated event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle payment completed events
app.post('/events/payment-completed', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Payment completed event received:', data);
    
    // This could trigger additional notifications if needed
    // For now, we'll just log it since order confirmation handles the main notification
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling payment completed event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle order shipped events
app.post('/events/order-shipped', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Order shipped event received:', data);
    
    // This is handled by order-status-updated event
    // Keeping this for potential additional logic
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order shipped event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Handle reorder needed events
app.post('/events/reorder-needed', async (req, res) => {
  try {
    const { data } = req.body;
    console.log('Reorder needed event received:', data);
    
    const { productId, currentQuantity, reorderLevel, suggestedReorderQuantity } = data;
    
    // Send alert to admin/inventory team
    await fetch(`http://localhost:${port}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: NOTIFICATION_TYPES.EMAIL,
        recipient: 'inventory@company.com',
        subject: `Low Stock Alert - Product ${productId}`,
        content: `Alert: Product ${productId} is running low on stock.\n\nCurrent Quantity: ${currentQuantity}\nReorder Level: ${reorderLevel}\nSuggested Reorder Quantity: ${suggestedReorderQuantity}\n\nPlease restock immediately.\n\nInventory Management System`,
        metadata: { productId, currentQuantity, reorderLevel, eventType: 'reorder-needed' }
      })
    });
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling reorder needed event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Start server
const server = app.listen(port, () => {
  console.log(`Notification Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
  console.log('Available notification types:', Object.values(NOTIFICATION_TYPES));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Notification Service stopped');
    process.exit(0);
  });
});

module.exports = app;
