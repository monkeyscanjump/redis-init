/**
 * Documentation generation module
 *
 * Generates documentation for Redis schemas.
 */

const fs = require('fs');
const path = require('path');
const { parseSchemaContent } = require('./schema-loader');
const { findLuaScriptsInSchema } = require('./lua-scripts');

/**
 * Generate documentation for Redis schemas
 * @param {string} schemasDir - Schemas directory
 * @param {Object} options - Documentation options
 * @returns {Object} - Generated documentation
 */
function generateDocumentation(schemasDir, options = {}) {
  const docs = {
    schemas: {},
    keyPatterns: {},
    scripts: {},
    generated: new Date().toISOString(),
    directory: schemasDir
  };

  if (!fs.existsSync(schemasDir)) {
    throw new Error(`Schemas directory not found: ${schemasDir}`);
  }

  const files = fs.readdirSync(schemasDir)
    .filter(file => file.endsWith('.redis') || file.endsWith('.schema'));

  if (files.length === 0) {
    return docs;
  }

  // Process each schema file
  for (const file of files) {
    const filePath = path.join(schemasDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse schema content
    const { commands, metadata } = parseSchemaContent(content, file);

    // Find Lua scripts
    const scripts = findLuaScriptsInSchema(content, file);

    // Extract key patterns
    const keyPatterns = new Set();
    const commandTypes = {
      string: 0,
      hash: 0,
      list: 0,
      set: 0,
      zset: 0,
      other: 0
    };

    // Parse commands to extract key patterns and stats
    for (const command of commands) {
      if (command.length === 0) continue;

      const cmd = command[0].toUpperCase();

      // Categorize command types
      if (['SET', 'GET', 'MSET', 'MGET', 'SETEX', 'SETNX', 'APPEND'].includes(cmd)) {
        commandTypes.string++;
        if (command.length > 1) {
          keyPatterns.add(getBasePattern(command[1]));
        }
      } else if (['HSET', 'HMSET', 'HGET', 'HMGET', 'HGETALL', 'HDEL'].includes(cmd)) {
        commandTypes.hash++;
        if (command.length > 1) {
          keyPatterns.add(getBasePattern(command[1]));
        }
      } else if (['LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LRANGE', 'LLEN'].includes(cmd)) {
        commandTypes.list++;
        if (command.length > 1) {
          keyPatterns.add(getBasePattern(command[1]));
        }
      } else if (['SADD', 'SMEMBERS', 'SISMEMBER', 'SREM', 'SCARD'].includes(cmd)) {
        commandTypes.set++;
        if (command.length > 1) {
          keyPatterns.add(getBasePattern(command[1]));
        }
      } else if (['ZADD', 'ZRANGE', 'ZRANK', 'ZREM', 'ZCARD'].includes(cmd)) {
        commandTypes.zset++;
        if (command.length > 1) {
          keyPatterns.add(getBasePattern(command[1]));
        }
      } else {
        commandTypes.other++;
      }
    }

    // Store schema documentation
    docs.schemas[file] = {
      description: metadata.description || 'No description provided',
      version: metadata.version || 1,
      dependencies: metadata.dependencies || [],
      commandCount: commands.length,
      commandTypes,
      keyPatterns: Array.from(keyPatterns),
      scripts: scripts.map(s => s.name)
    };

    // Add key patterns
    for (const pattern of keyPatterns) {
      if (!docs.keyPatterns[pattern]) {
        docs.keyPatterns[pattern] = {
          schemas: [file],
          examples: []
        };
      } else if (!docs.keyPatterns[pattern].schemas.includes(file)) {
        docs.keyPatterns[pattern].schemas.push(file);
      }
    }

    // Add scripts
    for (const script of scripts) {
      docs.scripts[script.name] = {
        source: file,
        description: extractScriptDescription(script.script),
        lineCount: script.script.split('\n').length
      };
    }
  }

  // Generate summary
  docs.summary = {
    schemaCount: Object.keys(docs.schemas).length,
    keyPatternCount: Object.keys(docs.keyPatterns).length,
    scriptCount: Object.keys(docs.scripts).length,
    totalCommands: Object.values(docs.schemas).reduce((total, schema) => total + schema.commandCount, 0)
  };

  return docs;
}

/**
 * Extract base pattern from a key
 * @param {string} key - Redis key
 * @returns {string} - Base pattern
 */
function getBasePattern(key) {
  // Remove numeric parts and keep the structure
  return key.replace(/:\d+/g, ':*')
            .replace(/\d+/g, '*');
}

/**
 * Extract script description from Lua script
 * @param {string} script - Lua script content
 * @returns {string} - Script description
 */
function extractScriptDescription(script) {
  // Look for comments at the beginning of the script
  const lines = script.split('\n');
  const description = [];

  for (const line of lines) {
    if (line.trim().startsWith('--')) {
      description.push(line.trim().substring(2).trim());
    } else if (line.trim() && !line.trim().startsWith('--')) {
      break;
    }
  }

  return description.join(' ') || 'No description provided';
}

module.exports = {
  generateDocumentation
};
