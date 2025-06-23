const ConfigManager = require('../src/services/configManager');

describe('Namespace Configuration Tests', () => {
  let configManager;

  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.K8S_NAMESPACES;
    delete process.env.K8S_WATCH_ALL_NAMESPACES;
    
    configManager = new ConfigManager();
  });

  describe('Default Configuration', () => {
    test('should watch all namespaces by default', () => {
      const config = configManager.getDefaultConfig();
      expect(config.kubernetes.watchAllNamespaces).toBe(true);
      expect(config.kubernetes.namespaces).toEqual([]);
    });

    test('should watch any namespace when no specific namespaces are configured', () => {
      configManager.initialize();
      expect(configManager.isNamespaceWatched('default')).toBe(true);
      expect(configManager.isNamespaceWatched('production')).toBe(true);
      expect(configManager.isNamespaceWatched('any-namespace')).toBe(true);
    });
  });

  describe('Watch All Namespaces Configuration', () => {
    test('should watch all namespaces when K8S_WATCH_ALL_NAMESPACES=true', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'true';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(true);
      expect(configManager.config.kubernetes.namespaces).toEqual([]);
      expect(configManager.isNamespaceWatched('default')).toBe(true);
      expect(configManager.isNamespaceWatched('production')).toBe(true);
    });

    test('should watch all namespaces when K8S_WATCH_ALL_NAMESPACES is not set', () => {
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(true);
      expect(configManager.isNamespaceWatched('any-namespace')).toBe(true);
    });
  });

  describe('Specific Namespaces Configuration', () => {
    test('should only watch specified namespaces when K8S_WATCH_ALL_NAMESPACES=false', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'false';
      process.env.K8S_NAMESPACES = 'production,staging';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(false);
      expect(configManager.config.kubernetes.namespaces).toEqual(['production', 'staging']);
      expect(configManager.isNamespaceWatched('production')).toBe(true);
      expect(configManager.isNamespaceWatched('staging')).toBe(true);
      expect(configManager.isNamespaceWatched('default')).toBe(false);
      expect(configManager.isNamespaceWatched('other')).toBe(false);
    });

    test('should handle empty K8S_NAMESPACES with K8S_WATCH_ALL_NAMESPACES=false', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'false';
      process.env.K8S_NAMESPACES = '';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(false);
      expect(configManager.config.kubernetes.namespaces).toEqual([]);
      expect(configManager.isNamespaceWatched('any-namespace')).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    test('should watch all namespaces when only K8S_NAMESPACES is set to empty', () => {
      process.env.K8S_NAMESPACES = '';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(true);
      expect(configManager.isNamespaceWatched('any-namespace')).toBe(true);
    });

    test('should watch specific namespaces when K8S_NAMESPACES contains values', () => {
      process.env.K8S_NAMESPACES = 'production,staging';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(false);
      expect(configManager.config.kubernetes.namespaces).toEqual(['production', 'staging']);
    });
  });

  describe('Status Information', () => {
    test('should include namespace configuration in status', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'true';
      
      configManager.initialize();
      const status = configManager.getStatus();
      
      expect(status.watchAllNamespaces).toBe(true);
      expect(status.watchedNamespaces).toEqual([]);
    });

    test('should include specific namespaces in status', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'false';
      process.env.K8S_NAMESPACES = 'prod,test';
      
      configManager.initialize();
      const status = configManager.getStatus();
      
      expect(status.watchAllNamespaces).toBe(false);
      expect(status.watchedNamespaces).toEqual(['prod', 'test']);
    });
  });

  describe('Environment Variable Parsing', () => {
    test('should handle whitespace in namespace list', () => {
      process.env.K8S_NAMESPACES = '  production , staging , monitoring  ';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.namespaces).toEqual(['production', 'staging', 'monitoring']);
    });

    test('should filter out empty namespaces', () => {
      process.env.K8S_NAMESPACES = 'production,,staging,,monitoring';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.namespaces).toEqual(['production', 'staging', 'monitoring']);
    });

    test('should handle case-insensitive boolean values', () => {
      process.env.K8S_WATCH_ALL_NAMESPACES = 'TRUE';
      
      configManager.initialize();
      
      expect(configManager.config.kubernetes.watchAllNamespaces).toBe(true);
    });
  });
}); 