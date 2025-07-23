namespace ProductService.Models;

public class Product
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Stock { get; set; }
    public string? ImageUrl { get; set; }
    public List<string> Tags { get; set; } = new List<string>();
    public Dictionary<string, object> Specifications { get; set; } = new Dictionary<string, object>();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string Status { get; set; } = "active";
}

public class CreateProductRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Stock { get; set; }
    public string? ImageUrl { get; set; }
    public List<string>? Tags { get; set; }
    public Dictionary<string, object>? Specifications { get; set; }
}

public class UpdateProductRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public decimal? Price { get; set; }
    public string? Category { get; set; }
    public int? Stock { get; set; }
    public string? ImageUrl { get; set; }
    public List<string>? Tags { get; set; }
    public Dictionary<string, object>? Specifications { get; set; }
    public string? Status { get; set; }
}

public class ProductsResponse
{
    public List<Product> Products { get; set; } = new List<Product>();
    public PaginationInfo Pagination { get; set; } = new PaginationInfo();
    public Dictionary<string, object> Filters { get; set; } = new Dictionary<string, object>();
}

public class PaginationInfo
{
    public int Page { get; set; }
    public int Limit { get; set; }
    public int Total { get; set; }
    public int TotalPages { get; set; }
}

public class ProductUpdatedEvent
{
    public string ProductId { get; set; } = string.Empty;
    public Product Product { get; set; } = new Product();
    public object Changes { get; set; } = new object();
}

public class ProductDeletedEvent
{
    public string ProductId { get; set; } = string.Empty;
    public Product Product { get; set; } = new Product();
}
