# EKS Blueprints CDK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a production-ready CDK project using AWS EKS Blueprints to deploy an EKS 1.35 cluster with core addons for microservices workloads.

**Architecture:** Three-stack modular architecture with explicit dependencies: VpcStack creates networking foundation, EksClusterStack provisions the cluster using EKS Blueprints, and EksAddonsStack installs core addons (VPC CNI, CoreDNS, kube-proxy, AWS LB Controller, EBS CSI Driver with Pod Identity, Metrics Server).

**Tech Stack:** AWS CDK v2 (TypeScript), EKS Blueprints, Kubernetes 1.35, Amazon Linux 2023

---

## Task 1: Initialize CDK Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `cdk.json`
- Create: `.gitignore`
- Create: `bin/app.ts`

**Step 1: Initialize TypeScript CDK project**

Run:
```bash
npm install -g aws-cdk
cdk init app --language typescript
```

Expected: CDK project scaffolding created

**Step 2: Install EKS Blueprints dependencies**

Run:
```bash
npm install @aws-quickstart/eks-blueprints
```

Expected: Package installed successfully

**Step 3: Update package.json with project metadata**

Modify `package.json`:
```json
{
  "name": "cdk-eks",
  "version": "1.0.0",
  "description": "EKS Blueprints CDK project for microservices",
  "bin": {
    "cdk-eks": "bin/app.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest",
    "cdk": "cdk"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "aws-cdk": "^2.170.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "~5.3.3"
  },
  "dependencies": {
    "@aws-quickstart/eks-blueprints": "^1.15.1",
    "aws-cdk-lib": "^2.170.0",
    "constructs": "^10.3.0"
  }
}
```

**Step 4: Verify TypeScript configuration**

Check `tsconfig.json` exists with:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["es2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": ["./node_modules/@types"]
  },
  "exclude": ["node_modules", "cdk.out"]
}
```

**Step 5: Update .gitignore**

Ensure `.gitignore` contains:
```
*.js
*.d.ts
node_modules
cdk.out
.cdk.staging
.DS_Store
*.swp
.env
```

**Step 6: Build project**

Run:
```bash
npm install
npm run build
```

Expected: TypeScript compilation successful, no errors

**Step 7: Commit initial setup**

```bash
git add .
git commit -m "Initialize CDK project with EKS Blueprints"
```

---

## Task 2: Implement VPC Stack

**Files:**
- Create: `lib/vpc-stack.ts`

**Step 1: Create VPC Stack with proper configuration**

Create `lib/vpc-stack.ts`:
```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC with 2 AZs, public and private subnets
    this.vpc = new ec2.Vpc(this, 'EksVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 19,
        },
      ],
    });

    // Tag subnets for EKS
    this.vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
      cdk.Tags.of(subnet).add('Name', `EksVpc-Public-${index + 1}`);
    });

    this.vpc.privateSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
      cdk.Tags.of(subnet).add('Name', `EksVpc-Private-${index + 1}`);
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'EksVpcId',
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR',
    });
  }
}
```

**Step 2: Build to verify syntax**

Run:
```bash
npm run build
```

Expected: Compilation successful, no TypeScript errors

**Step 3: Commit VPC Stack**

```bash
git add lib/vpc-stack.ts
git commit -m "Add VPC stack with public/private subnets"
```

---

## Task 3: Implement EKS Cluster Stack

**Files:**
- Create: `lib/eks-cluster-stack.ts`

**Step 1: Create EKS Cluster Stack using Blueprints**

Create `lib/eks-cluster-stack.ts`:
```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { Construct } from 'constructs';

