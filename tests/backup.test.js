const { backupRedisData, restoreRedisData } = require('../lib/backup');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra', () => {
  return {
    ensureDir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(JSON.stringify({
      timestamp: new Date().toISOString(),
      prefix: 'myapp:',
      host: 'localhost',
      port: 6379,
      database: 0,
      keys: {
        'myapp:key1': { type: 'string', value: 'value1', ttl: 3600 },
        'myapp:hash1': { type: 'hash', value: { field1: 'value1', field2: 'value2' }, ttl: -1 },
        'myapp:list1': { type: 'list', value: ['item1', 'item2'], ttl: 3600 }
      }
    })),
    existsSync: jest.fn().mockReturnValue(true)
  };
});

// Mock fs-extra
jest.mock('fs-extra');

describe('Backup Module', () => {
  describe('backupRedisData function', () => {
    // Setup test environment
    beforeEach(() => {
      // Mock fs.writeFile
      fs.writeFile.mockReset();
      fs.writeFile.mockResolvedValue(undefined);

      // Mock fs.ensureDir
      fs.ensureDir.mockReset();
      fs.ensureDir.mockResolvedValue(undefined);
    });

    test('should create backup of Redis data', async () => {
      // Mock client with test data
      const mockClient = {
        keys: jest.fn().mockResolvedValue(['key1', 'hash1', 'list1']),
        type: jest.fn().mockImplementation(key => {
          if (key === 'key1') return Promise.resolve('string');
          if (key === 'hash1') return Promise.resolve('hash');
          if (key === 'list1') return Promise.resolve('list');
          return Promise.resolve('none');
        }),
        get: jest.fn().mockResolvedValue('value1'),
        hGetAll: jest.fn().mockResolvedValue({ field1: 'value1', field2: 'value2' }),
        lRange: jest.fn().mockResolvedValue(['item1', 'item2']),
        ttl: jest.fn().mockResolvedValue(3600)
      };

      const config = {
        backupFile: './backup.json',
        host: 'localhost',
        port: 6379
      };

      const result = await backupRedisData(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);

      // Check that keys were requested
      expect(mockClient.keys).toHaveBeenCalledWith('*');

      // Check that the appropriate data was fetched for each key type
      expect(mockClient.get).toHaveBeenCalledWith('key1');
      expect(mockClient.hGetAll).toHaveBeenCalledWith('hash1');
      expect(mockClient.lRange).toHaveBeenCalledWith('list1', 0, -1);

      // Check that TTL was fetched for each key
      expect(mockClient.ttl).toHaveBeenCalledTimes(3);

      // Check that the backup was written to the file
      expect(fs.writeFile).toHaveBeenCalledWith(
        './backup.json',
        expect.stringContaining('timestamp'),
        expect.any(Function)
      );
    });

    test('should create backup with prefix filter', async () => {
      // Mock client with test data
      const mockClient = {
        keys: jest.fn().mockResolvedValue(['myapp:key1', 'myapp:hash1']),
        type: jest.fn().mockResolvedValue('string'),
        get: jest.fn().mockResolvedValue('value1'),
        ttl: jest.fn().mockResolvedValue(3600)
      };

      const config = {
        backupFile: './backup.json',
        prefix: 'myapp:'
      };

      const result = await backupRedisData(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Check that keys were requested with prefix
      expect(mockClient.keys).toHaveBeenCalledWith('myapp:*');
    });

    test('should create empty backup if no keys found', async () => {
      // Mock client with empty data
      const mockClient = {
        keys: jest.fn().mockResolvedValue([])
      };

      const config = {
        backupFile: './backup.json'
      };

      const result = await backupRedisData(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      // Check that an empty backup was written
      expect(fs.writeFile).toHaveBeenCalled();
      const backupCall = fs.writeFile.mock.calls[0];
      const backupContent = JSON.parse(backupCall[1]);
      expect(backupContent.keys).toEqual({});
    });

    test('should handle errors during backup', async () => {
      // Mock client with error
      const mockClient = {
        keys: jest.fn().mockRejectedValue(new Error('Redis error'))
      };

      const config = {
        backupFile: './backup.json'
      };

      const result = await backupRedisData(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Redis error');
    });

    test('should handle error if no backup file specified', async () => {
      const mockClient = {};

      const config = {};

      const result = await backupRedisData(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No backup file specified');
    });
  });

  describe('restoreRedisData function', () => {
    // Setup test environment
    beforeEach(() => {
      // Mock fs.readFile
      fs.readFile.mockReset();
      fs.readFile.mockResolvedValue(JSON.stringify({
        timestamp: new Date().toISOString(),
        prefix: 'myapp:',
        host: 'localhost',
        port: 6379,
        database: 0,
        keys: {
          'myapp:key1': { type: 'string', value: 'value1', ttl: 3600 },
          'myapp:hash1': { type: 'hash', value: { field1: 'value1', field2: 'value2' }, ttl: -1 },
          'myapp:list1': { type: 'list', value: ['item1', 'item2'], ttl: 3600 }
        }
      }));

      // Mock fs.existsSync
      fs.existsSync.mockReset();
      fs.existsSync.mockReturnValue(true);
    });

    test('should restore data from backup file', async () => {
      // Mock client
      const mockClient = {
        set: jest.fn().mockResolvedValue('OK'),
        hSet: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        rPush: jest.fn().mockResolvedValue(2),
        expire: jest.fn().mockResolvedValue(1),
        pipeline: jest.fn().mockReturnValue({
          commands: [],
          exec: jest.fn().mockResolvedValue([])
        })
      };

      const config = {
        backupFile: './backup.json',
        interactive: false
      };

      const result = await restoreRedisData(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);

      // Check that fs.readFile was called with the correct file
      expect(fs.readFile).toHaveBeenCalledWith('./backup.json', 'utf8');
    });

    test('should handle error if backup file not found', async () => {
      fs.existsSync.mockReturnValue(false);

      const mockClient = {};

      const config = {
        backupFile: './nonexistent.json'
      };

      const result = await restoreRedisData(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should handle error if no backup file specified', async () => {
      const mockClient = {};

      const config = {};

      const result = await restoreRedisData(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No backup file specified');
    });

    test('should handle invalid backup file', async () => {
      fs.readFile.mockResolvedValue('invalid json');

      const mockClient = {};

      const config = {
        backupFile: './backup.json'
      };

      await expect(restoreRedisData(mockClient, config)).rejects.toThrow();
    });
  });
});
