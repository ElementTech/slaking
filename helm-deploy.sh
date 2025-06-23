#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CHART_NAME="slaking"
RELEASE_NAME="slaking"
NAMESPACE="slaking"
IMAGE_NAME="slaking"
IMAGE_TAG="latest"
HELM_CHART_PATH="./helm"

echo -e "${BLUE}🚀 Slaking Helm Deployment Script${NC}"
echo "=========================================="

# Check if required tools are available
check_requirements() {
    echo -e "${BLUE}🔍 Checking requirements...${NC}"
    
    if ! command -v helm &> /dev/null; then
        echo -e "${RED}❌ Helm is not installed or not in PATH${NC}"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}❌ kubectl is not installed or not in PATH${NC}"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All requirements met${NC}"
}

# Build Docker image
build_image() {
    echo -e "${BLUE}🔨 Building Docker image...${NC}"
    
    if [ ! -f "Dockerfile" ]; then
        echo -e "${RED}❌ Dockerfile not found in current directory${NC}"
        exit 1
    fi
    
    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Docker image built successfully${NC}"
    else
        echo -e "${RED}❌ Failed to build Docker image${NC}"
        exit 1
    fi
}

# Create namespace
create_namespace() {
    echo -e "${BLUE}📦 Creating namespace...${NC}"
    
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    echo -e "${GREEN}✅ Namespace created/updated${NC}"
}

# Create values file from environment
create_values_file() {
    echo -e "${BLUE}⚙️  Creating values file...${NC}"
    
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}⚠️  .env file not found. Creating from template...${NC}"
        cp env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env file with your Slack token and other settings${NC}"
        exit 1
    fi
    
    # Load environment variables
    source .env
    
    # Check if SLACK_TOKEN is set
    if [ -z "$SLACK_TOKEN" ] || [ "$SLACK_TOKEN" = "xoxb-your-slack-bot-token-here" ]; then
        echo -e "${RED}❌ Please set your Slack token in the .env file${NC}"
        exit 1
    fi
    
    # Create values file
    cat > helm/values-production.yaml << EOF
# Production values for Slaking
# Generated from .env file

image:
  repository: ${IMAGE_NAME}
  tag: "${IMAGE_TAG}"
  pullPolicy: IfNotPresent

env:
  SLACK_TOKEN: "${SLACK_TOKEN}"
  SLACK_DEFAULT_CHANNEL: "${SLACK_DEFAULT_CHANNEL:-#general}"
  SLACK_RATE_LIMIT: "${SLACK_RATE_LIMIT:-1000}"
  K8S_NAMESPACES: "${K8S_NAMESPACES:-}"
  K8S_WATCH_INTERVAL: "${K8S_WATCH_INTERVAL:-30000}"
  LOG_LEVEL: "${LOG_LEVEL:-info}"
  METRICS_PORT: "${METRICS_PORT:-9090}"
  PORT: "3000"
  NODE_ENV: "production"
  CONFIG_PATH: "/app/config/config.json"

secret:
  create: true
  data:
    slack-token: "${SLACK_TOKEN}"

config:
  slack:
    defaultChannel: "${SLACK_DEFAULT_CHANNEL:-#general}"
    rateLimit: ${SLACK_RATE_LIMIT:-1000}
  kubernetes:
    namespaces: ${K8S_NAMESPACES:-[]}
    watchInterval: ${K8S_WATCH_INTERVAL:-30000}
  logging:
    level: "${LOG_LEVEL:-info}"

# Enable monitoring features
serviceMonitor:
  enabled: true
  interval: 30s
  scrapeTimeout: 10s

# Enable horizontal pod autoscaler
hpa:
  enabled: true
  minReplicas: 1
  maxReplicas: 3
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80

# Resource limits
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

# Security settings
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
EOF
    
    echo -e "${GREEN}✅ Values file created: helm/values-production.yaml${NC}"
}

