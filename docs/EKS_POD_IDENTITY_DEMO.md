# EKS Pod Identity Demo

This guide demonstrates how to use **EKS Pod Identity** to grant AWS IAM permissions to Kubernetes workloads without using IRSA (IAM Roles for Service Accounts).

## Overview

EKS Pod Identity is AWS's modern approach for providing IAM credentials to pods running in EKS clusters. It simplifies the process by:

- ✅ **No OIDC Configuration** - No need to manage OIDC providers or trust policies
- ✅ **Centralized Management** - Configure via EKS API instead of IAM trust policies
- ✅ **Multi-Cluster Support** - Use the same IAM role across multiple clusters
- ✅ **Session Tags** - Enable fine-grained access control
- ✅ **Simplified Setup** - Fewer steps compared to IRSA

## Prerequisites

- EKS cluster deployed with the **EKS Pod Identity Agent** addon (included in this project)
- `kubectl` configured to access your cluster
- AWS CLI configured with appropriate permissions
- Permissions to create IAM roles and EKS pod identity associations

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     EKS Cluster                         │
│                                                           │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Pod Identity    │         │   Application    │     │
│  │  Agent (DaemonSet│◄────────│      Pod         │     │
│  │  on each node)   │         │  (uses IAM role) │     │
│  └────────┬─────────┘         └──────────────────┘     │
│           │                                              │
└───────────┼──────────────────────────────────────────────┘
            │
            ▼ (AssumeRoleForPodIdentity)
┌───────────────────────────┐
│   EKS Auth API            │
│  (Returns temporary       │
│   credentials)            │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│   IAM Role                │
│  eks-pod-identity-        │
│  s3-reader                │
└───────────────────────────┘
```

## Demo Application

The demo consists of:

1. **Namespace**: `pod-identity-demo`
2. **Service Account**: `s3-reader-sa`
3. **Deployment**: `aws-cli-demo` - A pod running AWS CLI that can assume the IAM role

## Step-by-Step Guide

### Step 1: Create IAM Role for Pod Identity

Create an IAM role with the EKS Pod Identity trust policy:

```bash
# Set variables
CLUSTER_NAME="eks-blueprints-cluster"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

# Create trust policy for EKS Pod Identity
cat > pod-identity-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
EOF

# Create the IAM role
aws iam create-role \
  --role-name eks-pod-identity-s3-reader \
  --assume-role-policy-document file://pod-identity-trust-policy.json \
  --description "EKS Pod Identity demo role for S3 read access"

# Attach S3 read-only policy
aws iam attach-role-policy \
  --role-name eks-pod-identity-s3-reader \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Verify role creation
aws iam get-role --role-name eks-pod-identity-s3-reader

# Clean up temp file
rm pod-identity-trust-policy.json
```

**Key Differences from IRSA:**
- Trust principal is `pods.eks.amazonaws.com` (not OIDC provider)
- No cluster-specific OIDC issuer in trust policy
- Supports `sts:TagSession` for session tags

### Step 2: Create Pod Identity Association

Link the IAM role to the Kubernetes service account using the EKS API:

```bash
aws eks create-pod-identity-association \
  --cluster-name $CLUSTER_NAME \
  --namespace pod-identity-demo \
  --service-account s3-reader-sa \
  --role-arn arn:aws:iam::${ACCOUNT_ID}:role/eks-pod-identity-s3-reader \
  --region $REGION
```

**Verify the association:**

```bash
# List all pod identity associations
aws eks list-pod-identity-associations \
  --cluster-name $CLUSTER_NAME \
  --region $REGION

# Get details of the association
ASSOCIATION_ID=$(aws eks list-pod-identity-associations \
  --cluster-name $CLUSTER_NAME \
  --region $REGION \
  --query "associations[?serviceAccount=='s3-reader-sa'].associationId" \
  --output text)

aws eks describe-pod-identity-association \
  --cluster-name $CLUSTER_NAME \
  --association-id $ASSOCIATION_ID \
  --region $REGION
```

### Step 3: Deploy the Demo Application

Deploy the Kubernetes resources:

```bash
kubectl apply -f examples/manifests.yaml
```

**Check the deployment:**

```bash
# Verify namespace creation
kubectl get namespace pod-identity-demo

# Check service account
kubectl get serviceaccount s3-reader-sa -n pod-identity-demo

# Check pod status
kubectl get pods -n pod-identity-demo

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=aws-cli-demo -n pod-identity-demo --timeout=60s

