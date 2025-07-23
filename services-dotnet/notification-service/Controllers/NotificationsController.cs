using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace NotificationService.Controllers;

[ApiController]
[Route("[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<NotificationsController> _logger;
    private const string NotificationStore = "notification-store";
    private const string PubSubName = "order-pubsub";

    public NotificationsController(DaprClient daprClient, ILogger<NotificationsController> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    [HttpPost("send")]
    public async Task<ActionResult<object>> SendNotification([FromBody] SendNotificationRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.Recipient) || string.IsNullOrEmpty(request.Content))
            {
                return BadRequest(new { error = "Recipient and content are required" });
            }

            if (!Enum.TryParse<NotificationType>(request.Type, true, out var notificationType))
            {
                return BadRequest(new
                {
                    error = "Invalid notification type",
                    validTypes = Enum.GetNames<NotificationType>()
                });
            }

            var notificationId = Guid.NewGuid().ToString();
            var notification = new Notification
            {
                Id = notificationId,
                Type = notificationType,
                Recipient = request.Recipient,
                Subject = request.Subject,
                Content = request.Content,
                Status = NotificationStatus.Pending,
                CreatedAt = DateTime.UtcNow.ToString("O"),
                UpdatedAt = DateTime.UtcNow.ToString("O"),
                MaxAttempts = 3,
                Attempts = 0,
                Metadata = request.Metadata ?? new Dictionary<string, object>()
            };

            await _daprClient.SaveStateAsync(NotificationStore, notificationId, notification);

            try
            {
                // Simulate sending notification
                var result = await SimulateNotificationSending(notificationType, request.Recipient, request.Content);

                // Update notification with success
                notification.Status = NotificationStatus.Sent;
                notification.MessageId = result.MessageId;
                notification.Provider = result.Provider;
                notification.SentAt = DateTime.UtcNow.ToString("O");
                notification.UpdatedAt = DateTime.UtcNow.ToString("O");
                notification.Attempts = 1;

                await _daprClient.SaveStateAsync(NotificationStore, notificationId, notification);

                _logger.LogInformation("Notification sent successfully: {NotificationId} to {Recipient}", 
                    notificationId, request.Recipient);

                return Ok(new
                {
                    notificationId,
                    status = notification.Status.ToString().ToLower(),
                    messageId = notification.MessageId,
                    sentAt = notification.SentAt
                });
            }
            catch (Exception sendEx)
            {
                _logger.LogError(sendEx, "Failed to send notification {NotificationId}", notificationId);

                // Update notification with failure
                notification.Status = NotificationStatus.Failed;
                notification.ErrorMessage = sendEx.Message;
                notification.FailedAt = DateTime.UtcNow.ToString("O");
                notification.UpdatedAt = DateTime.UtcNow.ToString("O");
                notification.Attempts = 1;

                await _daprClient.SaveStateAsync(NotificationStore, notificationId, notification);

                return StatusCode(500, new
                {
                    notificationId,
                    status = notification.Status.ToString().ToLower(),
                    error = "Failed to send notification",
                    message = sendEx.Message
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending notification");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetNotification(string id)
    {
        try
        {
            var notification = await _daprClient.GetStateAsync<Notification>(NotificationStore, id);

            if (notification == null)
            {
                return NotFound(new { error = "Notification not found" });
            }

            return Ok(new
            {
                notification.Id,
                type = notification.Type.ToString().ToLower(),
                notification.Recipient,
                notification.Subject,
                notification.Content,
                status = notification.Status.ToString().ToLower(),
                notification.CreatedAt,
                notification.UpdatedAt,
                notification.SentAt,
                notification.FailedAt,
                notification.MessageId,
                notification.Provider,
                notification.Attempts,
                notification.MaxAttempts,
                notification.Metadata
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting notification {NotificationId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("bulk")]
    public async Task<ActionResult<object>> SendBulkNotifications([FromBody] BulkNotificationRequest request)
    {
        try
        {
            if (request.Notifications == null || request.Notifications.Count == 0)
            {
                return BadRequest(new { error = "At least one notification is required" });
            }

            var results = new List<object>();
            var successful = 0;
            var failed = 0;

            foreach (var notificationRequest in request.Notifications)
            {
                try
                {
                    if (!Enum.TryParse<NotificationType>(notificationRequest.Type, true, out var notificationType))
                    {
                        results.Add(new
                        {
                            recipient = notificationRequest.Recipient,
                            success = false,
                            error = "Invalid notification type"
                        });
                        failed++;
                        continue;
                    }

                    var notificationId = Guid.NewGuid().ToString();
                    var sendResult = await SimulateNotificationSending(notificationType, notificationRequest.Recipient, notificationRequest.Content);

                    var notification = new Notification
                    {
                        Id = notificationId,
                        Type = notificationType,
                        Recipient = notificationRequest.Recipient,
                        Subject = notificationRequest.Subject,
                        Content = notificationRequest.Content,
                        Status = NotificationStatus.Sent,
                        CreatedAt = DateTime.UtcNow.ToString("O"),
                        UpdatedAt = DateTime.UtcNow.ToString("O"),
                        SentAt = DateTime.UtcNow.ToString("O"),
                        MessageId = sendResult.MessageId,
                        Provider = sendResult.Provider,
                        Attempts = 1,
                        MaxAttempts = 3
                    };

                    await _daprClient.SaveStateAsync(NotificationStore, notificationId, notification);

                    results.Add(new
                    {
                        type = notificationType.ToString().ToLower(),
                        recipient = notificationRequest.Recipient,
                        subject = notificationRequest.Subject,
                        content = notificationRequest.Content,
                        notificationId,
                        status = "sent",
                        messageId = notification.MessageId,
                        sentAt = notification.SentAt,
                        success = true
                    });
                    successful++;
                }
                catch (Exception notificationEx)
                {
                    _logger.LogError(notificationEx, "Failed to send bulk notification to {Recipient}", 
                        notificationRequest.Recipient);

                    results.Add(new
                    {
                        recipient = notificationRequest.Recipient,
                        success = false,
                        error = notificationEx.Message
                    });
                    failed++;
                }
            }

            return Ok(new
            {
                total = request.Notifications.Count,
                successful,
                failed,
                results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending bulk notifications");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "healthy",
            service = "notification-service",
            timestamp = DateTime.UtcNow.ToString("O"),
            providers = new
            {
                email = "online",
                sms = "online",
                push = "online"
            }
        });
    }

    private static async Task<NotificationSendResult> SimulateNotificationSending(NotificationType type, string recipient, string content)
    {
        // Simulate processing time
        await Task.Delay(Random.Shared.Next(200, 1000));

        // Simulate occasional failures (5% chance)
        if (Random.Shared.NextDouble() < 0.05)
        {
            throw new InvalidOperationException($"Failed to send {type.ToString().ToLower()} notification");
        }

        return new NotificationSendResult
        {
            Success = true,
            MessageId = $"msg_{Guid.NewGuid():N}[..16]",
            Provider = type switch
            {
                NotificationType.Email => "SendGrid",
                NotificationType.Sms => "Twilio",
                NotificationType.Push => "Firebase",
                NotificationType.In_App => "Internal",
                _ => "Unknown"
            }
        };
    }
}

// Data models
public class Notification
{
    public string Id { get; set; } = string.Empty;
    public NotificationType Type { get; set; }
    public string Recipient { get; set; } = string.Empty;
    public string? Subject { get; set; }
    public string Content { get; set; } = string.Empty;
    public NotificationStatus Status { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string? SentAt { get; set; }
    public string? FailedAt { get; set; }
    public string? MessageId { get; set; }
    public string? Provider { get; set; }
    public int Attempts { get; set; }
    public int MaxAttempts { get; set; }
    public string? ErrorMessage { get; set; }
    public Dictionary<string, object> Metadata { get; set; } = new();
}

public enum NotificationType
{
    Email,
    Sms,
    Push,
    In_App
}

public enum NotificationStatus
{
    Pending,
    Sent,
    Failed,
    Delivered
}

public class SendNotificationRequest
{
    public string Type { get; set; } = "email";
    public string Recipient { get; set; } = string.Empty;
    public string? Subject { get; set; }
    public string Content { get; set; } = string.Empty;
    public Dictionary<string, object>? Metadata { get; set; }
}

public class BulkNotificationRequest
{
    public List<SendNotificationRequest> Notifications { get; set; } = new();
}

public class NotificationSendResult
{
    public bool Success { get; set; }
    public string MessageId { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
}
