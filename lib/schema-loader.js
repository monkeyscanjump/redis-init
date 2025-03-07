/**
 * Schema Loader Module
 *
 * Handles loading and parsing of Redis schema files.
 */

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const { log, applyPrefixToCommand } = require('./utils');
const { executeInTransaction } = require('./transactions');
const { processTemplate } = require('./templates');
const { parseSchemaForLuaScripts } = require('./lua-scripts');

/**
 * Parse Redis schema from string content
 * @param {string} content - Schema content
 * @param {string} sourceName - Source name for logging
 * @param {Object} config - Configuration options
 * @returns {Object} - Parsed commands and metadata
 */
function parseSchemaContent(content, sourceName, config = {}) {
  try {
    const commands = [];
    let currentCommand = [];
    let inLuaScript = false;
    let luaScriptName = '';
    let luaScriptContent = '';
    let skipToLine = -1;

    // Extract metadata
    const metadata = {
      version: 1,
      description: '',
      dependencies: []
    };

    const versionMatch = content.match(/version:\s*(\d+)/);
    if (versionMatch) {
      metadata.version = parseInt(versionMatch[1], 10);
    }

    const descriptionMatch = content.match(/description:\s*(.*)/);
    if (descriptionMatch) {
      metadata.description = descriptionMatch[1].trim();
    }

    const dependenciesMatch = content.match(/dependencies:\s*(.*)/);
    if (dependenciesMatch) {
      metadata.dependencies = dependenciesMatch[1].split(/\s*,\s*/).map(d => d.trim());
    }

    // Process template variables if any
    let processedContent = content;
    if (config.variables && Object.keys(config.variables).length > 0) {
      processedContent = processTemplate(content, config.variables);
    }

    const lines = processedContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Skip lines if in a Lua script block and currently processing with skipToLine
      if (skipToLine > i) {
        continue;
      }

      let line = lines[i];

      // Remove comments and trim whitespace
      line = line.replace(/#.*$/, '').trim();
      if (!line) continue;

      // Handle Lua scripts separately by the Lua script parser
      if (line.startsWith('SCRIPT:')) {
        const scriptResult = parseSchemaForLuaScripts(lines, i);
        if (scriptResult) {
          skipToLine = scriptResult.endIndex + 1;
          continue;
        }
      }

      // Add to current command
      currentCommand.push(line);

      // If line ends with a command terminator, add to commands list
      if (line.endsWith(';')) {
        // Remove semicolon and join the command parts
        const commandStr = currentCommand.join(' ').slice(0, -1);
        currentCommand = [];

        // Parse command into parts
        const parts = [];
        let currentPart = '';
        let inQuotes = false;

        for (let i = 0; i < commandStr.length; i++) {
          const char = commandStr[i];

          if (char === '"' && (i === 0 || commandStr[i-1] !== '\\')) {
            inQuotes = !inQuotes;
          }

          if (char === ' ' && !inQuotes) {
            if (currentPart) {
              // Remove surrounding quotes if present
              if (currentPart.startsWith('"') && currentPart.endsWith('"') && currentPart.length > 1) {
                currentPart = currentPart.slice(1, -1);
              }
              parts.push(currentPart);
              currentPart = '';
            }
          } else {
            currentPart += char;
          }
        }

        if (currentPart) {
          // Remove surrounding quotes if present
          if (currentPart.startsWith('"') && currentPart.endsWith('"') && currentPart.length > 1) {
            currentPart = currentPart.slice(1, -1);
          }
          parts.push(currentPart);
        }

        if (parts.length > 0) {
          commands.push(parts);
        }
      }
    }

    return { commands, metadata };
  } catch (error) {
    log('error', `Failed to parse schema from ${sourceName}: ${error.message}`);
    return { commands: [], metadata: { version: 1, description: '', dependencies: [] } };
  }
}

/**
 * Sort schema files by dependencies
 * @param {Array} schemaFiles - List of schema files with metadata
 * @returns {Array} - Sorted schema files
 */
