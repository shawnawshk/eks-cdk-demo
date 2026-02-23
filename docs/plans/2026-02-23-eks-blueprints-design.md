# EKS Blueprints CDK Project Design

**Date:** 2026-02-23
**Purpose:** Create a CDK project using AWS EKS Blueprints to set up an EKS cluster with core addons for microservices workloads

## Requirements Summary

- **Workload Type:** Small-scale microservices (1-5 services, starting small but can scale)
- **Access Pattern:** Internal only, using ClusterIP services with local port-forwarding for demo
- **Environment:** Single environment (demo/dev) with structure to support multi-environment later
- **Language:** TypeScript
- **Addons:** Core essentials (VPC CNI, CoreDNS, kube-proxy, AWS LB Controller, EBS CSI Driver, Metrics Server)

## Architecture Overview

### Stack Structure

The project uses a modular multi-stack architecture with three layers:

1. **VpcStack** - Creates VPC with public/private subnets
2. **EksClusterStack** - Creates EKS cluster using EKS Blueprints
3. **EksAddonsStack** - Installs core addons

### Dependency Flow

```
VpcStack (base layer)
   ↓ (passes vpc reference via constructor props)
EksClusterStack (cluster layer)
   ↓ (passes cluster reference via constructor props)
EksAddonsStack (addons layer)
```

### Dependency Handling

- Use `addDependency()` to enforce CloudFormation deployment order
- Pass resources via constructor props (direct references, not CloudFormation exports)
- Ensures clean stack boundaries without circular dependency risks

### Project Structure

```
cdk-eks/
├── bin/
│   └── app.ts              # CDK app entry point, defines stack dependencies
├── lib/
│   ├── vpc-stack.ts        # VPC stack
│   ├── eks-cluster-stack.ts # EKS cluster stack
│   └── eks-addons-stack.ts # Addons stack
├── docs/
│   └── plans/              # Design documents
├── cdk.json                # CDK configuration
├── package.json
├── tsconfig.json
└── .gitignore
```

## VPC Configuration

### Design

- **CIDR:** 10.0.0.0/16 (~65k IPs available)
- **Availability Zones:** 2 (for high availability)
- **Subnet Configuration per AZ:**
  - Public subnet: /24 (254 IPs) - for NAT gateways and future load balancers
  - Private subnet: /19 (8,190 IPs) - for EKS worker nodes and pods
- **NAT Gateways:** 1 per AZ (fault tolerant)
- **VPC Flow Logs:** Disabled for demo (can enable for production)

### Rationale

- Private subnets keep worker nodes isolated from internet
- Public subnets needed for NAT gateway egress
- Large private subnet CIDR provides room for pod IP allocation
- 2 AZs balances cost vs availability for a demo that can grow

### VPC Outputs

The VPC stack exposes:
- VPC ID
- Private subnet IDs (for node groups)
- Public subnet IDs (for future use)

## EKS Cluster Configuration

### Cluster Setup

- **Kubernetes Version:** 1.35
- **Control Plane:** AWS-managed (automatic HA across 3 AZs)
- **Cluster Endpoint:** Public + Private access
  - Public: Allows kubectl/port-forward from local machine
  - Private: Nodes communicate with control plane via VPC
- **Cluster Logging:** Disabled for demo (API server, audit, authenticator, controller manager, scheduler)

### Node Group

- **Type:** Managed node group (AWS handles updates and health checks)
- **Instance Type:** t3.medium (2 vCPU, 4GB RAM)
- **Capacity:**
  - Desired: 2 nodes
  - Min: 1 node
  - Max: 3 nodes
- **Disk Size:** 100GB per node
- **AMI Type:** AL2023_x86_64_STANDARD (Amazon Linux 2023)

### EKS Blueprints Integration

- Use `@aws-quickstart/eks-blueprints` library
- ClusterProvider pattern for cluster creation
- Prepares cluster for addon installation via Blueprints framework

### Rationale

