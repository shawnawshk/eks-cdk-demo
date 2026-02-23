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
