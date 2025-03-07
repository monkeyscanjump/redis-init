#!/usr/bin/env node

/**
 * Redis Database Initialization CLI
 *
 * This is the command-line interface for the redis-init module.
 */

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const {
  redisInit,
  performHealthCheck,
  generateDocumentation,
  backupRedisData
} = require('../lib/index');
const packageJson = require('../package.json');

// Configure the CLI
program
  .version(packageJson.version)
  .description('Advanced Redis Database Initialization Tool')
  .option('-h, --host <host>', 'Redis host', '127.0.0.1')
  .option('-p, --port <port>', 'Redis port', '6379')
  .option('-a, --auth <password>', 'Redis password')
  .option('-d, --dir <directory>', 'Directory containing Redis schema files', './schemas')
  .option('-f, --flush', 'Flush database before initialization', false)
  .option('-t, --timeout <ms>', 'Connection timeout in milliseconds', '5000')
  .option('-c, --config <path>', 'Path to Redis configuration file')
  .option('-m, --deployment <type>', 'Deployment type: standalone, cluster, sentinel', 'standalone')
  .option('-s, --ssl', 'Use SSL for Redis connection', false)
  .option('--dry-run', 'Parse and validate schemas without applying them', false)
  .option('--no-color', 'Disable colored output')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--prefix <prefix>', 'Key prefix to apply to all Redis keys')
  .option('-n, --db <number>', 'Redis database number', '0')
  .option('--flush-mode <mode>', 'Flush mode: all, db, prefix', 'db')
  .option('--variables <path>', 'Path to JSON file with template variables')
  .option('--backup <path>', 'Create backup before making changes')
  .option('--batch-size <size>', 'Number of commands to process in a batch', '100')
  .option('--with-ttl <path>', 'Path to JSON file with TTL rules')
  .option('--acl-setup <path>', 'Path to JSON file with ACL configuration')
  .option('--health-check', 'Run health check before initialization')
  .option('--generate-docs <path>', 'Generate documentation for schemas')
  .option('--regions <path>', 'Path to JSON file with multi-region configuration')
  .option('--use-transactions', 'Use Redis transactions for atomic operations')
  .parse(process.argv);

const options = program.opts();

// Configure chalk based on color option
const colorize = program.opts().color;

// Display banner
console.log(chalk.bold(colorize ? chalk.blue('Redis Database Initialization Tool') : 'Redis Database Initialization Tool'));
console.log(colorize ? chalk.blue('-------------------------------') : '-------------------------------');

// Load template variables if specified
let variables = {};
if (options.variables) {
  try {
    variables = JSON.parse(fs.readFileSync(options.variables, 'utf8'));
    console.log(colorize ? chalk.blue(`Loaded template variables from ${chalk.yellow(options.variables)}`) : `Loaded template variables from ${options.variables}`);
  } catch (error) {
    console.error(colorize ? chalk.red(`Failed to load template variables: ${error.message}`) : `Failed to load template variables: ${error.message}`);
    process.exit(1);
  }
}

// Load TTL rules if specified
let ttlRules = {};
if (options.withTtl) {
  try {
    ttlRules = JSON.parse(fs.readFileSync(options.withTtl, 'utf8'));
    console.log(colorize ? chalk.blue(`Loaded TTL rules from ${chalk.yellow(options.withTtl)}`) : `Loaded TTL rules from ${options.withTtl}`);
  } catch (error) {
    console.error(colorize ? chalk.red(`Failed to load TTL rules: ${error.message}`) : `Failed to load TTL rules: ${error.message}`);
    process.exit(1);
  }
}

