# Redis Init Module

An advanced, environment-agnostic Redis database initialization tool for loading schema files and configuring Redis databases.

## Key Features

- **Schema Management**: Load Redis schemas from files or strings
- **Transaction Support**: Execute commands in atomic transactions
- **Schema Versioning and Migrations**: Track schema versions and handle migrations
- **Lua Script Support**: Load and register Lua scripts from schemas
- **Template Variables**: Use variables in your schema files
- **Backup and Restore**: Create backups before making changes
- **Health Checks**: Monitor Redis server health
- **TTL Management**: Apply expiration rules based on key patterns
- **Security**: Configure Redis ACL users
- **Schema Documentation**: Generate documentation from schema files
- **Multi-Region Support**: Replicate schemas across multiple Redis instances

## Installation

### Global Installation

```bash
npm install -g git+https://github.com/monkeyscanjump/redis-init.git
```

### Local Project Installation

```bash
npm install --save git+https://github.com/monkeyscanjump/redis-init.git
```

## Command Line Usage

After installing globally, you can use the `redis-init` command:

```bash
# Basic usage with schemas in a directory
redis-init -d ./schemas

# Connect to remote Redis server
redis-init -h redis.example.com -p 6379 -a password -d ./schemas

# Use SSL for connecting to Redis
redis-init -h redis.example.com -p 6379 --ssl -d ./schemas

# Flush database before initialization
redis-init -f -d ./schemas

# Use key prefix
redis-init --prefix "myapp:" -d ./schemas

# Use transactions for atomic operations
redis-init --use-transactions -d ./schemas

# Create backup before making changes
redis-init --backup ./backup.json -d ./schemas

# Apply TTL rules
redis-init --with-ttl ./ttl-rules.json -d ./schemas

# Create schema with interactive builder
redis-schema-builder
```

## Programmatic Usage

You can import and use the module in your JavaScript code:

```javascript
const { redisInit, redisInitFromString } = require('redis-init');

// Initialize Redis with schema files from a directory
async function initFromDirectory() {
  const result = await redisInit({
    host: 'redis.example.com',
    port: 6379,
    password: 'password',
    schemasDir: './schemas',
    prefix: 'myapp:',
    flush: true,
    ssl: true,
    verbose: true,
    useTransactions: true,
    // Template variables
    variables: {
      APP_VERSION: '1.0.0',
      ENVIRONMENT: 'production'
    }
  });

  if (result.success) {
    console.log(`Initialized successfully with ${result.commandsExecuted} commands`);
  } else {
    console.error(`Initialization failed: ${result.error}`);
  }
}

// Initialize Redis with a schema string
async function initFromString() {
  const schemaContent = `
    # Users Schema
    # version: 1
    # description: User management schema

    HSET user:1000 username "johndoe" email "john@example.com";
    SET username:johndoe 1000;
    SADD users 1000;

    # Login script
    SCRIPT: authenticate_user
    local username = ARGV[1]
    local password = ARGV[2]
    local user_id = redis.call("GET", "username:" .. username)
    if not user_id then
      return { err = "user_not_found" }
    end
    -- More authentication logic here
    return { ok = user_id }
    END_SCRIPT
  `;

  const result = await redisInitFromString(
    {
      host: 'redis.example.com',
      port: 6379,
      password: 'password',
      prefix: 'myapp:'
    },
    schemaContent,
    'users-schema'
  );

  if (result.success) {
    console.log(`Initialized successfully with ${result.commandsExecuted} commands`);
  } else {
    console.error(`Initialization failed: ${result.error}`);
  }
}
```

## Schema Files

Schema files should have a `.redis` or `.schema` extension and follow this format:

```
# Schema Name
# version: 1
# description: Description of this schema
# dependencies: other-schema.redis, another-schema.redis

# Each command ends with a semicolon
SET key "value";
HSET user:1000 username "johndoe" email "john@example.com";
SADD users 1000;

# Lua scripts
SCRIPT: script_name
-- Lua script content here
-- Multiple lines are allowed
local key = KEYS[1]
local value = ARGV[1]
return redis.call("SET", key, value)
END_SCRIPT

# Using the script
EVALSHA script_name 1 some_key some_value;

# Template variables
SET app:version "${APP_VERSION}";
SET app:environment "${ENVIRONMENT}";
```

## Interactive Schema Builder

You can use the interactive schema builder to create schema files:

```bash
redis-schema-builder
```

This tool will guide you through creating schemas for:
- User Management
- Product Catalog
- Session Store
- Cache
- Counter
- Custom schemas

## Health Checks

You can perform Redis health checks:

```javascript
const { performHealthCheck } = require('redis-init');

const health = await performHealthCheck({
  host: 'redis.example.com',
  port: 6379,
  password: 'password'
});

console.log(health.status); // 'healthy', 'warning', or 'unhealthy'
console.log(health);
```

## Backup and Restore

Create backups and restore from them:

```javascript
const { backupRedisData, restoreRedisData } = require('redis-init');

// Create backup
await backupRedisData(client, {
  backupFile: './redis-backup.json',
  prefix: 'myapp:'
});

// Restore from backup
await restoreRedisData(client, {
  backupFile: './redis-backup.json',
  prefix: 'myapp:'
});
```

## Key Prefixing

Redis Init supports key prefixing, allowing you to namespace your Redis keys:

```bash
# Use a key prefix
redis-init --prefix "myapp:" -d ./schemas

# Use a prefix with selective flushing
redis-init --prefix "myapp:" --flush --flush-mode prefix -d ./schemas
```

## Database Selection

You can select which Redis database to use:

```bash
# Use Redis database 2
redis-init -n 2 -d ./schemas

# Use Redis database 3 with a prefix
redis-init -n 3 --prefix "myapp:" -d ./schemas
```

## Security with ACL

Configure Redis ACL users:

```json
// acl-config.json
{
  "users": [
    {
      "username": "app_user",
      "password": "secure_password",
      "enabled": true,
      "keyPatterns": ["user:*", "session:*"],
      "commands": ["+get", "+set", "+hset", "+hmget"],
      "categories": ["+@read", "+@hash", "-@dangerous"]
    }
  ],
  "saveToConfig": true
}
```

```bash
redis-init --acl-setup ./acl-config.json -d ./schemas
```

## Documentation Generation

Generate documentation for your schemas:

```bash
redis-init --generate-docs ./schema-docs.json -d ./schemas
```

## Lua Script Support

Redis Init automatically registers Lua scripts defined in schema files:

```
# Define a Lua script
SCRIPT: increment_counter
local key = KEYS[1]
local amount = tonumber(ARGV[1])
return redis.call("INCRBY", key, amount)
END_SCRIPT

# Use the script
EVALSHA increment_counter 1 counter:visits 1;
```

## Template Variables

Use template variables in your schemas:

```
# Schema with template variables
SET app:version "${APP_VERSION}";
SET app:environment "${ENVIRONMENT}";
SET app:deployed_at "${TIMESTAMP}";
```

```bash
# Provide variables via JSON file
redis-init --variables ./variables.json -d ./schemas
```

```json
// variables.json
{
  "APP_VERSION": "1.0.0",
  "ENVIRONMENT": "production",
  "CUSTOM_VALUE": "something-specific"
}
```

## Multi-Region Support

Replicate schemas to multiple Redis instances:

```json
// regions.json
{
  "us-east": {
    "host": "redis-us-east.example.com",
    "port": 6379,
    "password": "password1"
  },
  "us-west": {
    "host": "redis-us-west.example.com",
    "port": 6379,
    "password": "password2"
  },
  "eu-central": {
    "host": "redis-eu.example.com",
    "port": 6379,
    "password": "password3"
  }
}
```

```bash
redis-init --regions ./regions.json -d ./schemas
```

## License

MIT

## Example Schema Files for Testing

### `schemas/users.redis`

```sh
# Users Schema
# version: 1
# description: Contains user profiles and authentication data

# User Hash Structure
HSET user:1000 username "johndoe" email "john@example.com" password_hash "hashed_password" created_at "1617278461" status "active";
HSET user:1001 username "janedoe" email "jane@example.com" password_hash "hashed_password" created_at "1617278492" status "active";

# Username to ID mapping (for lookups)
SET username:johndoe 1000;
SET username:janedoe 1001;

# Email to ID mapping (for lookups)
SET email:john@example.com 1000;
SET email:jane@example.com 1001;

# Users Set
SADD users 1000 1001;

# User Roles
SADD user:1000:roles "customer";
SADD user:1001:roles "customer" "admin";

# Authentication script
SCRIPT: authenticate_user
-- User authentication script
-- Validates username and password hash
local username = ARGV[1]
local password_hash = ARGV[2]

local user_id_key = "username:" .. username
local user_id = redis.call("GET", user_id_key)

if not user_id then
  return { err = "invalid_username" }
end

local auth_key = "user:" .. user_id
local stored_hash = redis.call("HGET", auth_key, "password_hash")

if stored_hash == password_hash then
  redis.call("HSET", auth_key, "last_login", ARGV[3])
  return { ok = user_id }
else
  return { err = "invalid_password" }
end
END_SCRIPT
```

### `schemas/products.redis`

