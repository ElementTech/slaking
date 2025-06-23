class MetricsCollector {
  constructor() {
    this.metrics = {
      logsProcessed: 0,
      logsFiltered: 0,
      slackMessagesSent: 0,
      errors: 0,
      activeStreams: 0,
      watchEvents: 0,
      podEvents: 0,
      deploymentEvents: 0,
      statefulSetEvents: 0,
      daemonSetEvents: 0
    };

    this.startTime = Date.now();
    this.lastResetTime = this.startTime;
  }

  incrementLogsProcessed() {
    this.metrics.logsProcessed++;
  }

  incrementLogsFiltered() {
    this.metrics.logsFiltered++;
  }

  incrementSlackMessagesSent() {
    this.metrics.slackMessagesSent++;
  }

  incrementErrors() {
    this.metrics.errors++;
  }

  setActiveStreams(count) {
    this.metrics.activeStreams = count;
  }

  incrementWatchEvents() {
    this.metrics.watchEvents++;
  }

  incrementPodEvents() {
    this.metrics.podEvents++;
  }

  incrementDeploymentEvents() {
    this.metrics.deploymentEvents++;
  }

  incrementStatefulSetEvents() {
    this.metrics.statefulSetEvents++;
  }

  incrementDaemonSetEvents() {
    this.metrics.daemonSetEvents++;
  }

  getMetrics() {
    const uptime = Date.now() - this.startTime;
    return {
      ...this.metrics,
      uptime,
      uptimeSeconds: Math.floor(uptime / 1000),
      startTime: new Date(this.startTime).toISOString()
    };
  }

  getPrometheusMetrics() {
    const uptime = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);

    return `# HELP slaking_logs_processed_total Total number of log lines processed
# TYPE slaking_logs_processed_total counter
slaking_logs_processed_total ${this.metrics.logsProcessed}

# HELP slaking_logs_filtered_total Total number of log lines that matched filters
# TYPE slaking_logs_filtered_total counter
slaking_logs_filtered_total ${this.metrics.logsFiltered}

# HELP slaking_slack_messages_sent_total Total number of messages sent to Slack
# TYPE slaking_slack_messages_sent_total counter
slaking_slack_messages_sent_total ${this.metrics.slackMessagesSent}

# HELP slaking_errors_total Total number of errors encountered
# TYPE slaking_errors_total counter
slaking_errors_total ${this.metrics.errors}

# HELP slaking_active_streams Current number of active log streams
# TYPE slaking_active_streams gauge
slaking_active_streams ${this.metrics.activeStreams}

# HELP slaking_watch_events_total Total number of Kubernetes watch events
# TYPE slaking_watch_events_total counter
slaking_watch_events_total ${this.metrics.watchEvents}

# HELP slaking_pod_events_total Total number of pod events processed
# TYPE slaking_pod_events_total counter
slaking_pod_events_total ${this.metrics.podEvents}

# HELP slaking_deployment_events_total Total number of deployment events processed
# TYPE slaking_deployment_events_total counter
slaking_deployment_events_total ${this.metrics.deploymentEvents}

# HELP slaking_statefulset_events_total Total number of statefulset events processed
# TYPE slaking_statefulset_events_total counter
slaking_statefulset_events_total ${this.metrics.statefulSetEvents}

# HELP slaking_daemonset_events_total Total number of daemonset events processed
# TYPE slaking_daemonset_events_total counter
slaking_daemonset_events_total ${this.metrics.daemonSetEvents}

# HELP slaking_uptime_seconds Service uptime in seconds
# TYPE slaking_uptime_seconds gauge
slaking_uptime_seconds ${uptimeSeconds}

# HELP slaking_build_info Build information
# TYPE slaking_build_info gauge
slaking_build_info{version="1.0.0",name="slaking"} 1
`;
  }

  reset() {
    this.metrics = {
      logsProcessed: 0,
      logsFiltered: 0,
      slackMessagesSent: 0,
      errors: 0,
      activeStreams: 0,
      watchEvents: 0,
      podEvents: 0,
      deploymentEvents: 0,
      statefulSetEvents: 0,
      daemonSetEvents: 0
    };
    this.lastResetTime = Date.now();
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    const logsPerSecond = uptimeSeconds > 0 ? (this.metrics.logsProcessed / uptimeSeconds).toFixed(2) : 0;
    const messagesPerSecond = uptimeSeconds > 0 ? (this.metrics.slackMessagesSent / uptimeSeconds).toFixed(2) : 0;
    const errorRate = this.metrics.logsProcessed > 0 ? ((this.metrics.errors / this.metrics.logsProcessed) * 100).toFixed(2) : 0;

    return {
      uptime: {
        seconds: uptimeSeconds,
        minutes: uptimeMinutes,
        hours: uptimeHours,
        formatted: `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`
      },
      rates: {
        logsPerSecond,
        messagesPerSecond,
        errorRate: `${errorRate}%`
      },
      totals: {
        ...this.metrics
      },
      lastReset: new Date(this.lastResetTime).toISOString()
    };
  }
}

module.exports = MetricsCollector; 