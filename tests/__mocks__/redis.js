// Mock implementation of Redis client
const redis = jest.createMockFromModule('redis');

// Store for simulating Redis data
const redisStore = {
  data: {},
  scriptCache: {}
};

// Clear all stored data (for test isolation)
const clearStore = () => {
  redisStore.data = {};
  redisStore.scriptCache = {};
};

// Mock client creation
const createClient = jest.fn(() => {
  return {
    connect: jest.fn().mockResolvedValue(true),
    quit: jest.fn().mockResolvedValue(true),
    select: jest.fn().mockResolvedValue('OK'),
    sendCommand: jest.fn().mockImplementation(([cmd, ...args]) => {
      // Mock implementation for different commands
      cmd = cmd.toUpperCase();
      if (cmd === 'PING') return Promise.resolve('PONG');
      if (cmd === 'INFO') return Promise.resolve('redis_version:6.2.6\nredis_mode:standalone\nuptime_in_seconds:3600\nconnected_clients:10\nused_memory_human:10M\nmaxmemory_human:100M');

      // Basic mocks for common commands
      if (cmd === 'SET') {
        const [key, value] = args;
        redisStore.data[key] = value;
        return Promise.resolve('OK');
      }
      if (cmd === 'GET') {
        const [key] = args;
        return Promise.resolve(redisStore.data[key] || null);
      }
      if (cmd === 'DEL') {
        const keys = args;
        let count = 0;
        for (const key of keys) {
          if (redisStore.data[key]) {
            delete redisStore.data[key];
            count++;
          }
        }
        return Promise.resolve(count);
      }
      if (cmd === 'KEYS') {
        const [pattern] = args;
        if (pattern === '*') {
          return Promise.resolve(Object.keys(redisStore.data));
        }
        // Very simple pattern matching (just prefix with *)
        if (pattern.endsWith('*')) {
          const prefix = pattern.substring(0, pattern.length - 1);
          return Promise.resolve(
            Object.keys(redisStore.data).filter(key => key.startsWith(prefix))
          );
        }
        return Promise.resolve([]);
      }
      if (cmd === 'EXISTS') {
        const [key] = args;
        return Promise.resolve(redisStore.data[key] ? 1 : 0);
      }
      if (cmd === 'TYPE') {
        const [key] = args;
        if (!redisStore.data[key]) return Promise.resolve('none');
        // Simple type inference - this is a naive implementation
        if (typeof redisStore.data[key] === 'string') return Promise.resolve('string');
        if (typeof redisStore.data[key] === 'object') {
          if (Array.isArray(redisStore.data[key])) return Promise.resolve('list');
          return Promise.resolve('hash');
        }
        return Promise.resolve('string');
      }
      if (cmd === 'DBSIZE') {
        return Promise.resolve(Object.keys(redisStore.data).length);
      }
      if (cmd === 'EXPIRE') {
        // Just pretend it worked, not actually implementing expiry
        return Promise.resolve(1);
      }
      if (cmd === 'TTL') {
        return Promise.resolve(3600); // Pretend everything expires in an hour
      }
      if (cmd === 'HSET') {
        const [key, ...fieldValues] = args;
        if (!redisStore.data[key]) redisStore.data[key] = {};

        // Handle both HSET key field value and HSET key field1 value1 field2 value2...
        if (typeof fieldValues[0] === 'object') {
          // HSET key {field1: value1, field2: value2}
          redisStore.data[key] = {...redisStore.data[key], ...fieldValues[0]};
        } else {
          // HSET key field1 value1 field2 value2...
          for (let i = 0; i < fieldValues.length; i += 2) {
            if (i + 1 < fieldValues.length) {
              redisStore.data[key][fieldValues[i]] = fieldValues[i + 1];
            }
          }
        }
        return Promise.resolve('OK');
      }
      if (cmd === 'HGET') {
        const [key, field] = args;
        if (!redisStore.data[key]) return Promise.resolve(null);
        return Promise.resolve(redisStore.data[key][field] || null);
      }
      if (cmd === 'HGETALL') {
        const [key] = args;
        return Promise.resolve(redisStore.data[key] || {});
      }
      if (cmd === 'SADD') {
        const [key, ...members] = args;
        if (!redisStore.data[key]) redisStore.data[key] = new Set();
        let count = 0;
        for (const member of members) {
          if (!redisStore.data[key].has(member)) {
            redisStore.data[key].add(member);
            count++;
          }
        }
        return Promise.resolve(count);
      }
      if (cmd === 'SMEMBERS') {
        const [key] = args;
        if (!redisStore.data[key]) return Promise.resolve([]);
        return Promise.resolve(Array.from(redisStore.data[key]));
      }
      if (cmd === 'FLUSHALL') {
        clearStore();
        return Promise.resolve('OK');
      }
      if (cmd === 'FLUSHDB') {
        clearStore();
        return Promise.resolve('OK');
      }
      if (cmd === 'SCRIPT') {
        const [subCmd, ...scriptArgs] = args;
        if (subCmd.toUpperCase() === 'LOAD') {
          const script = scriptArgs[0];
          // Mock the SHA1 hash calculation - not actual SHA1
          const sha = `mock-sha-${script.length}`;
          redisStore.scriptCache[sha] = script;
          return Promise.resolve(sha);
        }
        return Promise.resolve('OK');
      }

      // For any unimplemented command, return success
      return Promise.resolve('OK');
    }),

    // Additional methods mocked directly
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest.fn().mockResolvedValue('redis_version:6.2.6\nredis_mode:standalone\nuptime_in_seconds:3600\nconnected_clients:10\nused_memory_human:10M\nmaxmemory_human:100M'),
    get: jest.fn((key) => Promise.resolve(redisStore.data[key])),
    set: jest.fn((key, value) => {
      redisStore.data[key] = value;
      return Promise.resolve('OK');
    }),
    del: jest.fn((keys) => {
      if (!Array.isArray(keys)) keys = [keys];
      let count = 0;
      for (const key of keys) {
        if (redisStore.data[key]) {
          delete redisStore.data[key];
          count++;
        }
      }
      return Promise.resolve(count);
    }),
    keys: jest.fn((pattern) => {
      if (pattern === '*') {
        return Promise.resolve(Object.keys(redisStore.data));
      }
      // Simple pattern matching
      if (pattern.endsWith('*')) {
        const prefix = pattern.substring(0, pattern.length - 1);
        return Promise.resolve(
          Object.keys(redisStore.data).filter(key => key.startsWith(prefix))
        );
      }
      return Promise.resolve([]);
    }),
    exists: jest.fn((key) => Promise.resolve(redisStore.data[key] ? 1 : 0)),
    type: jest.fn((key) => {
      if (!redisStore.data[key]) return Promise.resolve('none');
      if (typeof redisStore.data[key] === 'string') return Promise.resolve('string');
      if (typeof redisStore.data[key] === 'object') {
        if (Array.isArray(redisStore.data[key])) return Promise.resolve('list');
        return Promise.resolve('hash');
      }
      return Promise.resolve('string');
    }),
    dbSize: jest.fn(() => Promise.resolve(Object.keys(redisStore.data).length)),
    flushAll: jest.fn(() => {
      clearStore();
      return Promise.resolve('OK');
    }),
    flushDb: jest.fn(() => {
      clearStore();
      return Promise.resolve('OK');
    }),
    scriptLoad: jest.fn((script) => {
      const sha = `mock-sha-${script.length}`;
      redisStore.scriptCache[sha] = script;
      return Promise.resolve(sha);
    }),
    ttl: jest.fn(() => Promise.resolve(3600)),
    expire: jest.fn(() => Promise.resolve(1)),
    hSet: jest.fn((key, ...args) => {
      if (!redisStore.data[key]) redisStore.data[key] = {};

      // Handle different HSET variants
      if (args.length === 1 && typeof args[0] === 'object') {
        // hSet(key, {field1: value1, field2: value2})
        redisStore.data[key] = {...redisStore.data[key], ...args[0]};
      } else if (args.length === 2) {
        // hSet(key, field, value)
        redisStore.data[key][args[0]] = args[1];
      } else {
        // hSet(key, field1, value1, field2, value2, ...)
        for (let i = 0; i < args.length; i += 2) {
          if (i + 1 < args.length) {
            redisStore.data[key][args[i]] = args[i + 1];
          }
        }
      }
      return Promise.resolve('OK');
    }),
    hGet: jest.fn((key, field) => {
      if (!redisStore.data[key]) return Promise.resolve(null);
      return Promise.resolve(redisStore.data[key][field] || null);
    }),
    hGetAll: jest.fn((key) => Promise.resolve(redisStore.data[key] || {})),
    sAdd: jest.fn((key, ...members) => {
      if (!redisStore.data[key]) redisStore.data[key] = new Set();
      let count = 0;
      for (const member of members) {
        if (!redisStore.data[key].has(member)) {
          redisStore.data[key].add(member);
          count++;
        }
      }
      return Promise.resolve(count);
    }),
    sMembers: jest.fn((key) => {
      if (!redisStore.data[key]) return Promise.resolve([]);
      return Promise.resolve(Array.from(redisStore.data[key]));
    }),

    // Mock transaction methods
    multi: jest.fn(() => {
      const transaction = {
        commands: [],
        sendCommand: jest.fn(function(command) {
          this.commands.push(command);
          return this;
        }),
        exec: jest.fn(function() {
          const results = [];
          for (const command of this.commands) {
            try {
              // Process commands in a transaction
              const [cmd, ...args] = command;
              results.push('OK'); // Simplified - just return success for all commands
            } catch (error) {
              results.push(error);
            }
          }
          this.commands = [];
          return Promise.resolve(results);
        })
      };
      return transaction;
    }),

    // Mock pipeline methods
    pipeline: jest.fn(() => {
      const pipeline = {
        commands: [],
        sendCommand: jest.fn(function(command) {
          this.commands.push(command);
          return this;
        }),
        exec: jest.fn(function() {
          const results = [];
          for (const command of this.commands) {
            try {
              // Process commands in a pipeline
              const [cmd, ...args] = command;
              results.push(['OK', null]); // [value, error]
            } catch (error) {
              results.push([null, error]);
            }
          }
          this.commands = [];
          return Promise.resolve(results);
        })
      };
      return pipeline;
    })
  };
});

// Mock store for tests to access
redis.__store = redisStore;
redis.__clearStore = clearStore;

module.exports = redis;