- t3.medium: Cost-effective for small microservices demo
- 2 nodes: Provides redundancy without over-provisioning
- 100GB: Ample space for container images, logs, and local storage
- AL2023: Modern Amazon Linux with longer support lifecycle
- Public endpoint: Required for local kubectl access and port-forwarding
- Managed nodes: Reduces operational overhead

## EKS Addons

### Core Addons

1. **VPC CNI**
   - Assigns AWS VPC IP addresses to pods
   - Managed via Blueprints for version control
   - Required for pod networking

2. **CoreDNS**
   - DNS resolution for service discovery
   - Managed addon with automatic updates

3. **kube-proxy**
   - Maintains network rules for service communication
   - Managed addon

4. **AWS Load Balancer Controller**
   - Creates and manages ALB/NLB for Kubernetes services and ingresses
   - Uses IRSA (IAM Roles for Service Accounts) for permissions
   - Zero cost until load balancers are created
   - Future-proofs cluster for when public access is needed

5. **EBS CSI Driver**
   - Enables persistent storage with EBS volumes
   - Required for stateful workloads (databases, caches, etc.)
   - **Uses EKS Pod Identity** for IAM permissions (not IRSA)
   - Simpler configuration with native EKS integration

6. **Metrics Server**
   - Provides resource metrics for `kubectl top nodes/pods`
   - Required for Horizontal Pod Autoscaler
   - Essential for monitoring and capacity planning

### Implementation Approach

- Use EKS Blueprints addon framework for consistent deployment
- EBS CSI Driver configured with EKS Pod Identity
- Other addons use IRSA where appropriate
- Addons deployed in correct dependency order automatically

## Deployment & Stack Dependencies

### CDK App Structure

```typescript
// bin/app.ts
const vpcStack = new VpcStack(app, 'VpcStack', { env });

const eksStack = new EksClusterStack(app, 'EksClusterStack', {
  vpc: vpcStack.vpc,
  env
});

const addonsStack = new EksAddonsStack(app, 'EksAddonsStack', {
  cluster: eksStack.cluster,
  env
});

// Explicit dependency chain
eksStack.addDependency(vpcStack);
addonsStack.addDependency(eksStack);
```

### Deployment Order

1. **VpcStack** - Creates VPC (~2-3 minutes)
2. **EksClusterStack** - Creates EKS cluster (~15-20 minutes)
3. **EksAddonsStack** - Installs addons (~5-10 minutes)

**Commands:**
```bash
# Deploy all stacks in order
cdk deploy --all

# Or deploy individually
cdk deploy VpcStack
cdk deploy EksClusterStack
cdk deploy EksAddonsStack
```

### Stack Communication

- VPC passed via constructor props (direct reference)
- EKS cluster passed via constructor props
- No CloudFormation cross-stack references (cleaner, no circular dependency risks)

### Environment Configuration

- AWS account/region from environment variables or CDK context
- Single environment for demo
- Structure supports parameterization for multi-environment later

## Future Considerations

### When Scaling to Multiple Environments

- Parameterize stack names and configurations
- Use CDK context for environment-specific values
- Consider separate AWS accounts for production isolation

### When Adding Public Access

- Follow AWS deployment convention: CloudFront → ALB (internal) → services
- AWS Load Balancer Controller already installed and ready
- Update security groups and subnet configurations

### When Adding More Addons

- External DNS (for automatic Route53 updates)
- Cluster Autoscaler or Karpenter (for node autoscaling)
- Secrets Store CSI Driver (for AWS Secrets Manager integration)
- ArgoCD (for GitOps deployments)

## Validation Criteria

Project is successful when:
1. All three stacks deploy without errors
2. `kubectl get nodes` shows 2 ready nodes
3. All system pods are running in kube-system namespace
4. Can deploy a sample microservice with ClusterIP
5. Can successfully port-forward to the service from local machine

## Dependencies

- **AWS CDK:** v2.x (latest)
- **Node.js:** v18+ (for CDK and TypeScript)
- **kubectl:** Latest stable (for cluster access)
- **AWS CLI:** v2 (for authentication)
- **npm package:** `@aws-quickstart/eks-blueprints`
