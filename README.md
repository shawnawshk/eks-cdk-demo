# EKS CDK Demo

[![AWS](https://img.shields.io/badge/AWS-EKS-FF9900?logo=amazon-aws)](https://aws.amazon.com/eks/)
[![CDK](https://img.shields.io/badge/AWS-CDK-FF9900?logo=amazon-aws)](https://aws.amazon.com/cdk/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.35-326CE5?logo=kubernetes)](https://kubernetes.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)

Production-ready AWS CDK project for deploying Amazon EKS clusters with core addons using a modular three-stack architecture.

## 🏗️ Architecture

This project uses a modular approach with three interdependent CloudFormation stacks:

```
┌─────────────┐
│  VpcStack   │
│  (Network)  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ EksClusterStack │
│  (K8s 1.35)     │
└────────┬────────┘
         │
         ▼
┌────────────────┐
│ EksAddonsStack │
│   (6 Addons)   │
└────────────────┘
```

### Stack Components

#### 1. VpcStack
- VPC with CIDR 10.0.0.0/16
- 2 Availability Zones for high availability
- Public subnets (/24) with Internet Gateway
- Private subnets (/19) with NAT Gateways
- Proper EKS subnet tagging for load balancer integration

#### 2. EksClusterStack
- **Kubernetes Version**: 1.35 (latest)
- **AMI**: Amazon Linux 2023 (AL2023_X86_64_STANDARD)
- **Node Group**: 2x t3.medium instances
- **Storage**: 100GB EBS per node
- **Networking**: Private subnets with public + private endpoint access
- **Access**: IAM role mapping for kubectl access

#### 3. EksAddonsStack
Six core addons (AWS managed addons automatically use the default/recommended version for K8s 1.35):
- **VPC CNI**: Pod networking (AWS managed addon)
- **CoreDNS**: DNS resolution (AWS managed addon)
- **kube-proxy**: Network proxy (AWS managed addon)
- **EBS CSI Driver**: Persistent storage with IRSA (AWS managed addon)
- **AWS Load Balancer Controller**: ALB/NLB integration with IRSA (Helm chart)
- **Metrics Server**: Resource metrics (AWS managed addon)

> **Note**: Addon versions are automatically managed by AWS and will use the default recommended version compatible with your Kubernetes version. This ensures you always get tested, compatible versions without manual version tracking.

## 📋 Prerequisites

- **Node.js**: 18+ ([Download](https://nodejs.org/))
- **AWS CLI**: v2 configured with credentials ([Setup Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- **AWS CDK CLI**:
  ```bash
  npm install -g aws-cdk
  ```
- **kubectl**: ([Installation Guide](https://kubernetes.io/docs/tasks/tools/))
- **Helm** (optional): For managing additional charts ([Installation Guide](https://helm.sh/docs/intro/install/))

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/shawnawshk/eks-cdk-demo.git
cd eks-cdk-demo
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure AWS Credentials

Ensure your AWS credentials are configured:

```bash
aws sts get-caller-identity
```

### 4. Bootstrap CDK (First Time Only)

```bash
cdk bootstrap aws://<ACCOUNT-ID>/<REGION>
```

### 5. Configure Cluster Access (Optional)

Grant your IAM role/user kubectl access by setting the admin role ARN:

**Option 1: Using CDK Context**
```bash
cdk deploy EksClusterStack -c adminRoleArn=arn:aws:iam::123456789012:role/YourRoleName
```

**Option 2: Using Environment Variable**
```bash
export ADMIN_ROLE_ARN=arn:aws:iam::123456789012:role/YourRoleName
cdk deploy EksClusterStack
```

**Option 3: Find Your Current Role**
```bash
aws sts get-caller-identity --query Arn --output text
# Use the role ARN from the output
```

**Note**: The cluster creator role automatically gets admin access. Additional roles are optional.

### 6. Deploy Infrastructure

Deploy all three stacks:

```bash
cdk deploy --all
```

Or deploy individually with dependencies:

```bash
cdk deploy VpcStack
cdk deploy EksClusterStack
cdk deploy EksAddonsStack
```

**Note**: The deployment takes approximately 15-20 minutes (mostly EKS cluster creation).

### 7. Configure kubectl

After deployment, the output will show the configuration command:

```bash
aws eks update-kubeconfig --name eks-blueprints-cluster --region us-east-1
```

### 8. Verify Cluster

```bash
# Check nodes
kubectl get nodes

# Check Kubernetes version
kubectl version --short

# Check all addons
kubectl get pods -n kube-system

# Check metrics
kubectl top nodes
```

## 📁 Project Structure

```
eks-cdk-demo/
├── bin/
│   └── app.ts                    # CDK app entry point
├── lib/
│   ├── vpc-stack.ts              # VPC with public/private subnets
│   ├── eks-cluster-stack.ts      # EKS cluster with managed node group
│   └── eks-addons-stack.ts       # Core Kubernetes addons
├── examples/
│   └── sample-app.yaml           # Sample nginx deployment
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
└── cdk.json                      # CDK configuration
```

## 🧪 Testing the Cluster

### Deploy Sample Application

```bash
kubectl apply -f examples/sample-app.yaml
```

### Verify Deployment

```bash
kubectl get deployments
kubectl get pods
kubectl get services
```

### Test with Port Forward

```bash
kubectl port-forward service/nginx-service 8080:80
```

In another terminal:

```bash
curl http://localhost:8080
```

Expected output: nginx welcome page HTML.

### Clean Up Sample App

```bash
kubectl delete -f examples/sample-app.yaml
```

## 🔧 Customization

### Update Kubernetes Version

Edit `lib/eks-cluster-stack.ts`:

```typescript
version: eks.KubernetesVersion.of('1.35'),
kubectlLayer: new KubectlV35Layer(this, 'kubectl'),
```

Then update addon versions in `lib/eks-addons-stack.ts` for compatibility.

### Change Instance Type

Edit `lib/eks-cluster-stack.ts`:

```typescript
instanceTypes: [new ec2.InstanceType('t3.large')],
```

### Adjust Node Count

Edit `lib/eks-cluster-stack.ts`:

```typescript
minSize: 2,
maxSize: 5,
desiredSize: 3,
```

### Add IAM Access

**Method 1: Using CDK Context (Recommended)**

No code changes needed! Just pass the role ARN during deployment:

```bash
cdk deploy EksClusterStack -c adminRoleArn=arn:aws:iam::123456789012:role/YourRole
```

**Method 2: Using Environment Variable**

```bash
export ADMIN_ROLE_ARN=arn:aws:iam::123456789012:role/YourRole
cdk deploy EksClusterStack
```

**Method 3: Hardcode in Code (Not Recommended)**

If you absolutely need to hardcode, edit `lib/eks-cluster-stack.ts`:

```typescript
const yourRole = iam.Role.fromRoleArn(
  this,
  'YourRole',
  'arn:aws:iam::ACCOUNT-ID:role/YourRoleName',
  { mutable: false }
);

this.cluster.awsAuth.addRoleMapping(yourRole, {
  groups: ['system:masters'],
  username: 'your-user',
});
```

**Find Your Current Role:**
```bash
aws sts get-caller-identity --query Arn --output text
```

## 💰 Cost Estimation

Monthly costs (us-east-1 region):

| Component | Cost |
|-----------|------|
| EKS Control Plane | ~$73/month |
| 2x t3.medium nodes (730 hrs) | ~$60/month |
| 2x NAT Gateways | ~$64/month |
| EBS volumes (200GB gp3) | ~$16/month |
| Data transfer | Variable |
| **Estimated Total** | **~$213/month** |

> **Note**: Costs vary by region and usage. Use [AWS Pricing Calculator](https://calculator.aws/) for accurate estimates.

## 🧹 Cleanup

To avoid ongoing charges, destroy all resources:

```bash
# Delete any workloads first
kubectl delete all --all -n default

# Destroy CDK stacks (in reverse order)
cdk destroy EksAddonsStack
cdk destroy EksClusterStack
cdk destroy VpcStack
```

Or destroy all at once:

```bash
cdk destroy --all
```

## 🔐 Security Best Practices

- ✅ All nodes run in private subnets
- ✅ IRSA (IAM Roles for Service Accounts) for addon authentication
- ✅ Latest Amazon Linux 2023 AMI with security patches
- ✅ Cluster endpoint has both public and private access
- ✅ Network policies enabled via VPC CNI
- ✅ Default security group configured properly

### Additional Recommendations

1. **Enable encryption**: Add KMS encryption for EBS volumes and secrets
2. **Network policies**: Implement Kubernetes NetworkPolicies
3. **Pod Security Standards**: Enforce PSS policies
4. **Secrets management**: Use AWS Secrets Manager or HashiCorp Vault
5. **Audit logging**: Enable CloudWatch Container Insights

## 🐛 Troubleshooting

### kubectl authentication error

If you see: `error: You must be logged in to the server`

1. Verify AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Update kubeconfig:
   ```bash
   aws eks update-kubeconfig --name eks-blueprints-cluster --region us-east-1
   ```

3. Grant your IAM role cluster access:
   ```bash
   # Get your current role ARN
   aws sts get-caller-identity --query Arn --output text

   # Redeploy with your role
   cdk deploy EksClusterStack -c adminRoleArn=YOUR_ROLE_ARN
   ```

**Note**: The cluster creator role automatically has access. If you're using a different role/user, you must explicitly grant access.

### Pods in Pending state

Check node resources:
```bash
kubectl describe nodes
kubectl top nodes
```

### Addon issues

Check addon status:
```bash
kubectl get pods -n kube-system
kubectl logs -n kube-system <pod-name>
```

## 🛣️ Roadmap

- [ ] Multi-environment support (dev, staging, prod)
- [ ] Cluster Autoscaler or Karpenter integration
- [ ] External DNS for automatic Route53 updates
- [ ] Secrets Store CSI Driver with AWS Secrets Manager
- [ ] AWS CloudWatch Container Insights
- [ ] ArgoCD for GitOps deployments
- [ ] Velero for backup and disaster recovery
- [ ] Istio or Linkerd service mesh

## 📚 Documentation

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [EKS Blueprints](https://aws-quickstart.github.io/cdk-eks-blueprints/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- AWS CDK Team for the excellent IaC framework
- EKS Blueprints for CDK patterns and best practices
- Kubernetes community for comprehensive documentation

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

**Built with ❤️ using AWS CDK and TypeScript**
