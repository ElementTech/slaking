# Slaking Helm Chart

A Helm chart for deploying Slaking - a Kubernetes service that monitors workloads for annotations and sends filtered logs to Slack channels.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- kubectl configured and connected to your cluster
- Docker installed and running
- Slack workspace with API access

## Quick Start

### 1. Add the Helm Repository (if published)

```bash
helm repo add slaking https://your-helm-repo.com
helm repo update
```

### 2. Install the Chart

```bash
# Install with default values
helm install slaking ./

# Install with custom values
helm install slaking ./ --values values-production.yaml

# Install in a specific namespace
helm install slaking ./ --namespace slaking --create-namespace
```

### 3. Using the Deployment Script

```bash
# Deploy with automated script
./helm-deploy.sh

# Check status
./helm-deploy.sh status

# View logs
./helm-deploy.sh logs

# Test deployment
./helm-deploy.sh test

# Uninstall
./helm-deploy.sh uninstall
```

## Configuration

### Values File Structure

The chart supports extensive configuration through the `values.yaml` file:

```yaml
# Image configuration
image:
  repository: slaking
  tag: "latest"
  pullPolicy: IfNotPresent

# Replica count
replicaCount: 1

# Resource limits
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

# Service configuration
service:
  type: ClusterIP
  port: 3000
  metricsPort: 9090

# Slack configuration
config:
  slack:
    defaultChannel: "#general"
    rateLimit: 1000
    retryAttempts: 3
    retryDelay: 5000

# Kubernetes configuration
config:
  kubernetes:
    namespaces: []  # Empty means all namespaces
    watchInterval: 30000
    logBufferSize: 100
    maxLogLines: 10
    defaultCooldown: 60

# Environment variables
env:
  SLACK_TOKEN: ""
  SLACK_DEFAULT_CHANNEL: "#alerts"
  LOG_LEVEL: "info"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_TOKEN` | Slack bot token | Required |
| `SLACK_DEFAULT_CHANNEL` | Default Slack channel | `#general` |
| `SLACK_RATE_LIMIT` | Rate limit in ms | `1000` |
| `K8S_NAMESPACES` | Comma-separated namespaces | All namespaces |
| `K8S_WATCH_INTERVAL` | Watch interval in ms | `30000` |
| `LOG_LEVEL` | Logging level | `info` |
| `METRICS_PORT` | Metrics port | `9090` |
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Environment | `production` |

### Advanced Configuration

#### Horizontal Pod Autoscaler

```yaml
hpa:
  enabled: true
  minReplicas: 1
  maxReplicas: 3
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

#### ServiceMonitor for Prometheus

```yaml
serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
  path: /metrics
  port: metrics
```

#### Ingress Configuration

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    kubernetes.io/ingress.class: nginx
  hosts:
    - host: slaking.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: slaking-tls
      hosts:
        - slaking.example.com
```

#### Security Context

```yaml
podSecurityContext:
  fsGroup: 1000
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

containerSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

## Installation Examples

### Basic Installation

```bash
helm install slaking ./ \
  --set env.SLACK_TOKEN="xoxb-your-token" \
  --set env.SLACK_DEFAULT_CHANNEL="#alerts"
```

### Production Installation

```bash
helm install slaking ./ \
  --namespace slaking \
  --create-namespace \
  --values values-production.yaml \
  --set replicaCount=2 \
  --set hpa.enabled=true \
  --set serviceMonitor.enabled=true
```

### Development Installation

```bash
helm install slaking-dev ./ \
  --namespace development \
  --create-namespace \
  --set env.LOG_LEVEL=debug \
  --set env.SLACK_DEFAULT_CHANNEL="#dev-logs" \
  --set config.kubernetes.namespaces[0]="development" \
  --set config.kubernetes.namespaces[1]="staging"
```

### Multi-Environment Setup

Create separate values files for different environments:

**values-production.yaml:**
```yaml
replicaCount: 3
hpa:
  enabled: true
  maxReplicas: 5
serviceMonitor:
  enabled: true
config:
  slack:
    defaultChannel: "#prod-alerts"
  kubernetes:
    namespaces: ["production", "staging"]
```

**values-staging.yaml:**
```yaml
replicaCount: 2
hpa:
  enabled: true
  maxReplicas: 3
config:
  slack:
    defaultChannel: "#staging-alerts"
  kubernetes:
    namespaces: ["staging"]
```

**values-development.yaml:**
```yaml
replicaCount: 1
hpa:
  enabled: false
config:
  slack:
    defaultChannel: "#dev-logs"
  kubernetes:
    namespaces: ["development"]
  logging:
    level: "debug"
```

## Upgrading

### Upgrade with New Values

```bash
helm upgrade slaking ./ \
  --namespace slaking \
  --values values-production.yaml
```

### Upgrade with Specific Values

```bash
helm upgrade slaking ./ \
  --namespace slaking \
  --set image.tag="v1.1.0" \
  --set config.slack.defaultChannel="#new-alerts"
```

### Rollback

```bash
# List releases
helm list -n slaking

# Rollback to previous version
helm rollback slaking 1 -n slaking

# Rollback to specific version
helm rollback slaking 2 -n slaking
```

## Monitoring and Observability

### Prometheus Metrics

The chart includes a ServiceMonitor for Prometheus Operator:

```yaml
serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s
  path: /metrics
  port: metrics
```

Available metrics:
- `slaking_logs_processed_total`
- `slaking_logs_filtered_total`
- `slaking_slack_messages_sent_total`
- `slaking_errors_total`
- `slaking_active_streams`

### Grafana Dashboard

Create a Grafana dashboard with these queries:

```promql
# Log processing rate
rate(slaking_logs_processed_total[5m])

# Error rate
rate(slaking_errors_total[5m])

# Active streams
slaking_active_streams

# Slack message rate
rate(slaking_slack_messages_sent_total[5m])
```

### Health Checks

The deployment includes comprehensive health checks:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

## Troubleshooting

### Common Issues

#### 1. Pod Not Starting

```bash
# Check pod status
kubectl get pods -n slaking

# Check pod events
kubectl describe pod -n slaking <pod-name>

# Check logs
kubectl logs -n slaking <pod-name>
```

#### 2. Slack Token Issues

```bash
# Check if secret exists
kubectl get secret -n slaking slaking-secrets

# Check secret content
kubectl get secret -n slaking slaking-secrets -o jsonpath='{.data.slack-token}' | base64 -d
```

#### 3. RBAC Issues

```bash
# Check service account
kubectl get serviceaccount -n slaking

# Test permissions
kubectl auth can-i get pods --as=system:serviceaccount:slaking:slaking
kubectl auth can-i get pods/log --as=system:serviceaccount:slaking:slaking
```

#### 4. Configuration Issues

```bash
# Check configmap
kubectl get configmap -n slaking slaking-config -o yaml

# Check environment variables
kubectl exec -n slaking <pod-name> -- env | grep SLACK
```

### Debug Mode

Enable debug logging:

```bash
helm upgrade slaking ./ \
  --namespace slaking \
  --set env.LOG_LEVEL=debug
```

### Testing

Test the deployment:

```bash
# Test health endpoint
kubectl port-forward -n slaking svc/slaking 3000:3000 &
curl http://localhost:3000/health

# Test metrics endpoint
kubectl port-forward -n slaking svc/slaking-metrics 9090:9090 &
curl http://localhost:9090/metrics

# Test Slack integration
curl -X POST http://localhost:3000/test-slack \
  -H "Content-Type: application/json" \
  -d '{"channel": "#test"}'
```

## Uninstalling

### Complete Uninstall

```bash
# Uninstall the release
helm uninstall slaking -n slaking

# Delete the namespace (optional)
kubectl delete namespace slaking

# Clean up RBAC (optional)
kubectl delete clusterrole slaking-role
kubectl delete clusterrolebinding slaking-role-binding
```

### Using the Script

```bash
./helm-deploy.sh uninstall
```

## Contributing

### Chart Development

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `helm template`
5. Submit a pull request

### Testing the Chart

```bash
# Lint the chart
helm lint ./

# Template the chart
helm template slaking ./ --values values-production.yaml

# Dry run installation
helm install slaking ./ --dry-run --debug --values values-production.yaml
```

## Support

For issues and questions:
1. Check the logs: `kubectl logs -n slaking -l app.kubernetes.io/name=slaking`
2. Verify configuration: `helm get values slaking -n slaking`
3. Test connectivity: Use the health check endpoint
4. Review RBAC permissions: `kubectl auth can-i --as=system:serviceaccount:slaking:slaking`

## License

This Helm chart is licensed under the MIT License. 