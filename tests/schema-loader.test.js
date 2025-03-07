const {
  parseSchemaContent,
  sortSchemasByDependencies
} = require('../lib/schema-loader');

describe('Schema Loader Module', () => {
  describe('parseSchemaContent function', () => {
    test('should parse basic commands', () => {
      const content = `
        # This is a comment
        SET key1 "value1";
        HSET hash1 field1 "value1" field2 "value2";
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toEqual(['SET', 'key1', 'value1']);
      expect(result.commands[1]).toEqual(['HSET', 'hash1', 'field1', 'value1', 'field2', 'value2']);
    });

    test('should extract metadata', () => {
      const content = `
        # My Schema
        # version: 2
        # description: Test schema
        # dependencies: users.redis, products.redis

        SET key1 "value1";
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.metadata.version).toBe(2);
      expect(result.metadata.description).toBe('Test schema');
      expect(result.metadata.dependencies).toEqual(['users.redis', 'products.redis']);
    });

    test('should handle commands with quotes', () => {
      const content = `
        SET key "value with spaces";
        SET key2 "value with \\"escaped\\" quotes";
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toEqual(['SET', 'key', 'value with spaces']);
      expect(result.commands[1][2]).toContain('escaped');
    });

    test('should handle multi-line commands', () => {
      const content = `
        SET
          key1
          "value1";
        HSET
          hash1
          field1 "value1"
          field2 "value2";
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toEqual(['SET', 'key1', 'value1']);
      expect(result.commands[1]).toEqual(['HSET', 'hash1', 'field1', 'value1', 'field2', 'value2']);
    });

    test('should process template variables if provided', () => {
      const content = `
        SET app:version "${APP_VERSION}";
        SET app:env "${ENV}";
      `;

      const config = {
        variables: {
          APP_VERSION: '1.0.0',
          ENV: 'test'
        }
      };

      const result = parseSchemaContent(content, 'test.redis', config);

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toEqual(['SET', 'app:version', '1.0.0']);
      expect(result.commands[1]).toEqual(['SET', 'app:env', 'test']);
    });

    test('should ignore Lua scripts blocks while parsing commands', () => {
      const content = `
        SET key1 "value1";

        SCRIPT: test_script
        local key = KEYS[1]
        local value = ARGV[1]
        return redis.call("SET", key, value)
        END_SCRIPT

        SET key2 "value2";
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0]).toEqual(['SET', 'key1', 'value1']);
      expect(result.commands[1]).toEqual(['SET', 'key2', 'value2']);
    });

    test('should handle empty content', () => {
      const content = '';

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(0);
      expect(result.metadata.version).toBe(1);
    });

    test('should handle content with only comments', () => {
      const content = `
        # This is a comment
        # Another comment
      `;

      const result = parseSchemaContent(content, 'test.redis');

      expect(result.commands).toHaveLength(0);
    });
  });

  describe('sortSchemasByDependencies function', () => {
    test('should sort schemas by dependencies', () => {
      const schemas = [
        {
          path: 'products.redis',
          metadata: {
            dependencies: ['users.redis']
          }
        },
        {
          path: 'users.redis',
          metadata: {
            dependencies: []
          }
        },
        {
          path: 'orders.redis',
          metadata: {
            dependencies: ['users.redis', 'products.redis']
          }
        }
      ];

      const sorted = sortSchemasByDependencies(schemas);

      expect(sorted[0].path).toBe('users.redis');
      expect(sorted[1].path).toBe('products.redis');
      expect(sorted[2].path).toBe('orders.redis');
    });

    test('should handle schemas with no dependencies', () => {
      const schemas = [
        {
          path: 'a.redis',
          metadata: {
            dependencies: []
          }
        },
        {
          path: 'b.redis',
          metadata: {
            dependencies: []
          }
        }
      ];

      const sorted = sortSchemasByDependencies(schemas);

      expect(sorted).toHaveLength(2);
    });

    test('should throw error for circular dependencies', () => {
      const schemas = [
        {
          path: 'a.redis',
          metadata: {
            dependencies: ['b.redis']
          }
        },
        {
          path: 'b.redis',
          metadata: {
            dependencies: ['a.redis']
          }
        }
      ];

      expect(() => {
        sortSchemasByDependencies(schemas);
      }).toThrow(/Circular dependency/);
    });

    test('should throw error for missing dependencies', () => {
      const schemas = [
        {
          path: 'a.redis',
          metadata: {
            dependencies: ['missing.redis']
          }
        }
      ];

      expect(() => {
        sortSchemasByDependencies(schemas);
      }).toThrow(/depends on missing.redis/);
    });
  });
});