```sh
# Products Schema
# version: 1
# description: Product catalog with pricing information
# dependencies: users.redis

# Product Hash Structure
HSET product:100 name "Smartphone X" price "999.99" category "electronics" stock "50" created_at "1617278500";
HSET product:101 name "Coffee Maker" price "129.99" category "appliances" stock "25" created_at "1617278530";
HSET product:102 name "Running Shoes" price "89.99" category "footwear" stock "100" created_at "1617278560";

# Product Set
SADD products 100 101 102;

# Category to Products mapping
SADD category:electronics 100;
SADD category:appliances 101;
SADD category:footwear 102;

# Price Sorted Set (for range queries)
ZADD product_prices 999.99 100;
ZADD product_prices 129.99 101;
ZADD product_prices 89.99 102;

# Price update script
SCRIPT: update_price
-- Update product price and maintain sorted set
local product_id = ARGV[1]
local new_price = tonumber(ARGV[2])

-- Check if product exists
local exists = redis.call("EXISTS", "product:" .. product_id)
if exists == 0 then
  return { err = "product_not_found" }
end

-- Update hash and sorted set atomically
redis.call("HSET", "product:" .. product_id, "price", tostring(new_price))
redis.call("ZADD", "product_prices", new_price, product_id)
return { ok = product_id, price = new_price }
END_SCRIPT
```

### `schemas/sessions.redis`

```sh
# Sessions Schema
# version: 1
# description: Session management for user authentication
# dependencies: users.redis

# Session Hash Structure with TTL
HSET session:5e8f1c2a36b0 user_id "1000" ip "192.168.1.105" user_agent "Mozilla/5.0" created_at "1617278600";
EXPIRE session:5e8f1c2a36b0 86400;

HSET session:6a9d2b4c1e8f user_id "1001" ip "192.168.1.110" user_agent "Chrome/89.0.4389.114" created_at "1617278630";
EXPIRE session:6a9d2b4c1e8f 86400;

# User Sessions Set
SADD user:1000:sessions 5e8f1c2a36b0;
SADD user:1001:sessions 6a9d2b4c1e8f;

# Session creation script
SCRIPT: create_session
-- Create a new session and associate with user
local user_id = ARGV[1]
local ip = ARGV[2]
local user_agent = ARGV[3]
local session_id = ARGV[4]
local expiry = tonumber(ARGV[5])

-- Create new session
redis.call("HSET", "session:" .. session_id,
  "user_id", user_id,
  "ip", ip,
  "user_agent", user_agent,
  "created_at", tostring(ARGV[6]))
redis.call("EXPIRE", "session:" .. session_id, expiry)

-- Add to user's session set
redis.call("SADD", "user:" .. user_id .. ":sessions", session_id)

return { ok = session_id }
END_SCRIPT

# Session validation script

```sh
SCRIPT: validate_session
-- Validate and refresh a session
local session_id = ARGV[1]
-- Check if session exists
local exists = redis.call("EXISTS", "session:" .. session_id)
if exists == 0 then
  return { err = "session_not_found" }
end

-- Get session data
local session = redis.call("HGETALL", "session:" .. session_id)
-- Reset expiry
redis.call("EXPIRE", "session:" .. session_id, tonumber(ARGV[2]))
return session
END_SCRIPT
```

### `ttl-rules.json`

```json
{
  "session:*": 86400,
  "cache:*": 3600,
  "temp:*": 300
}
```

### `variables.json`

```json
{
  "APP_VERSION": "1.0.0",
  "ENVIRONMENT": "development",
  "DEPLOYED_AT": "2023-07-15T12:00:00Z"
}
```

### `acl-config.json`

```json
{
  "users": [
    {
      "username": "app_user",
      "password": "secure_password",
      "enabled": true,
      "keyPatterns": ["user:*", "session:*", "product:*"],
      "commands": ["+get", "+set", "+hset", "+hmget", "+sadd", "+smembers"],
      "categories": ["+@read", "+@hash", "+@set", "-@dangerous"]
    },
    {
      "username": "readonly_user",
      "password": "read_password",
      "enabled": true,
      "keyPatterns": ["*"],
      "categories": ["+@read", "-@write", "-@dangerous"]
    }
  ],
  "saveToConfig": true
}
```

### `regions.json`

```json
{
  "us-east": {
    "host": "redis-us-east.example.com",
    "port": 6379,
    "password": "password1"
  },
  "us-west": {
    "host": "redis-us-west.example.com",
    "port": 6379,
    "password": "password2"
  }
}
```

## Running the Example

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make the scripts executable:

   ```bash
   chmod +x bin/redis-init.js
   chmod +x bin/redis-schema-builder.js
   ```

3. Basic initialization:

   ```bash
   node bin/redis-init.js -d ./schemas
   ```

4. Advanced initialization with features:

   ```bash
   node bin/redis-init.js -d ./schemas --prefix "myapp:" --with-ttl ./ttl-rules.json --variables ./variables.json --backup ./backup.json --use-transactions
   ```

5. Try the interactive schema builder:

   ```bash
   node bin/redis-schema-builder.js
   ```

6. Generate documentation:

  ```bash
  node bin/redis-init.js --generate-docs ./schema-docs.json -d ./schemas
  ```

## Running the Tests

1. Install test dependencies:

   ```bash
   npm install --save-dev jest mock-fs
   ```

2. Run basic tests:

   ```bash
   npm test
   ```

3. Run tests with coverage:

   ```bash
   npm run test:coverage
   ```

4. Run integration tests (requires a Redis server):

   ```bash
   REDIS_INTEGRATION_TESTS=1 npm test
   ```
