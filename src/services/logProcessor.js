const k8s = require('@kubernetes/client-node');
const { createLogger, format, transports } = require('winston');

class LogProcessor {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'log-processor' },
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' })
      ]
    });
    this.activeStreams = new Map();
    this.kc = new k8s.KubeConfig();
    this.k8sApi = null;
    this.cooldownTimers = new Map();
    
    // Log consolidation tracking
    this.logPatterns = new Map(); // Track repeated log patterns
    this.consolidationTimers = new Map(); // Timers for sending consolidation summaries
    this.consolidationConfig = {
      minRepeatCount: 10, // Minimum repeats before consolidating
      consolidationDelay: 120000, // 2 minutes delay before sending summary
      summaryTimeout: 900000, // 15 minutes timeout for "stopped" message
      enableStoppedMessages: true // Whether to send "stopped" messages
    };
  }

  async initialize() {
    try {
      this.kc.loadFromDefault();
      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.logger.info('Log processor initialized');
    } catch (error) {
      this.logger.error('Failed to initialize log processor', error);
      throw error;
    }
  }

  async startStreaming(streamKey, config, slackService) {
    if (this.activeStreams.has(streamKey)) {
      this.logger.warn(`Stream ${streamKey} is already active`);
      return;
    }

    try {
      // Use the proper log streaming method
      const logStream = {
        config,
        slackService,
        stream: null,
        buffer: [],
        lastSent: 0,
        isActive: true,
        interval: null
      };

      this.activeStreams.set(streamKey, logStream);

      // Set up polling for logs since streaming doesn't work as expected
      logStream.interval = setInterval(async () => {
        if (!logStream.isActive) {
          clearInterval(logStream.interval);
          return;
        }

        try {
          const response = await this.k8sApi.readNamespacedPodLog(
            config.podName,
            config.namespace,
            config.containerName,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            false // don't follow, just get current logs
          );

          if (response && response.body) {
            this.processLogChunk(streamKey, response.body);
          }
          
          // Check for stopped patterns every few polling cycles
          this.checkForStoppedPatterns(streamKey);
        } catch (error) {
          this.logger.error(`Error polling logs for ${streamKey}`, error);
          // Don't stop streaming on temporary errors
        }
      }, 5000); // Poll every 5 seconds

      this.logger.info(`Started log streaming for ${streamKey}`);

    } catch (error) {
      this.logger.error(`Failed to start log streaming for ${streamKey}`, error);
      throw error;
    }
  }

  processLogChunk(streamKey, chunk) {
    const logStream = this.activeStreams.get(streamKey);
    if (!logStream || !logStream.isActive) {
      return;
    }

    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (this.shouldProcessLine(line, logStream.config)) {
        // Track the log pattern for consolidation
        const patternData = this.trackLogPattern(streamKey, line, logStream.config, logStream.slackService);
        
        // Only add to buffer if the pattern is not being consolidated
        if (!patternData.isConsolidated) {
          logStream.buffer.push({
            timestamp: new Date().toISOString(),
            line: line.trim(),
            pod: logStream.config.podName,
            container: logStream.config.containerName,
            namespace: logStream.config.namespace
          });

          // Check if we should send the buffer
          if (this.shouldSendBuffer(logStream)) {
            this.sendLogBuffer(streamKey, logStream);
          }
        }
      }
    }
    
    // Check for stopped patterns after processing chunk
    this.checkForStoppedPatterns(streamKey);
  }

  shouldProcessLine(line, config) {
    // Check log level
    const level = this.extractLogLevel(line);
    if (!this.meetsLogLevel(level, config.level)) {
      return false;
    }

    // Check filters
    if (config.filters && config.filters !== '.*') {
      try {
        const regex = new RegExp(config.filters, 'i');
        if (!regex.test(line)) {
          return false;
        }
      } catch (error) {
        this.logger.error('Invalid filter regex', error);
        return false;
      }
    }

    return true;
  }

  extractLogLevel(line) {
    const levelPatterns = [
      { pattern: /\b(ERROR|FATAL|CRITICAL)\b/i, level: 'error' },
      { pattern: /\b(WARN|WARNING)\b/i, level: 'warn' },
      { pattern: /\b(INFO|INFORMATION)\b/i, level: 'info' },
      { pattern: /\b(DEBUG|TRACE)\b/i, level: 'debug' }
    ];

    for (const { pattern, level } of levelPatterns) {
      if (pattern.test(line)) {
        return level;
      }
    }

    return 'info'; // default level
  }

  meetsLogLevel(actualLevel, requiredLevel) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[actualLevel] >= levels[requiredLevel];
  }

  shouldSendBuffer(logStream) {
    const now = Date.now();
    const cooldownMs = logStream.config.cooldown * 1000;

    // Check cooldown
    if (now - logStream.lastSent < cooldownMs) {
      return false;
    }

    // Check buffer size
    if (logStream.buffer.length >= logStream.config.maxLines) {
      return true;
    }

    // Check if buffer is getting old (send after 30 seconds even if not full)
    const bufferAge = now - new Date(logStream.buffer[0]?.timestamp).getTime();
    if (logStream.buffer.length > 0 && bufferAge > 30000) {
      return true;
    }

    return false;
  }

  async sendLogBuffer(streamKey, logStream) {
    if (logStream.buffer.length === 0) {
      return;
    }

    try {
      const message = this.formatLogMessage(logStream.buffer, logStream.config);
      
      await logStream.slackService.sendMessage(
        logStream.config.channel,
        message,
        logStream.config
      );

      // Clear buffer and update last sent time
      logStream.buffer = [];
      logStream.lastSent = Date.now();

      this.logger.debug(`Sent ${logStream.buffer.length} log lines to ${logStream.config.channel}`);

    } catch (error) {
      this.logger.error(`Failed to send log buffer for ${streamKey}`, error);
      
      // Don't clear buffer on error, let it retry
      // But add a longer cooldown to prevent spam
      logStream.lastSent = Date.now() + 60000; // 1 minute cooldown
    }
  }

  formatLogMessage(logEntries, config) {
    const levels = logEntries.map(entry => this.extractLogLevel(entry.line));
    const highestLevel = this.getHighestLogLevel(levels);
    const { header, color } = this.getLevelFormatting(highestLevel, config);
    const logContent = logEntries.map(entry => {
      const timestamp = new Date(entry.timestamp).toLocaleTimeString();
      return `*[${timestamp}]* \`${entry.pod}/${entry.container}\`: ${entry.line}`;
    }).join('\n');
    const podInfo = `*Pod:* \`${config.podName}\`\n*Namespace:* \`${config.namespace}\``;
    return {
      text: `${header}\n${logContent}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: header.replace(/[*_`]/g, ''), emoji: true } },
        { type: 'section', fields: [
            { type: 'mrkdwn', text: podInfo },
            { type: 'mrkdwn', text: `*Log Level:* ${highestLevel.toUpperCase()}` }
          ] },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `\n\n\`\`\`${logContent}\`\`\`` } },
        { type: 'context', elements: [
            { type: 'mrkdwn', text: `:clock1: Sent at ${new Date().toLocaleString()}` }
          ] }
      ]
    };
  }

  getHighestLogLevel(levels) {
    const levelPriority = { error: 4, warn: 3, info: 2, debug: 1 };
    let highest = 'info';
    let maxPriority = 0;
    
    for (const level of levels) {
      const priority = levelPriority[level] || 0;
      if (priority > maxPriority) {
        maxPriority = priority;
        highest = level;
      }
    }
    
    return highest;
  }

  getLevelFormatting(level, config) {
    const baseInfo = `${config.podName} (${config.namespace})`;
    
    switch (level) {
      case 'error':
        return {
          header: `🚨 *Critical Error* - ${baseInfo}\n`,
          color: 'danger'
        };
      case 'warn':
        return {
          header: `⚠️ *Warning* - ${baseInfo}\n`,
          color: 'warning'
        };
      case 'debug':
        return {
          header: `🔍 *Debug Info* - ${baseInfo}\n`,
          color: 'good'
        };
      case 'info':
      default:
        return {
          header: `ℹ️ *Log Update* - ${baseInfo}\n`,
          color: 'good'
        };
    }
  }

  stopStreaming(streamKey) {
    const logStream = this.activeStreams.get(streamKey);
    if (!logStream) {
      return;
    }

    try {
      logStream.isActive = false;
      
      // Clear the polling interval
      if (logStream.interval) {
        clearInterval(logStream.interval);
        logStream.interval = null;
      }

      // Send any remaining buffer
      if (logStream.buffer.length > 0) {
        this.sendLogBuffer(streamKey, logStream);
      }

      // Clean up consolidation timers for this stream
      this.cleanupConsolidationTimers(streamKey);

      this.activeStreams.delete(streamKey);
      this.logger.info(`Stopped log streaming for ${streamKey}`);

    } catch (error) {
      this.logger.error(`Error stopping stream ${streamKey}`, error);
    }
  }

  cleanupConsolidationTimers(streamKey) {
    for (const [patternKey, patternData] of this.logPatterns.entries()) {
      if (patternKey.startsWith(streamKey + ':')) {
        // Clear timers
        if (patternData.consolidationTimer) {
          clearTimeout(patternData.consolidationTimer);
        }
        if (patternData.stoppedTimer) {
          clearTimeout(patternData.stoppedTimer);
        }
        
        // Remove from tracking
        this.logPatterns.delete(patternKey);
      }
    }
  }

  async stopAllStreams() {
    this.logger.info('Stopping all log streams');
    
    const streamKeys = Array.from(this.activeStreams.keys());
    for (const streamKey of streamKeys) {
      this.stopStreaming(streamKey);
    }
  }

  isStreaming(streamKey) {
    return this.activeStreams.has(streamKey);
  }

  getActiveStreams() {
    return this.activeStreams;
  }

  getStreamStatus(streamKey) {
    const stream = this.activeStreams.get(streamKey);
    if (!stream) {
      return null;
    }

    const consolidationStats = this.getConsolidationStats(streamKey);

    return {
      isActive: stream.isActive,
      bufferSize: stream.buffer.length,
      lastSent: stream.lastSent,
      config: stream.config,
      consolidation: consolidationStats.patternsByStream[streamKey] || {
        total: 0,
        active: 0,
        consolidated: 0
      }
    };
  }

  getAllStreamStatuses() {
    const statuses = {};
    for (const [streamKey, stream] of this.activeStreams) {
      statuses[streamKey] = this.getStreamStatus(streamKey);
    }
    return statuses;
  }

  getConsolidationStats(streamKey = null) {
    const stats = {
      totalPatterns: 0,
      activePatterns: 0,
      consolidatedPatterns: 0,
      patternsByStream: {}
    };

    for (const [patternKey, patternData] of this.logPatterns.entries()) {
      const keyStreamKey = patternKey.split(':')[0];
      
      if (streamKey && keyStreamKey !== streamKey) {
        continue;
      }

      stats.totalPatterns++;
      
      if (!stats.patternsByStream[keyStreamKey]) {
        stats.patternsByStream[keyStreamKey] = {
          total: 0,
          active: 0,
          consolidated: 0
        };
      }

      stats.patternsByStream[keyStreamKey].total++;
      
      if (patternData.isConsolidated) {
        stats.consolidatedPatterns++;
        stats.patternsByStream[keyStreamKey].consolidated++;
      } else {
        stats.activePatterns++;
        stats.patternsByStream[keyStreamKey].active++;
      }
    }

    return stats;
  }

  updateConsolidationConfig(newConfig) {
    this.consolidationConfig = { ...this.consolidationConfig, ...newConfig };
    this.logger.info('Updated consolidation configuration', this.consolidationConfig);
  }

  getConsolidationConfig() {
    return { ...this.consolidationConfig };
  }

  // Log consolidation methods
  extractLogPattern(line) {
    // Remove timestamps, dynamic values, and create a pattern
    let pattern = line
      // Remove ISO timestamps
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, '<TIMESTAMP>')
      // Remove common dynamic values
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
      .replace(/\b\d{10,}\b/g, '<ID>')
      .replace(/\b[A-Za-z0-9+/]{20,}={0,2}\b/g, '<HASH>')
      // Remove numbers that might be dynamic
      .replace(/\b\d{4,}\b/g, '<NUMBER>')
      // Remove quoted strings that might be dynamic
      .replace(/"[^"]*"/g, '<STRING>')
      .replace(/'[^']*'/g, '<STRING>');
    
    return pattern.trim();
  }

  getPatternKey(streamKey, pattern) {
    return `${streamKey}:${pattern}`;
  }

  trackLogPattern(streamKey, line, config, slackService) {
    const pattern = this.extractLogPattern(line);
    const patternKey = this.getPatternKey(streamKey, pattern);
    let patternData = this.logPatterns.get(patternKey);
    if (!patternData) {
      patternData = {
        pattern,
        count: 0,
        isConsolidated: false,
        isSuppressed: false, // NEW: suppress after first summary until resolved
        lastSeen: Date.now(),
        config,
        slackService,
        consolidationTimer: null,
        stoppedTimer: null
      };
      this.logPatterns.set(patternKey, patternData);
    }
    patternData.lastSeen = Date.now();
    if (!patternData.isSuppressed) {
      patternData.count++;
      if (!patternData.isConsolidated && patternData.count >= this.consolidationConfig.minRepeatCount) {
        this.startConsolidation(patternKey, patternData);
        patternData.isConsolidated = true;
        patternData.isSuppressed = true; // Suppress further reporting until resolved
      }
    }
    return patternData;
  }

  startConsolidation(patternKey, patternData) {
    // Clear any existing timer
    if (patternData.consolidationTimer) {
      clearTimeout(patternData.consolidationTimer);
    }
    
    // Set timer to send consolidation summary
    patternData.consolidationTimer = setTimeout(() => {
      this.sendConsolidationSummary(patternKey, patternData);
    }, this.consolidationConfig.consolidationDelay);
  }

  async sendConsolidationSummary(patternKey, patternData) {
    try {
      const message = this.formatConsolidationMessage(patternData);
      await patternData.slackService.sendMessage(
        patternData.config.channel,
        message,
        patternData.config
      );
      this.logger.debug(`Sent consolidation summary for pattern: ${patternData.pattern}`);
      // Reset count but keep suppressed until resolved
      patternData.count = 0;
      patternData.isConsolidated = false;
      // patternData.isSuppressed remains true until stopped message
      patternData.consolidationTimer = null;
    } catch (error) {
      this.logger.error(`Failed to send consolidation summary for ${patternKey}`, error);
    }
  }

  formatConsolidationMessage(patternData) {
    const duration = Math.round((Date.now() - patternData.lastSeen) / 1000);
    const level = this.extractLogLevel(patternData.pattern);
    const baseInfo = `*Pod:* \`${patternData.config.podName}\`\n*Namespace:* \`${patternData.config.namespace}\``;
    let emoji, title, color;
    switch (level) {
      case 'error': emoji = '🔄'; title = 'Repeated Error Pattern'; color = '#e01e5a'; break;
      case 'warn': emoji = '🔄'; title = 'Repeated Warning Pattern'; color = '#ecb22e'; break;
      case 'debug': emoji = '🔄'; title = 'Repeated Debug Pattern'; color = '#2eb886'; break;
      case 'info': default: emoji = '🔄'; title = 'Repeated Info Pattern'; color = '#36c5f0'; break;
    }
    return {
      text: `${emoji} ${title} - ${patternData.config.podName}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${emoji} ${title}`, emoji: true } },
        { type: 'section', fields: [
            { type: 'mrkdwn', text: baseInfo },
            { type: 'mrkdwn', text: `*Log Level:* ${level.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Count:* ${patternData.count}` },
            { type: 'mrkdwn', text: `*Duration:* ${duration} seconds` }
          ] },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `*Pattern:*\n\`\`\`${patternData.pattern}\`\`\`` } },
        { type: 'context', elements: [
            { type: 'mrkdwn', text: `:clock1: Last seen at ${new Date(patternData.lastSeen).toLocaleString()}` }
          ] }
      ]
    };
  }

  scheduleStoppedMessage(patternKey, patternData) {
    if (!this.consolidationConfig.enableStoppedMessages) {
      return;
    }
    
    // Clear any existing stopped timer
    if (patternData.stoppedTimer) {
      clearTimeout(patternData.stoppedTimer);
    }
    
    // Schedule "stopped" message
    patternData.stoppedTimer = setTimeout(async () => {
      await this.sendStoppedMessage(patternKey, patternData);
    }, this.consolidationConfig.summaryTimeout);
  }

  async sendStoppedMessage(patternKey, patternData) {
    try {
      const message = this.formatStoppedMessage(patternData);
      await patternData.slackService.sendMessage(
        patternData.config.channel,
        message,
        patternData.config
      );
      this.logger.debug(`Sent stopped message for pattern: ${patternData.pattern}`);
      // Remove the pattern from tracking and allow it to be reported again
      this.logPatterns.delete(patternKey);
      // (If you want to keep the object for stats, you could instead reset isSuppressed)
    } catch (error) {
      this.logger.error(`Failed to send stopped message for ${patternKey}`, error);
    }
  }

  formatStoppedMessage(patternData) {
    const level = this.extractLogLevel(patternData.pattern);
    const baseInfo = `*Pod:* \`${patternData.config.podName}\`\n*Namespace:* \`${patternData.config.namespace}\``;
    let emoji, title, color;
    switch (level) {
      case 'error': emoji = '✅'; title = 'Error Pattern Resolved'; color = '#2eb886'; break;
      case 'warn': emoji = '✅'; title = 'Warning Pattern Resolved'; color = '#2eb886'; break;
      case 'debug': emoji = '🔍'; title = 'Debug Pattern Stopped'; color = '#36c5f0'; break;
      case 'info': default: emoji = 'ℹ️'; title = 'Info Pattern Stopped'; color = '#36c5f0'; break;
    }
    return {
      text: `${emoji} ${title} - ${patternData.config.podName}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${emoji} ${title}`, emoji: true } },
        { type: 'section', fields: [
            { type: 'mrkdwn', text: baseInfo },
            { type: 'mrkdwn', text: `*Log Level:* ${level.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Total Occurrences:* ${patternData.count}` }
          ] },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: `*Pattern:*\n\`\`\`${patternData.pattern}\`\`\`` } },
        { type: 'context', elements: [
            { type: 'mrkdwn', text: `:white_check_mark: Resolved at ${new Date().toLocaleString()}` }
          ] }
      ]
    };
  }

  checkForStoppedPatterns(streamKey) {
    const now = Date.now();
    
    for (const [patternKey, patternData] of this.logPatterns.entries()) {
      if (patternKey.startsWith(streamKey + ':') && 
          !patternData.stoppedTimer && 
          (now - patternData.lastSeen) > this.consolidationConfig.summaryTimeout) {
        this.scheduleStoppedMessage(patternKey, patternData);
      }
    }
  }
}

module.exports = LogProcessor; 