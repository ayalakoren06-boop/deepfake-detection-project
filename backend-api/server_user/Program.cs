using WebDeepFence.Services;

var builder = WebApplication.CreateBuilder(args);

// Allow the Angular site and the browser extension to call the API
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Register services
builder.Services.AddSingleton<UserService>();
builder.Services.AddHttpClient<PythonIntegrationService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

app.UseCors("AllowAll");

app.UseAuthorization();
app.MapControllers();

app.Run();
