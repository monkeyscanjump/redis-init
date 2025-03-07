/**
 * Utility functions for redis-init
 */

const chalk = require('chalk');

/**
 * Log a message with appropriate formatting
 * @param {string} level - Log level (info, success, warn, error)
 * @param {string} message - Message to log
 * @param {Object} config - Configuration object
 * @param {boolean} prefix - Whether to include log level prefix
 */
function log(level, message, config = { color: true }, prefix = true) {
  const colorize = config?.color !== false;

  let formattedMessage = message;

  if (prefix) {
    switch (level) {
      case 'info':
        formattedMessage = colorize ? chalk.blue(`INFO: ${message}`) : `INFO: ${message}`;
        break;
      case 'success':
        formattedMessage = colorize ? chalk.green(`SUCCESS: ${message}`) : `SUCCESS: ${message}`;
        break;
      case 'warn':
        formattedMessage = colorize ? chalk.yellow(`WARNING: ${message}`) : `WARNING: ${message}`;
        break;
      case 'error':
        formattedMessage = colorize ? chalk.red(`ERROR: ${message}`) : `ERROR: ${message}`;
        break;
      default:
        formattedMessage = message;
    }
  } else {
    switch (level) {
      case 'info':
        formattedMessage = colorize ? chalk.blue(message) : message;
        break;
      case 'success':
        formattedMessage = colorize ? chalk.green(message) : message;
        break;
      case 'warn':
        formattedMessage = colorize ? chalk.yellow(message) : message;
        break;
      case 'error':
        formattedMessage = colorize ? chalk.red(message) : message;
        break;
    }
  }

  console.log(formattedMessage);
}

/**
 * Apply prefix to a Redis command
 * @param {Array} command - Command parts
 * @param {string} prefix - Key prefix
 * @returns {Array} - Command with prefixed keys
 */
function applyPrefixToCommand(command, prefix) {
  if (!prefix || prefix.length === 0 || command.length === 0) {
    return command;
  }

  const cmd = command[0].toUpperCase();
  const args = [...command.slice(1)];

  // Commands where the first argument is always a key
  const firstArgKeyCommands = [
    'APPEND', 'DECR', 'DECRBY', 'DEL', 'EXISTS', 'EXPIRE', 'EXPIREAT',
    'GET', 'GETBIT', 'GETRANGE', 'GETSET', 'HDEL', 'HEXISTS', 'HGET',
    'HGETALL', 'HINCRBY', 'HINCRBYFLOAT', 'HKEYS', 'HLEN', 'HMGET',
    'HMSET', 'HSET', 'HSETNX', 'HSTRLEN', 'HVALS', 'INCR', 'INCRBY',
    'INCRBYFLOAT', 'LINDEX', 'LINSERT', 'LLEN', 'LPOP', 'LPUSH',
    'LPUSHX', 'LRANGE', 'LREM', 'LSET', 'LTRIM', 'PERSIST', 'PEXPIRE',
    'PEXPIREAT', 'PSETEX', 'PTTL', 'RENAME', 'RENAMENX', 'RPOP', 'RPUSH',
    'RPUSHX', 'SADD', 'SCARD', 'SDIFF', 'SDIFFSTORE', 'SET', 'SETBIT',
    'SETEX', 'SETNX', 'SETRANGE', 'SINTER', 'SINTERSTORE', 'SISMEMBER',
    'SMEMBERS', 'SMOVE', 'SPOP', 'SRANDMEMBER', 'SREM', 'STRLEN',
    'SUNION', 'SUNIONSTORE', 'TTL', 'TYPE', 'ZADD', 'ZCARD', 'ZCOUNT',
    'ZINCRBY', 'ZINTERSTORE', 'ZLEXCOUNT', 'ZRANGE', 'ZRANGEBYLEX',
    'ZRANGEBYSCORE', 'ZRANK', 'ZREM', 'ZREMRANGEBYLEX', 'ZREMRANGEBYRANK',
    'ZREMRANGEBYSCORE', 'ZREVRANGE', 'ZREVRANGEBYLEX', 'ZREVRANGEBYSCORE',
    'ZREVRANK', 'ZSCORE', 'ZUNIONSTORE'
  ];

  // Special cases for commands with multiple keys or special formats
  switch (cmd) {
    case 'MSET':
    case 'MSETNX':
      // Every odd argument is a key
      for (let i = 0; i < args.length; i += 2) {
        args[i] = `${prefix}${args[i]}`;
      }
      break;

    case 'MGET':
      // All arguments are keys
      for (let i = 0; i < args.length; i++) {
        args[i] = `${prefix}${args[i]}`;
      }
      break;

    case 'RENAME':
    case 'RENAMENX':
      // First two arguments are keys
      if (args.length >= 2) {
        args[0] = `${prefix}${args[0]}`;
        args[1] = `${prefix}${args[1]}`;
      }
      break;

    case 'SCAN':
      // Second argument might be a MATCH pattern
      for (let i = 1; i < args.length; i++) {
        if (args[i].toUpperCase() === 'MATCH' && i + 1 < args.length) {
          // Skip adding prefix if pattern already includes glob characters
          if (!args[i + 1].includes('*') && !args[i + 1].includes('?') && !args[i + 1].includes('[')) {
            args[i + 1] = `${prefix}${args[i + 1]}`;
          }
          break;
        }
      }
      break;

    case 'EVALSHA':
    case 'EVAL':
      // Handle Lua script calls - first arg is script/sha, second is key count
      // Then come keys, which need prefixes
      if (args.length >= 2) {
        const keyCount = parseInt(args[1], 10);
        if (!isNaN(keyCount) && keyCount > 0) {
          for (let i = 2; i < 2 + keyCount && i < args.length; i++) {
            args[i] = `${prefix}${args[i]}`;
          }
        }
      }
      break;

    default:
      // For commands where first argument is always a key
      if (firstArgKeyCommands.includes(cmd) && args.length > 0) {
        args[0] = `${prefix}${args[0]}`;
      }
      break;
  }

  return [cmd, ...args];
}

/**
 * Apply TTL rules to Redis keys
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Result of TTL application
 */
async function applyTTL(client, config) {
  try {
    const expiryRules = config.ttlRules || {};

    if (Object.keys(expiryRules).length === 0) {
      return { success: true, keysAffected: 0 };
    }

    log('info', 'Applying TTL rules...', config);

    let totalKeysAffected = 0;

    for (const [pattern, seconds] of Object.entries(expiryRules)) {
      const fullPattern = config.prefix ? `${config.prefix}${pattern}` : pattern;
      const keys = await client.keys(fullPattern);

      if (keys.length === 0) {
        log('info', `No keys matched pattern ${fullPattern}`, config);
        continue;
      }

      log('info', `Applying TTL of ${seconds}s to ${keys.length} keys matching ${fullPattern}`, config);

      // Apply TTL in batches to avoid blocking Redis
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, Math.min(i + batchSize, keys.length));
        const pipeline = client.pipeline();

        for (const key of batch) {
          pipeline.expire(key, seconds);
        }

        await pipeline.exec();
      }

      totalKeysAffected += keys.length;
    }

    log('success', `Applied TTL rules to ${totalKeysAffected} keys`, config);
    return { success: true, keysAffected: totalKeysAffected };
  } catch (error) {
    log('error', `Failed to apply TTL rules: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  log,
  applyPrefixToCommand,
  applyTTL
};
