using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace PaymentService.Controllers;

[ApiController]
[Route("[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly DaprClient _daprClient;
    private readonly ILogger<PaymentsController> _logger;
    private const string PaymentStore = "payment-store";
    private const string PubSubName = "order-pubsub";

    public PaymentsController(DaprClient daprClient, ILogger<PaymentsController> logger)
    {
        _daprClient = daprClient;
        _logger = logger;
    }

    [HttpPost("process")]
    public async Task<ActionResult<object>> ProcessPayment([FromBody] ProcessPaymentRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.OrderId) || request.Amount <= 0)
            {
                return BadRequest(new { error = "Order ID and amount are required" });
            }

            if (!Enum.TryParse<PaymentMethod>(request.PaymentMethod, true, out var paymentMethod))
            {
                return BadRequest(new
                {
                    error = "Invalid payment method",
                    validMethods = Enum.GetNames<PaymentMethod>()
                });
            }

            var paymentId = Guid.NewGuid().ToString();

            // Create initial payment record
            var payment = new Payment
            {
                Id = paymentId,
                OrderId = request.OrderId,
                Amount = request.Amount,
                PaymentMethod = paymentMethod.ToString().ToLower().Replace("_", " "),
                Status = PaymentStatus.Processing,
                CreatedAt = DateTime.UtcNow.ToString("O"),
                UpdatedAt = DateTime.UtcNow.ToString("O")
            };

            await _daprClient.SaveStateAsync(PaymentStore, paymentId, payment);

            try
            {
                // Simulate payment gateway processing
                var gatewayResponse = await SimulatePaymentGateway(request.Amount, paymentMethod, request.PaymentDetails);

                // Update payment with success
                payment.Status = PaymentStatus.Completed;
                payment.AuthCode = gatewayResponse.AuthCode;
                payment.GatewayTransactionId = gatewayResponse.TransactionId;
                payment.ProcessedAt = DateTime.UtcNow.ToString("O");
                payment.UpdatedAt = DateTime.UtcNow.ToString("O");

                await _daprClient.SaveStateAsync(PaymentStore, paymentId, payment);

                _logger.LogInformation("Payment processed successfully for order {OrderId}: {PaymentId}", 
                    request.OrderId, paymentId);

                // Publish payment completed event
                await _daprClient.PublishEventAsync(PubSubName, "payment-completed", new
                {
                    paymentId,
                    orderId = request.OrderId,
                    payment
                });

                return Ok(new
                {
                    paymentId,
                    status = payment.Status.ToString().ToLower(),
                    message = "Payment processed successfully",
                    authCode = payment.AuthCode,
                    processedAt = payment.ProcessedAt
                });
            }
            catch (Exception gatewayEx)
            {
                _logger.LogError(gatewayEx, "Payment gateway error for order {OrderId}", request.OrderId);

                // Update payment with failure
                payment.Status = PaymentStatus.Failed;
                payment.ErrorMessage = gatewayEx.Message;
                payment.FailedAt = DateTime.UtcNow.ToString("O");
                payment.UpdatedAt = DateTime.UtcNow.ToString("O");

                await _daprClient.SaveStateAsync(PaymentStore, paymentId, payment);

                // Publish payment failed event
                await _daprClient.PublishEventAsync(PubSubName, "payment-failed", new
                {
                    paymentId,
                    orderId = request.OrderId,
                    payment,
                    error = gatewayEx.Message
                });

                return BadRequest(new
                {
                    paymentId,
                    status = payment.Status.ToString().ToLower(),
                    error = "Payment processing failed",
                    message = gatewayEx.Message
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing payment for order {OrderId}", request.OrderId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<object>> GetPayment(string id)
    {
        try
        {
            var payment = await _daprClient.GetStateAsync<Payment>(PaymentStore, id);

            if (payment == null)
            {
                return NotFound(new { error = "Payment not found" });
            }

            // Remove sensitive information from response
            return Ok(new
            {
                payment.Id,
                payment.OrderId,
                payment.Amount,
                payment.PaymentMethod,
                payment.Status,
                payment.CreatedAt,
                payment.UpdatedAt,
                payment.ProcessedAt,
                payment.AuthCode,
                gatewayTransactionId = !string.IsNullOrEmpty(payment.GatewayTransactionId) 
                    ? $"***{payment.GatewayTransactionId[^4..]}" 
                    : null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting payment {PaymentId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("{id}/refund")]
    public async Task<ActionResult<object>> RefundPayment(string id, [FromBody] RefundPaymentRequest request)
    {
        try
        {
            var payment = await _daprClient.GetStateAsync<Payment>(PaymentStore, id);

            if (payment == null)
            {
                return NotFound(new { error = "Payment not found" });
            }

            if (payment.Status != PaymentStatus.Completed)
            {
                return BadRequest(new { error = "Only completed payments can be refunded" });
            }

            var refundAmount = request.Amount ?? payment.Amount;

            if (refundAmount > payment.Amount)
            {
                return BadRequest(new { error = "Refund amount cannot exceed original payment amount" });
            }

            // Simulate refund processing
            var refundId = Guid.NewGuid().ToString();

            try
            {
                // Simulate gateway refund call
                await Task.Delay(1000); // Simulate API call delay

                // Update payment with refund information
                payment.Status = PaymentStatus.Refunded;
                payment.RefundId = refundId;
                payment.RefundAmount = refundAmount;
                payment.RefundReason = request.Reason;
                payment.RefundedAt = DateTime.UtcNow.ToString("O");
                payment.UpdatedAt = DateTime.UtcNow.ToString("O");

                await _daprClient.SaveStateAsync(PaymentStore, id, payment);

                _logger.LogInformation("Refund processed for payment {PaymentId}: {RefundAmount}", 
                    id, refundAmount);

                // Publish payment refunded event
                await _daprClient.PublishEventAsync(PubSubName, "payment-refunded", new
                {
                    paymentId = id,
                    refundId,
                    orderId = payment.OrderId,
                    refundAmount,
                    originalAmount = payment.Amount,
                    reason = request.Reason
                });

                return Ok(new
                {
                    message = "Refund processed successfully",
                    refundId,
                    refundAmount,
                    processedAt = payment.RefundedAt
                });
            }
            catch (Exception refundEx)
            {
                _logger.LogError(refundEx, "Refund processing failed for payment {PaymentId}", id);
                return BadRequest(new { error = "Refund processing failed" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing refund for payment {PaymentId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("payment-methods")]
    public ActionResult<object> GetPaymentMethods()
    {
        return Ok(new
        {
            methods = Enum.GetValues<PaymentMethod>().Select(method => new
            {
                id = method.ToString().ToLower(),
                name = method.ToString().Replace("_", " "),
                enabled = true
            })
        });
    }

    [HttpGet("health")]
    public ActionResult<object> Health()
    {
        return Ok(new
        {
            status = "healthy",
            service = "payment-service",
            timestamp = DateTime.UtcNow.ToString("O"),
            gatewayConnections = new
            {
                creditCard = "online",
                paypal = "online",
                bankTransfer = "online"
            }
        });
    }

    private static async Task<PaymentGatewayResponse> SimulatePaymentGateway(decimal amount, PaymentMethod paymentMethod, object? paymentDetails)
    {
        await Task.Delay(Random.Shared.Next(500, 2000)); // Simulate processing time

        // Simulate occasional failures (5% chance)
        if (Random.Shared.NextDouble() < 0.05)
        {
            throw new Exception("Payment gateway temporarily unavailable");
        }

        return new PaymentGatewayResponse
        {
            Success = true,
            AuthCode = $"AUTH{Random.Shared.Next(100000, 999999)}",
            TransactionId = $"TXN_{Guid.NewGuid():N}[..16]"
        };
    }
}

// Data models
public class Payment
{
    public string Id { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public PaymentStatus Status { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string? ProcessedAt { get; set; }
    public string? FailedAt { get; set; }
    public string? RefundedAt { get; set; }
    public string? AuthCode { get; set; }
    public string? GatewayTransactionId { get; set; }
    public string? ErrorMessage { get; set; }
    public string? RefundId { get; set; }
    public decimal? RefundAmount { get; set; }
    public string? RefundReason { get; set; }
}

public enum PaymentStatus
{
    Pending,
    Processing,
    Completed,
    Failed,
    Refunded
}

public enum PaymentMethod
{
    Credit_Card,
    Debit_Card,
    Paypal,
    Bank_Transfer
}

public class ProcessPaymentRequest
{
    public string OrderId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = "credit_card";
    public object? PaymentDetails { get; set; }
}

public class RefundPaymentRequest
{
    public decimal? Amount { get; set; }
    public string? Reason { get; set; }
}

public class PaymentGatewayResponse
{
    public bool Success { get; set; }
    public string AuthCode { get; set; } = string.Empty;
    public string TransactionId { get; set; } = string.Empty;
}
