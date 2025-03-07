// setup.js - Test setup script
const redis = require('redis');

// Check if Redis is available
async function checkRedisAvailability() {
  try {
    const client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      },
      password: process.env.REDIS_PASSWORD
    });

    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch (error) {
    console.log('Redis server not available. Some tests will be skipped.');
    return false;
  }
}

// Set global variable for tests
global.REDIS_AVAILABLE = false;

// Run before tests
beforeAll(async () => {
  global.REDIS_AVAILABLE = await checkRedisAvailability();
});
