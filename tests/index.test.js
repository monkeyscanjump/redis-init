const { redisInit, redisInitFromString } = require('../lib/index');
const { createRedisClient, testConnection, flushDatabase } = require('../lib/client');
const { loadSchemas, validateSchemas } = require('../lib/schema-loader');
const { registerLuaScripts } = require('../lib/lua-scripts');
const redis = require('redis');

// Mock required modules
jest.mock('../lib/client');
jest.mock('../lib/schema-loader');
jest.mock('../lib/lua-scripts');
jest.mock('redis');

describe('Redis Init Module', () => {
  // Setup mocks
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup client mock
    const mockClient = {
      connect: jest.fn().mockResolvedValue(true),
      quit: jest.fn().mockResolvedValue(true),
      select: jest.fn().mockResolvedValue('OK')
    };

    // Mock createRedisClient to return our mock client
    createRedisClient.mockReturnValue(mockClient);

    // Mock other functions
    testConnection.mockResolvedValue(true);
    flushDatabase.mockResolvedValue(true);
    loadSchemas.mockResolvedValue({ success: true, commandsExecuted: 10, filesProcessed: 2 });
    validateSchemas.mockResolvedValue({ success: true, dbSize: 50 });
    registerLuaScripts.mockResolvedValue({ success: true, count: 2 });
  });

  describe('redisInit function', () => {
    test('should initialize Redis with default options', async () => {
      const result = await redisInit();

      expect(result.success).toBe(true);
      expect(result.commandsExecuted).toBe(10);
      expect(result.filesProcessed).toBe(2);
      expect(createRedisClient).toHaveBeenCalled();
      expect(testConnection).toHaveBeenCalled();
      expect(loadSchemas).toHaveBeenCalled();
      expect(validateSchemas).toHaveBeenCalled();
    });

    test('should initialize Redis with custom options', async () => {
      const options = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        schemasDir: './custom-schemas',
        prefix: 'myapp:',
        database: 2,
        flush: true,
        useTransactions: true
      };

      const result = await redisInit(options);

      expect(result.success).toBe(true);
      expect(createRedisClient).toHaveBeenCalledWith(expect.objectContaining({
        host: 'redis.example.com',
        port: 6380,
        password: 'secret'
      }));
      expect(loadSchemas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        schemasDir: './custom-schemas',
        prefix: 'myapp:',
        useTransactions: true
      }));
    });

    test('should return error if connection fails', async () => {
      testConnection.mockResolvedValue(false);

      const result = await redisInit();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to connect to Redis server');
      expect(loadSchemas).not.toHaveBeenCalled();
    });

    test('should return error if schema loading fails', async () => {
      loadSchemas.mockResolvedValue({
        success: false,
        details: 'Schema error'
      });

      const result = await redisInit();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Schema loading failed');
      expect(result.details).toBe('Schema error');
    });

    test('should select database if specified', async () => {
      const mockClient = {
        connect: jest.fn().mockResolvedValue(true),
        quit: jest.fn().mockResolvedValue(true),
        select: jest.fn().mockResolvedValue('OK')
      };

      createRedisClient.mockReturnValue(mockClient);

      const options = {
        database: 3
      };

      const result = await redisInit(options);

      expect(result.success).toBe(true);
      expect(mockClient.select).toHaveBeenCalledWith(3);
    });

    test('should flush database if requested', async () => {
      const options = {
        flush: true
      };

      const result = await redisInit(options);

      expect(result.success).toBe(true);
      expect(flushDatabase).toHaveBeenCalled();
    });

    test('should register Lua scripts from schemas', async () => {
      const result = await redisInit();

      expect(result.success).toBe(true);
      expect(registerLuaScripts).toHaveBeenCalled();
      expect(result.scriptCount).toBe(2);
    });

    test('should handle error during client initialization', async () => {
      createRedisClient.mockImplementation(() => {
        throw new Error('Client initialization error');
      });

      const result = await redisInit();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Client initialization error');
    });

    test('should close client connection even after error', async () => {
      const mockClient = {
        connect: jest.fn().mockRejectedValue(new Error('Connection error')),
        quit: jest.fn().mockResolvedValue(true)
      };

      createRedisClient.mockReturnValue(mockClient);

      const result = await redisInit();

      expect(result.success).toBe(false);
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });

  describe('redisInitFromString function', () => {
    test('should initialize Redis from schema string', async () => {
      const schemaContent = `
        SET key "value";
        HSET hash field "value";
      `;

      const result = await redisInitFromString({}, schemaContent, 'inline-schema');

      expect(result.success).toBe(true);
      expect(loadSchemas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        schemaContent,
        schemaName: 'inline-schema'
      }), true);
    });

    test('should return error if no schema content provided', async () => {
      loadSchemas.mockResolvedValue({
        success: false,
        details: 'No schema content provided'
      });

      const result = await redisInitFromString({});

      expect(result.success).toBe(false);
      expect(result.details).toBe('No schema content provided');
    });

    test('should use custom options when initializing from string', async () => {
      const options = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
        prefix: 'myapp:',
        database: 2
      };

      const schemaContent = 'SET key "value";';

      const result = await redisInitFromString(options, schemaContent);

      expect(result.success).toBe(true);
      expect(createRedisClient).toHaveBeenCalledWith(expect.objectContaining({
        host: 'redis.example.com',
        port: 6380,
        password: 'secret'
      }));
    });
  });
});
