# Slaking Deployment Guide

This guide provides step-by-step instructions for deploying and configuring the Slaking service in your Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured and connected to your cluster
- Docker installed and running
- Slack workspace with API access
- Slack bot token with appropriate permissions

## Slack Setup

### Option 1: Quick Setup with App Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From an app manifest"
3. Copy and paste the contents of `slack-app-manifest.json` into the manifest field
4. Click "Create"
5. Go to "Install App" in the sidebar
6. Click "Install to Workspace"
7. Authorize the app
8. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### Option 2: Manual Setup

#### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Enter app name (e.g., "Slaking") and select your workspace
4. Click "Create App"

#### 2. Configure Bot Token Scopes

In your Slack app settings, go to "OAuth & Permissions" and add these scopes:

**Bot Token Scopes:**
- `channels:read` - Read public channels
- `chat:write` - Send messages
- `groups:read` - Read private channels
- `im:read` - Read direct messages
- `mpim:read` - Read group direct messages

#### 3. Install App to Workspace

1. Go to "Install App" in the sidebar
2. Click "Install to Workspace"
3. Authorize the app
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

## Local Development Setup

### 1. Clone and Install

```bash
cd slack-o-tron
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your Slack token:

```bash
SLACK_TOKEN=xoxb-your-actual-token-here
SLACK_DEFAULT_CHANNEL=#alerts
LOG_LEVEL=debug
```

### 3. Test Locally

```bash
npm run dev
```

The service will start on `http://localhost:3000`

## Kubernetes Deployment

### 1. Quick Deployment

Use the automated deployment script:

```bash
./deploy.sh
```

This script will:
- Build the Docker image
- Create the namespace and RBAC resources
- Deploy the service
- Wait for the deployment to be ready

### 2. Manual Deployment

If you prefer manual deployment:

#### Build Docker Image

```bash
docker build -t slaking:latest .
```

#### Create Namespace

```bash
kubectl create namespace slaking
```

#### Create Slack Token Secret

```bash
kubectl create secret generic slaking-secrets \
    --namespace=slaking \
    --from-literal=slack-token="xoxb-your-token-here"
```

#### Apply Kubernetes Manifests

```bash
kubectl apply -f k8s/
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n slaking

# Check services
kubectl get svc -n slaking

# Check logs
kubectl logs -n slaking -l app=slaking

# Test health endpoint
kubectl port-forward -n slaking svc/slaking 3000:3000
curl http://localhost:3000/health
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_TOKEN` | Slack bot token | Required |
| `SLACK_DEFAULT_CHANNEL` | Default Slack channel | `#general` |
| `SLACK_RATE_LIMIT` | Rate limit in ms | `1000` |
| `K8S_WATCH_ALL_NAMESPACES` | Watch all namespaces (true/false) | `true` |
| `K8S_NAMESPACES` | Comma-separated namespaces to watch | All namespaces (when K8S_WATCH_ALL_NAMESPACES=true) |
| `LOG_LEVEL` | Logging level | `info` |
| `PORT` | HTTP server port | `3000` |

### Namespace Configuration

Slaking supports two modes for watching Kubernetes namespaces:

#### Watch All Namespaces (Default)
By default, Slaking watches all namespaces in your cluster. This is the recommended configuration for most use cases.

```bash
# Environment configuration
K8S_WATCH_ALL_NAMESPACES=true
# K8S_NAMESPACES can be left empty or unset
```

**Benefits:**
- Automatically picks up new namespaces
- No need to maintain a list of namespaces
- Works with any workload regardless of namespace
- Simpler configuration

#### Watch Specific Namespaces Only
For environments where you want to limit Slaking's scope to specific namespaces.

```bash
# Environment configuration
K8S_WATCH_ALL_NAMESPACES=false
K8S_NAMESPACES=production,staging,monitoring
```

**Use Cases:**
- Multi-tenant clusters with namespace isolation
- Performance optimization for large clusters
- Security requirements limiting cross-namespace access
- Testing in specific environments only

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
    slaking.exclude-labels: "component=monitoring"
    slaking.max-lines: "10"
    slaking.cooldown: "60"