// Load ACL configuration if specified
let aclSetup = null;
if (options.aclSetup) {
  try {
    aclSetup = JSON.parse(fs.readFileSync(options.aclSetup, 'utf8'));
    console.log(colorize ? chalk.blue(`Loaded ACL configuration from ${chalk.yellow(options.aclSetup)}`) : `Loaded ACL configuration from ${options.aclSetup}`);
  } catch (error) {
    console.error(colorize ? chalk.red(`Failed to load ACL configuration: ${error.message}`) : `Failed to load ACL configuration: ${error.message}`);
    process.exit(1);
  }
}

// Load multi-region configuration if specified
let regions = null;
if (options.regions) {
  try {
    regions = JSON.parse(fs.readFileSync(options.regions, 'utf8'));
    console.log(colorize ? chalk.blue(`Loaded multi-region configuration from ${chalk.yellow(options.regions)}`) : `Loaded multi-region configuration from ${options.regions}`);
  } catch (error) {
    console.error(colorize ? chalk.red(`Failed to load multi-region configuration: ${error.message}`) : `Failed to load multi-region configuration: ${error.message}`);
    process.exit(1);
  }
}

// Log execution parameters
console.log(colorize ? chalk.blue(`Host:       ${chalk.yellow(options.host)}`) : `Host:       ${options.host}`);
console.log(colorize ? chalk.blue(`Port:       ${chalk.yellow(options.port)}`) : `Port:       ${options.port}`);
console.log(colorize ? chalk.blue(`Auth:       ${options.auth ? chalk.yellow('***') : chalk.yellow('none')}`) : `Auth:       ${options.auth ? '***' : 'none'}`);
console.log(colorize ? chalk.blue(`Database:   ${chalk.yellow(options.db)}`) : `Database:   ${options.db}`);
console.log(colorize ? chalk.blue(`Schemas:    ${chalk.yellow(options.dir)}`) : `Schemas:    ${options.dir}`);
console.log(colorize ? chalk.blue(`Prefix:     ${options.prefix ? chalk.yellow(options.prefix) : chalk.yellow('none')}`) : `Prefix:     ${options.prefix || 'none'}`);
console.log(colorize ? chalk.blue(`Deployment: ${chalk.yellow(options.deployment)}`) : `Deployment: ${options.deployment}`);
console.log(colorize ? chalk.blue(`Flush DB:   ${chalk.yellow(options.flush)}`) : `Flush DB:   ${options.flush}`);
if (options.flush) {
  console.log(colorize ? chalk.blue(`Flush Mode: ${chalk.yellow(options.flushMode)}`) : `Flush Mode: ${options.flushMode}`);
}
console.log(colorize ? chalk.blue(`Dry Run:    ${chalk.yellow(options.dryRun)}`) : `Dry Run:    ${options.dryRun}`);
console.log(colorize ? chalk.blue(`Batch Size: ${chalk.yellow(options.batchSize)}`) : `Batch Size: ${options.batchSize}`);
console.log(colorize ? chalk.blue(`Transactions: ${chalk.yellow(options.useTransactions)}`) : `Transactions: ${options.useTransactions}`);
console.log();

// Generate schema documentation if requested
if (options.generateDocs) {
  console.log(colorize ? chalk.blue(`Generating schema documentation...`) : `Generating schema documentation...`);

  try {
    const docs = generateDocumentation(options.dir);
    fs.writeFileSync(options.generateDocs, JSON.stringify(docs, null, 2));
    console.log(colorize ? chalk.green(`Documentation saved to ${options.generateDocs}`) : `Documentation saved to ${options.generateDocs}`);

    if (!options.host) {
      // If only generating docs without connecting to Redis, exit
      process.exit(0);
    }
  } catch (error) {
    console.error(colorize ? chalk.red(`Failed to generate documentation: ${error.message}`) : `Failed to generate documentation: ${error.message}`);
    process.exit(1);
  }
}

