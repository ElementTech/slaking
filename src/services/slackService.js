const { WebClient } = require('@slack/web-api');
const { createLogger, format, transports } = require('winston');

class SlackService {
  constructor(configManager) {
    this.configManager = configManager;
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'slack-service' },
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' })
      ]
    });
    this.client = null;
    this.isInitialized = false;
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  async initialize() {
    try {
      const config = this.configManager.getConfig();
      const token = config.slack?.token || process.env.SLACK_TOKEN;

      if (!token) {
        throw new Error('Slack token not configured. Set SLACK_TOKEN environment variable or configure in settings.');
      }

      this.client = new WebClient(token);
      
      // Test the connection
      const authTest = await this.client.auth.test();
      this.logger.info(`Connected to Slack workspace: ${authTest.team}`);
      
      this.isInitialized = true;
      this.logger.info('Slack service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Slack service', error);
      throw error;
    }
  }

  async sendMessage(channel, message, config = {}) {
    if (!this.isInitialized) {
      throw new Error('Slack service not initialized');
    }

    try {
      // Add message to queue for rate limiting
      this.messageQueue.push({
        channel,
        message,
        config,
        timestamp: Date.now()
      });

      // Process queue if not already processing
      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }

    } catch (error) {
      this.logger.error('Failed to queue message for Slack', error);
      throw error;
    }
  }

  async processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const messageData = this.messageQueue.shift();
      
      try {
        await this.sendMessageToSlack(
          messageData.channel,
          messageData.message,
          messageData.config
        );

        // Rate limiting: wait between messages
        await this.delay(1000);

      } catch (error) {
        this.logger.error('Failed to send message to Slack', error);
        
        // Re-queue message for retry (with exponential backoff)
        if (messageData.retryCount < 3) {
          messageData.retryCount = (messageData.retryCount || 0) + 1;
          messageData.timestamp = Date.now() + (messageData.retryCount * 5000); // 5s, 10s, 15s
          this.messageQueue.push(messageData);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  async sendMessageToSlack(channel, message, config) {
    try {
      // Format the message
      const formattedMessage = this.formatMessage(message, config);

      // Send to Slack
      const result = await this.client.chat.postMessage({
        channel: channel,
        text: formattedMessage.text,
        blocks: formattedMessage.blocks,
        unfurl_links: false,
        unfurl_media: false
      });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      this.logger.debug(`Message sent to ${channel}: ${result.ts}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to send message to ${channel}`, error);
      throw error;
    }
  }

  formatMessage(message, config) {
    // If message is already formatted as blocks, use it
    if (typeof message === 'object' && message.blocks) {
      return message;
    }

    // Simple text message
    if (typeof message === 'string') {
      return {
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          }
        ]
      };
    }

    // Default formatting
    return {
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };
  }

  async sendTestMessage(channel) {
    const testMessage = {
      text: '🧪 *Slaking Test Message*\nThis is a test message from the Slaking service.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🧪 *Slaking Test Message*\nThis is a test message from the Slaking service.'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Sent at ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    };

    return await this.sendMessage(channel, testMessage);
  }

  async getChannelInfo(channel) {
    try {
      const result = await this.client.conversations.info({
        channel: channel
      });

      return {
        id: result.channel.id,
        name: result.channel.name,
        is_member: result.channel.is_member,
        is_private: result.channel.is_private
      };

    } catch (error) {
      this.logger.error(`Failed to get channel info for ${channel}`, error);
      return null;
    }
  }

  async listChannels() {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel'
      });

      return result.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private
      }));

    } catch (error) {
      this.logger.error('Failed to list channels', error);
      return [];
    }
  }

  async validateChannel(channel) {
    // Remove # if present
    const channelName = channel.startsWith('#') ? channel.slice(1) : channel;
    
    try {
      const channels = await this.listChannels();
      return channels.some(ch => ch.name === channelName);
    } catch (error) {
      this.logger.error('Failed to validate channel', error);
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      queueLength: this.messageQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'not_initialized' };
      }

      const authTest = await this.client.auth.test();
      return {
        status: 'healthy',
        workspace: authTest.team,
        user: authTest.user
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = SlackService; 