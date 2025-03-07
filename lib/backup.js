/**
 * Backup and restore module
 *
 * Handles backing up and restoring Redis data.
 */

const fs = require('fs-extra');
const { log } = require('./utils');

/**
 * Backup Redis data to a file
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Backup result
 */
async function backupRedisData(client, config) {
  try {
    if (!config.backupFile) {
      return { success: false, error: 'No backup file specified' };
    }

    log('info', `Backing up Redis data to ${config.backupFile}...`, config);

    const pattern = config.prefix ? `${config.prefix}*` : '*';
    let keys;

    try {
      keys = await client.keys(pattern);
    } catch (error) {
      return { success: false, error: `Failed to get keys: ${error.message}` };
    }

    if (keys.length === 0) {
      log('warn', `No keys found matching pattern ${pattern}`, config);

      // Create an empty backup file
      await fs.writeFile(config.backupFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        prefix: config.prefix || '',
        host: config.host,
        port: config.port,
        database: config.database || 0,
        keys: {}
      }, null, 2));

      return { success: true, count: 0 };
    }

    log('info', `Found ${keys.length} keys to backup`, config);

    const backup = {
      timestamp: new Date().toISOString(),
      prefix: config.prefix || '',
      host: config.host,
      port: config.port,
      database: config.database || 0,
      keys: {}
    };

    // Process keys in batches to avoid memory issues
    const batchSize = 1000;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batchKeys = keys.slice(i, i + batchSize);

      for (const key of batchKeys) {
        try {
          const type = await client.type(key);

          switch (type) {
            case 'string':
              backup.keys[key] = {
                type,
                value: await client.get(key),
                ttl: await client.ttl(key)
              };
              break;

            case 'hash':
              backup.keys[key] = {
                type,
                value: await client.hGetAll(key),
                ttl: await client.ttl(key)
              };
              break;

            case 'list':
              backup.keys[key] = {
                type,
                value: await client.lRange(key, 0, -1),
                ttl: await client.ttl(key)
              };
              break;

            case 'set':
              backup.keys[key] = {
                type,
                value: await client.sMembers(key),
                ttl: await client.ttl(key)
              };
              break;

            case 'zset':
              const members = await client.zRange(key, 0, -1, { WITHSCORES: true });
              const zsetValue = {};

              // Convert array [member1, score1, member2, score2, ...] to object
              for (let i = 0; i < members.length; i += 2) {
                zsetValue[members[i]] = parseFloat(members[i + 1]);
              }

              backup.keys[key] = {
                type,
                value: zsetValue,
                ttl: await client.ttl(key)
              };
              break;

            case 'stream':
              log('warn', `Stream backup not supported for key ${key}`, config);
              backup.keys[key] = {
                type,
                value: null,
                ttl: await client.ttl(key),
                error: 'Stream backup not supported'
              };
              break;

            default:
              log('warn', `Unknown type ${type} for key ${key}`, config);
              backup.keys[key] = {
                type,
                value: null,
                error: `Unknown type: ${type}`
              };
          }

          if (i % 100 === 0 && config.verbose) {
            log('info', `Processed ${i} of ${keys.length} keys...`, config);
          }
        } catch (error) {
          log('error', `Failed to backup key ${key}: ${error.message}`, config);
          backup.keys[key] = {
            error: error.message
          };
        }
      }
    }

    // Save backup to file
    await fs.ensureDir(path.dirname(config.backupFile));
    await fs.writeFile(config.backupFile, JSON.stringify(backup, null, 2));

    log('success', `Backup successful: ${keys.length} keys saved to ${config.backupFile}`, config);
    return { success: true, count: keys.length };
  } catch (error) {
    log('error', `Backup failed: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

/**
 * Restore Redis data from a backup file
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Restore result
 */
async function restoreRedisData(client, config) {
  try {
    if (!config.backupFile) {
      return { success: false, error: 'No backup file specified' };
    }

    if (!fs.existsSync(config.backupFile)) {
      return { success: false, error: `Backup file not found: ${config.backupFile}` };
    }

    log('info', `Restoring Redis data from ${config.backupFile}...`, config);

    // Load backup data
    const backup = JSON.parse(await fs.readFile(config.backupFile, 'utf8'));
    const keys = Object.keys(backup.keys);

    if (keys.length === 0) {
      log('warn', 'Backup file contains no keys', config);
      return { success: true, count: 0 };
    }

    log('info', `Found ${keys.length} keys to restore`, config);

    // Confirm restore if interactive
    if (config.interactive) {
      const answers = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Restore ${keys.length} keys from backup? This may overwrite existing data.`,
        default: false
      }]);

      if (!answers.confirm) {
        log('warn', 'Restore cancelled.', config);
        return { success: false, error: 'Restore cancelled by user' };
      }
    }

    // Check if prefix should be adjusted
    let targetPrefix = config.prefix || '';
    const backupPrefix = backup.prefix || '';

    if (backupPrefix !== targetPrefix) {
      log('info', `Adjusting key prefixes from "${backupPrefix}" to "${targetPrefix}"`, config);
    }

    // Restore keys in batches
    let restoredCount = 0;
    let errorCount = 0;
    const pipeline = client.pipeline();

    for (const [key, data] of Object.entries(backup.keys)) {
      if (data.error) {
        log('warn', `Skipping key ${key}: ${data.error}`, config);
        errorCount++;
        continue;
      }

      // Adjust key prefix if needed
      let targetKey = key;
      if (backupPrefix !== targetPrefix) {
        if (key.startsWith(backupPrefix)) {
          targetKey = targetPrefix + key.substring(backupPrefix.length);
        } else {
          targetKey = targetPrefix + key;
        }
      }

      try {
        switch (data.type) {
          case 'string':
            pipeline.set(targetKey, data.value);
            break;

          case 'hash':
            if (Object.keys(data.value).length > 0) {
              pipeline.hSet(targetKey, data.value);
            }
            break;

          case 'list':
            if (data.value.length > 0) {
              pipeline.del(targetKey); // Clear existing list
              pipeline.rPush(targetKey, data.value);
            }
            break;

          case 'set':
            if (data.value.length > 0) {
              pipeline.del(targetKey); // Clear existing set
              pipeline.sAdd(targetKey, data.value);
            }
            break;

          case 'zset':
            if (Object.keys(data.value).length > 0) {
              pipeline.del(targetKey); // Clear existing zset

              // Convert object to array of score-member pairs
              const args = [];
              for (const [member, score] of Object.entries(data.value)) {
                args.push(score);
                args.push(member);
              }

              pipeline.zAdd(targetKey, args);
            }
            break;

          default:
            log('warn', `Cannot restore key ${key} of type ${data.type}`, config);
            errorCount++;
            continue;
        }

        // Set TTL if it was finite
        if (data.ttl && data.ttl > 0) {
          pipeline.expire(targetKey, data.ttl);
        }

        restoredCount++;
      } catch (error) {
        log('error', `Failed to restore key ${key}: ${error.message}`, config);
        errorCount++;
      }

      // Execute pipeline in batches to avoid memory issues
      if (pipeline.length >= 1000) {
        await pipeline.exec();
        pipeline.length = 0; // Clear pipeline
      }
    }

    // Execute any remaining commands
    if (pipeline.length > 0) {
      await pipeline.exec();
    }

    log('success', `Restore completed: ${restoredCount} keys restored, ${errorCount} errors`, config);
    return { success: true, count: restoredCount, errors: errorCount };
  } catch (error) {
    log('error', `Restore failed: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  backupRedisData,
  restoreRedisData
};