# Check pod details
kubectl describe pod -n pod-identity-demo -l app=aws-cli-demo
```

### Step 4: Test AWS Access

Exec into the pod and verify AWS credentials:

```bash
# Get the pod name
POD_NAME=$(kubectl get pod -n pod-identity-demo -l app=aws-cli-demo -o jsonpath='{.items[0].metadata.name}')

# Exec into the pod
kubectl exec -it -n pod-identity-demo $POD_NAME -- bash
```

**Inside the pod, run these tests:**

```bash
# 1. Verify AWS credentials are provided
aws sts get-caller-identity
```

**Expected output:**
```json
{
    "UserId": "AROAXXXXXXXXX:eks-pod-identity-demo-aws-cli-demo-xxxxx",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/eks-pod-identity-s3-reader/eks-pod-identity-demo-aws-cli-demo-xxxxx"
}
```

✅ **Note**: The ARN shows the pod assumed the `eks-pod-identity-s3-reader` role!

```bash
# 2. Test S3 read access (should succeed)
aws s3 ls

# Expected: List of your S3 buckets or empty if none exist
```

```bash
# 3. Test unauthorized action (should fail)
aws ec2 describe-instances
```

**Expected output:**
```
An error occurred (UnauthorizedOperation) when calling the DescribeInstances operation:
You are not authorized to perform this operation.
```

✅ **This confirms the role has S3 read access but NOT EC2 permissions!**

```bash
# 4. Check environment variables (Pod Identity credentials)
env | grep AWS

# You should see:
# AWS_CONTAINER_CREDENTIALS_FULL_URI=<eks-auth-api-endpoint>
# AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE=<token-file-path>
```

**Exit the pod:**

```bash
exit
```

### Step 5: View Pod Identity Agent Logs (Optional)

Check the Pod Identity Agent logs to see credential provisioning:

```bash
# Find the agent pod on the same node as your demo pod
NODE_NAME=$(kubectl get pod -n pod-identity-demo -l app=aws-cli-demo -o jsonpath='{.items[0].spec.nodeName}')

AGENT_POD=$(kubectl get pods -n kube-system -l app.kubernetes.io/name=eks-pod-identity-agent \
  --field-selector spec.nodeName=$NODE_NAME -o jsonpath='{.items[0].metadata.name}')

# View logs
kubectl logs -n kube-system $AGENT_POD --tail=50

# Look for log entries showing credential requests
```

### Step 6: Clean Up

Remove all demo resources:

```bash
# Delete Kubernetes resources
kubectl delete -f examples/manifests.yaml

# Wait for namespace deletion
kubectl wait --for=delete namespace/pod-identity-demo --timeout=60s

# Delete the pod identity association
ASSOCIATION_ID=$(aws eks list-pod-identity-associations \
  --cluster-name $CLUSTER_NAME \
  --region $REGION \
  --query "associations[?serviceAccount=='s3-reader-sa'].associationId" \
  --output text)

aws eks delete-pod-identity-association \
  --cluster-name $CLUSTER_NAME \
  --association-id $ASSOCIATION_ID \
  --region $REGION

# Detach policy and delete IAM role
aws iam detach-role-policy \
  --role-name eks-pod-identity-s3-reader \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

aws iam delete-role --role-name eks-pod-identity-s3-reader

# Verify cleanup
aws eks list-pod-identity-associations --cluster-name $CLUSTER_NAME --region $REGION
aws iam get-role --role-name eks-pod-identity-s3-reader 2>&1 || echo "Role deleted successfully"
```

## How EKS Pod Identity Works

### 1. Pod Startup
When a pod starts with a service account that has a pod identity association:
- Kubernetes creates the pod with environment variables pointing to the Pod Identity Agent
- `AWS_CONTAINER_CREDENTIALS_FULL_URI` points to the agent endpoint
- `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE` contains the token for authentication

### 2. Credential Request
When the AWS SDK needs credentials:
- It reads the token from `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`
- Sends a request to the Pod Identity Agent (via `AWS_CONTAINER_CREDENTIALS_FULL_URI`)
- The agent validates the pod's identity using the token

### 3. Credential Retrieval
The Pod Identity Agent:
- Calls the EKS Auth API (`AssumeRoleForPodIdentity`)
- Passes pod metadata (namespace, service account, pod name)
- Receives temporary credentials from the associated IAM role

### 4. Credential Delivery
- Agent returns temporary credentials to the pod
- AWS SDK caches and refreshes credentials automatically
- Pod can now make AWS API calls with the IAM role's permissions

## EKS Pod Identity vs IRSA Comparison

| Feature | EKS Pod Identity | IRSA |
|---------|------------------|------|
| **Setup Complexity** | Simple - EKS API only | Complex - OIDC + IAM trust policy |
| **Trust Policy** | Generic (`pods.eks.amazonaws.com`) | Cluster-specific OIDC issuer |
| **Multi-Cluster** | ✅ Same role across clusters | ❌ Update trust policy per cluster |
| **Configuration** | Centralized via EKS API | Distributed (IAM + K8s annotations) |
| **Session Tags** | ✅ Supported | ❌ Not supported |
| **Requires Addon** | ✅ EKS Pod Identity Agent | ❌ Built-in (OIDC provider) |
| **AWS Recommendation** | ✅ Recommended for new workloads | Still fully supported |

## Troubleshooting

### Pod can't get credentials

**Check 1: Verify Pod Identity Agent is running**
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=eks-pod-identity-agent
```

