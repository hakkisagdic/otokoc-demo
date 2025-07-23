using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using ProductService.Models;

namespace ProductService.Controllers;

[ApiController]
[Route("[controller]")]
public class ProductsController : ControllerBase
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<ProductsController> _logger;
    private const string ProductStore = "product-store";
    private const string PubSubName = "order-pubsub";

    public ProductsController(DaprClient daprClient, ILogger<ProductsController> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    [HttpPost]
    public async Task<ActionResult<Product>> CreateProduct([FromBody] CreateProductRequest request)
    {
        if (string.IsNullOrEmpty(request.Name) || request.Price <= 0)
        {
            return BadRequest(new { error = "Name and valid price are required" });
        }

        var productId = Guid.NewGuid().ToString();
        var product = new Product
        {
            Id = productId,
            Name = request.Name,
            Description = request.Description,
            Price = request.Price,
            Category = request.Category,
            Stock = request.Stock,
            ImageUrl = request.ImageUrl,
            Tags = request.Tags ?? new List<string>(),
            Specifications = request.Specifications ?? new Dictionary<string, object>(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Status = "active"
        };

        try
        {
            // Save to Dapr state store
            await _daprClient.SaveStateAsync(ProductStore, productId, product);

            // Update product list
            var productList = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list") ?? new List<Product>();
            productList.Add(product);
            await _daprClient.SaveStateAsync(ProductStore, "product-list", productList);

            _logger.LogInformation("Product created: {ProductId}", productId);

            return CreatedAtAction(nameof(GetProduct), new { id = productId }, product);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating product");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(string id)
    {
        try
        {
            var product = await _daprClient.GetStateAsync<Product>(ProductStore, id);
            
            if (product == null)
            {
                return NotFound(new { error = "Product not found" });
            }

            return Ok(product);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting product {ProductId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet]
    public async Task<ActionResult<ProductsResponse>> GetProducts(
        [FromQuery] int page = 1, 
        [FromQuery] int limit = 10,
        [FromQuery] string? category = null,
        [FromQuery] decimal? minPrice = null,
        [FromQuery] decimal? maxPrice = null,
        [FromQuery] string? search = null)
    {
        try
        {
            var productList = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list") ?? new List<Product>();
            
            // Apply filters
            var filteredProducts = productList.Where(p => p.Status == "active");

            if (!string.IsNullOrEmpty(category))
            {
                filteredProducts = filteredProducts.Where(p => p.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
            }

            if (minPrice.HasValue)
            {
                filteredProducts = filteredProducts.Where(p => p.Price >= minPrice.Value);
            }

            if (maxPrice.HasValue)
            {
                filteredProducts = filteredProducts.Where(p => p.Price <= maxPrice.Value);
            }

            if (!string.IsNullOrEmpty(search))
            {
                filteredProducts = filteredProducts.Where(p => 
                    p.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                    p.Description.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                    p.Tags.Any(tag => tag.Contains(search, StringComparison.OrdinalIgnoreCase)));
            }

            var totalProducts = filteredProducts.Count();
            var paginatedProducts = filteredProducts
                .Skip((page - 1) * limit)
                .Take(limit)
                .ToList();

            var response = new ProductsResponse
            {
                Products = paginatedProducts,
                Pagination = new PaginationInfo
                {
                    Page = page,
                    Limit = limit,
                    Total = totalProducts,
                    TotalPages = (int)Math.Ceiling((double)totalProducts / limit)
                },
                Filters = new Dictionary<string, object>()
            };

            if (!string.IsNullOrEmpty(category)) response.Filters["category"] = category;
            if (minPrice.HasValue) response.Filters["minPrice"] = minPrice.Value;
            if (maxPrice.HasValue) response.Filters["maxPrice"] = maxPrice.Value;
            if (!string.IsNullOrEmpty(search)) response.Filters["search"] = search;

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting products");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("categories")]
    public async Task<ActionResult<object>> GetCategories()
    {
        try
        {
            var productList = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list") ?? new List<Product>();
            var categories = productList
                .Where(p => p.Status == "active")
                .Select(p => p.Category)
                .Distinct()
                .OrderBy(c => c)
                .ToList();

            return Ok(new { categories });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting categories");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<Product>> UpdateProduct(string id, [FromBody] UpdateProductRequest request)
    {
        try
        {
            var existingProduct = await _daprClient.GetStateAsync<Product>(ProductStore, id);
            
            if (existingProduct == null)
            {
                return NotFound(new { error = "Product not found" });
            }

            // Update fields
            if (!string.IsNullOrEmpty(request.Name))
                existingProduct.Name = request.Name;
            if (!string.IsNullOrEmpty(request.Description))
                existingProduct.Description = request.Description;
            if (request.Price.HasValue && request.Price.Value > 0)
                existingProduct.Price = request.Price.Value;
            if (!string.IsNullOrEmpty(request.Category))
                existingProduct.Category = request.Category;
            if (request.Stock.HasValue)
                existingProduct.Stock = request.Stock.Value;
            if (!string.IsNullOrEmpty(request.ImageUrl))
                existingProduct.ImageUrl = request.ImageUrl;
            if (request.Tags != null)
                existingProduct.Tags = request.Tags;
            if (request.Specifications != null)
                existingProduct.Specifications = request.Specifications;
            if (!string.IsNullOrEmpty(request.Status))
                existingProduct.Status = request.Status;
            
            existingProduct.UpdatedAt = DateTime.UtcNow;

            // Save to Dapr state store
            await _daprClient.SaveStateAsync(ProductStore, id, existingProduct);

            // Update product list
            var productList = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list") ?? new List<Product>();
            var index = productList.FindIndex(p => p.Id == id);
            if (index >= 0)
            {
                productList[index] = existingProduct;
                await _daprClient.SaveStateAsync(ProductStore, "product-list", productList);
            }

            _logger.LogInformation("Product updated: {ProductId}", id);

            // Publish product updated event
            var productUpdatedEvent = new ProductUpdatedEvent
            {
                ProductId = id,
                Product = existingProduct,
                Changes = request
            };

            await _daprClient.PublishEventAsync(PubSubName, "product-updated", productUpdatedEvent);

            return Ok(existingProduct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating product {ProductId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteProduct(string id)
    {
        try
        {
            var existingProduct = await _daprClient.GetStateAsync<Product>(ProductStore, id);
            
            if (existingProduct == null)
            {
                return NotFound(new { error = "Product not found" });
            }

            // Delete from Dapr state store
            await _daprClient.DeleteStateAsync(ProductStore, id);

            // Update product list
            var productList = await _daprClient.GetStateAsync<List<Product>>(ProductStore, "product-list") ?? new List<Product>();
            productList.RemoveAll(p => p.Id == id);
            await _daprClient.SaveStateAsync(ProductStore, "product-list", productList);

            _logger.LogInformation("Product deleted: {ProductId}", id);

            // Publish product deleted event
            var productDeletedEvent = new ProductDeletedEvent
            {
                ProductId = id,
                Product = existingProduct
            };

            await _daprClient.PublishEventAsync(PubSubName, "product-deleted", productDeletedEvent);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting product {ProductId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "healthy",
            service = "product-service",
            timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        });
    }
}