function sortSchemasByDependencies(schemaFiles) {
  // Create a map of schema name to dependencies
  const dependencyMap = {};
  const nameToPath = {};

  for (const schema of schemaFiles) {
    const name = path.basename(schema.path);
    nameToPath[name] = schema.path;
    dependencyMap[name] = schema.metadata.dependencies || [];
  }

  // Helper function to check for circular dependencies
  function checkCircular(name, visited = new Set()) {
    if (visited.has(name)) {
      return true; // Circular dependency detected
    }

    visited.add(name);

    for (const dep of dependencyMap[name] || []) {
      if (checkCircular(dep, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  // Check for circular dependencies
  for (const name in dependencyMap) {
    if (checkCircular(name)) {
      throw new Error(`Circular dependency detected in schema ${name}`);
    }
  }

  // Sort schemas by dependencies using topological sort
  const result = [];
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;

    visited.add(name);

    for (const dep of dependencyMap[name] || []) {
      if (!nameToPath[dep]) {
        throw new Error(`Schema ${name} depends on ${dep}, but ${dep} was not found`);
      }
      visit(dep);
    }

    result.push(schemaFiles.find(s => path.basename(s.path) === name));
  }

  // Visit all schemas
  for (const name in dependencyMap) {
    visit(name);
  }

  return result;
}

/**
 * Load schema files
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @param {boolean} fromString - Whether loading from string instead of files
 * @returns {Promise<Object>} - Loading result
 */
async function loadSchemas(client, config, fromString = false) {
  try {
    if (fromString) {
      return await loadSchemaFromString(client, config);
    }

    // Check if schemas directory exists
    const schemasDir = config.schemasDir;
    if (!fs.existsSync(schemasDir)) {
      log('error', `Schemas directory not found: ${schemasDir}`, config);
      return { success: false, details: 'Schemas directory not found' };
    }

    // Get schema files
    const files = globSync(path.join(schemasDir, '**/*.{redis,schema}'));

    if (files.length === 0) {
      log('warn', `No schema files found in ${schemasDir}`, config);
      return { success: true, commandsExecuted: 0, filesProcessed: 0 };
    }

    log('info', `Found ${files.length} schema files to load.`, config);

    // Parse all schemas first to get metadata and validate
    const schemaFiles = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const parsed = parseSchemaContent(content, file, config);

        schemaFiles.push({
          path: file,
          content,
          commands: parsed.commands,
          metadata: parsed.metadata
        });

        log('info', `Parsed ${path.basename(file)} - version ${parsed.metadata.version}`, config);
      } catch (error) {
        log('error', `Failed to parse schema file ${file}: ${error.message}`, config);
      }
    }

    // Sort schemas by dependencies
    try {
      const sortedSchemas = sortSchemasByDependencies(schemaFiles);
      log('info', `Schemas sorted by dependencies: ${sortedSchemas.map(s => path.basename(s.path)).join(', ')}`, config);

      // Process schemas in sorted order
      let commandsExecuted = 0;
      let errorCount = 0;

      for (const schema of sortedSchemas) {
        const fileName = path.basename(schema.path);
        log('info', `Processing ${fileName}...`, config);

        if (config.dryRun) {
          log('info', `Dry run: would execute ${schema.commands.length} commands from ${fileName}`, config);
          continue;
        }

        // Execute commands
        let fileCommandsExecuted = 0;

        // Use transactions if configured
        if (config.useTransactions && schema.commands.length > 0) {
          log('info', `Using transaction for ${fileName} with ${schema.commands.length} commands`, config);

          // Apply prefix to all commands
          const processedCommands = schema.commands.map(cmd =>
            config.prefix ? applyPrefixToCommand(cmd, config.prefix) : cmd
          );

          const result = await executeInTransaction(client, processedCommands, config);

          if (result.success) {
            fileCommandsExecuted = schema.commands.length;
            commandsExecuted += fileCommandsExecuted;
            log('success', `Successfully executed ${fileCommandsExecuted} commands in transaction from ${fileName}`, config);
          } else {
            log('error', `Transaction failed for ${fileName}: ${result.error}`, config);
            errorCount++;
          }
        } else {
          // Process in batches without transactions
          const batchSize = config.batchSize || 100;

          for (let i = 0; i < schema.commands.length; i += batchSize) {
            const batch = schema.commands.slice(i, i + batchSize);
            const pipeline = client.pipeline();

            for (const command of batch) {
              if (command.length === 0) continue;

              try {
                let cmdToExecute = command;

                // Apply prefix if specified
                if (config.prefix) {
                  cmdToExecute = applyPrefixToCommand(command, config.prefix);
                }

                if (config.verbose) {
                  log('info', `Adding to pipeline: ${cmdToExecute.join(' ')}`, config);
                }

                const cmd = cmdToExecute[0].toUpperCase();
                const args = cmdToExecute.slice(1);

                pipeline.sendCommand([cmd, ...args]);
              } catch (error) {
                log('error', `Error preparing command ${command.join(' ')}: ${error.message}`, config);
                errorCount++;
              }
            }

            try {
              await pipeline.exec();
              fileCommandsExecuted += batch.length;
              commandsExecuted += batch.length;

              if (config.verbose) {
                log('info', `Executed batch of ${batch.length} commands from ${fileName}`, config);
              }
            } catch (error) {
              log('error', `Error executing batch from ${fileName}: ${error.message}`, config);
              errorCount++;
            }
          }

          log('success', `Successfully executed ${fileCommandsExecuted} commands from ${fileName}`, config);
        }
      }

      log('success', `Schema loading completed. Total commands executed: ${commandsExecuted}. Errors: ${errorCount}.`, config);
      return {
        success: errorCount === 0,
        commandsExecuted,
        filesProcessed: schemaFiles.length,
        errorCount
      };
    } catch (error) {
      log('error', `Failed to process schemas: ${error.message}`, config);
      return { success: false, details: error.message };
    }
  } catch (error) {
    log('error', `Failed to load schemas: ${error.message}`, config);
    return { success: false, details: error.message };
  }
}

/**
 * Load schema from string content
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Loading result
 */
async function loadSchemaFromString(client, config) {
  try {
    if (!config.schemaContent) {
      return { success: false, details: 'No schema content provided' };
    }

    log('info', `Processing schema from string: ${config.schemaName}`, config);

    const parsed = parseSchemaContent(config.schemaContent, config.schemaName, config);
    const commands = parsed.commands;

    log('info', `Found ${commands.length} commands in schema`, config);

    if (config.dryRun) {
      log('info', `Dry run: would execute ${commands.length} commands`, config);
      return { success: true, commandsExecuted: 0 };
    }

    // Execute commands
    let commandsExecuted = 0;
    let errorCount = 0;

    // Use transactions if configured
    if (config.useTransactions && commands.length > 0) {
      log('info', `Using transaction for schema with ${commands.length} commands`, config);

      // Apply prefix to all commands
      const processedCommands = commands.map(cmd =>
        config.prefix ? applyPrefixToCommand(cmd, config.prefix) : cmd
      );

      const result = await executeInTransaction(client, processedCommands, config);

      if (result.success) {
        commandsExecuted = commands.length;
        log('success', `Successfully executed ${commandsExecuted} commands in transaction`, config);
      } else {
        log('error', `Transaction failed: ${result.error}`, config);
        errorCount++;
      }
    } else {
      // Process in batches without transactions
      const batchSize = config.batchSize || 100;

      for (let i = 0; i < commands.length; i += batchSize) {
        const batch = commands.slice(i, i + batchSize);
        const pipeline = client.pipeline();

        for (const command of batch) {
          if (command.length === 0) continue;

          try {
            let cmdToExecute = command;

            // Apply prefix if specified
            if (config.prefix) {
              cmdToExecute = applyPrefixToCommand(command, config.prefix);
            }

            if (config.verbose) {
              log('info', `Adding to pipeline: ${cmdToExecute.join(' ')}`, config);
            }

            const cmd = cmdToExecute[0].toUpperCase();
            const args = cmdToExecute.slice(1);

            pipeline.sendCommand([cmd, ...args]);
          } catch (error) {
            log('error', `Error preparing command ${command.join(' ')}: ${error.message}`, config);
            errorCount++;
          }
        }

        try {
          await pipeline.exec();
          commandsExecuted += batch.length;

          if (config.verbose) {
            log('info', `Executed batch of ${batch.length} commands`, config);
          }
        } catch (error) {
          log('error', `Error executing batch: ${error.message}`, config);
          errorCount++;
        }
      }

      log('success', `Schema loading completed. Total commands executed: ${commandsExecuted}. Errors: ${errorCount}.`, config);
    }

    return {
      success: errorCount === 0,
      commandsExecuted,
      errorCount
    };
  } catch (error) {
    log('error', `Failed to load schema from string: ${error.message}`, config);
    return { success: false, details: error.message };
  }
}

/**
 * Validate loaded schemas
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Validation result
 */
async function validateSchemas(client, config) {
  try {
    log('info', 'Validating loaded schemas...', config);

    // Get database size
    const dbSize = await client.dbSize();
    log('success', `Database contains ${dbSize} keys.`, config);

    if (dbSize === 0) {
      log('warn', 'Warning: Database is empty after schema loading.', config);
    }

    // If prefix is set, count keys with that prefix
    if (config.prefix) {
      const keys = await client.keys(`${config.prefix}*`);
      log('success', `Found ${keys.length} keys with prefix "${config.prefix}".`, config);

      if (keys.length === 0 && dbSize > 0) {
        log('warn', `Warning: No keys found with prefix "${config.prefix}" but database contains ${dbSize} keys.`, config);
      }
    }

    return { success: true, dbSize };
  } catch (error) {
    log('error', `Failed to validate schemas: ${error.message}`, config);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadSchemas,
  validateSchemas,
  parseSchemaContent,
  sortSchemasByDependencies
};
