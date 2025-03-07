const {
  parseSchemaForLuaScripts,
  findLuaScriptsInSchema
} = require('../lib/lua-scripts');

describe('Lua Scripts Module', () => {
  describe('parseSchemaForLuaScripts function', () => {
    test('should extract a Lua script from schema lines', () => {
      const lines = [
        'SET key "value";',
        'SCRIPT: test_script',
        'local key = KEYS[1]',
        'local value = ARGV[1]',
        'return redis.call("SET", key, value)',
        'END_SCRIPT',
        'SET another_key "value";'
      ];

      const result = parseSchemaForLuaScripts(lines, 1);

      expect(result).not.toBeNull();
      expect(result.name).toBe('test_script');
      expect(result.script).toBe(
        'local key = KEYS[1]\nlocal value = ARGV[1]\nreturn redis.call("SET", key, value)'
      );
      expect(result.startIndex).toBe(1);
      expect(result.endIndex).toBe(5);
    });

    test('should return null if not a script line', () => {
      const lines = [
        'SET key "value";',
        'NOT_A_SCRIPT: test',
        'some content',
        'END_SCRIPT'
      ];

      const result = parseSchemaForLuaScripts(lines, 1);

      expect(result).toBeNull();
    });

    test('should return null if no script name provided', () => {
      const lines = [
        'SCRIPT:',
        'local key = KEYS[1]',
        'END_SCRIPT'
      ];

      const result = parseSchemaForLuaScripts(lines, 0);

      expect(result).toBeNull();
    });

    test('should return null if no END_SCRIPT found', () => {
      const lines = [
        'SCRIPT: test_script',
        'local key = KEYS[1]',
        'local value = ARGV[1]'
      ];

      const result = parseSchemaForLuaScripts(lines, 0);

      expect(result).toBeNull();
    });
  });

  describe('findLuaScriptsInSchema function', () => {
    test('should find all Lua scripts in schema content', () => {
      const content = `
        # Schema with multiple scripts
        SET key "value";

        SCRIPT: first_script
        -- First script
        local key = KEYS[1]
        return redis.call("GET", key)
        END_SCRIPT

        SET another_key "value";

        SCRIPT: second_script
        -- Second script
        local keys = KEYS
        local args = ARGV
        return #keys + #args
        END_SCRIPT
      `;

      const scripts = findLuaScriptsInSchema(content, 'test.redis');

      expect(scripts).toHaveLength(2);
      expect(scripts[0].name).toBe('first_script');
      expect(scripts[0].source).toBe('test.redis');
      expect(scripts[0].script).toContain('First script');

      expect(scripts[1].name).toBe('second_script');
      expect(scripts[1].script).toContain('Second script');
    });

    test('should return empty array if no scripts found', () => {
      const content = `
        # Schema with no scripts
        SET key "value";
        HSET hash field "value";
      `;

      const scripts = findLuaScriptsInSchema(content, 'test.redis');

      expect(scripts).toHaveLength(0);
    });

    test('should handle invalid script blocks', () => {
      const content = `
        # Schema with invalid script block
        SCRIPT: incomplete_script
        local key = KEYS[1]
        -- No END_SCRIPT tag

        SCRIPT: valid_script
        local value = ARGV[1]
        return value
        END_SCRIPT
      `;

      const scripts = findLuaScriptsInSchema(content, 'test.redis');

      expect(scripts).toHaveLength(1);
      expect(scripts[0].name).toBe('valid_script');
    });
  });
});
