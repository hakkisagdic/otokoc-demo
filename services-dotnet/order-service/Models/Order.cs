namespace OrderService.Models;

public class Order
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public List<OrderItem> Items { get; set; } = new List<OrderItem>();
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = "pending";
    public ShippingAddress ShippingAddress { get; set; } = new ShippingAddress();
    public string PaymentMethod { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? PaymentId { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancellationReason { get; set; }
    public List<StatusNote>? StatusNotes { get; set; }
}

public class OrderItem
{
    public string ProductId { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal TotalPrice { get; set; }
}

public class ShippingAddress
{
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? ZipCode { get; set; }
}

public class StatusNote
{
    public string Status { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class CreateOrderRequest
{
    public string UserId { get; set; } = string.Empty;
    public List<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ShippingAddress? ShippingAddress { get; set; }
    public string PaymentMethod { get; set; } = "credit_card";
}

public class UpdateOrderStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class CancelOrderRequest
{
    public string Reason { get; set; } = "Customer changed mind";
}

public class OrdersResponse
{
    public List<Order> Orders { get; set; } = new List<Order>();
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

// Events
public class OrderCreatedEvent
{
    public string OrderId { get; set; } = string.Empty;
    public Order Order { get; set; } = new Order();
}

public class OrderUpdatedEvent
{
    public string OrderId { get; set; } = string.Empty;
    public Order Order { get; set; } = new Order();
    public string PreviousStatus { get; set; } = string.Empty;
}

public class OrderCancelledEvent
{
    public string OrderId { get; set; } = string.Empty;
    public Order Order { get; set; } = new Order();
    public string Reason { get; set; } = string.Empty;
}

public class PaymentProcessedEvent
{
    public string OrderId { get; set; } = string.Empty;
    public string PaymentId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; }
}