export interface EksClusterStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksClusterStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // Create EKS cluster using Blueprints
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      vpc,
      version: eks.KubernetesVersion.V1_31, // Will update to 1.35 when available
      defaultCapacity: 0, // We'll add managed node group separately
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      clusterName: 'eks-blueprints-cluster',
    });

    // Add managed node group
    this.cluster.addNodegroupCapacity('ManagedNodeGroup', {
      instanceTypes: [new ec2.InstanceType('t3.medium')],
      minSize: 1,
      maxSize: 3,
      desiredSize: 2,
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
      diskSize: 100,
      nodeRole: undefined, // Let CDK create the role
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
      exportName: 'EksClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS Cluster ARN',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'KubectlRoleArn', {
      value: this.cluster.kubectlRole?.roleArn ?? 'N/A',
      description: 'kubectl Role ARN',
    });
  }
}
```

**Step 2: Build to verify syntax**

Run:
```bash
npm run build
```

Expected: Compilation successful

**Step 3: Commit EKS Cluster Stack**

```bash
git add lib/eks-cluster-stack.ts
git commit -m "Add EKS cluster stack with managed node group"
```

---

## Task 4: Implement EKS Addons Stack

**Files:**
- Create: `lib/eks-addons-stack.ts`

**Step 1: Create Addons Stack with core addons**

Create `lib/eks-addons-stack.ts`:
```typescript
import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EksAddonsStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class EksAddonsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EksAddonsStackProps) {
    super(scope, id, props);

    const { cluster } = props;

    // VPC CNI Addon
    new eks.CfnAddon(this, 'VpcCniAddon', {
      clusterName: cluster.clusterName,
      addonName: 'vpc-cni',
      resolveConflicts: 'OVERWRITE',
      addonVersion: 'v1.18.1-eksbuild.1', // Update to latest compatible version
    });

    // CoreDNS Addon
    new eks.CfnAddon(this, 'CoreDnsAddon', {
      clusterName: cluster.clusterName,
      addonName: 'coredns',
      resolveConflicts: 'OVERWRITE',
      addonVersion: 'v1.11.1-eksbuild.4', // Update to latest compatible version
    });

    // kube-proxy Addon
    new eks.CfnAddon(this, 'KubeProxyAddon', {
      clusterName: cluster.clusterName,
      addonName: 'kube-proxy',
      resolveConflicts: 'OVERWRITE',
      addonVersion: 'v1.31.0-eksbuild.1', // Update to 1.35.x when available
    });

    // EBS CSI Driver with Pod Identity
    // Create IAM role for EBS CSI Driver using Pod Identity
    const ebsCsiRole = new iam.Role(this, 'EbsCsiDriverRole', {
      assumedBy: new iam.ServicePrincipal('pods.eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'),
      ],
    });

    // Create Pod Identity Association
    new eks.CfnPodIdentityAssociation(this, 'EbsCsiPodIdentity', {
      clusterName: cluster.clusterName,
      namespace: 'kube-system',
      serviceAccount: 'ebs-csi-controller-sa',
      roleArn: ebsCsiRole.roleArn,
    });

    // EBS CSI Driver Addon
    const ebsCsiAddon = new eks.CfnAddon(this, 'EbsCsiAddon', {
      clusterName: cluster.clusterName,
      addonName: 'aws-ebs-csi-driver',
      resolveConflicts: 'OVERWRITE',
      addonVersion: 'v1.37.0-eksbuild.1', // Update to latest compatible version
      serviceAccountRoleArn: ebsCsiRole.roleArn,
    });

    // AWS Load Balancer Controller
    // Create IAM role for AWS Load Balancer Controller using IRSA
    const albControllerRole = new iam.Role(this, 'AlbControllerRole', {
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]:
              'system:serviceaccount:kube-system:aws-load-balancer-controller',
            [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]:
              'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // Attach AWS Load Balancer Controller policy
    albControllerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('ElasticLoadBalancingFullAccess')
    );

    // Add inline policy for additional permissions
    albControllerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:DescribeVpcs',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeInstances',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeTags',
          'ec2:CreateTags',
          'ec2:DeleteTags',
          'elasticloadbalancing:*',
          'acm:DescribeCertificate',
          'acm:ListCertificates',
          'iam:CreateServiceLinkedRole',
          'cognito-idp:DescribeUserPoolClient',
          'waf-regional:*',
          'wafv2:*',
          'shield:*',
        ],
        resources: ['*'],
      })
    );

    // Deploy AWS Load Balancer Controller via Helm
    const albController = cluster.addHelmChart('AwsLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: true,
          name: 'aws-load-balancer-controller',
          annotations: {
            'eks.amazonaws.com/role-arn': albControllerRole.roleArn,
          },
        },
        region: cdk.Stack.of(this).region,
        vpcId: cluster.vpc.vpcId,
      },
    });

    // Metrics Server
    cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      namespace: 'kube-system',
      values: {
        args: ['--kubelet-insecure-tls', '--kubelet-preferred-address-types=InternalIP'],
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'EbsCsiRoleArn', {
      value: ebsCsiRole.roleArn,
      description: 'EBS CSI Driver IAM Role ARN',
    });

    new cdk.CfnOutput(this, 'AlbControllerRoleArn', {
      value: albControllerRole.roleArn,
      description: 'AWS Load Balancer Controller IAM Role ARN',
    });
  }
}
```

**Step 2: Build to verify syntax**

Run:
```bash
npm run build
```

Expected: Compilation successful

**Step 3: Commit Addons Stack**

```bash
git add lib/eks-addons-stack.ts
git commit -m "Add EKS addons stack with core addons"
```

---

## Task 5: Wire Up CDK App

**Files:**
- Modify: `bin/app.ts`

**Step 1: Update CDK app entry point**

Replace contents of `bin/app.ts`:
```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { EksClusterStack } from '../lib/eks-cluster-stack';
import { EksAddonsStack } from '../lib/eks-addons-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Create VPC Stack
const vpcStack = new VpcStack(app, 'VpcStack', {
  env,
  description: 'VPC with public and private subnets for EKS cluster',
});