# Deploy with Helm
deploy_helm() {
    echo -e "${BLUE}📋 Deploying with Helm...${NC}"
    
    # Check if release exists
    if helm list -n ${NAMESPACE} | grep -q ${RELEASE_NAME}; then
        echo -e "${YELLOW}⚠️  Release ${RELEASE_NAME} already exists. Upgrading...${NC}"
        helm upgrade ${RELEASE_NAME} ${HELM_CHART_PATH} \
            --namespace ${NAMESPACE} \
            --values helm/values-production.yaml \
            --wait \
            --timeout 10m
    else
        echo -e "${BLUE}📦 Installing new release...${NC}"
        helm install ${RELEASE_NAME} ${HELM_CHART_PATH} \
            --namespace ${NAMESPACE} \
            --values helm/values-production.yaml \
            --wait \
            --timeout 10m
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Helm deployment completed successfully${NC}"
    else
        echo -e "${RED}❌ Helm deployment failed${NC}"
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    echo -e "${BLUE}🔍 Verifying deployment...${NC}"
    
    # Check pods
    echo -e "${BLUE}📦 Checking pods...${NC}"
    kubectl get pods -n ${NAMESPACE} -l "app.kubernetes.io/name=${CHART_NAME}"
    
    # Check services
    echo -e "${BLUE}🔌 Checking services...${NC}"
    kubectl get svc -n ${NAMESPACE}
    
    # Check secrets
    echo -e "${BLUE}🔐 Checking secrets...${NC}"
    kubectl get secrets -n ${NAMESPACE} | grep ${CHART_NAME}
    
    # Check configmaps
    echo -e "${BLUE}📋 Checking configmaps...${NC}"
    kubectl get configmaps -n ${NAMESPACE} | grep ${CHART_NAME}
    
    # Check RBAC
    echo -e "${BLUE}🛡️  Checking RBAC...${NC}"
    kubectl get clusterrole,clusterrolebinding | grep ${CHART_NAME}
    
    echo -e "${GREEN}✅ Deployment verification completed${NC}"
}

# Show useful commands
show_commands() {
    echo -e "${BLUE}📋 Useful commands:${NC}"
    echo ""
    echo -e "${GREEN}Check status:${NC}"
    echo "  helm status ${RELEASE_NAME} -n ${NAMESPACE}"
    echo "  kubectl get pods -n ${NAMESPACE}"
    echo ""
    echo -e "${GREEN}View logs:${NC}"
    echo "  kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=${CHART_NAME}"
    echo ""
    echo -e "${GREEN}Test health:${NC}"
    echo "  kubectl port-forward -n ${NAMESPACE} svc/${RELEASE_NAME} 3000:3000"
    echo "  curl http://localhost:3000/health"
    echo ""
    echo -e "${GREEN}View metrics:${NC}"
    echo "  kubectl port-forward -n ${NAMESPACE} svc/${RELEASE_NAME}-metrics 9090:9090"
    echo "  curl http://localhost:9090/metrics"
    echo ""
    echo -e "${GREEN}Update configuration:${NC}"
    echo "  helm upgrade ${RELEASE_NAME} ${HELM_CHART_PATH} --namespace ${NAMESPACE} --values helm/values-production.yaml"
    echo ""
    echo -e "${GREEN}Uninstall:${NC}"
    echo "  helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}"
    echo ""
    echo -e "${YELLOW}⚠️  Remember to configure your workloads with slaking annotations!${NC}"
}

# Main execution
main() {
    check_requirements
    build_image
    create_namespace
    create_values_file
    deploy_helm
    verify_deployment
    show_commands
    
    echo -e "${GREEN}🎉 Slaking Helm deployment completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Configure your workloads with slaking annotations"
    echo "2. Test the service endpoints"
    echo "3. Monitor the logs and metrics"
    echo "4. Set up Prometheus/Grafana dashboards if needed"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "upgrade")
        echo -e "${BLUE}🔄 Upgrading existing deployment...${NC}"
        create_values_file
        deploy_helm
        verify_deployment
        ;;
    "uninstall")
        echo -e "${YELLOW}🗑️  Uninstalling Slaking...${NC}"
        helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}
        echo -e "${GREEN}✅ Uninstallation completed${NC}"
        ;;
    "status")
        echo -e "${BLUE}📊 Checking deployment status...${NC}"
        helm status ${RELEASE_NAME} -n ${NAMESPACE}
        kubectl get pods -n ${NAMESPACE}
        ;;
    "logs")
        echo -e "${BLUE}📋 Showing logs...${NC}"
        kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=${CHART_NAME} -f
        ;;
    "test")
        echo -e "${BLUE}🧪 Testing deployment...${NC}"
        kubectl port-forward -n ${NAMESPACE} svc/${RELEASE_NAME} 3000:3000 &
        sleep 5
        curl -f http://localhost:3000/health
        kill %1
        ;;
    *)
        echo "Usage: $0 {deploy|upgrade|uninstall|status|logs|test}"
        echo "  deploy   - Deploy Slaking (default)"
        echo "  upgrade  - Upgrade existing deployment"
        echo "  uninstall- Remove Slaking"
        echo "  status   - Check deployment status"
        echo "  logs     - Show application logs"
        echo "  test     - Test deployment health"
        exit 1
        ;;
esac 