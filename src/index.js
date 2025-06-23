// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createLogger, format, transports } = require('winston');
const K8sWatcher = require('./services/k8sWatcher');
const SlackService = require('./services/slackService');
const LogProcessor = require('./services/logProcessor');
const ConfigManager = require('./services/configManager');
const MetricsCollector = require('./services/metricsCollector');

// Initialize logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'slaking' },
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' })
  ]
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize services
const configManager = new ConfigManager();
const slackService = new SlackService(configManager);
const logProcessor = new LogProcessor(configManager);
const metricsCollector = new MetricsCollector();
const k8sWatcher = new K8sWatcher(configManager, logProcessor, slackService, metricsCollector);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsCollector.getPrometheusMetrics());
});

// Configuration endpoints
app.get('/config', (req, res) => {
  res.json(configManager.getConfig());
});

app.post('/config', (req, res) => {
  try {
    configManager.updateConfig(req.body);
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    logger.error('Failed to update configuration', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    watcher: k8sWatcher.getStatus(),
    slack: slackService.getStatus(),
    config: configManager.getConfig(),
    metrics: metricsCollector.getMetrics()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await k8sWatcher.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await k8sWatcher.stop();
  process.exit(0);
});

// Start the application
async function start() {
  try {
    // Initialize services
    await configManager.initialize();
    await slackService.initialize();
    await logProcessor.initialize();
    await k8sWatcher.initialize();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Slaking service started on port ${PORT}`);
      logger.info('Health check available at /health');
      logger.info('Metrics available at /metrics');
      logger.info('Configuration available at /config');
    });

  } catch (error) {
    logger.error('Failed to start Slaking service', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at', promise, 'reason:', reason);
  process.exit(1);
});

start(); 