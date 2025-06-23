# Slaking

A Kubernetes service that monitors workloads for specific annotations and sends filtered logs to Slack channels based on configurations.

## Features

- **Workload Monitoring**: Watches Kubernetes workloads (Pods, Deployments, StatefulSets, etc.) for specific annotations
- **Log Filtering**: Filters logs based on configurable patterns and criteria
- **Slack Integration**: Sends filtered logs to designated Slack channels
- **Configuration Management**: Supports multiple configurations for different workloads and channels
- **Health Monitoring**: Built-in health checks and metrics
- **Helm Chart**: Complete Helm chart for easy deployment and management

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Kubernetes    │    │    Slaking     │    │     Slack       │
│   Workloads     │───▶│   Service        │───▶│   Channels      │
│   (with         │    │                  │    │                 │
│   annotations)  │    │  - Watcher       │    │  - #alerts      │
│                 │    │  - Filter        │    │  - #errors      │
│                 │    │  - Forwarder     │    │  - #debug       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Deployment Options

### Option 1: Helm Chart (Recommended)

The easiest way to deploy Slaking is using the provided Helm chart:

```bash
# Quick deployment with automated script
./helm-deploy.sh

# Manual Helm deployment
helm install slaking ./helm \
  --namespace slaking \
  --create-namespace \
  --set env.SLACK_TOKEN="xoxb-your-token" \
  --set env.SLACK_DEFAULT_CHANNEL="#alerts"
```

**Benefits of Helm deployment:**
- ✅ Easy configuration management
- ✅ Environment-specific values files
- ✅ Automatic RBAC setup
- ✅ Prometheus ServiceMonitor integration
- ✅ Horizontal Pod Autoscaler support
- ✅ Ingress configuration
- ✅ Comprehensive health checks
- ✅ Easy upgrades and rollbacks

### Option 2: Vanilla Kubernetes Manifests

For users who prefer direct Kubernetes manifests:

```bash
# Deploy using vanilla manifests
./deploy.sh

# Or manually
kubectl apply -f k8s/
```

## Configuration

### Workload Annotations

Add these annotations to your Kubernetes workloads:

```yaml
metadata:
  annotations:
    slaking.enabled: "true"
    slaking.channel: "#alerts"
    slaking.filters: "error|exception|fatal"
    slaking.level: "error"
    slaking.include-labels: "app=myapp,environment=prod"
```

### Configuration Options

| Annotation | Description | Default |
|------------|-------------|---------|
| `slaking.enabled` | Enable log forwarding for this workload | `false` |
| `slaking.channel` | Slack channel to send logs to | `#general` |
| `slaking.filters` | Regex patterns to filter logs | `.*` |
| `slaking.level` | Minimum log level (debug, info, warn, error) | `info` |
| `slaking.include-labels` | Comma-separated key=value pairs to include | `""` |
| `slaking.exclude-labels` | Comma-separated key=value pairs to exclude | `""` |
| `slaking.max-lines` | Maximum lines per message | `10` |
| `slaking.cooldown` | Cooldown period between messages (seconds) | `60` |

## Installation

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured and connected to your cluster
- Docker installed and running
- Slack workspace with API access
- Helm 3.0+ (for Helm deployment)

### Quick Start

1. **Clone and install dependencies:**
   ```bash
   cd slack-o-tron
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your Slack token and other settings
   ```

3. **Deploy to Kubernetes:**

   **Using Helm (Recommended):**
   ```bash
   ./helm-deploy.sh
   ```

   **Using vanilla manifests:**
   ```bash
   ./deploy.sh
   ```

4. **Configure your workloads with annotations and watch logs flow to Slack!**

## Development

### Local Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Building Docker Image

```bash
npm run build
```

## API Endpoints

- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `POST /config` - Update configuration
- `GET /config` - Get current configuration
- `GET /status` - Service status

## Monitoring

The service exposes Prometheus metrics at `/metrics` for monitoring:
- `slaking_logs_processed_total`
- `slaking_logs_filtered_total`
- `slaking_slack_messages_sent_total`
- `slaking_errors_total`

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

## Advanced Configuration

### Helm Chart Configuration

The Helm chart supports extensive configuration:

```yaml
# values-production.yaml
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

### Multi-Environment Setup

Create separate values files for different environments:

- `values-production.yaml` - Production settings
- `values-staging.yaml` - Staging settings  
- `values-development.yaml` - Development settings

## Troubleshooting

### Common Issues

1. **No logs being sent to Slack**
   - Check if annotations are properly set
   - Verify Slack token and channel permissions
   - Check service logs for errors

2. **Too many messages**
   - Adjust cooldown period
   - Refine filter patterns
   - Set appropriate log levels

3. **Permission denied**
   - Ensure proper RBAC configuration
   - Check service account permissions

### Debug Mode

**Helm deployment:**
```bash
helm upgrade slaking ./helm \
  --namespace slaking \
  --set env.LOG_LEVEL=debug
```

**Vanilla deployment:**
```bash
kubectl patch deployment slaking -n slaking \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"slaking","env":[{"name":"LOG_LEVEL","value":"debug"}]}]}}}}'
```

### Testing Configuration

```bash
# Test health endpoint
kubectl port-forward -n slaking svc/slaking 3000:3000
curl http://localhost:3000/health

# Test metrics endpoint
kubectl port-forward -n slaking svc/slaking-metrics 9090:9090
curl http://localhost:9090/metrics
```

## Management Commands

### Helm Deployment

```bash
# Check status
./helm-deploy.sh status

# View logs
./helm-deploy.sh logs

# Test deployment
./helm-deploy.sh test

# Upgrade deployment
./helm-deploy.sh upgrade

# Uninstall
./helm-deploy.sh uninstall
```

### Vanilla Deployment

```bash
# Check status
kubectl get pods -n slaking

# View logs
kubectl logs -n slaking -l app=slaking

# Update deployment
kubectl apply -f k8s/

# Delete deployment
kubectl delete -f k8s/
```

## Security Considerations

### RBAC Permissions

The service requires minimal permissions:
- Read access to pods and their logs
- Watch access to deployments, statefulsets, daemonsets
- Read access to namespaces

### Network Security

- Service runs on ClusterIP by default
- Metrics endpoint is separate for Prometheus scraping
- No external access required

### Secret Management

- Slack token is stored in Kubernetes Secret
- Consider using external secret management (HashiCorp Vault, AWS Secrets Manager, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT 