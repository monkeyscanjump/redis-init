const { log, applyPrefixToCommand, applyTTL } = require('../lib/utils');

// Mock console.log
console.log = jest.fn();

describe('Utils Module', () => {
  beforeEach(() => {
    console.log.mockClear();
  });

  describe('log function', () => {
    test('should log info message with color', () => {
      log('info', 'Test message', { color: true });
      expect(console.log).toHaveBeenCalled();
    });

    test('should log info message without color', () => {
      log('info', 'Test message', { color: false });
      expect(console.log).toHaveBeenCalledWith('INFO: Test message');
    });

    test('should log error message', () => {
      log('error', 'Error message', { color: false });
      expect(console.log).toHaveBeenCalledWith('ERROR: Error message');
    });

    test('should log success message', () => {
      log('success', 'Success message', { color: false });
      expect(console.log).toHaveBeenCalledWith('SUCCESS: Success message');
    });

    test('should log warning message', () => {
      log('warn', 'Warning message', { color: false });
      expect(console.log).toHaveBeenCalledWith('WARNING: Warning message');
    });

    test('should log without prefix', () => {
      log('info', 'No prefix', { color: false }, false);
      expect(console.log).toHaveBeenCalledWith('No prefix');
    });
  });

  describe('applyPrefixToCommand function', () => {
    test('should add prefix to SET command', () => {
      const cmd = ['SET', 'mykey', 'value'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['SET', 'prefix:mykey', 'value']);
    });

    test('should add prefix to all keys in MSET command', () => {
      const cmd = ['MSET', 'key1', 'value1', 'key2', 'value2'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['MSET', 'prefix:key1', 'value1', 'prefix:key2', 'value2']);
    });

    test('should add prefix to all keys in MGET command', () => {
      const cmd = ['MGET', 'key1', 'key2', 'key3'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['MGET', 'prefix:key1', 'prefix:key2', 'prefix:key3']);
    });

    test('should add prefix to both keys in RENAME command', () => {
      const cmd = ['RENAME', 'oldkey', 'newkey'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['RENAME', 'prefix:oldkey', 'prefix:newkey']);
    });

    test('should add prefix to HASH key', () => {
      const cmd = ['HSET', 'hashkey', 'field1', 'value1', 'field2', 'value2'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['HSET', 'prefix:hashkey', 'field1', 'value1', 'field2', 'value2']);
    });

    test('should add prefix to SET key', () => {
      const cmd = ['SADD', 'setkey', 'member1', 'member2'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['SADD', 'prefix:setkey', 'member1', 'member2']);
    });

    test('should add prefix to EVALSHA keys', () => {
      const cmd = ['EVALSHA', 'sha1', '2', 'key1', 'key2', 'arg1', 'arg2'];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(['EVALSHA', 'sha1', '2', 'prefix:key1', 'prefix:key2', 'arg1', 'arg2']);
    });

    test('should not modify command if prefix is empty', () => {
      const cmd = ['SET', 'mykey', 'value'];
      const result = applyPrefixToCommand(cmd, '');
      expect(result).toEqual(cmd);
    });

    test('should not modify command if command is empty', () => {
      const cmd = [];
      const result = applyPrefixToCommand(cmd, 'prefix:');
      expect(result).toEqual(cmd);
    });
  });

  describe('applyTTL function', () => {
    test('should apply TTL rules to matching keys', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValue(['session:1', 'session:2']),
        expire: jest.fn().mockResolvedValue(1),
        pipeline: jest.fn().mockReturnValue({
          expire: jest.fn(),
          exec: jest.fn().mockResolvedValue([])
        })
      };

      const config = {
        ttlRules: {
          'session:*': 3600
        }
      };

      const result = await applyTTL(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.keysAffected).toBe(2);
      expect(mockClient.keys).toHaveBeenCalledWith('session:*');
    });

    test('should adjust patterns with prefix', async () => {
      const mockClient = {
        keys: jest.fn().mockResolvedValue(['myapp:session:1']),
        expire: jest.fn().mockResolvedValue(1),
        pipeline: jest.fn().mockReturnValue({
          expire: jest.fn(),
          exec: jest.fn().mockResolvedValue([])
        })
      };

      const config = {
        prefix: 'myapp:',
        ttlRules: {
          'session:*': 3600
        }
      };

      const result = await applyTTL(mockClient, config);

      expect(result.success).toBe(true);
      expect(mockClient.keys).toHaveBeenCalledWith('myapp:session:*');
    });

    test('should return success with no keys affected if no rules', async () => {
      const mockClient = {
        keys: jest.fn(),
        expire: jest.fn()
      };

      const config = {
        ttlRules: {}
      };

      const result = await applyTTL(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.keysAffected).toBe(0);
      expect(mockClient.keys).not.toHaveBeenCalled();
    });

    test('should handle errors', async () => {
      const mockClient = {
        keys: jest.fn().mockRejectedValue(new Error('Redis error'))
      };

      const config = {
        ttlRules: {
          'session:*': 3600
        }
      };

      const result = await applyTTL(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Redis error');
    });
  });
});
