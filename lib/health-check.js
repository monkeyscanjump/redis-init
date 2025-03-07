/**
 * Health check module
 *
 * Provides Redis health check functionality.
 */

const { log } = require('./utils');

/**
 * Perform Redis health check
 * @param {Object} client - Redis client
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Health check result
 */
async function performHealthCheck(client, config) {
  try {
    log('info', 'Performing Redis health check...', config);

    const startTime = Date.now();
    const healthInfo = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      host: config.host,
      port: config.port,
      database: config.database || 0
    };

    // Test basic connectivity with PING
    try {
      const pingResult = await client.ping();
      healthInfo.ping = pingResult === 'PONG';
    } catch (error) {
      log('error', `Health check - ping failed: ${error.message}`, config);
      healthInfo.status = 'unhealthy';
      healthInfo.error = `Ping failed: ${error.message}`;
      return healthInfo;
    }

    // Get Redis info
    try {
      const info = await client.info();

      // Parse important metrics
      const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
      if (uptimeMatch) {
        healthInfo.uptime = parseInt(uptimeMatch[1], 10);
      }

      const connectedClientsMatch = info.match(/connected_clients:(\d+)/);
      if (connectedClientsMatch) {
        healthInfo.connectedClients = parseInt(connectedClientsMatch[1], 10);
      }

      const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
      if (usedMemoryMatch) {
        healthInfo.usedMemory = usedMemoryMatch[1].trim();
      }

      const maxMemoryMatch = info.match(/maxmemory_human:(.+)/);
      if (maxMemoryMatch && maxMemoryMatch[1].trim() !== '0B') {
        healthInfo.maxMemory = maxMemoryMatch[1].trim();
      }

      // Redis version
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      if (versionMatch) {
        healthInfo.version = versionMatch[1].trim();
      }

      // Check memory usage alert
      if (healthInfo.usedMemory && healthInfo.maxMemory) {
        // Try to extract numeric values and units
        const usedMatch = healthInfo.usedMemory.match(/^([\d.]+)([A-Z]+)$/);
        const maxMatch = healthInfo.maxMemory.match(/^([\d.]+)([A-Z]+)$/);

        if (usedMatch && maxMatch && usedMatch[2] === maxMatch[2]) {
          const usedValue = parseFloat(usedMatch[1]);
          const maxValue = parseFloat(maxMatch[1]);

          if (usedValue / maxValue > 0.9) {
            healthInfo.memoryAlert = `High memory usage: ${usedValue}/${maxValue} ${usedMatch[2]} (${Math.round(usedValue / maxValue * 100)}%)`;
          }
        }
      }

      // Check for excessive clients
      if (healthInfo.connectedClients > 5000) {
        healthInfo.clientsAlert = `High number of connected clients: ${healthInfo.connectedClients}`;
      }
    } catch (error) {
      log('warn', `Health check - info command failed: ${error.message}`, config);
      healthInfo.infoError = error.message;
    }

    // Get database size
    try {
      healthInfo.dbSize = await client.dbSize();
    } catch (error) {
      log('warn', `Health check - dbSize command failed: ${error.message}`, config);
      healthInfo.dbSizeError = error.message;
    }

    // Measure response time
    healthInfo.responseTime = Date.now() - startTime;

    // Set overall status
    if (healthInfo.ping === true) {
      healthInfo.status = 'healthy';

      // Add warnings if there are alerts
      if (healthInfo.memoryAlert || healthInfo.clientsAlert) {
        healthInfo.status = 'warning';
        healthInfo.warnings = [];

        if (healthInfo.memoryAlert) {
          healthInfo.warnings.push(healthInfo.memoryAlert);
        }

        if (healthInfo.clientsAlert) {
          healthInfo.warnings.push(healthInfo.clientsAlert);
        }
      }
    } else {
      healthInfo.status = 'unhealthy';
    }

    log('info', `Health check result: ${healthInfo.status}`, config);
    return healthInfo;
  } catch (error) {
    log('error', `Health check failed: ${error.message}`, config);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      host: config.host,
      port: config.port
    };
  }
}

module.exports = {
  performHealthCheck
};
