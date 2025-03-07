#!/usr/bin/env node

/**
 * Interactive Schema Builder
 *
 * This CLI tool helps users create Redis schema files interactively.
 */

const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function buildSchema() {
  console.log(chalk.bold.blue('Redis Schema Builder'));
  console.log(chalk.blue('--------------------'));
  console.log(chalk.yellow('This tool will help you create Redis schema files interactively.\n'));

  // First prompt for output directory
  const { outputDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputDir',
      message: 'Enter directory to save schema files:',
      default: './schemas',
      validate: input => {
        // Check if directory exists or can be created
        try {
          if (!fs.existsSync(input)) {
            console.log(chalk.yellow(`\nDirectory ${input} doesn't exist. It will be created.`));
            // Don't actually create it yet, just check if we can
            const testPath = path.resolve(input);
            const parentDir = path.dirname(testPath);
            if (!fs.existsSync(parentDir)) {
              return `Parent directory ${parentDir} doesn't exist. Please create it first.`;
            }
          }
          return true;
        } catch (error) {
          return `Invalid directory: ${error.message}`;
        }
      }
    }
  ]);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(chalk.green(`Created directory: ${outputDir}`));
    } catch (error) {
      console.error(chalk.red(`Failed to create directory ${outputDir}: ${error.message}`));
      return;
    }
  }

  const { schemaName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'schemaName',
      message: 'Enter schema name (without extension):',
      validate: input => input.trim() !== '' ? true : 'Schema name is required'
    }
  ]);

  const { schemaType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'schemaType',
      message: 'Select schema type:',
      choices: ['User Management', 'Product Catalog', 'Session Store', 'Cache', 'Counter', 'Custom']
    }
  ]);

  const { schemaVersion, schemaDescription } = await inquirer.prompt([
    {
      type: 'input',
      name: 'schemaVersion',
      message: 'Schema version:',
      default: '1'
    },
    {
      type: 'input',
      name: 'schemaDescription',
      message: 'Schema description:',
      default: `${schemaType} schema`
    }
  ]);

  // Start building the schema
  let schemaContent = '';
  schemaContent += `# ${schemaName} Schema\n`;
  schemaContent += `# Created: ${new Date().toISOString()}\n`;
  schemaContent += `# version: ${schemaVersion}\n`;
  schemaContent += `# description: ${schemaDescription}\n\n`;

  // Based on schema type, ask specific questions and build the schema
  if (schemaType === 'User Management') {
    const { userIdPrefix, includeRoles, includeAuth, sampleCount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userIdPrefix',
        message: 'User ID prefix:',
        default: 'user:'
      },
      {
        type: 'confirm',
        name: 'includeRoles',
        message: 'Include role management?',
        default: true
      },
      {
        type: 'confirm',
        name: 'includeAuth',
        message: 'Include authentication data?',
        default: true
      },
      {
        type: 'number',
        name: 'sampleCount',
        message: 'Number of sample users to generate:',
        default: 2,
        validate: input => input > 0 ? true : 'Must generate at least 1 user'
      }
    ]);

    schemaContent += `# User Data Schema\n\n`;

    // Generate sample users
    for (let i = 1; i <= sampleCount; i++) {
      const userId = 1000 + i - 1;
      const username = `user${i}`;
      const email = `user${i}@example.com`;

      schemaContent += `# User ${i}\n`;
      schemaContent += `HSET ${userIdPrefix}${userId} username "${username}" email "${email}" created_at "${Date.now()}" status "active";\n`;
      schemaContent += `SET username:${username} ${userId};\n`;
      schemaContent += `SET email:${email} ${userId};\n`;

      if (includeAuth) {
        schemaContent += `HSET ${userIdPrefix}${userId}:auth password_hash "hashed_password_here" last_login "${Date.now()}" failed_attempts "0";\n`;
      }

      if (includeRoles) {
        schemaContent += `SADD ${userIdPrefix}${userId}:roles "user";\n`;
        if (i === 1) {
          schemaContent += `SADD ${userIdPrefix}${userId}:roles "admin";\n`;
        }
      }

      schemaContent += `\n`;
    }

    // Add users set
    schemaContent += `# All users set\n`;
    schemaContent += `SADD users ${Array.from({length: sampleCount}, (_, i) => 1000 + i).join(' ')};\n\n`;

    // Add optional Lua script for authentication
    if (includeAuth) {
      schemaContent += `# Authentication script\n`;
      schemaContent += `SCRIPT: authenticate_user\n`;
      schemaContent += `local username = ARGV[1]\n`;
      schemaContent += `local password_hash = ARGV[2]\n\n`;
      schemaContent += `local user_id_key = "username:" .. username\n`;
      schemaContent += `local user_id = redis.call("GET", user_id_key)\n\n`;
      schemaContent += `if not user_id then\n`;
      schemaContent += `  return { err = "invalid_username" }\n`;
      schemaContent += `end\n\n`;
      schemaContent += `local auth_key = "${userIdPrefix}" .. user_id .. ":auth"\n`;
      schemaContent += `local stored_hash = redis.call("HGET", auth_key, "password_hash")\n\n`;
      schemaContent += `if stored_hash == password_hash then\n`;
      schemaContent += `  redis.call("HSET", auth_key, "last_login", ARGV[3])\n`;
      schemaContent += `  redis.call("HSET", auth_key, "failed_attempts", "0")\n`;
      schemaContent += `  return { ok = user_id }\n`;
      schemaContent += `else\n`;
      schemaContent += `  local attempts = tonumber(redis.call("HINCRBY", auth_key, "failed_attempts", 1))\n`;
      schemaContent += `  return { err = "invalid_password", attempts = attempts }\n`;
      schemaContent += `end\n`;
      schemaContent += `END_SCRIPT\n\n`;
    }
  }
  else if (schemaType === 'Product Catalog') {
    const { productIdPrefix, includePricing, includeStock, sampleCount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'productIdPrefix',
        message: 'Product ID prefix:',
        default: 'product:'
      },
      {
        type: 'confirm',
        name: 'includePricing',
        message: 'Include pricing data?',
        default: true
      },
      {
        type: 'confirm',
        name: 'includeStock',
        message: 'Include inventory/stock data?',
        default: true
      },
      {
        type: 'number',
        name: 'sampleCount',
        message: 'Number of sample products to generate:',
        default: 3,
        validate: input => input > 0 ? true : 'Must generate at least 1 product'
      }
    ]);

    schemaContent += `# Product Catalog Schema\n\n`;

    const categories = ['electronics', 'clothing', 'food', 'books'];

    // Generate sample products
    for (let i = 1; i <= sampleCount; i++) {
      const productId = 100 + i - 1;
      const name = `Product ${i}`;
      const category = categories[i % categories.length];
      const price = (19.99 + (i * 10)).toFixed(2);
      const stock = 10 + (i * 5);

      schemaContent += `# Product ${i}\n`;
      let productFields = `name "${name}" category "${category}" created_at "${Date.now()}"`;

      if (includePricing) {
        productFields += ` price "${price}"`;
      }

      if (includeStock) {
        productFields += ` stock "${stock}"`;
      }

      schemaContent += `HSET ${productIdPrefix}${productId} ${productFields};\n`;
      schemaContent += `SADD category:${category} ${productId};\n`;

      if (includePricing) {
        schemaContent += `ZADD product_prices ${price} ${productId};\n`;
      }

      schemaContent += `\n`;
    }

    // Add products set
    schemaContent += `# All products set\n`;
    schemaContent += `SADD products ${Array.from({length: sampleCount}, (_, i) => 100 + i).join(' ')};\n\n`;

    // Add optional Lua script for price updates
    if (includePricing) {
      schemaContent += `# Price update script\n`;
      schemaContent += `SCRIPT: update_price\n`;
      schemaContent += `local product_id = ARGV[1]\n`;
      schemaContent += `local new_price = tonumber(ARGV[2])\n\n`;
      schemaContent += `-- Check if product exists\n`;
      schemaContent += `local exists = redis.call("EXISTS", "${productIdPrefix}" .. product_id)\n`;
      schemaContent += `if exists == 0 then\n`;
      schemaContent += `  return { err = "product_not_found" }\n`;
      schemaContent += `end\n\n`;
      schemaContent += `-- Update hash and sorted set atomically\n`;
      schemaContent += `redis.call("HSET", "${productIdPrefix}" .. product_id, "price", tostring(new_price))\n`;
      schemaContent += `redis.call("ZADD", "product_prices", new_price, product_id)\n`;
      schemaContent += `return { ok = product_id, price = new_price }\n`;
      schemaContent += `END_SCRIPT\n\n`;
    }
  }
  else if (schemaType === 'Session Store') {
    const { sessionIdPrefix, sessionExpiry } = await inquirer.prompt([
      {
        type: 'input',
        name: 'sessionIdPrefix',
        message: 'Session ID prefix:',
        default: 'session:'
      },
      {
        type: 'number',
        name: 'sessionExpiry',
        message: 'Session expiry time (seconds):',
        default: 3600
      }
    ]);

    schemaContent += `# Session Store Schema\n\n`;

    // Generate sample sessions
    for (let i = 1; i <= 2; i++) {
      const sessionId = `${Math.random().toString(36).substring(2, 15)}`;
      const userId = 1000 + i - 1;

      schemaContent += `# Session ${i}\n`;
      schemaContent += `HSET ${sessionIdPrefix}${sessionId} user_id "${userId}" ip "192.168.1.${10+i}" user_agent "Mozilla/5.0" created_at "${Date.now()}";\n`;
      schemaContent += `EXPIRE ${sessionIdPrefix}${sessionId} ${sessionExpiry};\n`;
      schemaContent += `SADD user:${userId}:sessions ${sessionId};\n\n`;
    }

    // Add Lua script for session management
    schemaContent += `# Session creation and validation script\n`;
    schemaContent += `SCRIPT: create_session\n`;
    schemaContent += `local user_id = ARGV[1]\n`;
    schemaContent += `local ip = ARGV[2]\n`;
    schemaContent += `local user_agent = ARGV[3]\n`;
    schemaContent += `local session_id = ARGV[4]\n`;
    schemaContent += `local expiry = tonumber(ARGV[5])\n\n`;
    schemaContent += `-- Create new session\n`;
    schemaContent += `redis.call("HSET", "${sessionIdPrefix}" .. session_id, "user_id", user_id, "ip", ip, "user_agent", user_agent, "created_at", tostring(ARGV[6]))\n`;
    schemaContent += `redis.call("EXPIRE", "${sessionIdPrefix}" .. session_id, expiry)\n\n`;
    schemaContent += `-- Add to user's session set\n`;
    schemaContent += `redis.call("SADD", "user:" .. user_id .. ":sessions", session_id)\n\n`;
    schemaContent += `return { ok = session_id }\n`;
    schemaContent += `END_SCRIPT\n\n`;

    schemaContent += `SCRIPT: validate_session\n`;
    schemaContent += `local session_id = ARGV[1]\n`;
    schemaContent += `-- Check if session exists\n`;
    schemaContent += `local exists = redis.call("EXISTS", "${sessionIdPrefix}" .. session_id)\n`;
    schemaContent += `if exists == 0 then\n`;
    schemaContent += `  return { err = "session_not_found" }\n`;
    schemaContent += `end\n\n`;
    schemaContent += `-- Get session data\n`;
    schemaContent += `local session = redis.call("HGETALL", "${sessionIdPrefix}" .. session_id)\n`;
    schemaContent += `-- Reset expiry\n`;
    schemaContent += `redis.call("EXPIRE", "${sessionIdPrefix}" .. session_id, tonumber(ARGV[2]))\n`;
    schemaContent += `return session\n`;
    schemaContent += `END_SCRIPT\n\n`;
  }
  else if (schemaType === 'Cache') {
    const { cachePrefix, defaultExpiry } = await inquirer.prompt([
      {
        type: 'input',
        name: 'cachePrefix',
        message: 'Cache key prefix:',
        default: 'cache:'
      },
      {
        type: 'number',
        name: 'defaultExpiry',
        message: 'Default cache expiry time (seconds):',
        default: 300
      }
    ]);

    schemaContent += `# Cache Schema\n\n`;

    // Add sample cache entries
    schemaContent += `# Sample cache entries\n`;
    schemaContent += `SET ${cachePrefix}user:profile:1000 "{\\"name\\":\\"John Doe\\",\\"email\\":\\"john@example.com\\"}";\n`;
    schemaContent += `EXPIRE ${cachePrefix}user:profile:1000 ${defaultExpiry};\n\n`;

    schemaContent += `SET ${cachePrefix}product:details:100 "{\\"name\\":\\"Product 1\\",\\"price\\":29.99,\\"description\\":\\"A great product\\"}";\n`;
    schemaContent += `EXPIRE ${cachePrefix}product:details:100 ${defaultExpiry};\n\n`;

    // Add Lua script for cache management
    schemaContent += `# Cache management script\n`;
    schemaContent += `SCRIPT: cache_get_or_set\n`;
    schemaContent += `local key = KEYS[1]\n`;
    schemaContent += `local callback_id = ARGV[1]\n`;
    schemaContent += `local expiry = tonumber(ARGV[2])\n\n`;
    schemaContent += `-- Try to get from cache\n`;
    schemaContent += `local cached = redis.call("GET", "${cachePrefix}" .. key)\n`;
    schemaContent += `if cached then\n`;
    schemaContent += `  -- Refresh expiry\n`;
    schemaContent += `  redis.call("EXPIRE", "${cachePrefix}" .. key, expiry)\n`;
    schemaContent += `  return { hit = 1, data = cached }\n`;
    schemaContent += `else\n`;
    schemaContent += `  -- Cache miss - return callback id for application to handle\n`;
    schemaContent += `  return { hit = 0, callback = callback_id }\n`;
    schemaContent += `end\n`;
    schemaContent += `END_SCRIPT\n\n`;

    schemaContent += `SCRIPT: cache_set\n`;
    schemaContent += `local key = KEYS[1]\n`;
    schemaContent += `local value = ARGV[1]\n`;
    schemaContent += `local expiry = tonumber(ARGV[2])\n\n`;
    schemaContent += `-- Set cache with expiry\n`;
    schemaContent += `redis.call("SET", "${cachePrefix}" .. key, value)\n`;
    schemaContent += `redis.call("EXPIRE", "${cachePrefix}" .. key, expiry)\n`;
    schemaContent += `return { ok = 1 }\n`;
    schemaContent += `END_SCRIPT\n\n`;
  }
  else if (schemaType === 'Counter') {
    const { counterPrefix } = await inquirer.prompt([
      {
        type: 'input',
        name: 'counterPrefix',
        message: 'Counter prefix:',
        default: 'counter:'
      }
    ]);

    schemaContent += `# Counter Schema\n\n`;

    // Add sample counters
    schemaContent += `# Sample counters\n`;
    schemaContent += `SET ${counterPrefix}visits 0;\n`;
    schemaContent += `SET ${counterPrefix}api:calls 0;\n`;
    schemaContent += `SET ${counterPrefix}errors 0;\n\n`;

    // Add daily counters with expiry
    schemaContent += `# Daily counters (expire after 48 hours)\n`;
    schemaContent += `SET ${counterPrefix}daily:${new Date().toISOString().slice(0, 10)}:visits 0;\n`;
    schemaContent += `EXPIRE ${counterPrefix}daily:${new Date().toISOString().slice(0, 10)}:visits 172800;\n\n`;

    // Add hourly counters with expiry
    schemaContent += `# Hourly counters (expire after 24 hours)\n`;
    schemaContent += `SET ${counterPrefix}hourly:${new Date().toISOString().slice(0, 13)}:visits 0;\n`;
    schemaContent += `EXPIRE ${counterPrefix}hourly:${new Date().toISOString().slice(0, 13)}:visits 86400;\n\n`;

    // Add Lua script for atomic counter operations
    schemaContent += `# Counter management script\n`;
    schemaContent += `SCRIPT: increment_counter\n`;
    schemaContent += `local base_key = ARGV[1]\n`;
    schemaContent += `local amount = tonumber(ARGV[2])\n\n`;
    schemaContent += `-- Increment permanent counter\n`;
    schemaContent += `local new_value = redis.call("INCRBY", "${counterPrefix}" .. base_key, amount)\n\n`;
    schemaContent += `-- Increment time-based counters\n`;
    schemaContent += `local date = ARGV[3] -- Format: YYYY-MM-DD\n`;
    schemaContent += `local hour = ARGV[4] -- Format: YYYY-MM-DDThh\n\n`;
    schemaContent += `-- Daily counter\n`;
    schemaContent += `local daily_key = "${counterPrefix}daily:" .. date .. ":" .. base_key\n`;
    schemaContent += `redis.call("INCRBY", daily_key, amount)\n`;
    schemaContent += `redis.call("EXPIRE", daily_key, 172800) -- 48 hours\n\n`;
    schemaContent += `-- Hourly counter\n`;
    schemaContent += `local hourly_key = "${counterPrefix}hourly:" .. hour .. ":" .. base_key\n`;
    schemaContent += `redis.call("INCRBY", hourly_key, amount)\n`;
    schemaContent += `redis.call("EXPIRE", hourly_key, 86400) -- 24 hours\n\n`;
    schemaContent += `return { ok = 1, value = new_value }\n`;
    schemaContent += `END_SCRIPT\n\n`;
  }
  else if (schemaType === 'Custom') {
    const { includeTemplate, includeLua } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'includeTemplate',
        message: 'Include template variables example?',
        default: true
      },
      {
        type: 'confirm',
        name: 'includeLua',
        message: 'Include Lua script example?',
        default: true
      }
    ]);

    schemaContent += `# Custom Schema\n\n`;

    // Add custom schema content
    schemaContent += `# Custom Redis commands\n`;
    schemaContent += `SET custom:key "value";\n`;
    schemaContent += `HSET custom:hash field1 "value1" field2 "value2";\n`;
    schemaContent += `SADD custom:set "member1" "member2" "member3";\n`;
    schemaContent += `ZADD custom:sorted_set 1 "member1" 2 "member2" 3 "member3";\n\n`;

    if (includeTemplate) {
      schemaContent += `# Template variables example\n`;
      schemaContent += `# These variables will be replaced at runtime\n`;
      schemaContent += `SET app:version "\${APP_VERSION}";\n`;
      schemaContent += `SET app:environment "\${ENVIRONMENT}";\n`;
      schemaContent += `SET app:deployed_at "\${DEPLOYED_AT}";\n\n`;
    }

    if (includeLua) {
      schemaContent += `# Example Lua script\n`;
      schemaContent += `SCRIPT: custom_script\n`;
      schemaContent += `local key = KEYS[1]\n`;
      schemaContent += `local value = ARGV[1]\n\n`;
      schemaContent += `-- Script logic here\n`;
      schemaContent += `local result = redis.call("GET", key)\n`;
      schemaContent += `if result then\n`;
      schemaContent += `  redis.call("SET", key, value)\n`;
      schemaContent += `  return { updated = 1, previous = result }\n`;
      schemaContent += `else\n`;
      schemaContent += `  redis.call("SET", key, value)\n`;
      schemaContent += `  return { created = 1 }\n`;
      schemaContent += `end\n`;
      schemaContent += `END_SCRIPT\n\n`;
    }
  }

  // Write schema to file
  const filename = `${schemaName}.redis`;
  const fullPath = path.join(outputDir, filename);

  try {
    fs.writeFileSync(fullPath, schemaContent);
    console.log(chalk.green(`\nSchema created successfully: ${fullPath}`));
    console.log(`\nSchema contains ${schemaContent.split('\n').length} lines.`);
  } catch (error) {
    console.error(chalk.red(`\nFailed to create schema: ${error.message}`));
  }
}

// Execute the schema builder
buildSchema().catch(error => {
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
});
