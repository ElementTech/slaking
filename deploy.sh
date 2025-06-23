#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="slaking"
IMAGE_TAG="latest"
NAMESPACE="slaking"

echo -e "${BLUE}🚀 Slaking Deployment Script${NC}"
echo "=================================="

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
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

echo -e "${GREEN}✅ Environment check passed${NC}"

# Build Docker image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
else
    echo -e "${RED}❌ Failed to build Docker image${NC}"
    exit 1
fi

# Create namespace if it doesn't exist
echo -e "${BLUE}📦 Creating namespace...${NC}"
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# Create secret for Slack token
echo -e "${BLUE}🔐 Creating Slack token secret...${NC}"
kubectl create secret generic slaking-secrets \
    --namespace=${NAMESPACE} \
    --from-literal=slack-token="${SLACK_TOKEN}" \
    --dry-run=client -o yaml | kubectl apply -f -

# Apply Kubernetes manifests
echo -e "${BLUE}📋 Applying Kubernetes manifests...${NC}"
kubectl apply -f k8s/

# Wait for deployment to be ready
echo -e "${BLUE}⏳ Waiting for deployment to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/slaking -n ${NAMESPACE}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment is ready${NC}"
else
    echo -e "${RED}❌ Deployment failed to become ready${NC}"
    echo -e "${YELLOW}📋 Checking pod status...${NC}"
    kubectl get pods -n ${NAMESPACE}
    kubectl describe deployment slaking -n ${NAMESPACE}
    exit 1
fi

# Get service information
echo -e "${BLUE}📊 Service Information:${NC}"
kubectl get svc -n ${NAMESPACE}

# Get pod information
echo -e "${BLUE}📦 Pod Information:${NC}"
kubectl get pods -n ${NAMESPACE}

# Show logs
echo -e "${BLUE}📋 Recent logs:${NC}"
kubectl logs -n ${NAMESPACE} -l app=slaking --tail=20

echo -e "${GREEN}🎉 Slaking deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo "1. Test the service: kubectl port-forward -n ${NAMESPACE} svc/slaking 3000:3000"
echo "2. Check health: curl http://localhost:3000/health"
echo "3. View metrics: curl http://localhost:3000/metrics"
echo "4. Deploy example workload: kubectl apply -f examples/example-deployment.yaml"
echo ""
echo -e "${YELLOW}⚠️  Remember to configure your workloads with slaking annotations!${NC}" 