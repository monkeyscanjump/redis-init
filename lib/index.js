/**
 * Redis Initialization Module
 *
 * Main entry point for redis-init module.
 */

const { createRedisClient, testConnection, flushDatabase, loadRedisConfig } = require('./client');
const { loadSchemas, validateSchemas } = require('./schema-loader');
const { applyTTL } = require('./utils');
const { backupRedisData, restoreRedisData } = require('./backup');
const { performHealthCheck } = require('./health-check');
const { configureAcl } = require('./security');
const { generateDocumentation } = require('./documentation');
const { registerLuaScripts } = require('./lua-scripts');

/**
 * Initialize Redis with schema files
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} - Result of initialization with success flag
 */
async function redisInit(options = {}) {
  const config = {
    // Connection options
    host: options.host || '127.0.0.1',
    port: options.port || 6379,
    password: options.password || null,
    database: options.database || 0,
    timeout: options.timeout || 5000,
    ssl: options.ssl || false,

    // Schema options
    schemasDir: options.schemasDir || './schemas',
    prefix: options.prefix || '',
    variables: options.variables || {},

    // Behavior options
    flush: options.flush || false,
    flushMode: options.flushMode || 'db',
    deploymentType: options.deploymentType || 'standalone',
    dryRun: options.dryRun || false,
    batchSize: options.batchSize || 100,
    useTransactions: options.useTransactions || false,

    // Advanced features
    backupFile: options.backupFile || null,
    ttlRules: options.ttlRules || {},
    aclSetup: options.aclSetup || null,

    // UI options
    verbose: options.verbose || false,
    color: options.color !== undefined ? options.color : true,
    interactive: options.interactive !== undefined ? options.interactive : process.stdin.isTTY
  };

  let client;
  try {
    // Load Redis configuration file if specified
    if (options.configFile) {
      const configResult = await loadRedisConfig(options.configFile);
      if (configResult.success) {
        Object.assign(config, configResult.config);
      }
    }

    // Create Redis client
    client = createRedisClient(config);

    // Test connection
    const connected = await testConnection(client, config);
    if (!connected) {
      return { success: false, error: 'Failed to connect to Redis server' };
    }

    // Select database if specified
    if (config.database !== 0) {
      try {
        await client.select(config.database);
        console.log(`Switched to database ${config.database}`);
      } catch (error) {
        return { success: false, error: `Failed to select database ${config.database}: ${error.message}` };
      }
    }

    // Perform health check
    if (options.performHealthCheck) {
      const health = await performHealthCheck(client, config);
      if (health.status !== 'healthy') {
        return { success: false, error: `Redis health check failed: ${health.error}` };
      }
    }

    // Create backup if requested
    if (config.backupFile) {
      const backupResult = await backupRedisData(client, config);
      if (!backupResult.success) {
        return { success: false, error: `Backup failed: ${backupResult.error}` };
      }
    }

    // Flush database if requested
    if (config.flush) {
      const flushed = await flushDatabase(client, config);
      if (!flushed) {
        console.warn('Warning: Database flush failed, continuing with initialization');
      }
    }

    // Register Lua scripts from schemas
    const scriptsResult = await registerLuaScripts(client, config);
    if (!scriptsResult.success) {
      console.warn(`Warning: Some Lua scripts failed to register: ${scriptsResult.error}`);
    }

    // Load schemas
    const schemasLoaded = await loadSchemas(client, config);
    if (!schemasLoaded.success) {
      return {
        success: false,
        error: 'Schema loading failed',
        details: schemasLoaded.details
      };
    }

    // Apply TTL rules if specified
    if (Object.keys(config.ttlRules).length > 0) {
      await applyTTL(client, config);
    }

    // Configure Redis ACL if specified
    if (config.aclSetup) {
      await configureAcl(client, config);
    }

    // Validate schemas
    const validationResult = await validateSchemas(client, config);
    if (!validationResult.success) {
      console.warn('Schema validation failed. Check for errors.');
    }

    return {
      success: true,
      commandsExecuted: schemasLoaded.commandsExecuted,
      filesProcessed: schemasLoaded.filesProcessed,
      scriptCount: scriptsResult.count || 0,
      dbSize: validationResult.dbSize || 0,
      prefix: config.prefix
    };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    // Close Redis connection
    if (client) {
      try {
        await client.quit();
      } catch (error) {
        console.error(`Error disconnecting: ${error.message}`);
      }
    }
  }
}

/**
 * Initialize Redis with schema files from a string or buffer
 * @param {Object} options - Initialization options
 * @param {string|Buffer} schemaContent - Schema content
 * @param {string} schemaName - Name for the schema
 * @returns {Promise<Object>} - Result of initialization with success flag
 */
async function redisInitFromString(options = {}, schemaContent, schemaName = 'inline-schema') {
  const config = {
    ...options,
    schemaContent,
    schemaName
  };

  let client;
  try {
    // Create Redis client
    client = createRedisClient(config);

    // Test connection
    const connected = await testConnection(client, config);
    if (!connected) {
      return { success: false, error: 'Failed to connect to Redis server' };
    }

    // Select database if specified
    if (config.database !== 0) {
      try {
        await client.select(config.database);
        console.log(`Switched to database ${config.database}`);
      } catch (error) {
        return { success: false, error: `Failed to select database ${config.database}: ${error.message}` };
      }
    }

    // Create backup if requested
    if (config.backupFile) {
      const backupResult = await backupRedisData(client, config);
      if (!backupResult.success) {
        return { success: false, error: `Backup failed: ${backupResult.error}` };
      }
    }

    // Flush database if requested
    if (config.flush) {
      const flushed = await flushDatabase(client, config);
      if (!flushed) {
        console.warn('Warning: Database flush failed, continuing with initialization');
      }
    }

    // Register Lua scripts from schema content
    const scriptsResult = await registerLuaScripts(client, config, true);
    if (!scriptsResult.success) {
      console.warn(`Warning: Some Lua scripts failed to register: ${scriptsResult.error}`);
    }

    // Load schema from string
    const result = await loadSchemas(client, config, true);
    if (!result.success) {
      return {
        success: false,
        error: 'Schema loading failed',
        details: result.details
      };
    }

    // Apply TTL rules if specified
    if (Object.keys(config.ttlRules || {}).length > 0) {
      await applyTTL(client, config);
    }

    // Configure Redis ACL if specified
    if (config.aclSetup) {
      await configureAcl(client, config);
    }

    // Validate schemas
    const validationResult = await validateSchemas(client, config);
    if (!validationResult.success) {
      console.warn('Schema validation failed. Check for errors.');
    }

    return {
      success: true,
      commandsExecuted: result.commandsExecuted,
      scriptCount: scriptsResult.count || 0,
      dbSize: validationResult.dbSize || 0,
      prefix: config.prefix
    };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    // Close Redis connection
    if (client) {
      try {
        await client.quit();
      } catch (error) {
        console.error(`Error disconnecting: ${error.message}`);
      }
    }
  }
}

// Export module functionality
module.exports = {
  redisInit,
  redisInitFromString,
  performHealthCheck,
  backupRedisData,
  restoreRedisData,
  generateDocumentation
};
