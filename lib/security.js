/**
 * Security module
 *
 * Provides security related functionalities for Redis.
 */

const { log } = require('./utils');

/**
 * Configure Redis ACL
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - ACL configuration result
 */
async function configureAcl(client, config) {
  try {
    if (!config.aclSetup || typeof config.aclSetup !== 'object') {
      return { success: false, error: 'Invalid ACL configuration' };
    }

    log('info', 'Configuring Redis ACL...', config);

    // Check if Redis version supports ACL
    try {
      const info = await client.info();
      const versionMatch = info.match(/redis_version:([.\d]+)/);

      if (!versionMatch || parseFloat(versionMatch[1]) < 6.0) {
        return { success: false, error: 'ACL requires Redis 6.0 or higher' };
      }
    } catch (error) {
      return { success: false, error: `Failed to get Redis version: ${error.message}` };
    }

    const users = config.aclSetup.users || [];
    if (users.length === 0) {
      return { success: false, error: 'No users specified in ACL configuration' };
    }

    const results = [];

    // Process each user
    for (const user of users) {
      try {
        // Validate user configuration
        if (!user.username) {
          results.push({ success: false, error: 'Username is required' });
          continue;
        }

        if (!user.password && user.enabled !== false) {
          results.push({ success: false, username: user.username, error: 'Password is required for enabled users' });
          continue;
        }

        // Build ACL command
        const aclCommand = ['ACL', 'SETUSER', user.username];

        // Enable/disable
        aclCommand.push(user.enabled === false ? 'off' : 'on');

        // Password
        if (user.password) {
          aclCommand.push(`>${user.password}`);
        }

        // Key patterns
        if (user.keyPatterns && user.keyPatterns.length > 0) {
          for (const pattern of user.keyPatterns) {
            const fullPattern = config.prefix ? `~${config.prefix}${pattern}` : `~${pattern}`;
            aclCommand.push(fullPattern);
          }
        } else if (config.prefix) {
          // Default to prefix pattern if available
          aclCommand.push(`~${config.prefix}*`);
        }

        // Commands
        if (user.commands && user.commands.length > 0) {
          for (const cmd of user.commands) {
            aclCommand.push(cmd.startsWith('+') || cmd.startsWith('-') ? cmd : `+${cmd}`);
          }
        }

        // Command categories
        if (user.categories && user.categories.length > 0) {
          for (const category of user.categories) {
            aclCommand.push(category.startsWith('+@') || category.startsWith('-@') ?
                            category : `+@${category}`);
          }
        }

        // Execute ACL command
        if (config.verbose) {
          log('info', `ACL command: ${aclCommand.join(' ')}`, config);
        }

        if (!config.dryRun) {
          await client.sendCommand(aclCommand);
          log('success', `ACL user '${user.username}' configured successfully`, config);
          results.push({ success: true, username: user.username });
        } else {
          log('info', `Dry run: would configure ACL user '${user.username}'`, config);
          results.push({ success: true, username: user.username, dryRun: true });
        }
      } catch (error) {
        log('error', `Failed to configure ACL for user '${user.username}': ${error.message}`, config);
        results.push({ success: false, username: user.username, error: error.message });
      }
    }

    // Save ACL changes to disk if configured
    if (config.aclSetup.saveToConfig !== false && !config.dryRun) {
      try {
        await client.aclSave();
        log('success', 'ACL configuration saved to Redis configuration file', config);
      } catch (error) {
        log('warn', `Failed to save ACL configuration: ${error.message}`, config);
      }
    }

    // Calculate overall success
    const success = results.every(r => r.success);

    return {
      success,
      results,
      userCount: results.length
    };
  } catch (error) {
    log('error', `ACL configuration failed: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  configureAcl
};
