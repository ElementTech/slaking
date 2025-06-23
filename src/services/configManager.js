const fs = require('fs').promises;
const path = require('path');
const { createLogger, format, transports } = require('winston');

class ConfigManager {
  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'config-manager' },
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' })
      ]
    });
    this.config = null;
    this.configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.json');
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await this.loadConfig();
      this.validateConfig();
      this.isInitialized = true;
      this.logger.info('Configuration manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize configuration manager', error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      // Try to load from file first
      try {
        const configData = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
        this.logger.info(`Configuration loaded from ${this.configPath}`);
      } catch (fileError) {
        this.logger.warn(`Could not load config from ${this.configPath}, using defaults`);
        this.config = this.getDefaultConfig();
      }

      // Override with environment variables
      this.overrideWithEnvVars();

    } catch (error) {
      this.logger.error('Failed to load configuration', error);
      throw error;
    }
  }

  getDefaultConfig() {
    return {
      slack: {
        token: process.env.SLACK_TOKEN || null,
        defaultChannel: '#general',
        rateLimit: 1000, // ms between messages
        retryAttempts: 3,
        retryDelay: 5000 // ms
      },
      kubernetes: {
        namespaces: [], // empty means all namespaces
        watchAllNamespaces: true, // new option to explicitly enable watching all namespaces
        watchInterval: 30000, // ms
        logBufferSize: 100,
        maxLogLines: 10,
        defaultCooldown: 60 // seconds
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        maxFiles: 5,
        maxSize: '10m'
      },
      monitoring: {
        metricsPort: 9090,
        healthCheckInterval: 30000, // ms
        prometheusEnabled: true
      },
      filters: {
        defaultLevel: 'info',
        defaultPattern: '.*',
        excludePatterns: [
          'health check',
          'heartbeat',
          'ping'
        ]
      },
      annotations: {
        enabled: 'slaking.enabled',
        channel: 'slaking.channel',
        filters: 'slaking.filters',
        level: 'slaking.level',
        includeLabels: 'slaking.include-labels',
        excludeLabels: 'slaking.exclude-labels',
        maxLines: 'slaking.max-lines',
        cooldown: 'slaking.cooldown'
      }
    };
  }

  overrideWithEnvVars() {
    // Slack configuration
    if (process.env.SLACK_TOKEN) {
      this.config.slack.token = process.env.SLACK_TOKEN;
    }
    if (process.env.SLACK_DEFAULT_CHANNEL) {
      this.config.slack.defaultChannel = process.env.SLACK_DEFAULT_CHANNEL;
    }
    if (process.env.SLACK_RATE_LIMIT) {
      this.config.slack.rateLimit = parseInt(process.env.SLACK_RATE_LIMIT);
    }

    // Kubernetes configuration
    if (process.env.K8S_NAMESPACES) {
      const namespaces = process.env.K8S_NAMESPACES.split(',').map(ns => ns.trim()).filter(ns => ns.length > 0);
      this.config.kubernetes.namespaces = namespaces;
      // If specific namespaces are provided, disable watch all namespaces
      this.config.kubernetes.watchAllNamespaces = namespaces.length === 0;
    }
    
    // New environment variable to explicitly control watching all namespaces
    if (process.env.K8S_WATCH_ALL_NAMESPACES) {
      this.config.kubernetes.watchAllNamespaces = process.env.K8S_WATCH_ALL_NAMESPACES.toLowerCase() === 'true';
      // If watching all namespaces, clear the specific namespaces list
      if (this.config.kubernetes.watchAllNamespaces) {
        this.config.kubernetes.namespaces = [];
      }
    }
    
    if (process.env.K8S_WATCH_INTERVAL) {
      this.config.kubernetes.watchInterval = parseInt(process.env.K8S_WATCH_INTERVAL);
    }

    // Logging configuration
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL;
    }

    // Monitoring configuration
    if (process.env.METRICS_PORT) {
      this.config.monitoring.metricsPort = parseInt(process.env.METRICS_PORT);
    }
  }

  validateConfig() {
    const errors = [];

    // Validate Slack configuration
    if (!this.config.slack.token) {
      errors.push('Slack token is required');
    }

    // Validate Kubernetes configuration
    if (this.config.kubernetes.watchInterval < 1000) {
      errors.push('Kubernetes watch interval must be at least 1000ms');
    }

    if (this.config.kubernetes.logBufferSize < 1) {
      errors.push('Log buffer size must be at least 1');
    }

    // Validate monitoring configuration
    if (this.config.monitoring.metricsPort < 1 || this.config.monitoring.metricsPort > 65535) {
      errors.push('Metrics port must be between 1 and 65535');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    this.logger.info('Configuration validation passed');
  }

  getConfig() {
    if (!this.isInitialized) {
      throw new Error('Configuration manager not initialized');
    }
    return this.config;
  }

  async updateConfig(newConfig) {
    try {
      // Merge with existing config
      this.config = { ...this.config, ...newConfig };
      
      // Validate the updated config
      this.validateConfig();
      
      // Save to file
      await this.saveConfig();
      
      this.logger.info('Configuration updated successfully');
      
    } catch (error) {
      this.logger.error('Failed to update configuration', error);
      throw error;
    }
  }

  async saveConfig() {
    try {
      // Create directory if it doesn't exist
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      // Save config to file
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      this.logger.info(`Configuration saved to ${this.configPath}`);
      
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
      throw error;
    }
  }

  getSlackConfig() {
    return this.config.slack;
  }

  getKubernetesConfig() {
    return this.config.kubernetes;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getMonitoringConfig() {
    return this.config.monitoring;
  }

  getFiltersConfig() {
    return this.config.filters;
  }

  getAnnotationsConfig() {
    return this.config.annotations;
  }

  isNamespaceWatched(namespace) {
    // If watchAllNamespaces is explicitly enabled, watch all namespaces
    if (this.config.kubernetes.watchAllNamespaces) {
      return true;
    }
    
    // If no specific namespaces are configured, watch all namespaces (backward compatibility)
    if (this.config.kubernetes.namespaces.length === 0) {
      return true;
    }
    
    // Otherwise, only watch specified namespaces
    return this.config.kubernetes.namespaces.includes(namespace);
  }

  getAnnotationValue(annotations, key) {
    const annotationKey = this.config.annotations[key];
    return annotations[annotationKey];
  }

  validateAnnotationConfig(annotations) {
    const errors = [];
    
    // Check if slaking is enabled
    const enabled = this.getAnnotationValue(annotations, 'enabled');
    if (enabled === 'true') {
      // Validate channel
      const channel = this.getAnnotationValue(annotations, 'channel');
      if (channel && !channel.startsWith('#')) {
        errors.push('Channel must start with #');
      }
      
      // Validate filters regex
      const filters = this.getAnnotationValue(annotations, 'filters');
      if (filters) {
        try {
          new RegExp(filters);
        } catch (error) {
          errors.push('Invalid filter regex pattern');
        }
      }
      
      // Validate level
      const level = this.getAnnotationValue(annotations, 'level');
      if (level && !['debug', 'info', 'warn', 'error'].includes(level)) {
        errors.push('Invalid log level. Must be debug, info, warn, or error');
      }
      
      // Validate max lines
      const maxLines = this.getAnnotationValue(annotations, 'maxLines');
      if (maxLines && (isNaN(maxLines) || parseInt(maxLines) < 1)) {
        errors.push('Max lines must be a positive number');
      }
      
      // Validate cooldown
      const cooldown = this.getAnnotationValue(annotations, 'cooldown');
      if (cooldown && (isNaN(cooldown) || parseInt(cooldown) < 0)) {
        errors.push('Cooldown must be a non-negative number');
      }
    }
    
    return errors;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      configPath: this.configPath,
      hasSlackToken: !!this.config?.slack?.token,
      watchedNamespaces: this.config?.kubernetes?.namespaces || [],
      watchAllNamespaces: this.config?.kubernetes?.watchAllNamespaces || false,
      logLevel: this.config?.logging?.level
    };
  }
}

module.exports = ConfigManager; 