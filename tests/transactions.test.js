const { executeInTransaction } = require('../lib/transactions');

describe('Transactions Module', () => {
  describe('executeInTransaction function', () => {
    test('should execute commands in a transaction', async () => {
      const mockMulti = {
        sendCommand: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(['OK', 'OK'])
      };

      const mockClient = {
        multi: jest.fn().mockReturnValue(mockMulti)
      };

      const commands = [
        ['SET', 'key1', 'value1'],
        ['SET', 'key2', 'value2']
      ];

      const result = await executeInTransaction(mockClient, commands, { verbose: false });

      expect(result.success).toBe(true);
      expect(result.commandsExecuted).toBe(2);
      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockMulti.sendCommand).toHaveBeenCalledTimes(2);
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    test('should handle empty commands list', async () => {
      const mockClient = {
        multi: jest.fn()
      };

      const result = await executeInTransaction(mockClient, [], {});

      expect(result.success).toBe(true);
      expect(result.commandsExecuted).toBe(0);
      expect(mockClient.multi).not.toHaveBeenCalled();
    });

    test('should handle errors when adding commands to transaction', async () => {
      const mockMulti = {
        sendCommand: jest.fn().mockImplementation(() => {
          throw new Error('Invalid command');
        })
      };

      const mockClient = {
        multi: jest.fn().mockReturnValue(mockMulti)
      };

      const commands = [
        ['INVALID', 'key1', 'value1']
      ];

      const result = await executeInTransaction(mockClient, commands, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to add command');
    });

    test('should handle transaction execution errors', async () => {
      const mockMulti = {
        sendCommand: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Transaction failed'))
      };

      const mockClient = {
        multi: jest.fn().mockReturnValue(mockMulti)
      };

      const commands = [
        ['SET', 'key1', 'value1']
      ];

      const result = await executeInTransaction(mockClient, commands, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction failed');
    });

    test('should handle errors in transaction results', async () => {
      const error = new Error('Command failed');
      const mockMulti = {
        sendCommand: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          'OK',
          error
        ])
      };

      const mockClient = {
        multi: jest.fn().mockReturnValue(mockMulti)
      };

      const commands = [
        ['SET', 'key1', 'value1'],
        ['SET', 'key2', 'value2']
      ];

      const config = { verbose: true };
      console.log = jest.fn(); // Mock console.log to avoid output in tests

      const result = await executeInTransaction(mockClient, commands, config);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Command failed');
    });
  });
});
