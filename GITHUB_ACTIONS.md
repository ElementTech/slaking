# GitHub Actions Setup for Slaking

This document explains the GitHub Actions workflows that have been set up for Slaking to automatically build, test, and deploy the container image and Helm chart.

## Overview

The repository includes three GitHub Actions workflows:

1. **Container Deployment** (`deploy-container.yml`) - Builds and pushes Docker images to GitHub Container Registry
2. **Helm Chart Publishing** (`publish-helm.yml`) - Publishes Helm charts to GitHub Pages
3. **GitHub Pages Setup** (`setup-pages.yml`) - Initial setup for GitHub Pages hosting

## Workflows

### 1. Container Deployment Workflow

**File:** `.github/workflows/deploy-container.yml`

**Triggers:**
- Push to `main` or `develop` branches (when source code changes)
- Pull requests to `main` branch
- Release publications

**Features:**
- Builds Docker image using multi-platform support
- Pushes to GitHub Container Registry (GHCR)
- Automatic tagging based on branch, commit, and releases
- Security scanning with Trivy
- Runs tests on pull requests
- Caching for faster builds

**Usage:**
```bash
# Pull the latest image
docker pull ghcr.io/YOUR_USERNAME/slaking:latest

# Run the container
docker run -d \
  -e SLACK_BOT_TOKEN=your_token \
  -e SLACK_SIGNING_SECRET=your_secret \
  -e KUBERNETES_CONFIG_PATH=/path/to/kubeconfig \
  ghcr.io/YOUR_USERNAME/slaking:latest
```

### 2. Helm Chart Publishing Workflow

**File:** `.github/workflows/publish-helm.yml`

**Triggers:**
- Push to `main` branch (when Helm chart changes)
- Release publications

**Features:**
- Lints and validates Helm charts
- Packages charts with proper metadata
- Publishes to GitHub Pages
- Updates chart versions on releases
- Creates Helm repository index

**Usage:**
```bash
# Add the Helm repository
helm repo add slaking https://YOUR_USERNAME.github.io/slaking
helm repo update

# Install Slaking
helm install slaking slaking/slaking \
  --set slack.botToken=your_token \
  --set slack.signingSecret=your_secret
```

### 3. GitHub Pages Setup Workflow

**File:** `.github/workflows/setup-pages.yml`

**Triggers:**
- Manual workflow dispatch

**Features:**
- Sets up GitHub Pages for Helm chart hosting
- Creates a landing page for the Helm repository
- Provides installation instructions

## Setup Instructions

### 1. Enable GitHub Pages

1. Go to your repository settings
2. Navigate to "Pages" section
3. Set source to "GitHub Actions"
4. Run the "Setup GitHub Pages" workflow manually

### 2. Configure Repository Secrets

The workflows use the following secrets (automatically provided by GitHub):
- `GITHUB_TOKEN` - Automatically provided, no setup needed

### 3. Enable Container Registry

1. Go to your repository settings
2. Navigate to "Packages" section
3. Ensure "Inherit access from source repository" is enabled

### 4. Update Repository URLs

Update the following files with your actual repository information:

1. **Chart.yaml** - Update maintainer information
2. **README.md** - Update installation instructions
3. **Values.yaml** - Update default values

## Customization

### Container Image

To customize the container build:

1. Modify `Dockerfile` for different base images or build steps
2. Update `.github/workflows/deploy-container.yml` for different build contexts
3. Add build arguments or multi-stage builds as needed

### Helm Chart

To customize the Helm chart publishing:

1. Modify `charts/slaking/Chart.yaml` for metadata
2. Update `charts/slaking/values.yaml` for default values
3. Add additional chart dependencies if needed
4. Customize the GitHub Pages landing page in `setup-pages.yml`

### Workflow Triggers

To modify when workflows run:

1. Edit the `on` section in each workflow file
2. Add path filters to only trigger on specific file changes
3. Add environment-specific triggers

## Security Features

### Container Security

- **Trivy Scanning**: Automatically scans for vulnerabilities
- **Non-root User**: Container runs as non-root user
- **Multi-stage Builds**: Minimizes attack surface
- **Dependency Scanning**: Monitors for known vulnerabilities

### Helm Chart Security

- **Chart Linting**: Validates chart structure and metadata
- **Template Validation**: Ensures templates render correctly
- **Version Management**: Automatic version updates on releases

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure workflows have proper permissions
2. **Build Failures**: Check Dockerfile and dependencies
3. **Chart Publishing Issues**: Verify Helm chart structure
4. **Pages Not Updating**: Check GitHub Pages settings

### Debugging

1. Check workflow logs in the Actions tab
2. Verify repository secrets and permissions
3. Test workflows locally using `act` (GitHub Actions local runner)
4. Review container registry and pages settings

## Best Practices

1. **Version Management**: Use semantic versioning for releases
2. **Security**: Regularly update dependencies and base images
3. **Testing**: Add comprehensive tests to workflows
4. **Documentation**: Keep installation instructions updated
5. **Monitoring**: Monitor workflow success rates and build times

## Support

For issues with the GitHub Actions setup:

1. Check the workflow logs in the Actions tab
2. Review this documentation
3. Open an issue in the repository
4. Check GitHub Actions documentation for specific errors 