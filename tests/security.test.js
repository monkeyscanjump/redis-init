const { configureAcl } = require('../lib/security');

describe('Security Module', () => {
  describe('configureAcl function', () => {
    test('should configure ACL users', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:6.2.6'),
        sendCommand: jest.fn().mockResolvedValue('OK'),
        aclSave: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'app_user',
              password: 'secret',
              enabled: true,
              keyPatterns: ['user:*', 'session:*'],
              commands: ['+get', '+set', '+hset', '+hmget'],
              categories: ['+@read', '+@hash', '-@dangerous']
            }
          ],
          saveToConfig: true
        },
        prefix: 'myapp:',
        verbose: false
      };

      console.log = jest.fn(); // Mock console.log

      const result = await configureAcl(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.userCount).toBe(1);
      expect(mockClient.sendCommand).toHaveBeenCalledWith(
        expect.arrayContaining(['ACL', 'SETUSER', 'app_user'])
      );
      expect(mockClient.aclSave).toHaveBeenCalled();
    });

    test('should fail if Redis version is too old', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:5.0.9')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'app_user',
              password: 'secret'
            }
          ]
        }
      };

      console.log = jest.fn(); // Mock console.log

      const result = await configureAcl(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires Redis 6.0 or higher');
    });

    test('should validate user configurations', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:6.2.6'),
        sendCommand: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'valid_user',
              password: 'secret',
              enabled: true
            },
            {
              // Missing username
              password: 'secret',
              enabled: true
            },
            {
              username: 'no_password',
              // Missing password
              enabled: true
            }
          ]
        }
      };

      console.log = jest.fn(); // Mock console.log

      const result = await configureAcl(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true); // Valid user
      expect(result.results[1].success).toBe(false); // Missing username
      expect(result.results[2].success).toBe(false); // Missing password
    });

    test('should apply prefix to key patterns', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:6.2.6'),
        sendCommand: jest.fn().mockResolvedValue('OK'),
        aclSave: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'app_user',
              password: 'secret',
              enabled: true,
              keyPatterns: ['user:*', 'session:*']
            }
          ]
        },
        prefix: 'myapp:'
      };

      console.log = jest.fn(); // Mock console.log

      await configureAcl(mockClient, config);

      // Check that the key patterns were prefixed
      expect(mockClient.sendCommand).toHaveBeenCalledWith(
        expect.arrayContaining(['~myapp:user:*', '~myapp:session:*'])
      );
    });

    test('should return error for invalid ACL configuration', async () => {
      const mockClient = {};

      const config = {};

      console.log = jest.fn(); // Mock console.log

      const result = await configureAcl(mockClient, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ACL configuration');
    });

    test('should not save ACL config if saveToConfig is false', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:6.2.6'),
        sendCommand: jest.fn().mockResolvedValue('OK'),
        aclSave: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'app_user',
              password: 'secret',
              enabled: true
            }
          ],
          saveToConfig: false
        }
      };

      console.log = jest.fn(); // Mock console.log

      await configureAcl(mockClient, config);

      expect(mockClient.aclSave).not.toHaveBeenCalled();
    });

    test('should not execute commands in dry run mode', async () => {
      const mockClient = {
        info: jest.fn().mockResolvedValue('redis_version:6.2.6'),
        sendCommand: jest.fn().mockResolvedValue('OK'),
        aclSave: jest.fn().mockResolvedValue('OK')
      };

      const config = {
        aclSetup: {
          users: [
            {
              username: 'app_user',
              password: 'secret',
              enabled: true
            }
          ]
        },
        dryRun: true
      };

      console.log = jest.fn(); // Mock console.log

      const result = await configureAcl(mockClient, config);

      expect(result.success).toBe(true);
      expect(result.results[0].dryRun).toBe(true);
      expect(mockClient.sendCommand).not.toHaveBeenCalled();
      expect(mockClient.aclSave).not.toHaveBeenCalled();
    });
  });
});
