using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace InventoryService.Controllers;

[ApiController]
[Route("[controller]")]
public class InventoryController : ControllerBase
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<InventoryController> _logger;
    private const string InventoryStore = "inventory-store";
    private const string PubSubName = "order-pubsub";

    public InventoryController(DaprClient daprClient, ILogger<InventoryController> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    [HttpGet("{productId}")]
    public async Task<ActionResult<InventoryItem>> GetInventory(string productId)
    {
        try
        {
            var inventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
            
            if (inventory == null)
            {
                return NotFound(new { error = "Inventory not found for product" });
            }

            return Ok(new
            {
                productId,
                inventory.Quantity,
                inventory.Reserved,
                inventory.Location,
                inventory.ReorderLevel,
                inventory.LastUpdated,
                Available = inventory.Quantity - inventory.Reserved
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting inventory for product {ProductId}", productId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPut("{productId}")]
    public async Task<ActionResult<InventoryItem>> UpdateInventory(string productId, [FromBody] UpdateInventoryRequest request)
    {
        try
        {
            var existingInventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
            
            InventoryItem inventory;
            if (existingInventory == null)
            {
                // Create new inventory record
                inventory = new InventoryItem
                {
                    ProductId = productId,
                    Quantity = request.Quantity ?? 0,
                    Reserved = 0,
                    Location = request.Location ?? "Default",
                    ReorderLevel = request.ReorderLevel ?? 5,
                    LastUpdated = DateTime.UtcNow.ToString("O")
                };
            }
            else
            {
                // Update existing inventory
                inventory = existingInventory;
                if (request.Quantity.HasValue)
                    inventory.Quantity = request.Quantity.Value;
                if (!string.IsNullOrEmpty(request.Location))
                    inventory.Location = request.Location;
                if (request.ReorderLevel.HasValue)
                    inventory.ReorderLevel = request.ReorderLevel.Value;
                inventory.LastUpdated = DateTime.UtcNow.ToString("O");
            }

            await _daprClient.SaveStateAsync(InventoryStore, productId, inventory);
            
            _logger.LogInformation("Inventory updated for product {ProductId}: {Quantity} units at {Location}", 
                productId, inventory.Quantity, inventory.Location);

            // Publish inventory updated event
            await _daprClient.PublishEventAsync(PubSubName, "inventory-updated", new
            {
                productId,
                newStock = inventory.Quantity,
                inventory
            });

            return Ok(new
            {
                productId,
                inventory.Quantity,
                inventory.Reserved,
                inventory.Location,
                inventory.ReorderLevel,
                inventory.LastUpdated,
                Available = inventory.Quantity - inventory.Reserved
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating inventory for product {ProductId}", productId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("{productId}/reserve")]
    public async Task<ActionResult> ReserveInventory(string productId, [FromBody] ReserveInventoryRequest request)
    {
        try
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { error = "Valid quantity is required" });
            }

            var inventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
            
            if (inventory == null)
            {
                return NotFound(new { error = "Inventory not found for product" });
            }

            var availableQuantity = inventory.Quantity - inventory.Reserved;
            if (availableQuantity < request.Quantity)
            {
                return BadRequest(new
                {
                    error = "Insufficient inventory",
                    available = availableQuantity,
                    requested = request.Quantity
                });
            }

            // Reserve the inventory
            inventory.Reserved += request.Quantity;
            inventory.LastUpdated = DateTime.UtcNow.ToString("O");

            await _daprClient.SaveStateAsync(InventoryStore, productId, inventory);
            
            _logger.LogInformation("Reserved {Quantity} units of product {ProductId} for order {OrderId}", 
                request.Quantity, productId, request.OrderId);

            return Ok(new
            {
                message = "Inventory reserved successfully",
                productId,
                reservedQuantity = request.Quantity,
                orderId = request.OrderId,
                availableAfterReservation = inventory.Quantity - inventory.Reserved
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reserving inventory for product {ProductId}", productId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("{productId}/release")]
    public async Task<ActionResult> ReleaseInventory(string productId, [FromBody] ReleaseInventoryRequest request)
    {
        try
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { error = "Valid quantity is required" });
            }

            var inventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
            
            if (inventory == null)
            {
                return NotFound(new { error = "Inventory not found for product" });
            }

            if (inventory.Reserved < request.Quantity)
            {
                return BadRequest(new
                {
                    error = "Cannot release more than reserved",
                    reserved = inventory.Reserved,
                    requested = request.Quantity
                });
            }

            // Release the reserved inventory
            inventory.Reserved -= request.Quantity;
            inventory.LastUpdated = DateTime.UtcNow.ToString("O");

            await _daprClient.SaveStateAsync(InventoryStore, productId, inventory);
            
            _logger.LogInformation("Released {Quantity} units of product {ProductId} for order {OrderId}", 
                request.Quantity, productId, request.OrderId);

            return Ok(new
            {
                message = "Inventory released successfully",
                productId,
                releasedQuantity = request.Quantity,
                orderId = request.OrderId,
                availableAfterRelease = inventory.Quantity - inventory.Reserved
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error releasing inventory for product {ProductId}", productId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("{productId}/fulfill")]
    public async Task<ActionResult> FulfillInventory(string productId, [FromBody] FulfillInventoryRequest request)
    {
        try
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { error = "Valid quantity is required" });
            }

            var inventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
            
            if (inventory == null)
            {
                return NotFound(new { error = "Inventory not found for product" });
            }

            if (inventory.Reserved < request.Quantity)
            {
                return BadRequest(new
                {
                    error = "Cannot fulfill more than reserved",
                    reserved = inventory.Reserved,
                    requested = request.Quantity
                });
            }

            // Fulfill inventory (reduce both quantity and reserved)
            inventory.Quantity -= request.Quantity;
            inventory.Reserved -= request.Quantity;
            inventory.LastUpdated = DateTime.UtcNow.ToString("O");

            await _daprClient.SaveStateAsync(InventoryStore, productId, inventory);
            
            _logger.LogInformation("Fulfilled {Quantity} units of product {ProductId} for order {OrderId}", 
                request.Quantity, productId, request.OrderId);

            // Check if reorder is needed
            if (inventory.Quantity <= inventory.ReorderLevel)
            {
                await _daprClient.PublishEventAsync(PubSubName, "reorder-needed", new
                {
                    productId,
                    currentQuantity = inventory.Quantity,
                    reorderLevel = inventory.ReorderLevel,
                    suggestedOrderQuantity = inventory.ReorderLevel * 2
                });
            }

            return Ok(new
            {
                message = "Inventory fulfilled successfully",
                productId,
                fulfilledQuantity = request.Quantity,
                orderId = request.OrderId,
                remainingQuantity = inventory.Quantity,
                available = inventory.Quantity - inventory.Reserved
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fulfilling inventory for product {ProductId}", productId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("low-stock")]
    public async Task<ActionResult<object>> GetLowStockItems()
    {
        try
        {
            // For demo purposes, we'll check the sample products
            var lowStockItems = new List<object>();
            var sampleProductIds = new[] { "1", "2", "3" };

            foreach (var productId in sampleProductIds)
            {
                var inventory = await _daprClient.GetStateAsync<InventoryItem>(InventoryStore, productId);
                if (inventory != null && inventory.Quantity <= inventory.ReorderLevel)
                {
                    lowStockItems.Add(new
                    {
                        productId = inventory.ProductId ?? productId,
                        currentQuantity = inventory.Quantity,
                        reorderLevel = inventory.ReorderLevel,
                        available = inventory.Quantity - inventory.Reserved,
                        location = inventory.Location
                    });
                }
            }

            return Ok(new
            {
                lowStockItems,
                count = lowStockItems.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting low stock items");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "healthy",
            service = "inventory-service",
            timestamp = DateTime.UtcNow.ToString("O")
        });
    }
}

// Data models
public class InventoryItem
{
    public string? ProductId { get; set; }
    public int Quantity { get; set; }
    public int Reserved { get; set; }
    public string Location { get; set; } = string.Empty;
    public int ReorderLevel { get; set; }
    public string LastUpdated { get; set; } = string.Empty;
}

public class UpdateInventoryRequest
{
    public int? Quantity { get; set; }
    public string? Location { get; set; }
    public int? ReorderLevel { get; set; }
}

public class ReserveInventoryRequest
{
    public int Quantity { get; set; }
    public string OrderId { get; set; } = string.Empty;
}

public class ReleaseInventoryRequest
{
    public int Quantity { get; set; }
    public string OrderId { get; set; } = string.Empty;
}

public class FulfillInventoryRequest
{
    public int Quantity { get; set; }
    public string OrderId { get; set; } = string.Empty;
}
