namespace UserService.Models;

public class User
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string Status { get; set; } = "active";
}

public class CreateUserRequest
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
}

public class UpdateUserRequest
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Status { get; set; }
}

public class UserCreatedEvent
{
    public string UserId { get; set; } = string.Empty;
    public User User { get; set; } = new User();
}

public class UserUpdatedEvent
{
    public string UserId { get; set; } = string.Empty;
    public User User { get; set; } = new User();
    public object Changes { get; set; } = new object();
}

public class UserDeletedEvent
{
    public string UserId { get; set; } = string.Empty;
    public User User { get; set; } = new User();
}

public class OrderCreatedEvent
{
    public string OrderId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime CreatedAt { get; set; }
}