**Check 2: Verify pod identity association exists**
```bash
aws eks list-pod-identity-associations --cluster-name $CLUSTER_NAME --region $REGION
```

**Check 3: Check pod environment variables**
```bash
kubectl exec -n pod-identity-demo $POD_NAME -- env | grep AWS
```

**Check 4: View agent logs**
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=eks-pod-identity-agent --tail=100
```

### "Access Denied" errors

**Check IAM role permissions:**
```bash
aws iam get-role --role-name eks-pod-identity-s3-reader
aws iam list-attached-role-policies --role-name eks-pod-identity-s3-reader
```

**Verify trust policy is correct:**
```bash
aws iam get-role --role-name eks-pod-identity-s3-reader --query 'Role.AssumeRolePolicyDocument'
```

Should show:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
```

### Service account or namespace mismatch

Ensure the pod identity association matches exactly:
```bash
aws eks describe-pod-identity-association \
  --cluster-name $CLUSTER_NAME \
  --association-id $ASSOCIATION_ID \
  --region $REGION
```

Check that:
- `namespace` matches the pod's namespace (`pod-identity-demo`)
- `serviceAccount` matches the pod's service account (`s3-reader-sa`)

## Advanced Use Cases

### Multiple IAM Roles in Same Namespace

You can have multiple service accounts with different IAM roles:

```bash
# Create second role
aws iam create-role --role-name eks-pod-identity-dynamodb-writer ...

# Create second association
aws eks create-pod-identity-association \
  --cluster-name $CLUSTER_NAME \
  --namespace pod-identity-demo \
  --service-account dynamodb-writer-sa \
  --role-arn arn:aws:iam::${ACCOUNT_ID}:role/eks-pod-identity-dynamodb-writer
```

### Cross-Account Access

EKS Pod Identity supports cross-account access. In the trust policy of the role in **Account B**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": ["sts:AssumeRole", "sts:TagSession"],
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "ACCOUNT_A_ID"
        },
        "StringLike": {
          "aws:SourceArn": "arn:aws:eks:REGION:ACCOUNT_A_ID:cluster/CLUSTER_NAME"
        }
      }
    }
  ]
}
```

### Using Session Tags

Pod Identity automatically sets session tags. Use them in IAM policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/eks-cluster-name": "eks-blueprints-cluster",
          "aws:PrincipalTag/kubernetes-namespace": "pod-identity-demo"
        }
      }
    }
  ]
}
```

## Best Practices

1. ✅ **Principle of Least Privilege** - Grant only the minimum required permissions
2. ✅ **One Role Per Service Account** - Keep role assignments clear and auditable
3. ✅ **Use AWS Managed Policies** - When possible, use AWS managed policies for common patterns
4. ✅ **Tag Your Roles** - Add tags to IAM roles for easier tracking and billing
5. ✅ **Monitor with CloudTrail** - Log all `AssumeRoleForPodIdentity` calls for auditing
6. ✅ **Test in Non-Prod First** - Always test pod identity associations in dev/staging
7. ✅ **Clean Up Unused Associations** - Regularly audit and remove unused associations

## References

- [EKS Pod Identity Documentation](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)
- [Set up the Amazon EKS Pod Identity Agent](https://docs.aws.amazon.com/eks/latest/userguide/pod-id-agent-setup.html)
- [EKS Pod Identity vs IRSA](https://aws.amazon.com/blogs/containers/amazon-eks-pod-identity-a-new-way-for-applications-on-eks-to-obtain-iam-credentials/)
- [AWS SDK Container Credentials Provider](https://docs.aws.amazon.com/sdkref/latest/guide/feature-container-credentials.html)

---

🎉 **Congratulations!** You've successfully configured and tested EKS Pod Identity!