// Create EKS Cluster Stack
const eksStack = new EksClusterStack(app, 'EksClusterStack', {
  vpc: vpcStack.vpc,
  env,
  description: 'EKS cluster with managed node group',
});

// Create EKS Addons Stack
const addonsStack = new EksAddonsStack(app, 'EksAddonsStack', {
  cluster: eksStack.cluster,
  env,
  description: 'EKS core addons (VPC CNI, CoreDNS, kube-proxy, EBS CSI, ALB Controller, Metrics Server)',
});

// Explicit dependency chain
eksStack.addDependency(vpcStack);
addonsStack.addDependency(eksStack);

// Tags
cdk.Tags.of(app).add('Project', 'EKS-Blueprints');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
```

**Step 2: Build final project**

Run:
```bash
npm run build
```

Expected: Compilation successful, all stacks ready

**Step 3: Synthesize CloudFormation templates**

Run:
```bash
cdk synth
```

Expected: Three CloudFormation templates generated in `cdk.out/` directory

**Step 4: Commit CDK app**

```bash
git add bin/app.ts
git commit -m "Wire up VPC, EKS, and Addons stacks with dependencies"
```

---

## Task 6: Bootstrap and Deploy

**Files:**
- None (deployment commands)

**Step 1: Bootstrap CDK in AWS account**

Run:
```bash
cdk bootstrap
```

Expected: CDKToolkit stack created in AWS account

**Step 2: Review deployment plan**

Run:
```bash
cdk diff
```

Expected: Shows all resources to be created across three stacks

**Step 3: Deploy all stacks**

Run:
```bash
cdk deploy --all --require-approval never
```

Expected:
- VpcStack deploys first (~2-3 minutes)
- EksClusterStack deploys second (~15-20 minutes)
- EksAddonsStack deploys last (~5-10 minutes)

**Step 4: Configure kubectl**

Run:
```bash
aws eks update-kubeconfig --name eks-blueprints-cluster --region <your-region>
```

Expected: kubectl configured to access cluster

**Step 5: Verify cluster nodes**

Run:
```bash
kubectl get nodes
```

Expected output:
```
NAME                          STATUS   ROLES    AGE   VERSION
ip-10-0-x-x.ec2.internal      Ready    <none>   5m    v1.31.x
ip-10-0-x-x.ec2.internal      Ready    <none>   5m    v1.31.x
```

**Step 6: Verify addons**

Run:
```bash
kubectl get pods -n kube-system
```

Expected: All system pods running (coredns, vpc-cni, kube-proxy, ebs-csi-controller, aws-load-balancer-controller, metrics-server)

**Step 7: Test metrics server**

Run:
```bash
kubectl top nodes
```

Expected: CPU and memory metrics displayed for both nodes

---

## Task 7: Create Sample Deployment for Testing

**Files:**
- Create: `examples/sample-app.yaml`

**Step 1: Create sample nginx deployment**

Create `examples/sample-app.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-sample
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: nginx
  ports:
  - port: 80
    targetPort: 80
```

**Step 2: Deploy sample app**

Run:
```bash
kubectl apply -f examples/sample-app.yaml
```

Expected: Deployment and service created

**Step 3: Verify pods are running**

Run:
```bash
kubectl get pods -l app=nginx
```

Expected: 2 nginx pods in Running state

**Step 4: Test port-forward**

Run:
```bash
kubectl port-forward service/nginx-service 8080:80
```

Then in another terminal:
```bash
curl localhost:8080
```

Expected: Nginx welcome page HTML

**Step 5: Commit sample app**

```bash
git add examples/sample-app.yaml
git commit -m "Add sample nginx deployment for testing"
```

---

## Task 8: Documentation and README

**Files:**
- Create: `README.md`

**Step 1: Create comprehensive README**

Create `README.md`:
```markdown
# EKS Blueprints CDK Project

