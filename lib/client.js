/**
 * Redis Client Module
 *
 * Handles Redis client creation and connection management.
 */

const redis = require('redis');
const fs = require('fs');
const inquirer = require('inquirer');
const { log } = require('./utils');

/**
 * Create and configure Redis client
 * @param {Object} config - Redis configuration
 * @returns {Object} - Redis client
 */
function createRedisClient(config) {
  const clientOptions = {
    socket: {
      host: config.host,
      port: parseInt(config.port),
      connectTimeout: parseInt(config.timeout),
      tls: config.ssl
    },
    password: config.password,
    database: config.database || 0
  };

  if (config.verbose) {
    log('info', 'Creating Redis client with options:', config);
    // Clone options to avoid displaying the password in logs
    const safeOptions = { ...clientOptions, password: clientOptions.password ? '******' : undefined };
    log('info', JSON.stringify(safeOptions, null, 2), config, false);
  }

  return redis.createClient(clientOptions);
}

/**
 * Test Redis connection
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<boolean>} - Connection success
 */
async function testConnection(client, config) {
  try {
    log('info', `Testing connection to Redis at ${config.host}:${config.port}...`, config);
    await client.connect();
    log('success', 'Connection successful!', config);

    // Get Redis info
    const info = await client.info();
    const version = info.match(/redis_version:(.*)/)?.[1]?.trim() || 'Unknown';
    const mode = info.match(/redis_mode:(.*)/)?.[1]?.trim() || 'standalone';

    log('success', `Redis Version: ${version}`, config);
    log('success', `Redis Mode: ${mode}`, config);

    if (config.prefix) {
      log('info', `Using key prefix: "${config.prefix}"`, config);
    }

    return true;
  } catch (error) {
    log('error', `Failed to connect to Redis: ${error.message}`, config);
    return false;
  }
}

/**
 * Load Redis configuration from file
 * @param {string} filePath - Path to configuration file
 * @returns {Promise<Object>} - Loaded configuration
 */
async function loadRedisConfig(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Configuration file not found: ${filePath}` };
    }

    // Read and parse file based on extension
    if (filePath.endsWith('.json')) {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { success: true, config };
    } else if (filePath.endsWith('.conf')) {
      // Basic Redis conf file parser
      const content = fs.readFileSync(filePath, 'utf8');
      const config = {};

      // Extract key settings
      const hostMatch = content.match(/^host\s+(.+)$/m);
      if (hostMatch) config.host = hostMatch[1];

      const portMatch = content.match(/^port\s+(\d+)$/m);
      if (portMatch) config.port = parseInt(portMatch[1]);

      const passwordMatch = content.match(/^requirepass\s+(.+)$/m);
      if (passwordMatch) config.password = passwordMatch[1];

      const databaseMatch = content.match(/^databases\s+(\d+)$/m);
      if (databaseMatch) config.databases = parseInt(databaseMatch[1]);

      return { success: true, config };
    } else {
      return { success: false, error: `Unsupported configuration file format: ${filePath}` };
    }
  } catch (error) {
    return { success: false, error: `Failed to load Redis configuration: ${error.message}` };
  }
}

/**
 * Flush Redis database
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<boolean>} - Flush success
 */
async function flushDatabase(client, config) {
  if (!config.flush) return true;

  try {
    let flushMode = config.flushMode || 'all';
    let flushMessage = '';
    let flushPrompt = '';
    let flushCommand = 'flushAll';

    // Determine what we're flushing
    if (flushMode === 'all') {
      flushMessage = 'Flushing all Redis databases...';
      flushPrompt = 'Are you sure you want to flush ALL Redis databases? This will delete ALL data in ALL databases.';
      flushCommand = 'flushAll';
    } else if (flushMode === 'db') {
      flushMessage = `Flushing Redis database ${config.database}...`;
      flushPrompt = `Are you sure you want to flush Redis database ${config.database}? This will delete ALL data in this database.`;
      flushCommand = 'flushDb';
    } else if (flushMode === 'prefix' && config.prefix) {
      flushMessage = `Flushing Redis keys with prefix "${config.prefix}"...`;
      flushPrompt = `Are you sure you want to flush all Redis keys with prefix "${config.prefix}"?`;
      // We'll handle this differently
      flushCommand = 'custom';
    } else {
      // Default to flushing current DB
      flushMode = 'db';
      flushMessage = `Flushing Redis database ${config.database}...`;
      flushPrompt = `Are you sure you want to flush Redis database ${config.database}? This will delete ALL data in this database.`;
      flushCommand = 'flushDb';
    }

    // Confirm with user unless it's a non-interactive environment
    if (config.interactive) {
      const answers = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: flushPrompt,
        default: false
      }]);

      if (!answers.confirm) {
        log('warn', 'Database flush cancelled.', config);
        return true;
      }
    } else {
      log('warn', 'Non-interactive mode: proceeding with database flush as requested.', config);
    }

    log('warn', flushMessage, config);

    // Execute the flush
    if (flushCommand === 'custom') {
      // Handle prefix-based flushing
      if (!config.prefix) {
        log('error', 'Prefix-based flush requested but no prefix provided.', config);
        return false;
      }

      const pattern = `${config.prefix}*`;
      const keys = await client.keys(pattern);

      if (keys.length === 0) {
        log('warn', `No keys found with prefix "${config.prefix}"`, config);
        return true;
      }

      log('info', `Found ${keys.length} keys with prefix "${config.prefix}"`, config);

      if (keys.length > 0) {
        // Delete in batches to avoid blocking Redis for too long
        const batchSize = 1000;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, Math.min(i + batchSize, keys.length));
          await client.del(batch);
        }
        log('success', `Successfully deleted ${keys.length} keys with prefix "${config.prefix}"`, config);
      }
    } else {
      // Execute standard flush command
      await client[flushCommand]();
      log('success', 'Database flushed successfully.', config);
    }

    return true;
  } catch (error) {
    log('error', `Failed to flush database: ${error.message}`, config);
    return false;
  }
}

module.exports = {
  createRedisClient,
  testConnection,
  flushDatabase,
  loadRedisConfig
};
