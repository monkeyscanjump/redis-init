/**
 * Lua script support module
 *
 * Handles loading and registering Lua scripts from schema files.
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');
const crypto = require('crypto');

/**
 * Parse schema content for Lua scripts
 * @param {Array} lines - Schema file lines
 * @param {number} startIndex - Line index where SCRIPT: tag appears
 * @returns {Object|null} - Lua script information or null if invalid
 */
function parseSchemaForLuaScripts(lines, startIndex) {
  if (!lines[startIndex] || !lines[startIndex].startsWith('SCRIPT:')) {
    return null;
  }

  const scriptName = lines[startIndex].substring(7).trim();
  if (!scriptName) {
    return null;
  }

  let endIndex = -1;
  const scriptLines = [];

  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === 'END_SCRIPT') {
      endIndex = i;
      break;
    }
    scriptLines.push(lines[i]);
  }

  if (endIndex === -1) {
    return null; // No END_SCRIPT found
  }

  return {
    name: scriptName,
    script: scriptLines.join('\n'),
    startIndex,
    endIndex
  };
}

/**
 * Find all Lua scripts in schema content
 * @param {string} content - Schema content
 * @param {string} sourceName - Source name for logging
 * @returns {Array} - List of Lua scripts
 */
function findLuaScriptsInSchema(content, sourceName) {
  const scripts = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('SCRIPT:')) {
      const scriptInfo = parseSchemaForLuaScripts(lines, i);

      if (scriptInfo) {
        scripts.push({
          name: scriptInfo.name,
          script: scriptInfo.script,
          source: sourceName
        });

        // Skip to the end of this script
        i = scriptInfo.endIndex;
      }
    }
  }

  return scripts;
}

/**
 * Register Lua scripts from schemas
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @param {boolean} fromString - Whether loading from string
 * @returns {Promise<Object>} - Registration result
 */
async function registerLuaScripts(client, config, fromString = false) {
  try {
    let scripts = [];

    if (fromString) {
      if (!config.schemaContent) {
        return { success: true, count: 0 };
      }

      scripts = findLuaScriptsInSchema(config.schemaContent, config.schemaName || 'inline-schema');
    } else {
      const schemasDir = config.schemasDir;
      if (!fs.existsSync(schemasDir)) {
        return { success: false, error: `Schemas directory not found: ${schemasDir}` };
      }

      // Get schema files
      const files = fs.readdirSync(schemasDir)
        .filter(file => file.endsWith('.redis') || file.endsWith('.schema'))
        .map(file => path.join(schemasDir, file));

      // Find Lua scripts in all files
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const fileScripts = findLuaScriptsInSchema(content, path.basename(file));
          scripts.push(...fileScripts);
        } catch (error) {
          log('error', `Failed to process Lua scripts in ${file}: ${error.message}`, config);
        }
      }
    }

    if (scripts.length === 0) {
      log('info', 'No Lua scripts found in schemas', config);
      return { success: true, count: 0 };
    }

    log('info', `Found ${scripts.length} Lua scripts to register`, config);

    if (config.dryRun) {
      log('info', `Dry run: would register ${scripts.length} Lua scripts`, config);
      return { success: true, count: scripts.length };
    }

    // Register each script and store its SHA
    const scriptRegistry = {};
    let successCount = 0;

    for (const script of scripts) {
      try {
        log('info', `Registering Lua script: ${script.name} from ${script.source}`, config);

        // Calculate SHA1 of the script
        const hash = crypto.createHash('sha1').update(script.script).digest('hex');

        // Register script
        const sha = await client.scriptLoad(script.script);

        if (sha !== hash) {
          log('warn', `SHA mismatch for script ${script.name}: expected ${hash}, got ${sha}`, config);
        }

        scriptRegistry[script.name] = {
          sha,
          source: script.source
        };

        successCount++;
      } catch (error) {
        log('error', `Failed to register Lua script ${script.name}: ${error.message}`, config);
      }
    }

    // Store script registry in Redis if not in dry-run mode
    if (successCount > 0 && !config.dryRun) {
      try {
        const registryKey = config.prefix ? `${config.prefix}lua:scripts` : 'lua:scripts';
        await client.del(registryKey);

        // Store script registry for reference
        for (const [name, info] of Object.entries(scriptRegistry)) {
          await client.hSet(registryKey, name, JSON.stringify(info));
        }
      } catch (error) {
        log('warn', `Failed to store script registry: ${error.message}`, config);
      }
    }

    log('success', `Successfully registered ${successCount} of ${scripts.length} Lua scripts`, config);

    return {
      success: successCount > 0,
      count: successCount,
      total: scripts.length,
      scripts: scriptRegistry
    };
  } catch (error) {
    log('error', `Failed to register Lua scripts: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  registerLuaScripts,
  findLuaScriptsInSchema,
  parseSchemaForLuaScripts
};
