const { createLogger } = require('winston');
const ConfigManager = require('../src/services/configManager');
const SlackService = require('../src/services/slackService');
const LogProcessor = require('../src/services/logProcessor');
const MetricsCollector = require('../src/services/metricsCollector');

// Mock logger for tests
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockLogger)
}));

describe('Slaking Integration Tests', () => {
  let configManager;
  let slackService;
  let logProcessor;
  let metricsCollector;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create fresh instances
    configManager = new ConfigManager();
    slackService = new SlackService(configManager);
    logProcessor = new LogProcessor(configManager);
    metricsCollector = new MetricsCollector();

    // Mock environment variables
    process.env.SLACK_TOKEN = 'xoxb-test-token';
    process.env.LOG_LEVEL = 'debug';
  });

  afterEach(() => {
    delete process.env.SLACK_TOKEN;
    delete process.env.LOG_LEVEL;
  });

  describe('Configuration Manager', () => {
    test('should initialize with default config', async () => {
      await configManager.initialize();
      
      const config = configManager.getConfig();
      expect(config.slack).toBeDefined();
      expect(config.kubernetes).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.monitoring).toBeDefined();
    });

    test('should validate annotation configuration', async () => {
      await configManager.initialize();
      
      const validAnnotations = {
        'slaking.enabled': 'true',
        'slaking.channel': '#alerts',
        'slaking.filters': 'error|exception',
        'slaking.level': 'error',
        'slaking.max-lines': '10',
        'slaking.cooldown': '60'
      };

      const errors = configManager.validateAnnotationConfig(validAnnotations);
      expect(errors).toHaveLength(0);
    });

    test('should detect invalid annotation configuration', async () => {
      await configManager.initialize();
      
      const invalidAnnotations = {
        'slaking.enabled': 'true',
        'slaking.channel': 'alerts', // Missing #
        'slaking.filters': '[invalid-regex', // Invalid regex
        'slaking.level': 'invalid-level', // Invalid level
        'slaking.max-lines': '-1', // Invalid number
        'slaking.cooldown': '-5' // Invalid number
      };

      const errors = configManager.validateAnnotationConfig(invalidAnnotations);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics Collector', () => {
    test('should track metrics correctly', () => {
      metricsCollector.incrementLogsProcessed();
      metricsCollector.incrementLogsFiltered();
      metricsCollector.incrementSlackMessagesSent();
      metricsCollector.incrementErrors();
      metricsCollector.setActiveStreams(5);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.logsProcessed).toBe(1);
      expect(metrics.logsFiltered).toBe(1);
      expect(metrics.slackMessagesSent).toBe(1);
      expect(metrics.errors).toBe(1);
      expect(metrics.activeStreams).toBe(5);
    });

    test('should generate Prometheus metrics', () => {
      metricsCollector.incrementLogsProcessed();
      metricsCollector.incrementSlackMessagesSent();

      const prometheusMetrics = metricsCollector.getPrometheusMetrics();
      expect(prometheusMetrics).toContain('slaking_logs_processed_total 1');
      expect(prometheusMetrics).toContain('slaking_slack_messages_sent_total 1');
      expect(prometheusMetrics).toContain('# HELP slaking_logs_processed_total');
    });
  });

  describe('Log Processor', () => {
    test('should extract log levels correctly', () => {
      const testCases = [
        { line: 'ERROR: Something went wrong', expected: 'error' },
        { line: 'WARN: This is a warning', expected: 'warn' },
        { line: 'INFO: This is info', expected: 'info' },
        { line: 'DEBUG: Debug information', expected: 'debug' },
        { line: 'Some random log line', expected: 'info' } // default
      ];

      testCases.forEach(({ line, expected }) => {
        const level = logProcessor.extractLogLevel(line);
        expect(level).toBe(expected);
      });
    });

    test('should check log level requirements', () => {
      const testCases = [
        { actual: 'error', required: 'info', expected: true },
        { actual: 'warn', required: 'info', expected: true },
        { actual: 'info', required: 'info', expected: true },
        { actual: 'debug', required: 'info', expected: false },
        { actual: 'error', required: 'error', expected: true },
        { actual: 'warn', required: 'error', expected: false }
      ];

      testCases.forEach(({ actual, required, expected }) => {
        const meets = logProcessor.meetsLogLevel(actual, required);
        expect(meets).toBe(expected);
      });
    });

    test('should process log lines with filters', () => {
      const config = {
        filters: 'error|exception',
        level: 'info'
      };

      const testCases = [
        { line: 'ERROR: Something went wrong', shouldProcess: true },
        { line: 'Exception occurred', shouldProcess: true },
        { line: 'INFO: Normal operation', shouldProcess: false },
        { line: 'DEBUG: Debug info', shouldProcess: false }
      ];

      testCases.forEach(({ line, shouldProcess }) => {
        const result = logProcessor.shouldProcessLine(line, config);
        expect(result).toBe(shouldProcess);
      });
    });
  });

  describe('Slack Service', () => {
    test('should format messages correctly', () => {
      const testMessage = 'Test log message';
      const formatted = slackService.formatMessage(testMessage);

      expect(formatted.text).toBe(testMessage);
      expect(formatted.blocks).toBeDefined();
      expect(formatted.blocks[0].type).toBe('section');
    });

    test('should validate channel names', async () => {
      // Mock the listChannels method
      slackService.listChannels = jest.fn().mockResolvedValue([
        { name: 'alerts', id: 'C123' },
        { name: 'general', id: 'C456' }
      ]);

      const validChannel = await slackService.validateChannel('#alerts');
      const invalidChannel = await slackService.validateChannel('#nonexistent');

      expect(validChannel).toBe(true);
      expect(invalidChannel).toBe(false);
    });
  });

  describe('End-to-End Workflow', () => {
    test('should process log through entire pipeline', async () => {
      // Initialize all services
      await configManager.initialize();
      
      // Mock Slack service to avoid actual API calls
      slackService.sendMessage = jest.fn().mockResolvedValue({ ok: true });
      slackService.isInitialized = true;

      // Create a test log stream
      const streamKey = 'test-pod-test-container';
      const config = {
        namespace: 'default',
        podName: 'test-pod',
        containerName: 'test-container',
        channel: '#test',
        filters: 'error|exception',
        level: 'error',
        maxLines: 2,
        cooldown: 1
      };

      // Simulate log processing
      const logLine = 'ERROR: Test error message';
      const shouldProcess = logProcessor.shouldProcessLine(logLine, config);
      
      expect(shouldProcess).toBe(true);

      // Check metrics
      metricsCollector.incrementLogsProcessed();
      const metrics = metricsCollector.getMetrics();
      expect(metrics.logsProcessed).toBe(1);
    });
  });
}); 