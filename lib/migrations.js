/**
 * Schema migrations module
 *
 * Handles schema versioning and migrations.
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');

/**
 * Get schema version from schema file
 * @param {string} filePath - Path to schema file
 * @returns {Promise<Object>} - Schema version information
 */
async function getSchemaVersion(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Schema file not found: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const versionMatch = content.match(/version:\s*(\d+)/);

    if (!versionMatch) {
      return { success: true, version: 1 }; // Default version
    }

    return { success: true, version: parseInt(versionMatch[1], 10) };
  } catch (error) {
    return { success: false, error: `Failed to get schema version: ${error.message}` };
  }
}

/**
 * Check if a schema needs migration
 * @param {Object} client - Redis client
 * @param {string} schemaName - Schema name
 * @param {number} currentVersion - Current schema version
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Migration check result
 */
async function checkSchemaMigration(client, schemaName, currentVersion, config) {
  try {
    // Get stored schema version
    const versionKey = config.prefix ?
      `${config.prefix}schema:${schemaName}:version` :
      `schema:${schemaName}:version`;

    let storedVersion;

    try {
      storedVersion = await client.get(versionKey);
      storedVersion = storedVersion ? parseInt(storedVersion, 10) : 0;
    } catch (error) {
      // If key doesn't exist or other error, assume version 0
      storedVersion = 0;
    }

    return {
      success: true,
      needsMigration: storedVersion < currentVersion,
      storedVersion,
      currentVersion
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to check schema migration: ${error.message}`
    };
  }
}

/**
 * Update schema version after migration
 * @param {Object} client - Redis client
 * @param {string} schemaName - Schema name
 * @param {number} newVersion - New schema version
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Update result
 */
async function updateSchemaVersion(client, schemaName, newVersion, config) {
  try {
    const versionKey = config.prefix ?
      `${config.prefix}schema:${schemaName}:version` :
      `schema:${schemaName}:version`;

    await client.set(versionKey, newVersion.toString());

    log('success', `Updated schema ${schemaName} to version ${newVersion}`, config);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update schema version: ${error.message}`
    };
  }
}

/**
 * Find migration files for a schema
 * @param {string} schemasDir - Schemas directory
 * @param {string} schemaName - Schema name
 * @param {number} fromVersion - Current version
 * @param {number} toVersion - Target version
 * @returns {Promise<Object>} - Migration files
 */
async function findMigrationFiles(schemasDir, schemaName, fromVersion, toVersion) {
  try {
    const migrationDir = path.join(schemasDir, 'migrations');

    if (!fs.existsSync(migrationDir)) {
      return { success: true, files: [] };
    }

    const files = fs.readdirSync(migrationDir)
      .filter(file => file.startsWith(`${schemaName}_`))
      .filter(file => {
        const versionMatch = file.match(/_v(\d+)_to_v(\d+)\.redis$/);
        if (!versionMatch) return false;

        const startVersion = parseInt(versionMatch[1], 10);
        const endVersion = parseInt(versionMatch[2], 10);

        return startVersion >= fromVersion && endVersion <= toVersion;
      })
      .sort((a, b) => {
        const versionA = parseInt(a.match(/_v(\d+)_to_v(\d+)\.redis$/)[1], 10);
        const versionB = parseInt(b.match(/_v(\d+)_to_v(\d+)\.redis$/)[1], 10);
        return versionA - versionB;
      });

    return { success: true, files: files.map(file => path.join(migrationDir, file)) };
  } catch (error) {
    return {
      success: false,
      error: `Failed to find migration files: ${error.message}`
    };
  }
}

module.exports = {
  getSchemaVersion,
  checkSchemaMigration,
  updateSchemaVersion,
  findMigrationFiles
};
