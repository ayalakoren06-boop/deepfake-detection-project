using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace WebDeepFence.Models
{
    public class User
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string Email { get; set; } = null!;

        public string Name { get; set; } = null!;

        public string Status { get; set; } = "FREE"; // "FREE" or "PRO"

        public int MaxScans { get; set; } = 10;

        public int UsedScans { get; set; } = 0;

        // Used to reset the scan quota every month
        public DateTime LastResetDate { get; set; } = DateTime.UtcNow;
    }
}