```

### Annotation Reference

| Annotation | Type | Description | Default |
|------------|------|-------------|---------|
| `slaking.enabled` | string | Enable log forwarding | `false` |
| `slaking.channel` | string | Slack channel (must start with #) | `#general` |
| `slaking.filters` | string | Regex pattern to filter logs | `.*` |
| `slaking.level` | string | Minimum log level (debug, info, warn, error) | `info` |
| `slaking.include-labels` | string | Comma-separated key=value pairs to include | `""` |
| `slaking.exclude-labels` | string | Comma-separated key=value pairs to exclude | `""` |
| `slaking.max-lines` | string | Maximum lines per message | `10` |
| `slaking.cooldown` | string | Cooldown period in seconds | `60` |

## Usage Examples

### Example 1: Basic Error Logging

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    metadata:
      annotations:
        slaking.enabled: "true"
        slaking.channel: "#errors"
        slaking.filters: "ERROR|FATAL|Exception"
        slaking.level: "error"
```

### Example 2: Production Monitoring

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: production-api
spec:
  template:
    metadata:
      labels:
        environment: production
        app: api
      annotations:
        slaking.enabled: "true"
        slaking.channel: "#prod-alerts"
        slaking.filters: "error|exception|timeout|deadline"
        slaking.level: "warn"
        slaking.include-labels: "environment=production"
        slaking.max-lines: "5"
        slaking.cooldown: "30"
```

### Example 3: Debug Logging for Development

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dev-app
spec:
  template:
    metadata:
      labels:
        environment: development
      annotations:
        slaking.enabled: "true"
        slaking.channel: "#dev-logs"
        slaking.filters: ".*"
        slaking.level: "debug"
        slaking.max-lines: "20"
        slaking.cooldown: "10"
```

## Monitoring

### Health Checks

```bash
# Health endpoint
curl http://localhost:3000/health

# Status endpoint
curl http://localhost:3000/status

# Metrics endpoint (Prometheus format)
curl http://localhost:3000/metrics
```

### Prometheus Integration

Add this to your Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'slaking'
    static_configs:
      - targets: ['slaking.slaking.svc.cluster.local:9090']
```

### Grafana Dashboard

Create a Grafana dashboard with these metrics:

- `slaking_logs_processed_total`
- `slaking_logs_filtered_total`
- `slaking_slack_messages_sent_total`
- `slaking_errors_total`
- `slaking_active_streams`

## Troubleshooting

### Common Issues

#### 1. No logs being sent to Slack

**Check:**
- Pod annotations are correctly set
- Slack token is valid and has proper permissions
- Service logs for errors

```bash
kubectl logs -n slaking -l app=slaking
```

#### 2. Permission Denied

**Check:**
- Service account has proper RBAC permissions
- Namespace access

```bash
kubectl auth can-i get pods --as=system:serviceaccount:slaking:slaking
```

#### 3. Too Many Messages

**Solutions:**
- Increase cooldown period
- Refine filter patterns
- Set appropriate log levels

#### 4. Service Not Starting

**Check:**
- ConfigMap and Secret are properly created
- Resource limits are appropriate
- Health check configuration

```bash
kubectl describe pod -n slaking -l app=slaking
```

### Debug Mode

Enable debug logging:

```bash
kubectl patch deployment slaking -n slaking -p '{"spec":{"template":{"spec":{"containers":[{"name":"slaking","env":[{"name":"LOG_LEVEL","value":"debug"}]}]}}}}'
```

### Testing Configuration

Test your Slack integration:

```bash
# Port forward to service
kubectl port-forward -n slaking svc/slaking 3000:3000

# Send test message
curl -X POST http://localhost:3000/test-slack \
  -H "Content-Type: application/json" \
  -d '{"channel": "#your-channel"}'
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

## Scaling

### Horizontal Scaling

```bash
kubectl scale deployment slaking -n slaking --replicas=3
```

**Note:** Multiple replicas will watch the same resources, but only one will process each log stream.

### Resource Limits

Adjust resource limits in `k8s/deployment.yaml`:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

## Backup and Recovery

### Configuration Backup

```bash
# Backup ConfigMap
kubectl get configmap slaking-config -n slaking -o yaml > slaking-config-backup.yaml

# Backup Secret
kubectl get secret slaking-secrets -n slaking -o yaml > slaking-secrets-backup.yaml
```

### Restore

```bash
kubectl apply -f slaking-config-backup.yaml
kubectl apply -f slaking-secrets-backup.yaml
```

## Support

For issues and questions:
1. Check the logs: `kubectl logs -n slaking -l app=slaking`
2. Verify configuration: `kubectl get configmap slaking-config -n slaking -o yaml`
3. Test Slack connectivity: Use the health check endpoint
4. Review RBAC permissions: `kubectl auth can-i --as=system:serviceaccount:slaking:slaking` 