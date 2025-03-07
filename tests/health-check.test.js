const { performHealthCheck } = require('../lib/health-check');

describe('Health Check Module', () => {
  describe('performHealthCheck function', () => {
    test('should return healthy status for healthy Redis', async () => {
      const mockClient = {
        ping: jest.fn().mockResolvedValue('PONG'),
        info: jest.fn().mockResolvedValue(
          'redis_version:6.2.6\n' +
          'uptime_in_seconds:3600\n' +
          'connected_clients:10\n' +
          'used_memory_human:10M\n' +
          'maxmemory_human:100M'
        ),
        dbSize: jest.fn().mockResolvedValue(100)
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('healthy');
      expect(health.ping).toBe(true);
      expect(health.version).toBe('6.2.6');
      expect(health.uptime).toBe(3600);
      expect(health.connectedClients).toBe(10);
      expect(health.usedMemory).toBe('10M');
      expect(health.maxMemory).toBe('100M');
      expect(health.dbSize).toBe(100);
      expect(health.responseTime).toBeGreaterThan(0);
    });

    test('should return warning status for high memory usage', async () => {
      const mockClient = {
        ping: jest.fn().mockResolvedValue('PONG'),
        info: jest.fn().mockResolvedValue(
          'redis_version:6.2.6\n' +
          'uptime_in_seconds:3600\n' +
          'connected_clients:10\n' +
          'used_memory_human:95M\n' +
          'maxmemory_human:100M'
        ),
        dbSize: jest.fn().mockResolvedValue(100)
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('warning');
      expect(health.warnings).toHaveLength(1);
      expect(health.warnings[0]).toContain('High memory usage');
    });

    test('should return warning status for high client count', async () => {
      const mockClient = {
        ping: jest.fn().mockResolvedValue('PONG'),
        info: jest.fn().mockResolvedValue(
          'redis_version:6.2.6\n' +
          'uptime_in_seconds:3600\n' +
          'connected_clients:6000\n' +
          'used_memory_human:10M\n' +
          'maxmemory_human:100M'
        ),
        dbSize: jest.fn().mockResolvedValue(100)
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('warning');
      expect(health.warnings).toHaveLength(1);
      expect(health.warnings[0]).toContain('High number of connected clients');
    });

    test('should return unhealthy status if ping fails', async () => {
      const mockClient = {
        ping: jest.fn().mockRejectedValue(new Error('Connection refused')),
        info: jest.fn(),
        dbSize: jest.fn()
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('Connection refused');
      expect(mockClient.info).not.toHaveBeenCalled();
      expect(mockClient.dbSize).not.toHaveBeenCalled();
    });

    test('should continue health check even if info command fails', async () => {
      const mockClient = {
        ping: jest.fn().mockResolvedValue('PONG'),
        info: jest.fn().mockRejectedValue(new Error('Info command failed')),
        dbSize: jest.fn().mockResolvedValue(100)
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('healthy');
      expect(health.ping).toBe(true);
      expect(health.infoError).toBe('Info command failed');
      expect(health.dbSize).toBe(100);
    });

    test('should handle unexpected errors', async () => {
      const mockClient = {
        ping: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        })
      };

      const config = {
        host: 'localhost',
        port: 6379
      };

      console.log = jest.fn(); // Mock console.log

      const health = await performHealthCheck(mockClient, config);

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Unexpected error');
    });
  });
});
