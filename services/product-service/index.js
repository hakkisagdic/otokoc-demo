const express = require('express');
const { DaprClient } = require('@dapr/dapr');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3002;
const daprPort = process.env.DAPR_HTTP_PORT || 3502;

// Dapr client
const daprClient = new DaprClient({ daprHost: '127.0.0.1', daprPort });

app.use(express.json());

// State store names
const PRODUCT_STORE = 'product-store';
const CATEGORY_STORE = 'product-store';

// Sample product data for demo
const sampleProducts = [
  {
    id: '1',
    name: 'MacBook Pro 16"',
    description: 'Apple MacBook Pro 16-inch with M3 chip',
    price: 2499.99,
    category: 'electronics',
    stock: 10,
    imageUrl: 'https://example.com/macbook.jpg',
    tags: ['apple', 'laptop', 'professional'],
    specifications: {
      processor: 'Apple M3',
      memory: '16GB',
      storage: '512GB SSD',
      display: '16-inch Retina'
    }
  },
  {
    id: '2',
    name: 'iPhone 15 Pro',
    description: 'Latest iPhone with A17 Pro chip',
    price: 999.99,
    category: 'electronics',
    stock: 25,
    imageUrl: 'https://example.com/iphone.jpg',
    tags: ['apple', 'smartphone', 'mobile'],
    specifications: {
      processor: 'A17 Pro',
      memory: '128GB',
      camera: '48MP',
      display: '6.1-inch Super Retina XDR'
    }
  },
  {
    id: '3',
    name: 'Nike Air Max 270',
    description: 'Comfortable running shoes',
    price: 150.00,
    category: 'fashion',
    stock: 50,
    imageUrl: 'https://example.com/nike.jpg',
    tags: ['nike', 'shoes', 'running', 'sport'],
    specifications: {
      brand: 'Nike',
      type: 'Running Shoes',
      material: 'Mesh/Synthetic',
      sizes: ['7', '8', '9', '10', '11', '12']
    }
  }
];

