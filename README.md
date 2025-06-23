# 🦥 Slaking

> *"The laziest Pokémon that monitors your Kubernetes workloads while you take a nap!"*

<img src="https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/289.png" alt="Slaking Pokémon" width="200" height="200">

```
    ╭─────────────────────────────────────────────────────────────╮
    │                                                             │
    │  🦥 Slaking - Kubernetes Log Monitoring Service            │
    │                                                             │
    │  "When your logs need attention, Slaking wakes up!"        │
    │                                                             │
    ╰─────────────────────────────────────────────────────────────╯
```

*A Kubernetes service that monitors workloads for specific annotations and sends filtered logs to Slack channels based on configurations - just like how Slaking watches over its territory!*

## 🎯 Features

- **🦥 Workload Monitoring**: Like Slaking's keen senses, watches Kubernetes workloads (Pods, Deployments, StatefulSets, etc.) for specific annotations
- **🔍 Log Filtering**: Filters logs based on configurable patterns and criteria - Slaking knows exactly what to look for!
- **📱 Slack Integration**: Sends filtered logs to designated Slack channels - Slaking's way of communicating
- **⚙️ Configuration Management**: Supports multiple configurations for different workloads and channels
- **❤️ Health Monitoring**: Built-in health checks and metrics - Slaking stays healthy!
- **📦 Helm Chart**: Complete Helm chart for easy deployment and management

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Kubernetes    │    │    🦥 Slaking    │    │     Slack       │
│   Workloads     │───▶│   Service        │───▶│   Channels      │
│   (with         │    │                  │    │                 │
│   annotations)  │    │  - Watcher       │    │  - #alerts      │
│                 │    │  - Filter        │    │  - #errors      │
│                 │    │  - Forwarder     │    │  - #debug       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

*Slaking's territory spans from your Kubernetes cluster to your Slack workspace!*

## 🚀 Deployment Options

### Option 1: Helm Chart (Recommended) 🦥

The easiest way to deploy Slaking is using the provided Helm chart from the GitHub Pages repository:

#### Watch All Namespaces (Recommended)
```bash
# Add the Helm repository
helm repo add slaking https://elementtech.github.io/slaking
helm repo update

# Install the chart - Wake up Slaking to watch ALL namespaces!
helm install slaking slaking/slaking \
  --namespace slaking \
  --create-namespace \
  --set env.SLACK_TOKEN="xoxb-your-token" \
  --set env.SLACK_DEFAULT_CHANNEL="#alerts" \
  --set env.K8S_WATCH_ALL_NAMESPACES="true"
```

#### Watch Specific Namespaces Only
```bash
# Install the chart to watch specific namespaces only
helm install slaking slaking/slaking \
  --namespace slaking \
  --create-namespace \
  --set env.SLACK_TOKEN="xoxb-your-token" \
  --set env.SLACK_DEFAULT_CHANNEL="#alerts" \
  --set env.K8S_WATCH_ALL_NAMESPACES="false" \
  --set env.K8S_NAMESPACES="production,staging,monitoring"
```

**Alternative: Install from local chart directory (if you have the source code):**
```bash
# Quick deployment with automated script (watches all namespaces by default)
./helm-deploy.sh

# Manual Helm deployment from local chart
helm install slaking ./charts/slaking \
  --namespace slaking \
  --create-namespace \
  --set env.SLACK_TOKEN="xoxb-your-token" \
  --set env.SLACK_DEFAULT_CHANNEL="#alerts" \
  --set env.K8S_WATCH_ALL_NAMESPACES="true"
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

## ⚙️ Configuration

### Workload Annotations

Add these annotations to your Kubernetes workloads - Slaking will watch for these signals:

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

### Namespace Configuration

Slaking supports two modes for watching Kubernetes namespaces:

#### 🦥 Watch All Namespaces (Recommended)
This is the default and recommended configuration. Slaking will monitor all namespaces in your cluster and only process logs from workloads that have the `slaking.enabled: "true"` annotation.

**Environment Configuration:**
```bash
# Set to watch all namespaces
K8S_WATCH_ALL_NAMESPACES=true
# Leave K8S_NAMESPACES empty or unset
```

**Helm Configuration:**
```bash
helm install slaking slaking/slaking \
  --set env.K8S_WATCH_ALL_NAMESPACES="true"
```

**Benefits:**
- ✅ No need to specify namespaces manually
- ✅ Automatically picks up new namespaces
- ✅ Works with any workload regardless of namespace
- ✅ Simpler configuration and maintenance

#### 🎯 Watch Specific Namespaces Only
For environments where you want to limit Slaking's scope to specific namespaces (e.g., for security or performance reasons).

**Environment Configuration:**
```bash
# Disable watching all namespaces
K8S_WATCH_ALL_NAMESPACES=false
# Specify namespaces to watch
K8S_NAMESPACES=production,staging,monitoring
```

**Helm Configuration:**
```bash
helm install slaking slaking/slaking \
  --set env.K8S_WATCH_ALL_NAMESPACES="false" \
  --set env.K8S_NAMESPACES="production,staging,monitoring"
