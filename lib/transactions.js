/**
 * Transaction support module
 *
 * Provides Redis transaction support for atomic operations.
 */

const { log } = require('./utils');

/**
 * Execute commands in a Redis transaction
 * @param {Object} client - Redis client
 * @param {Array} commands - List of commands to execute
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Transaction result
 */
async function executeInTransaction(client, commands, config) {
  if (commands.length === 0) return { success: true, commandsExecuted: 0 };

  try {
    // Start transaction
    const multi = client.multi();

    // Queue commands
    for (const command of commands) {
      if (command.length === 0) continue;

      const cmd = command[0].toUpperCase();
      const args = command.slice(1);

      try {
        if (config?.verbose) {
          log('info', `Adding to transaction: ${cmd} ${args.join(' ')}`, config);
        }

        multi.sendCommand([cmd, ...args]);
      } catch (error) {
        return { success: false, error: `Failed to add command to transaction: ${error.message}` };
      }
    }

    // Execute transaction
    log('info', `Executing transaction with ${commands.length} commands...`, config);
    const results = await multi.exec();

    // Check for errors in results
    const errors = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i] instanceof Error) {
        errors.push({
          index: i,
          command: commands[i].join(' '),
          error: results[i].message
        });
      }
    }

    if (errors.length > 0) {
      log('error', `Transaction had ${errors.length} errors`, config);
      if (config?.verbose) {
        for (const error of errors) {
          log('error', `Command ${error.index}: ${error.command} - ${error.error}`, config);
        }
      }
      return {
        success: false,
        error: `Transaction had ${errors.length} errors`,
        errors
      };
    }

    log('success', `Transaction executed successfully with ${commands.length} commands`, config);
    return { success: true, commandsExecuted: commands.length };
  } catch (error) {
    log('error', `Transaction failed: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  executeInTransaction
};
