const { createRedisClient, testConnection, flushDatabase } = require('../lib/client');
const redis = require('redis');

// Mock the redis module
jest.mock('redis');

describe('Client Module', () => {
  describe('createRedisClient function', () => {
    test('should create Redis client with basic options', () => {
      const config = {
        host: 'localhost',
        port: 6379
      };

      createRedisClient(config);

      expect(redis.createClient).toHaveBeenCalled();

      const args = redis.createClient.mock.calls[0][0];
      expect(args.socket.host).toBe('localhost');
      expect(args.socket.port).toBe(6379);
    });

    test('should create Redis client with SSL', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        ssl: true
      };

      createRedisClient(config);

      const args = redis.createClient.mock.calls[0][0];
      expect(args.socket.tls).toBe(true);
    });

    test('should create Redis client with password', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        password: 'secret'
      };

      createRedisClient(config);

      const args = redis.createClient.mock.calls[0][0];
      expect(args.password).toBe('secret');
    });

    test('should create Redis client with database selection', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        database: 2
      };

      createRedisClient(config);

      const args = redis.createClient.mock.calls[0][0];
      expect(args.database).toBe(2);
    });

    test('should create Redis client with timeout', () => {
      const config = {
        host: 'localhost',
        port: 6379,
        timeout: 10000
      };

      createRedisClient(config);

      const args = redis.createClient.mock.calls[0][0];
      expect(args.socket.connectTimeout).toBe(10000);
    });

    test('should log options if verbose is true', () => {
      console.log = jest.fn(); // Mock console.log

      const config = {
        host: 'localhost',
        port: 6379,
        verbose: true,
        color: false
      };

      createRedisClient(config);

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('testConnection function', () => {
    test('should test connection successfully', async () => {
      const mockClient = {
        connect: jest.fn().mockResolvedValue(true),
        info: jest.fn().mockResolvedValue('redis_version:6.2.6\nredis_mode:standalone')
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const result = await testConnection(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.info).toHaveBeenCalled();
    });

    test('should handle connection error', async () => {
      const mockClient = {
        connect: jest.fn().mockRejectedValue(new Error('Connection refused'))
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const result = await testConnection(mockClient, config);

      expect(result).toBe(false);
    });

    test('should log prefix if specified', async () => {
      const mockClient = {
        connect: jest.fn().mockResolvedValue(true),
        info: jest.fn().mockResolvedValue('redis_version:6.2.6\nredis_mode:standalone')
      };

      const config = {
        host: 'localhost',
        port: 6379,
        prefix: 'myapp:'
      };

      console.log = jest.fn(); // Mock console.log

      await testConnection(mockClient, config);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('myapp:'));
    });
  });

  describe('flushDatabase function', () => {
    test('should not flush if flush option is false', async () => {
      const mockClient = {
        flushAll: jest.fn(),
        flushDb: jest.fn()
      };

      const config = {
        flush: false
      };

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.flushAll).not.toHaveBeenCalled();
      expect(mockClient.flushDb).not.toHaveBeenCalled();
    });

    test('should flush all databases if flushMode is all', async () => {
      const mockClient = {
        flushAll: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        flush: true,
        flushMode: 'all',
        interactive: false
      };

      console.log = jest.fn(); // Mock console.log

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.flushAll).toHaveBeenCalled();
    });

    test('should flush current database if flushMode is db', async () => {
      const mockClient = {
        flushDb: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        flush: true,
        flushMode: 'db',
        interactive: false,
        database: 1
      };

      console.log = jest.fn(); // Mock console.log

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.flushDb).toHaveBeenCalled();
    });

    test('should delete keys with prefix if flushMode is prefix', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValue(['myapp:key1', 'myapp:key2']),
        del: jest.fn().mockResolvedValue(2)
      };

      const config = {
        flush: true,
        flushMode: 'prefix',
        prefix: 'myapp:',
        interactive: false
      };

      console.log = jest.fn(); // Mock console.log

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.keys).toHaveBeenCalledWith('myapp:*');
      expect(mockClient.del).toHaveBeenCalled();
    });

    test('should not delete if no keys match prefix', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValue([])
      };

      const config = {
        flush: true,
        flushMode: 'prefix',
        prefix: 'myapp:',
        interactive: false
      };

      console.log = jest.fn(); // Mock console.log

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(true);
      expect(mockClient.keys).toHaveBeenCalledWith('myapp:*');
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    test('should handle error in flush operation', async () => {
      const mockClient = {
        flushDb: jest.fn().mockRejectedValue(new Error('Flush error'))
      };

      const config = {
        flush: true,
        flushMode: 'db',
        interactive: false
      };

      console.log = jest.fn(); // Mock console.log

      const result = await flushDatabase(mockClient, config);

      expect(result).toBe(false);
    });
  });
});