```

**Use Cases:**
- 🔒 Multi-tenant clusters where you want to isolate monitoring
- 🚀 Performance optimization for large clusters
- 🛡️ Security requirements that limit cross-namespace access

## 🎮 Installation

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured and connected to your cluster
- Docker installed and running
- Slack workspace with API access
- Helm 3.0+ (for Helm deployment)

### Quick Start

1. **Install from Helm repository (Recommended):**
   ```bash
   # Add the Helm repository
   helm repo add slaking https://elementtech.github.io/slaking
   helm repo update
   
   # Install with your Slack configuration - Time to wake up Slaking!
   # This will watch ALL namespaces by default
   helm install slaking slaking/slaking \
     --namespace slaking \
     --create-namespace \
     --set env.SLACK_TOKEN="xoxb-your-token" \
     --set env.SLACK_DEFAULT_CHANNEL="#alerts" \
     --set env.K8S_WATCH_ALL_NAMESPACES="true"
   ```

2. **Alternative: Local development setup:**
   ```bash
   # Clone and install dependencies
   git clone https://github.com/ElementTech/slaking.git
   cd slaking
   npm install
   
   # Set up environment variables
   cp env.example .env
   # Edit .env with your Slack token and other settings
   # By default, it will watch all namespaces
   
   # Deploy using automated script
   ./helm-deploy.sh
   ```

3. **Configure your workloads with annotations and watch logs flow to Slack!** 🦥

### Updating the Helm Chart

```bash
# Update the repository
helm repo update

# Check available versions
helm search repo slaking/slaking

# Upgrade to latest version (maintains current namespace configuration)
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --reuse-values

# Upgrade and change to watch all namespaces
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --set env.K8S_WATCH_ALL_NAMESPACES="true" \
  --reuse-values

# Upgrade and change to watch specific namespaces only
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --set env.K8S_WATCH_ALL_NAMESPACES="false" \
  --set env.K8S_NAMESPACES="production,staging" \
  --reuse-values

# Or upgrade to a specific version
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --version 1.0.1 \
  --reuse-values
```

## 🔌 API Endpoints

- `GET /health` - Health check (Slaking's vital signs)
- `GET /metrics` - Prometheus metrics (Slaking's stats)
- `POST /config` - Update configuration
- `GET /config` - Get current configuration
- `GET /status` - Service status (includes namespace configuration)

## 📊 Monitoring

The service exposes Prometheus metrics at `/metrics` for monitoring - Slaking's performance stats:
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

## 🎯 Advanced Configuration

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
    # Watch all namespaces (recommended)
    watchAllNamespaces: true
    namespaces: []
    # OR watch specific namespaces only
    # watchAllNamespaces: false
    # namespaces: ["production", "staging"]
env:
  SLACK_TOKEN: "xoxb-your-token"
  K8S_WATCH_ALL_NAMESPACES: "true"
  # K8S_NAMESPACES: "production,staging"  # Only needed if watchAllNamespaces: false
```

### Multi-Environment Setup

Create separate values files for different environments:

- `values-production.yaml` - Production settings
- `values-staging.yaml` - Staging settings  
- `values-development.yaml` - Development settings

## 🆘 Troubleshooting

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

4. **Helm repository not found (404 error)**
   - Ensure GitHub Pages is enabled for the `gh-pages` branch
   - Check that the chart-releaser action has run successfully
   - Verify the repository URL is correct: `https://elementtech.github.io/slaking`
   - Wait a few minutes after pushing changes for GitHub Pages to update

### Debug Mode

**Repository-based Helm deployment:**
```bash
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --set env.LOG_LEVEL=debug \
  --reuse-values
```

**Local Helm deployment:**
```bash
helm upgrade slaking ./charts/slaking \
  --namespace slaking \
  --set env.LOG_LEVEL=debug
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

## 🎮 Management Commands

### Helm Deployment (Repository-based)

```bash
# Check status
helm list -n slaking
kubectl get pods -n slaking

# View logs
kubectl logs -n slaking -l app=slaking

# Test deployment
kubectl port-forward -n slaking svc/slaking 3000:3000
curl http://localhost:3000/health

# Upgrade deployment
helm upgrade slaking slaking/slaking \
  --namespace slaking \
  --reuse-values

# Uninstall
helm uninstall slaking -n slaking
kubectl delete namespace slaking
```

### Helm Deployment (Local chart)

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

## 🔒 Security Considerations

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

---

```
    🦥 Slaking says: "Thanks for choosing me as your Kubernetes monitor!"
    
    "When your logs need attention, I'll be there to help!"
```

## 📄 License

MIT 

---

*Made with ❤️ by the Slaking team - Because even the laziest Pokémon can be the most reliable!* 🦥 