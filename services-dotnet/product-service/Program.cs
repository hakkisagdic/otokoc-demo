using Dapr.Client;
using Microsoft.AspNetCore.Mvc;
using ProductService.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers().AddDapr();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add application services
builder.Services.AddScoped<ProductInitializationService>();

var app = builder.Build();

// Configure pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();
app.MapControllers();

// Add Dapr pub/sub
app.MapSubscribeHandler();

// Initialize sample products
using (var scope = app.Services.CreateScope())
{
    var productInitService = scope.ServiceProvider.GetRequiredService<ProductInitializationService>();
    await productInitService.InitializeSampleProductsAsync();
}

app.Run();
