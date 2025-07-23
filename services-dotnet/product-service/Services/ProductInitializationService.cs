using Dapr.Client;
using ProductService.Models;

namespace ProductService.Services;

public class ProductInitializationService
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<ProductInitializationService> _logger;
    private const string ProductStore = "product-store";

    public ProductInitializationService(DaprClient daprClient, ILogger<ProductInitializationService> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    public async Task InitializeSampleProductsAsync()
    {
        try
        {
            // Check if products already exist
            var existingProducts = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list");
            if (existingProducts != null && existingProducts.Any())
            {
                _logger.LogInformation("Products already initialized");
                return;
            }

            var sampleProducts = new List<Product>
            {
                new Product
                {
                    Id = "1",
                    Name = "MacBook Pro 16\"",
                    Description = "Apple MacBook Pro 16-inch with M3 chip",
                    Price = 2499.99m,
                    Category = "electronics",
                    Stock = 10,
                    ImageUrl = "https://example.com/macbook.jpg",
                    Tags = new List<string> { "apple", "laptop", "professional" },
                    Specifications = new Dictionary<string, object>
                    {
                        { "processor", "Apple M3" },
                        { "memory", "16GB" },
                        { "storage", "512GB SSD" },
                        { "display", "16-inch Retina" }
                    },
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    Status = "active"
                },
                new Product
                {
                    Id = "2",
                    Name = "iPhone 15 Pro",
                    Description = "Latest iPhone with A17 Pro chip",
                    Price = 999.99m,
                    Category = "electronics",
                    Stock = 25,
                    ImageUrl = "https://example.com/iphone.jpg",
                    Tags = new List<string> { "apple", "smartphone", "mobile" },
                    Specifications = new Dictionary<string, object>
                    {
                        { "processor", "A17 Pro" },
                        { "memory", "128GB" },
                        { "camera", "48MP" },
                        { "display", "6.1-inch Super Retina XDR" }
                    },
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    Status = "active"
                },
                new Product
                {
                    Id = "3",
                    Name = "Nike Air Max 270",
                    Description = "Comfortable running shoes",
                    Price = 150.00m,
                    Category = "fashion",
                    Stock = 50,
                    ImageUrl = "https://example.com/nike.jpg",
                    Tags = new List<string> { "nike", "shoes", "running", "sport" },
                    Specifications = new Dictionary<string, object>
                    {
                        { "brand", "Nike" },
                        { "type", "Running Shoes" },
                        { "material", "Mesh/Synthetic" },
                        { "sizes", new[] { "7", "8", "9", "10", "11", "12" } }
                    },
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    Status = "active"
                }
            };

            // Save individual products
            foreach (var product in sampleProducts)
            {
                await _daprClient.SaveStateAsync(ProductStore, product.Id, product);
            }

            // Save product list for easy retrieval
            await _daprClient.SaveStateAsync(ProductStore, "product-list", sampleProducts);

            _logger.LogInformation("Sample products initialized: {ProductCount}", sampleProducts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initializing sample products");
        }
    }
}
