const k8s = require('@kubernetes/client-node');
const { createLogger, format, transports } = require('winston');

class K8sWatcher {
  constructor(configManager, logProcessor, slackService, metricsCollector) {
    this.configManager = configManager;
    this.logProcessor = logProcessor;
    this.slackService = slackService;
    this.metricsCollector = metricsCollector;
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'k8s-watcher' },
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'error.log', level: 'error' }),
        new transports.File({ filename: 'combined.log' })
      ]
    });
    
    this.kc = new k8s.KubeConfig();
    this.k8sApi = null;
    this.watchers = new Map();
    this.isRunning = false;
    this.watchedNamespaces = new Set();
  }

  async initialize() {
    try {
      // Load kubeconfig
      this.kc.loadFromDefault();
      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      
      this.logger.info('Kubernetes client initialized');
      
      // Start watching workloads
      await this.startWatching();
      
    } catch (error) {
      this.logger.error('Failed to initialize Kubernetes watcher', error);
      throw error;
    }
  }

  async startWatching() {
    if (this.isRunning) {
      this.logger.warn('Watcher is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting Kubernetes workload watcher');

    try {
      // Watch pods across all namespaces
      await this.watchPods();
      
      // Watch deployments
      await this.watchDeployments();
      
      // Watch statefulsets
      await this.watchStatefulSets();
      
      // Watch daemonsets
      await this.watchDaemonSets();
      
    } catch (error) {
      this.logger.error('Failed to start watching', error);
      this.isRunning = false;
      throw error;
    }
  }

  async watchPods() {
    const watch = new k8s.Watch(this.kc);
    
    const stream = await watch.watch('/api/v1/pods', {}, 
      (type, obj) => this.handlePodEvent(type, obj),
      (error) => this.handleWatchError('pods', error)
    );

    this.watchers.set('pods', stream);
    this.logger.info('Started watching pods');
  }

  async watchDeployments() {
    const watch = new k8s.Watch(this.kc);
    
    const stream = await watch.watch('/apis/apps/v1/deployments', {},
      (type, obj) => this.handleDeploymentEvent(type, obj),
      (error) => this.handleWatchError('deployments', error)
    );

    this.watchers.set('deployments', stream);
    this.logger.info('Started watching deployments');
  }

  async watchStatefulSets() {
    const watch = new k8s.Watch(this.kc);
    
    const stream = await watch.watch('/apis/apps/v1/statefulsets', {},
      (type, obj) => this.handleStatefulSetEvent(type, obj),
      (error) => this.handleWatchError('statefulsets', error)
    );

    this.watchers.set('statefulsets', stream);
    this.logger.info('Started watching statefulsets');
  }

  async watchDaemonSets() {
    const watch = new k8s.Watch(this.kc);
    
    const stream = await watch.watch('/apis/apps/v1/daemonsets', {},
      (type, obj) => this.handleDaemonSetEvent(type, obj),
      (error) => this.handleWatchError('daemonsets', error)
    );

    this.watchers.set('daemonsets', stream);
    this.logger.info('Started watching daemonsets');
  }

  handlePodEvent(type, pod) {
    try {
      this.logger.debug(`Pod event: ${type} ${pod.metadata.name} in ${pod.metadata.namespace}`);
      
      if (type === 'ADDED' || type === 'MODIFIED') {
        this.checkAndSetupLogStreaming(pod);
      } else if (type === 'DELETED') {
        this.stopLogStreaming(pod.metadata.uid);
      }
      
      this.metricsCollector.incrementLogsProcessed();
      
    } catch (error) {
      this.logger.error('Error handling pod event', error);
      this.metricsCollector.incrementErrors();
    }
  }

  handleDeploymentEvent(type, deployment) {
    try {
      this.logger.debug(`Deployment event: ${type} ${deployment.metadata.name} in ${deployment.metadata.namespace}`);
      
      if (type === 'ADDED' || type === 'MODIFIED') {
        // When deployment changes, we need to check if any pods need log streaming
        this.checkDeploymentPods(deployment);
      }
      
    } catch (error) {
      this.logger.error('Error handling deployment event', error);
      this.metricsCollector.incrementErrors();
    }
  }

  handleStatefulSetEvent(type, statefulSet) {
    try {
      this.logger.debug(`StatefulSet event: ${type} ${statefulSet.metadata.name} in ${statefulSet.metadata.namespace}`);
      
      if (type === 'ADDED' || type === 'MODIFIED') {
        this.checkStatefulSetPods(statefulSet);
      }
      
    } catch (error) {
      this.logger.error('Error handling statefulset event', error);
      this.metricsCollector.incrementErrors();
    }
  }

  handleDaemonSetEvent(type, daemonSet) {
    try {
      this.logger.debug(`DaemonSet event: ${type} ${daemonSet.metadata.name} in ${daemonSet.metadata.namespace}`);
      
      if (type === 'ADDED' || type === 'MODIFIED') {
        this.checkDaemonSetPods(daemonSet);
      }
      
    } catch (error) {
      this.logger.error('Error handling daemonset event', error);
      this.metricsCollector.incrementErrors();
    }
  }

  async checkAndSetupLogStreaming(pod) {
    const annotations = pod.metadata.annotations || {};
    
    // Check if slaking is enabled for this pod
    if (annotations['slaking.enabled'] !== 'true') {
      return;
    }

    // Check if pod is running
    if (pod.status.phase !== 'Running') {
      return;
    }

    // Check label filters
    if (!this.matchesLabelFilters(pod.metadata.labels, annotations)) {
      return;
    }

    // Setup log streaming for each container
    for (const container of pod.spec.containers) {
      await this.setupContainerLogStreaming(pod, container, annotations);
    }
  }

  matchesLabelFilters(labels, annotations) {
    const includeLabels = annotations['slaking.include-labels'];
    const excludeLabels = annotations['slaking.exclude-labels'];

    if (includeLabels) {
      const includePairs = includeLabels.split(',').map(pair => pair.trim());
      for (const pair of includePairs) {
        const [key, value] = pair.split('=');
        if (labels[key] !== value) {
          return false;
        }
      }
    }

    if (excludeLabels) {
      const excludePairs = excludeLabels.split(',').map(pair => pair.trim());
      for (const pair of excludePairs) {
        const [key, value] = pair.split('=');
        if (labels[key] === value) {
          return false;
        }
      }
    }

    return true;
  }

  async setupContainerLogStreaming(pod, container, annotations) {
    const streamKey = `${pod.metadata.uid}-${container.name}`;
    
    // Check if already streaming
    if (this.logProcessor.isStreaming(streamKey)) {
      return;
    }

    try {
      const config = {
        namespace: pod.metadata.namespace,
        podName: pod.metadata.name,
        containerName: container.name,
        channel: annotations['slaking.channel'] || '#general',
        filters: annotations['slaking.filters'] || '.*',
        level: annotations['slaking.level'] || 'info',
        maxLines: parseInt(annotations['slaking.max-lines']) || 10,
        cooldown: parseInt(annotations['slaking.cooldown']) || 60
      };

      await this.logProcessor.startStreaming(streamKey, config, this.slackService);
      this.logger.info(`Started log streaming for ${pod.metadata.name}/${container.name}`);
      
    } catch (error) {
      this.logger.error(`Failed to setup log streaming for ${pod.metadata.name}/${container.name}`, error);
      this.metricsCollector.incrementErrors();
    }
  }

  async checkDeploymentPods(deployment) {
    try {
      const response = await this.k8sApi.listNamespacedPod(
        deployment.metadata.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deployment.metadata.name}`
      );

      for (const pod of response.body.items) {
        await this.checkAndSetupLogStreaming(pod);
      }
    } catch (error) {
      this.logger.error('Error checking deployment pods', error);
    }
  }

  async checkStatefulSetPods(statefulSet) {
    try {
      const response = await this.k8sApi.listNamespacedPod(
        statefulSet.metadata.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${statefulSet.metadata.name}`
      );

      for (const pod of response.body.items) {
        await this.checkAndSetupLogStreaming(pod);
      }
    } catch (error) {
      this.logger.error('Error checking statefulset pods', error);
    }
  }

  async checkDaemonSetPods(daemonSet) {
    try {
      const response = await this.k8sApi.listNamespacedPod(
        daemonSet.metadata.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${daemonSet.metadata.name}`
      );

      for (const pod of response.body.items) {
        await this.checkAndSetupLogStreaming(pod);
      }
    } catch (error) {
      this.logger.error('Error checking daemonset pods', error);
    }
  }

  stopLogStreaming(podUid) {
    // Stop all container streams for this pod
    for (const [streamKey, stream] of this.logProcessor.getActiveStreams()) {
      if (streamKey.startsWith(podUid)) {
        this.logProcessor.stopStreaming(streamKey);
        this.logger.info(`Stopped log streaming for ${streamKey}`);
      }
    }
  }

  handleWatchError(resourceType, error) {
    this.logger.error(`Watch error for ${resourceType}`, error);
    this.metricsCollector.incrementErrors();
    
    // Attempt to restart the watch after a delay
    setTimeout(() => {
      this.logger.info(`Attempting to restart ${resourceType} watch`);
      this.restartWatch(resourceType);
    }, 5000);
  }

  async restartWatch(resourceType) {
    try {
      const stream = this.watchers.get(resourceType);
      if (stream) {
        stream.destroy();
        this.watchers.delete(resourceType);
      }

      switch (resourceType) {
        case 'pods':
          await this.watchPods();
          break;
        case 'deployments':
          await this.watchDeployments();
          break;
        case 'statefulsets':
          await this.watchStatefulSets();
          break;
        case 'daemonsets':
          await this.watchDaemonSets();
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to restart ${resourceType} watch`, error);
    }
  }

  async stop() {
    this.isRunning = false;
    this.logger.info('Stopping Kubernetes watcher');

    // Stop all watchers
    for (const [resourceType, stream] of this.watchers) {
      try {
        stream.destroy();
        this.logger.info(`Stopped ${resourceType} watcher`);
      } catch (error) {
        this.logger.error(`Error stopping ${resourceType} watcher`, error);
      }
    }

    this.watchers.clear();

    // Stop all log streams
    await this.logProcessor.stopAllStreams();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeWatchers: Array.from(this.watchers.keys()),
      watchedNamespaces: Array.from(this.watchedNamespaces),
      activeStreams: this.logProcessor.getActiveStreams().size
    };
  }
}

module.exports = K8sWatcher; 