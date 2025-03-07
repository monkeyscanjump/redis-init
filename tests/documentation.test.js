const { generateDocumentation } = require('../lib/documentation');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('Documentation Module', () => {
  describe('generateDocumentation function', () => {
    // Set up mock files
    beforeEach(() => {
      // Mock the file system
      const mockFiles = {
        'schemas': {
          'users.redis': `
            # Users Schema
            # version: 1
            # description: User management schema

            SET username:john 1000;
            HSET user:1000 name "John" email "john@example.com";
            SADD users 1000;

            SCRIPT: authenticate_user
            -- User authentication
            local username = ARGV[1]
            local password = ARGV[2]
            return {ok = 1}
            END_SCRIPT
          `,
          'products.redis': `
            # Products Schema
            # version: 2
            # description: Product catalog
            # dependencies: users.redis

            HSET product:100 name "Product" price "9.99";
            ZADD products 9.99 100;

            SCRIPT: update_price
            -- Update product price
            local product_id = ARGV[1]
            local new_price = ARGV[2]
            return {ok = 1}
            END_SCRIPT
          `
        }
      };

      // Setup mock filesystem
      fs.__setMockFiles(mockFiles);
      fs.existsSync.mockImplementation((path) => {
        // Check if the path exists in our mock files structure
        return path === 'schemas' || mockFiles.schemas[path.replace('schemas/', '')];
      });

      fs.readdirSync.mockImplementation((dir) => {
        if (dir === 'schemas') {
          return Object.keys(mockFiles.schemas);
        }
        return [];
      });

      fs.readFileSync.mockImplementation((filePath, encoding) => {
        const fileName = path.basename(filePath);
        return mockFiles.schemas[fileName];
      });
    });

    test('should generate documentation for schemas', () => {
      const docs = generateDocumentation('schemas');

      // Check schemas section
      expect(docs.schemas).toHaveProperty('users.redis');
      expect(docs.schemas).toHaveProperty('products.redis');

      // Check users schema details
      expect(docs.schemas['users.redis'].description).toBe('User management schema');
      expect(docs.schemas['users.redis'].version).toBe(1);
      expect(docs.schemas['users.redis'].commandCount).toBeGreaterThan(0);
      expect(docs.schemas['users.redis'].scripts).toContain('authenticate_user');

      // Check products schema details
      expect(docs.schemas['products.redis'].description).toBe('Product catalog');
      expect(docs.schemas['products.redis'].version).toBe(2);
      expect(docs.schemas['products.redis'].dependencies).toContain('users.redis');
      expect(docs.schemas['products.redis'].scripts).toContain('update_price');

      // Check key patterns
      expect(docs.keyPatterns).toHaveProperty('username:*');
      expect(docs.keyPatterns).toHaveProperty('user:*');
      expect(docs.keyPatterns).toHaveProperty('product:*');

      // Check scripts
      expect(docs.scripts).toHaveProperty('authenticate_user');
      expect(docs.scripts).toHaveProperty('update_price');
      expect(docs.scripts['authenticate_user'].source).toBe('users.redis');
      expect(docs.scripts['update_price'].description).toContain('Update product price');

      // Check summary
      expect(docs.summary.schemaCount).toBe(2);
      expect(docs.summary.scriptCount).toBe(2);
    });

    test('should throw error if schemas directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => {
        generateDocumentation('nonexistent-dir');
      }).toThrow(/directory not found/);
    });

    test('should handle empty schemas directory', () => {
      fs.readdirSync.mockReturnValue([]);

      const docs = generateDocumentation('schemas');

      expect(docs.schemas).toEqual({});
      expect(docs.keyPatterns).toEqual({});
      expect(docs.scripts).toEqual({});
      expect(docs.summary.schemaCount).toBe(0);
    });
  });
});