// Create Redis client configuration
const redisConfig = {
  host: options.host,
  port: options.port,
  password: options.auth,
  schemasDir: options.dir,
  flush: options.flush,
  timeout: parseInt(options.timeout),
  deploymentType: options.deployment,
  ssl: options.ssl,
  dryRun: options.dryRun,
  verbose: options.verbose,
  color: colorize,
  prefix: options.prefix,
  database: parseInt(options.db),
  flushMode: options.flushMode,
  variables: variables,
  backupFile: options.backup,
  batchSize: parseInt(options.batchSize),
  ttlRules: ttlRules,
  aclSetup: aclSetup,
  useTransactions: options.useTransactions
};

// Execute health check if requested
if (options.healthCheck) {
  console.log(colorize ? chalk.blue(`Running Redis health check...`) : `Running Redis health check...`);

  performHealthCheck(redisConfig)
    .then(health => {
      if (health.status === 'healthy') {
        console.log(colorize ? chalk.green(`Health check passed:`) : `Health check passed:`);
        console.log(JSON.stringify(health, null, 2));
      } else {
        console.error(colorize ? chalk.red(`Health check failed:`) : `Health check failed:`);
        console.error(JSON.stringify(health, null, 2));
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(colorize ? chalk.red(`Health check failed: ${error.message}`) : `Health check failed: ${error.message}`);
      process.exit(1);
    });
}

// Backup data if requested
if (options.backup) {
  console.log(colorize ? chalk.blue(`Creating Redis backup...`) : `Creating Redis backup...`);

  backupRedisData(redisConfig)
    .then(result => {
      if (result.success) {
        console.log(colorize ? chalk.green(`Backup created successfully: ${result.count} keys saved to ${options.backup}`) : `Backup created successfully: ${result.count} keys saved to ${options.backup}`);
      } else {
        console.error(colorize ? chalk.red(`Backup failed: ${result.error}`) : `Backup failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(colorize ? chalk.red(`Backup failed: ${error.message}`) : `Backup failed: ${error.message}`);
      process.exit(1);
    });
}

// Execute redis initialization
const executeInit = async () => {
  try {
    // Handle multi-region setup if configured
    if (regions) {
      console.log(colorize ? chalk.blue(`Initializing multiple regions...`) : `Initializing multiple regions...`);

      const primaryResult = await redisInit(redisConfig);

      if (!primaryResult.success) {
        console.error(colorize ? chalk.red(`Primary region initialization failed: ${primaryResult.error}`) : `Primary region initialization failed: ${primaryResult.error}`);
        process.exit(1);
      }

      console.log(colorize ? chalk.green(`Primary region initialized successfully!`) : `Primary region initialized successfully!`);

      for (const [regionName, regionConfig] of Object.entries(regions)) {
        console.log(colorize ? chalk.blue(`Initializing region ${regionName}...`) : `Initializing region ${regionName}...`);

        const regionResult = await redisInit({
          ...redisConfig,
          host: regionConfig.host,
          port: regionConfig.port,
          password: regionConfig.password
        });

        if (regionResult.success) {
          console.log(colorize ? chalk.green(`Region ${regionName} initialized successfully!`) : `Region ${regionName} initialized successfully!`);
        } else {
          console.error(colorize ? chalk.red(`Region ${regionName} initialization failed: ${regionResult.error}`) : `Region ${regionName} initialization failed: ${regionResult.error}`);
        }
      }

      console.log();
      console.log(colorize ? chalk.green('Multi-region initialization completed!') : 'Multi-region initialization completed!');
      process.exit(0);
    }

    // Single region initialization
    const result = await redisInit(redisConfig);

    if (result.success) {
      console.log();
      console.log(colorize ? chalk.green('Redis initialization completed successfully!') : 'Redis initialization completed successfully!');
      process.exit(0);
    } else {
      console.error(colorize ? chalk.red(`Redis initialization failed: ${result.error}`) : `Redis initialization failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(colorize ? chalk.red(`Uncaught error: ${error.message}`) : `Uncaught error: ${error.message}`);
    process.exit(1);
  }
};

// Start initialization process
executeInit();
