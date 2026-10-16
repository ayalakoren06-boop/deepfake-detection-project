using MongoDB.Driver;
using WebDeepFence.Models;

namespace WebDeepFence.Services
{
    public class UserService
    {
        private readonly IMongoCollection<User> _usersCollection;

        public UserService(IConfiguration config)
        {
            var mongoClient = new MongoClient(config["MongoDbSettings:ConnectionString"]);
            var mongoDatabase = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            _usersCollection = mongoDatabase.GetCollection<User>(config["MongoDbSettings:UsersCollectionName"]);
        }

        // Creates a new FREE user on first login
        public async Task<User> LoginAsync(string email, string name)
        {
            var user = await _usersCollection.Find(u => u.Email == email).FirstOrDefaultAsync();

            if (user == null)
            {
                user = new User
                {
                    Email = email,
                    Name = name,
                    Status = "FREE",
                    MaxScans = 10,
                    UsedScans = 0,
                    LastResetDate = DateTime.UtcNow
                };
                await _usersCollection.InsertOneAsync(user);
            }

            return user;
        }

        public async Task<bool> HasAvailableQuotaAsync(string email)
        {
            var user = await _usersCollection.Find(u => u.Email == email).FirstOrDefaultAsync();
            if (user == null) return false;

            // Reset the monthly quota if a month has passed since the last reset
            if (DateTime.UtcNow >= user.LastResetDate.AddMonths(1))
            {
                user.UsedScans = 0;
                user.LastResetDate = DateTime.UtcNow;

                var resetUpdate = Builders<User>.Update
                    .Set(u => u.UsedScans, 0)
                    .Set(u => u.LastResetDate, user.LastResetDate);
                await _usersCollection.UpdateOneAsync(u => u.Email == email, resetUpdate);
            }

            return user.UsedScans < user.MaxScans;
        }

        public async Task DecrementUserQuotaAsync(string email)
        {
            var user = await _usersCollection.Find(u => u.Email == email).FirstOrDefaultAsync();

            if (user != null)
            {
                var update = Builders<User>.Update
                    .Set(u => u.UsedScans, user.UsedScans + 1);

                await _usersCollection.UpdateOneAsync(u => u.Email == email, update);
            }
        }

        // Upgrades the user to PRO: 100 scans per month, starting from a fresh count
        public async Task<User?> UpgradeToProAsync(string email)
        {
            var update = Builders<User>.Update
                .Set(u => u.Status, "PRO")
                .Set(u => u.MaxScans, 100)
                .Set(u => u.UsedScans, 0);

            var options = new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After };
            return await _usersCollection.FindOneAndUpdateAsync(u => u.Email == email, update, options);
        }

        public async Task<User?> GetUserByEmailAsync(string email)
        {
            return await _usersCollection.Find(u => u.Email == email).FirstOrDefaultAsync();
        }
    }
}
