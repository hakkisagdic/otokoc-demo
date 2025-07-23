const express = require('express');
const { DaprClient } = require('@dapr/dapr');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3004;
const daprPort = process.env.DAPR_HTTP_PORT || 3504;

// Dapr client
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });

app.use(express.json());

// State store names
const PAYMENT_STORE = 'payment-store';

// Payment statuses
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

// Payment methods
const PAYMENT_METHODS = {
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  PAYPAL: 'paypal',
  BANK_TRANSFER: 'bank_transfer'
};

// Simulate payment gateway responses
function simulatePaymentGateway(amount, paymentMethod, paymentDetails) {
  return new Promise((resolve, reject) => {
    // Simulate network delay
    setTimeout(() => {
      // Simulate 90% success rate
      const success = Math.random() > 0.1;
      
      if (success) {
        resolve({
          gatewayTransactionId: `gw_${uuidv4()}`,
          gatewayResponse: 'approved',
          authCode: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          processedAt: new Date().toISOString()
        });
      } else {
        reject(new Error('Payment gateway declined'));
      }
    }, Math.random() * 1000 + 500); // 500-1500ms delay
  });
}

// API Endpoints

// Process payment
app.post('/payments/process', async (req, res) => {
  try {
    const { orderId, amount, paymentMethod = PAYMENT_METHODS.CREDIT_CARD, paymentDetails } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount are required' });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    
    if (!Object.values(PAYMENT_METHODS).includes(paymentMethod)) {
      return res.status(400).json({ 
        error: 'Invalid payment method',
        validMethods: Object.values(PAYMENT_METHODS)
      });
    }
    
    const paymentId = uuidv4();
    
    // Create initial payment record
    const payment = {
      id: paymentId,
      orderId,
      amount: parseFloat(amount),
      paymentMethod,
      status: PAYMENT_STATUS.PROCESSING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Save payment to state store
    await daprClient.state.save(PAYMENT_STORE, [
      {
        key: paymentId,
        value: payment
      }
    ]);
    
    console.log(`Payment processing started: ${paymentId} for order: ${orderId}`);
    
    try {
      // Process payment through gateway (simulated)
      const gatewayResult = await simulatePaymentGateway(amount, paymentMethod, paymentDetails);
      
      // Update payment with success
      payment.status = PAYMENT_STATUS.COMPLETED;
      payment.gatewayTransactionId = gatewayResult.gatewayTransactionId;
      payment.gatewayResponse = gatewayResult.gatewayResponse;
      payment.authCode = gatewayResult.authCode;
      payment.processedAt = gatewayResult.processedAt;
      payment.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(PAYMENT_STORE, [
        {
          key: paymentId,
          value: payment
        }
      ]);
      
      console.log(`Payment completed: ${paymentId}`);
      
      // Publish payment completed event
      await daprClient.pubsub.publish('order-pubsub', 'payment-completed', {
        paymentId,
        orderId,
        payment
      });
      
      res.json({
        paymentId,
        status: payment.status,
        message: 'Payment processed successfully',
        authCode: payment.authCode,
        processedAt: payment.processedAt
      });
      
    } catch (error) {
      console.error('Payment gateway error:', error);
      
      // Update payment with failure
      payment.status = PAYMENT_STATUS.FAILED;
      payment.errorMessage = error.message;
      payment.failedAt = new Date().toISOString();
      payment.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(PAYMENT_STORE, [
        {
          key: paymentId,
          value: payment
        }
      ]);
      
      // Publish payment failed event
      await daprClient.pubsub.publish('order-pubsub', 'payment-failed', {
        paymentId,
        orderId,
        payment,
        error: error.message
      });
      
      res.status(400).json({
        paymentId,
        status: payment.status,
        error: 'Payment processing failed',
        message: error.message
      });
    }
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment by ID
app.get('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const payment = await daprClient.state.get(PAYMENT_STORE, id);
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Remove sensitive information from response
    const sanitizedPayment = {
      ...payment,
      gatewayTransactionId: payment.gatewayTransactionId ? `***${payment.gatewayTransactionId.slice(-4)}` : undefined
    };
    
    res.json(sanitizedPayment);
  } catch (error) {
    console.error('Error getting payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payments for an order
app.get('/orders/:orderId/payments', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // For demo purposes, we'll store payment IDs by order
    // In production, you'd use a proper database query
    const orderPaymentsKey = `order-payments-${orderId}`;
    const paymentIds = await daprClient.state.get(PAYMENT_STORE, orderPaymentsKey) || [];
    
    const payments = [];
    for (const paymentId of paymentIds) {
      const payment = await daprClient.state.get(PAYMENT_STORE, paymentId);
      if (payment) {
        // Sanitize sensitive information
        payments.push({
          ...payment,
          gatewayTransactionId: payment.gatewayTransactionId ? `***${payment.gatewayTransactionId.slice(-4)}` : undefined
        });
      }
    }
    
    res.json({
      orderId,
      payments
    });
  } catch (error) {
    console.error('Error getting order payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refund payment
app.post('/payments/:id/refund', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    
    const payment = await daprClient.state.get(PAYMENT_STORE, id);
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (payment.status !== PAYMENT_STATUS.COMPLETED) {
      return res.status(400).json({ error: 'Only completed payments can be refunded' });
    }
    
    const refundAmount = amount ? parseFloat(amount) : payment.amount;
    
    if (refundAmount > payment.amount) {
      return res.status(400).json({ error: 'Refund amount cannot exceed original payment amount' });
    }
    
    // Simulate refund processing
    const refundId = uuidv4();
    
    try {
      // Simulate gateway refund call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate 95% success rate for refunds
          const success = Math.random() > 0.05;
          if (success) {
            resolve();
          } else {
            reject(new Error('Refund gateway error'));
          }
        }, Math.random() * 500 + 200);
      });
      
      // Update payment record
      payment.status = PAYMENT_STATUS.REFUNDED;
      payment.refundId = refundId;
      payment.refundAmount = refundAmount;
      payment.refundReason = reason;
      payment.refundedAt = new Date().toISOString();
      payment.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(PAYMENT_STORE, [
        {
          key: id,
          value: payment
        }
      ]);
      
      console.log(`Payment refunded: ${id} - Amount: ${refundAmount}`);
      
      // Publish payment refunded event
      await daprClient.pubsub.publish('order-pubsub', 'payment-refunded', {
        paymentId: id,
        orderId: payment.orderId,
        refundId,
        refundAmount,
        reason
      });
      
      res.json({
        message: 'Refund processed successfully',
        refundId,
        refundAmount,
        processedAt: payment.refundedAt
      });
      
    } catch (error) {
      console.error('Refund processing failed:', error);
      res.status(400).json({ error: 'Refund processing failed' });
    }
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payment methods
app.get('/payment-methods', (req, res) => {
  res.json({
    methods: Object.values(PAYMENT_METHODS).map(method => ({
      id: method,
      name: method.replace('_', ' ').replace(/\w\S*/g, txt => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      ),
      enabled: true
    }))
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'payment-service',
    timestamp: new Date().toISOString(),
    gatewayConnections: {
      creditCard: 'online',
      paypal: 'online',
      bankTransfer: 'online'
    }
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'order-cancelled',
      route: '/events/order-cancelled'
    }
  ]);
});

// Handle order cancelled events
app.post('/events/order-cancelled', async (req, res) => {
  try {
    console.log('Order cancelled event received:', req.body);
    
    // Dapr pub/sub event format: { data: {...}, ... } or direct data
    const eventData = req.body.data || req.body;
    const { orderId } = eventData;
    
    // Find payments for this order and initiate refunds if necessary
    const orderPaymentsKey = `order-payments-${orderId}`;
    const paymentIds = await daprClient.state.get(PAYMENT_STORE, orderPaymentsKey) || [];
    
    for (const paymentId of paymentIds) {
      const payment = await daprClient.state.get(PAYMENT_STORE, paymentId);
      if (payment && payment.status === PAYMENT_STATUS.COMPLETED) {
        // Initiate automatic refund
        console.log(`Initiating automatic refund for payment: ${paymentId}`);
        
        // This would trigger the refund endpoint internally
        // For demo purposes, we'll just log it
      }
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling order cancelled event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Middleware to track payments by order
app.use('/payments/process', async (req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // After successful payment processing, track it by order
    if (res.statusCode === 200 && req.body.orderId) {
      (async () => {
        try {
          const result = JSON.parse(data);
          if (result.paymentId) {
            const orderPaymentsKey = `order-payments-${req.body.orderId}`;
            const paymentIds = await daprClient.state.get(PAYMENT_STORE, orderPaymentsKey) || [];
            paymentIds.push(result.paymentId);
            await daprClient.state.save(PAYMENT_STORE, [
              {
                key: orderPaymentsKey,
                value: paymentIds
              }
            ]);
          }
        } catch (error) {
          console.error('Error tracking payment by order:', error);
        }
      })();
    }
    originalSend.call(this, data);
  };
  next();
});

// Start server
const server = app.listen(port, () => {
  console.log(`Payment Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
  console.log('Available payment methods:', Object.values(PAYMENT_METHODS));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Payment Service stopped');
    process.exit(0);
  });
});

module.exports = app;