// Initialize sample data
async function initializeSampleData() {
  try {
    // Check if products already exist
    const existingProduct = await daprClient.state.get(PRODUCT_STORE, '1');
    if (!existingProduct) {
      console.log('Initializing sample product data...');
      
      // Save sample products
      const stateOperations = sampleProducts.map(product => ({
        key: product.id,
        value: {
          ...product,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active'
        }
      }));
      
      await daprClient.state.save(PRODUCT_STORE, stateOperations);
      
      // Save product list for easy retrieval
      await daprClient.state.save(PRODUCT_STORE, [
        {
          key: 'product-list',
          value: sampleProducts.map(p => p.id)
        }
      ]);
      
      console.log('Sample data initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
}

// API Endpoints

// Get all products
app.get('/products', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    
    // Get product list
    const productIds = await daprClient.state.get(PRODUCT_STORE, 'product-list') || [];
    
    // Get all products
    const products = [];
    for (const id of productIds) {
      const product = await daprClient.state.get(PRODUCT_STORE, id);
      if (product && product.status === 'active') {
        products.push(product);
      }
    }
    
    // Apply filters
    let filteredProducts = products;
    
    if (category) {
      filteredProducts = filteredProducts.filter(p => 
        p.category.toLowerCase() === category.toLowerCase()
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
    
    res.json({
      products: paginatedProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredProducts.length,
        totalPages: Math.ceil(filteredProducts.length / limit)
      },
      filters: {
        category,
        search
      }
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by ID
app.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await daprClient.state.get(PRODUCT_STORE, id);
    
    if (!product || product.status !== 'active') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product
app.post('/products', async (req, res) => {
  try {
    const { name, description, price, category, stock, imageUrl, tags, specifications } = req.body;
    
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price and category are required' });
    }
    
    const productId = uuidv4();
    const product = {
      id: productId,
      name,
      description,
      price: parseFloat(price),
      category,
      stock: parseInt(stock) || 0,
      imageUrl,
      tags: tags || [],
      specifications: specifications || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active'
    };
    
    // Save product
    await daprClient.state.save(PRODUCT_STORE, [
      {
        key: productId,
        value: product
      }
    ]);
    
    // Update product list
    const productIds = await daprClient.state.get(PRODUCT_STORE, 'product-list') || [];
    productIds.push(productId);
    await daprClient.state.save(PRODUCT_STORE, [
      {
        key: 'product-list',
        value: productIds
      }
    ]);
    
    console.log(`Product created: ${productId}`);
    
    // Publish product created event
    await daprClient.pubsub.publish('order-pubsub', 'product-created', {
      productId,
      product
    });
    
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const existingProduct = await daprClient.state.get(PRODUCT_STORE, id);
    
    if (!existingProduct || existingProduct.status !== 'active') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const updatedProduct = {
      ...existingProduct,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Convert price to number if provided
    if (updates.price) {
      updatedProduct.price = parseFloat(updates.price);
    }
    
    // Convert stock to number if provided
    if (updates.stock) {
      updatedProduct.stock = parseInt(updates.stock);
    }
    
    await daprClient.state.save(PRODUCT_STORE, [
      {
        key: id,
        value: updatedProduct
      }
    ]);
    
    console.log(`Product updated: ${id}`);
    
    // Publish product updated event
    await daprClient.pubsub.publish('order-pubsub', 'product-updated', {
      productId: id,
      product: updatedProduct,
      changes: updates
    });
    
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check product availability
app.post('/products/:id/check-availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity = 1 } = req.body;
    
    const product = await daprClient.state.get(PRODUCT_STORE, id);
    
    if (!product || product.status !== 'active') {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const available = product.stock >= quantity;
    
    res.json({
      productId: id,
      requestedQuantity: quantity,
      availableStock: product.stock,
      available,
      product: {
        id: product.id,
        name: product.name,
        price: product.price
      }
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get categories
app.get('/categories', async (req, res) => {
  try {
    // Get all products and extract unique categories
    const productIds = await daprClient.state.get(PRODUCT_STORE, 'product-list') || [];
    const categories = new Set();
    
    for (const id of productIds) {
      const product = await daprClient.state.get(PRODUCT_STORE, id);
      if (product && product.status === 'active') {
        categories.add(product.category);
      }
    }
    
    res.json({
      categories: Array.from(categories).sort()
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'product-service',
    timestamp: new Date().toISOString()
  });
});

// Dapr pub/sub subscription configuration
app.get('/dapr/subscribe', (req, res) => {
  res.json([
    {
      pubsubname: 'order-pubsub',
      topic: 'inventory-updated',
      route: '/events/inventory-updated'
    }
  ]);
});

// Handle inventory updated events
app.post('/events/inventory-updated', async (req, res) => {
  try {
    console.log('Inventory updated event received:', req.body);
    
    // Dapr pub/sub event format: { data: {...}, ... } or direct data
    const eventData = req.body.data || req.body;
    const { productId, newStock } = eventData;
    
    // Update product stock
    const product = await daprClient.state.get(PRODUCT_STORE, productId);
    if (product) {
      product.stock = newStock;
      product.updatedAt = new Date().toISOString();
      
      await daprClient.state.save(PRODUCT_STORE, [
        {
          key: productId,
          value: product
        }
      ]);
      
      console.log(`Product stock updated: ${productId} -> ${newStock}`);
    }
    
    res.status(200).send();
  } catch (error) {
    console.error('Error handling inventory updated event:', error);
    res.status(500).json({ error: 'Event handling failed' });
  }
});

// Start server
const server = app.listen(port, async () => {
  console.log(`Product Service running on port ${port}`);
  console.log(`Dapr sidecar expected on port ${daprPort}`);
  
  // Initialize sample data
  await initializeSampleData();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Product Service stopped');
    process.exit(0);
  });
});

module.exports = app;
