using Dapr;
using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using UserService.Models;

namespace UserService.Controllers;

[ApiController]
[Route("[controller]")]
public class UsersController : ControllerBase
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<UsersController> _logger;
    private const string UserStore = "user-store";
    private const string PubSubName = "order-pubsub";

    public UsersController(DaprClient daprClient, ILogger<UsersController> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    [HttpPost]
    public async Task<ActionResult<User>> CreateUser([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrEmpty(request.Name) || string.IsNullOrEmpty(request.Email))
        {
            return BadRequest(new { error = "Name and email are required" });
        }

        var userId = Guid.NewGuid().ToString();
        var user = new User
        {
            Id = userId,
            Name = request.Name,
            Email = request.Email,
            Phone = request.Phone,
            CreatedAt = DateTime.UtcNow,
            Status = "active"
        };

        try
        {
            // Save to Dapr state store
            await _daprClient.SaveStateAsync(UserStore, userId, user);

            _logger.LogInformation("User created: {UserId}", userId);

            // Publish user created event
            var userCreatedEvent = new UserCreatedEvent
            {
                UserId = userId,
                User = user
            };

            await _daprClient.PublishEventAsync(PubSubName, "user-created", userCreatedEvent);

            return CreatedAtAction(nameof(GetUser), new { id = userId }, user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating user");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetUser(string id)
    {
        try
        {
            var user = await _daprClient.GetStateAsync<User>(UserStore, id);
            
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user {UserId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetUsers([FromQuery] int page = 1, [FromQuery] int limit = 10)
    {
        try
        {
            // Get user list (simplified for demo)
            var userList = await _daprClient.GetStateAsync<List<User>>(UserStore, "user-list") ?? new List<User>();
            
            var startIndex = (page - 1) * limit;
            var paginatedUsers = userList.Skip(startIndex).Take(limit).ToList();

            return Ok(new
            {
                users = paginatedUsers,
                pagination = new
                {
                    page,
                    limit,
                    total = userList.Count,
                    totalPages = (int)Math.Ceiling((double)userList.Count / limit)
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting users");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<User>> UpdateUser(string id, [FromBody] UpdateUserRequest request)
    {
        try
        {
            var existingUser = await _daprClient.GetStateAsync<User>(UserStore, id);
            
            if (existingUser == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // Update fields
            if (!string.IsNullOrEmpty(request.Name))
                existingUser.Name = request.Name;
            if (!string.IsNullOrEmpty(request.Email))
                existingUser.Email = request.Email;
            if (!string.IsNullOrEmpty(request.Phone))
                existingUser.Phone = request.Phone;
            if (!string.IsNullOrEmpty(request.Status))
                existingUser.Status = request.Status;
            
            existingUser.UpdatedAt = DateTime.UtcNow;

            // Save to Dapr state store
            await _daprClient.SaveStateAsync(UserStore, id, existingUser);

            _logger.LogInformation("User updated: {UserId}", id);

            // Publish user updated event
            var userUpdatedEvent = new UserUpdatedEvent
            {
                UserId = id,
                User = existingUser,
                Changes = request
            };

            await _daprClient.PublishEventAsync(PubSubName, "user-updated", userUpdatedEvent);

            return Ok(existingUser);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating user {UserId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteUser(string id)
    {
        try
        {
            var existingUser = await _daprClient.GetStateAsync<User>(UserStore, id);
            
            if (existingUser == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // Delete from Dapr state store
            await _daprClient.DeleteStateAsync(UserStore, id);

            _logger.LogInformation("User deleted: {UserId}", id);

            // Publish user deleted event
            var userDeletedEvent = new UserDeletedEvent
            {
                UserId = id,
                User = existingUser
            };

            await _daprClient.PublishEventAsync(PubSubName, "user-deleted", userDeletedEvent);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting user {UserId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "healthy",
            service = "user-service",
            timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        });
    }

    // Event handlers
    [Topic(PubSubName, "order-created")]
    [HttpPost("events/order-created")]
    public async Task<ActionResult> HandleOrderCreated([FromBody] OrderCreatedEvent orderEvent)
    {
        try
        {
            _logger.LogInformation("Order created event received: {OrderId}", orderEvent.OrderId);
            
            // You could update user statistics, send notifications, etc.
            // For demo purposes, we'll just log it
            
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling order created event");
            return StatusCode(500, new { error = "Event handling failed" });
        }
    }
}
