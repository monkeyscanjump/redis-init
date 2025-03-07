/**
 * Integration tests for Redis Init Module
 *
 * These tests require a running Redis server.
 * They are disabled by default, but can be enabled by setting
 * the REDIS_INTEGRATION_TESTS environment variable.
 */

const { redisInit, redisInitFromString } = require('../lib/index');
const redis = require('redis');
const fs = require('fs');
const path = require('path');

// Create test schemas directory
const testSchemasDir = path.join(__dirname, 'test-schemas');

// Conditional test runner that only runs if REDIS_INTEGRATION_TESTS is set
const conditionalTest = global.REDIS_AVAILABLE ?
  describe : describe.skip;

conditionalTest('Redis Init Integration Tests', () => {
  let redisConfig;

  // Setup before all tests
  beforeAll(() => {
    // Create test schemas directory if it doesn't exist
    if (!fs.existsSync(testSchemasDir)) {
      fs.mkdirSync(testSchemasDir);
    }

    // Write test schema files
    fs.writeFileSync(path.join(testSchemasDir, 'test-users.redis'), `
      # Test Users Schema
      # version: 1
      # description: Test user data

      SET username:testuser 1000;
      HSET user:1000 name "Test User" email "test@example.com";
      SADD users 1000;
    `);

    fs.writeFileSync(path.join(testSchemasDir, 'test-products.redis'), `
      # Test Products Schema
      # version: 1
      # description: Test product data
      # dependencies: test-users.redis

      HSET product:100 name "Test Product" price "9.99";
      SADD products 100;

      SCRIPT: test_script
      local key = KEYS[1]
      local value = ARGV[1]
      return redis.call("SET", key, value)
      END_SCRIPT
    `);

    // Set Redis connection config from environment or use defaults
    redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      database: 15, // Use database 15 for tests
      prefix: 'test:',
      schemasDir: testSchemasDir
    };
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up test database
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();
    await client.flushDb();
    await client.quit();

    // Remove test schemas directory
    fs.rmdirSync(testSchemasDir, { recursive: true });
  });

  test('should initialize Redis with schema files', async () => {
    const result = await redisInit({
      ...redisConfig,
      flush: true
    });

    expect(result.success).toBe(true);
    expect(result.commandsExecuted).toBeGreaterThan(0);
    expect(result.filesProcessed).toBe(2);

    // Verify data with a separate client
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();

    // Check keys
    const keys = await client.keys('test:*');
    expect(keys.length).toBeGreaterThan(0);

    // Check specific data
    const user = await client.hGetAll('test:user:1000');
    expect(user.name).toBe('Test User');

    const product = await client.hGetAll('test:product:100');
    expect(product.name).toBe('Test Product');

    await client.quit();
  });

  test('should initialize Redis from string', async () => {
    const schemaContent = `
      # Test Schema String
      SET test:string:key "string value";
      HSET test:string:hash field1 "value1" field2 "value2";
      SADD test:string:set "member1" "member2";
    `;

    const result = await redisInitFromString(redisConfig, schemaContent, 'string-schema');

    expect(result.success).toBe(true);
    expect(result.commandsExecuted).toBe(3);

    // Verify data with a separate client
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();

    // Check keys
    const value = await client.get('test:string:key');
    expect(value).toBe('string value');

    const hash = await client.hGetAll('test:string:hash');
    expect(hash.field1).toBe('value1');

    const set = await client.sMembers('test:string:set');
    expect(set).toContain('member1');

    await client.quit();
  });

  test('should support transactions', async () => {
    const result = await redisInit({
      ...redisConfig,
      schemasDir: testSchemasDir,
      useTransactions: true
    });

    expect(result.success).toBe(true);
    expect(result.commandsExecuted).toBeGreaterThan(0);

    // Verify data with a separate client
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();

    // Check keys
    const user = await client.hGetAll('test:user:1000');
    expect(user.name).toBe('Test User');

    await client.quit();
  });

  test('should support template variables', async () => {
    const schemaContent = `
      # Schema with template variables
      SET test:app:version "${APP_VERSION}";
      SET test:app:env "${ENV}";
      SET test:timestamp "${TIMESTAMP}";
    `;

    const result = await redisInitFromString({
      ...redisConfig,
      variables: {
        APP_VERSION: '1.2.3',
        ENV: 'testing',
        TIMESTAMP: '2023-07-15'
      }
    }, schemaContent);

    expect(result.success).toBe(true);

    // Verify data with a separate client
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();

    // Check template variables were replaced
    const version = await client.get('test:app:version');
    expect(version).toBe('1.2.3');

    const env = await client.get('test:app:env');
    expect(env).toBe('testing');

    await client.quit();
  });

  test('should register and use Lua scripts', async () => {
    // Initialize with schema containing Lua script
    await redisInit({
      ...redisConfig,
      schemasDir: testSchemasDir
    });

    // Verify with a separate client
    const client = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      },
      password: redisConfig.password,
      database: redisConfig.database
    });

    await client.connect();

    // Check if script registry exists
    const scriptRegistry = await client.hGetAll('test:lua:scripts');
    expect(Object.keys(scriptRegistry)).toContain('test_script');

    await client.quit();
  });
});