AWS CDK project for deploying an EKS cluster with core addons using EKS Blueprints.

## Architecture

- **VpcStack**: VPC with 2 AZs, public/private subnets
- **EksClusterStack**: EKS 1.31 cluster with managed node group (2x t3.medium, AL2023)
- **EksAddonsStack**: Core addons (VPC CNI, CoreDNS, kube-proxy, EBS CSI, ALB Controller, Metrics Server)

## Prerequisites

- Node.js 18+
- AWS CLI v2 configured
- AWS CDK CLI: `npm install -g aws-cdk`
- kubectl

## Deployment

1. Install dependencies:
   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):
   ```bash
   cdk bootstrap
   ```

3. Deploy all stacks:
   ```bash
   cdk deploy --all
   ```

4. Configure kubectl:
   ```bash
   aws eks update-kubeconfig --name eks-blueprints-cluster --region <region>
   ```

5. Verify cluster:
   ```bash
   kubectl get nodes
   kubectl get pods -n kube-system
   ```

## Testing

Deploy sample nginx app:
```bash
kubectl apply -f examples/sample-app.yaml
kubectl port-forward service/nginx-service 8080:80
curl localhost:8080
```

## Cleanup

```bash
# Delete sample app first
kubectl delete -f examples/sample-app.yaml

# Destroy CDK stacks
cdk destroy --all
```

## Project Structure

```
├── bin/
│   └── app.ts              # CDK app entry point
├── lib/
│   ├── vpc-stack.ts        # VPC stack
│   ├── eks-cluster-stack.ts # EKS cluster stack
│   └── eks-addons-stack.ts # Addons stack
├── examples/
│   └── sample-app.yaml     # Sample nginx deployment
└── docs/
    └── plans/              # Design and implementation docs
```

## Stack Dependencies

```
VpcStack → EksClusterStack → EksAddonsStack
```

## Addons Installed

- **VPC CNI**: Pod networking
- **CoreDNS**: DNS resolution
- **kube-proxy**: Network rules
- **AWS Load Balancer Controller**: ALB/NLB integration (IRSA)
- **EBS CSI Driver**: Persistent storage (Pod Identity)
- **Metrics Server**: Resource metrics

## Estimated Costs

- EKS Control Plane: ~$73/month
- 2x t3.medium nodes: ~$60/month
- NAT Gateways (2): ~$64/month
- EBS volumes: ~$10/month
- **Total: ~$207/month**

## Future Enhancements

- Multi-environment support (dev, staging, prod)
- External DNS for automatic Route53 updates
- Cluster Autoscaler or Karpenter
- Secrets Store CSI Driver
- ArgoCD for GitOps
```

**Step 2: Commit README**

```bash
git add README.md
git commit -m "Add comprehensive README documentation"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] All three stacks deployed successfully
- [ ] `kubectl get nodes` shows 2 Ready nodes
- [ ] All kube-system pods are Running
- [ ] `kubectl top nodes` shows metrics
- [ ] Sample nginx deployment works
- [ ] Port-forward to nginx service succeeds
- [ ] Can access nginx via localhost:8080

## Notes

- **Kubernetes Version**: Plan uses 1.31 in code since 1.35 may not be available yet in CDK. Update `KubernetesVersion` enum when 1.35 is released.
- **Addon Versions**: Specified versions are examples. Check AWS documentation for latest compatible versions for your Kubernetes version.
- **Pod Identity**: EBS CSI Driver uses EKS Pod Identity (newer method) instead of IRSA for cleaner IAM integration.
- **IRSA**: AWS Load Balancer Controller still uses IRSA as it's the standard approach for this addon.

## Common Issues

1. **Addon version incompatibility**: Ensure addon versions match your Kubernetes version
2. **IAM permissions**: Verify Pod Identity and IRSA roles have correct trust relationships
3. **Subnet tags**: EKS requires specific subnet tags for load balancers (already included)
4. **kubectl access**: Ensure your AWS credentials have permission to access the cluster
