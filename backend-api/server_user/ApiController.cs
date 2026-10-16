using Microsoft.AspNetCore.Mvc;
using WebDeepFence.Models;
using WebDeepFence.Services;
using System.Text.Json;
using MetadataExtractor;
using System.Linq;

namespace WebDeepFence.Controllers
{
    [ApiController]
    [Route("api")]
    public class ApiController : ControllerBase
    {
        private readonly UserService _userService;
        private readonly PythonIntegrationService _pythonService;

        // Known AI-tool signatures searched for in image metadata
        private readonly string[] _aiSignatures = {
            "Midjourney", "DALL-E", "DALL·E", "Stable Diffusion",
            "Adobe Firefly", "AI generated", "Canva"
        };

        public ApiController(UserService userService, PythonIntegrationService pythonService)
        {
            _userService = userService;
            _pythonService = pythonService;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _userService.LoginAsync(request.Email, request.Name);
            return Ok(user);
        }

        [HttpPost("purchase-scans")]
        public async Task<IActionResult> PurchaseScans([FromBody] PurchaseRequest request)
        {
            var updatedUser = await _userService.UpgradeToProAsync(request.Email);
            if (updatedUser == null) return NotFound(new { error = "User not found" });

            return Ok(new { status = "success", user = updatedUser });
        }


        [HttpGet("user/{email}")]
        public async Task<IActionResult> GetUserDetails(string email)
        {
            var user = await _userService.GetUserByEmailAsync(email);

            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            return Ok(user);
        }



        [HttpPost("scan-image")]
        public async Task<IActionResult> ScanImage([FromForm] ScanRequest request)
        {
            if (request.File == null || request.File.Length == 0)
                return BadRequest(new { error = "No image file was sent" });

            if (string.IsNullOrEmpty(request.Email))
                return BadRequest(new { error = "Missing user email" });

            try
            {
                // 1. Check quota (read only - a scan is charged only after a successful analysis)
                bool hasQuota = await _userService.HasAvailableQuotaAsync(request.Email);
                if (!hasQuota)
                {
                    return StatusCode(403, new { error = "Quota exceeded", message = "You have used all your scans. Please upgrade your plan." });
                }

                // 2. Fast metadata check - skips the AI server if a known AI signature is found
                string? aiSignature = CheckMetadataForAI(request.File);
                if (aiSignature != null)
                {
                    await _userService.DecrementUserQuotaAsync(request.Email);

                    return Ok(new
                    {
                        status = "success",
                        final_decision = new
                        {
                            result = "Fake",
                            confidence = 100,
                            reason = $"AI generator signature found in image metadata ({aiSignature})"
                        }
                    });
                }

                // 3. Deep analysis by the Python AI server
                var pythonResponseJson = await _pythonService.SendImageToPythonAsync(request.File);

                // 4. Charge a scan only if the analysis succeeded
                using var jsonDoc = JsonDocument.Parse(pythonResponseJson);
                if (!jsonDoc.RootElement.TryGetProperty("error", out _))
                {
                    await _userService.DecrementUserQuotaAsync(request.Email);
                }

                return Content(pythonResponseJson, "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Error communicating with the analysis server", details = ex.Message });
            }
        }

        private string? CheckMetadataForAI(IFormFile file)
        {
            using var stream = file.OpenReadStream();
            try
            {
                var directories = ImageMetadataReader.ReadMetadata(stream);

                foreach (var directory in directories)
                {
                    foreach (var tag in directory.Tags)
                    {
                        string tagDescription = tag.Description ?? string.Empty;

                        var foundSignature = _aiSignatures.FirstOrDefault(sig =>
                            tagDescription.Contains(sig, StringComparison.OrdinalIgnoreCase));

                        if (foundSignature != null)
                        {
                            return foundSignature;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Metadata read error: {ex.Message}");
            }
            finally
            {
                // Reset the stream so the file can be read again when sent to the Python server
                if (stream.CanSeek)
                {
                    stream.Position = 0;
                }
            }

            return null;
        }
    }

    // --- DTOs ---
    public class LoginRequest { public string Email { get; set; } = null!; public string Name { get; set; } = null!; }
    public class PurchaseRequest { public string Email { get; set; } = null!; public decimal Amount { get; set; } }

    public class ScanRequest
    {
        public IFormFile File { get; set; } = null!;
        public string Email { get; set; } = null!;
    }
}
