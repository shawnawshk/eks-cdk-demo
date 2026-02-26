# EKS Cluster Access Configuration

This document explains how to configure kubectl access to your EKS cluster.

## Overview

This cluster uses **EKS API authentication mode** (the modern approach) instead of the legacy ConfigMap-based authentication. By default, the cluster creator IAM principal has administrative access. To grant additional IAM roles or users access, you can use EKS access entry APIs with predefined AWS managed access policies.

### Authentication Modes

Amazon EKS supports three authentication modes:

- **CONFIG_MAP** (legacy): Uses `aws-auth` ConfigMap exclusively
- **API_AND_CONFIG_MAP** (hybrid): Uses both access entry APIs and ConfigMap
- **API** (modern, recommended): Uses only EKS access entry APIs ✅ **This cluster**

This cluster is configured with `API` mode, which provides:
- Simplified access management via AWS APIs
- No need to manage ConfigMaps
- Better integration with AWS IAM
- Predefined access policies for common use cases

## Quick Start

### Find Your Current IAM Role/User

```bash
aws sts get-caller-identity
```

Output example:
```json
{
    "UserId": "AROAXXXXXXXXX:session-name",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/YourRoleName/session-name"
}
```

For IAM roles, use the role ARN format: `arn:aws:iam::123456789012:role/YourRoleName`

## Configuration Methods

### Method 1: CDK Context (Recommended)

Pass the role ARN when deploying:

```bash
cdk deploy EksClusterStack -c adminRoleArn=arn:aws:iam::123456789012:role/YourRole
```

**Pros:**
- No code changes needed
- Can specify different roles per deployment
- Clear and explicit
- Safe for public repositories

**Cons:**
- Must specify on each deployment

### Method 2: Environment Variable

Set an environment variable:

```bash
export ADMIN_ROLE_ARN=arn:aws:iam::123456789012:role/YourRole
cdk deploy EksClusterStack
```

Or add to your shell profile (~/.bashrc, ~/.zshrc):

```bash
echo 'export ADMIN_ROLE_ARN=arn:aws:iam::123456789012:role/YourRole' >> ~/.bashrc
source ~/.bashrc
```

**Pros:**
- Set once, use everywhere
- No need to specify on each deployment

**Cons:**
- Less explicit
- Can be forgotten when switching accounts

### Method 3: Hardcode in Code (Not Recommended)

Edit `lib/eks-cluster-stack.ts` and add after the node group creation:

```typescript
// Grant specific role cluster admin access using EKS access entry API
this.cluster.grantAccess('YourRoleAccess', 'arn:aws:iam::123456789012:role/YourRoleName', [
  eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
    accessScopeType: eks.AccessScopeType.CLUSTER,
  }),
]);
```

**Pros:**
- Permanent configuration
- No need to remember flags

**Cons:**
- ⚠️ **Security risk** if code is public
- Less flexible
- Must rebuild/redeploy for changes
- Account-specific (not portable)

## Multiple Roles

To grant multiple roles access, deploy multiple times with different context values, or hardcode multiple role access entries:

```typescript
const roles = [
  { arn: 'arn:aws:iam::123456789012:role/DevRole', id: 'DevTeamAccess' },
  { arn: 'arn:aws:iam::123456789012:role/OpsRole', id: 'OpsTeamAccess' },
];

roles.forEach((roleConfig) => {
  this.cluster.grantAccess(roleConfig.id, roleConfig.arn, [
    eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
      accessScopeType: eks.AccessScopeType.CLUSTER,
    }),
  ]);
});
```

## Granting Limited Access

To grant limited access instead of full admin, use AWS managed access policies:

```typescript
// Read-only access to cluster resources
this.cluster.grantAccess('ViewerAccess', 'arn:aws:iam::123456789012:role/ViewerRole', [
  eks.AccessPolicy.fromAccessPolicyName('AmazonEKSViewPolicy', {
    accessScopeType: eks.AccessScopeType.CLUSTER,
  }),
]);

// Admin access to specific namespaces only
this.cluster.grantAccess('NamespaceAdminAccess', 'arn:aws:iam::123456789012:role/DevRole', [
  eks.AccessPolicy.fromAccessPolicyName('AmazonEKSAdminPolicy', {
    accessScopeType: eks.AccessScopeType.NAMESPACE,
    namespaces: ['dev', 'staging'],
  }),
]);
```

**AWS Managed Access Policies:**

- **AmazonEKSClusterAdminPolicy** - Full admin access to all cluster resources
- **AmazonEKSAdminPolicy** - Admin access (can be scoped to namespaces)
- **AmazonEKSEditPolicy** - Edit most resources (can be scoped to namespaces)
- **AmazonEKSViewPolicy** - Read-only access to cluster resources

**Access Scopes:**

- `CLUSTER` - Policy applies to entire cluster
- `NAMESPACE` - Policy applies only to specified namespaces

For more details, see [EKS Access Policy Permissions](https://docs.aws.amazon.com/eks/latest/userguide/access-policies.html#access-policy-permissions).

## IAM Users vs Roles

### For IAM Roles (Recommended)

```bash
cdk deploy -c adminRoleArn=arn:aws:iam::123456789012:role/YourRole
```

In code:
```typescript
this.cluster.grantAccess('RoleAccess', 'arn:aws:iam::123456789012:role/YourRole', [
  eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
    accessScopeType: eks.AccessScopeType.CLUSTER,
  }),
]);
```

### For IAM Users

```typescript
this.cluster.grantAccess('UserAccess', 'arn:aws:iam::123456789012:user/username', [
  eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
    accessScopeType: eks.AccessScopeType.CLUSTER,
  }),
]);
```

**Note:** IAM roles are preferred over users for security best practices.

## Troubleshooting

### "You must be logged in to the server"

1. Verify you're using the correct AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Check access entries for your cluster:
   ```bash
   aws eks list-access-entries --cluster-name eks-blueprints-cluster --region us-east-1
   ```

3. Verify your principal has an access entry:
   ```bash
   aws eks describe-access-entry \
     --cluster-name eks-blueprints-cluster \
     --principal-arn YOUR_ROLE_ARN \
     --region us-east-1
   ```

4. Update kubeconfig:
   ```bash
   aws eks update-kubeconfig --name eks-blueprints-cluster --region us-east-1
   ```

5. If needed, grant access by redeploying:
   ```bash
   cdk deploy EksClusterStack -c adminRoleArn=YOUR_ROLE_ARN
   ```

### "Forbidden" or "Access Denied"

Your role is authenticated but lacks sufficient permissions. Check:

1. List associated access policies:
   ```bash
   aws eks list-associated-access-policies \
     --cluster-name eks-blueprints-cluster \
     --principal-arn YOUR_ROLE_ARN \
     --region us-east-1
   ```

2. Verify the access policy scope (CLUSTER vs NAMESPACE)

3. For testing, grant full admin access with `AmazonEKSClusterAdminPolicy`

### Verify Access Entries (API Mode)

List all access entries:
```bash
aws eks list-access-entries --cluster-name eks-blueprints-cluster --region us-east-1
```

Get details for a specific entry:
```bash
aws eks describe-access-entry \
  --cluster-name eks-blueprints-cluster \
  --principal-arn arn:aws:iam::ACCOUNT:role/ROLE_NAME \
  --region us-east-1
```

**Note:** This cluster uses API authentication mode. The `aws-auth` ConfigMap is not used.

## Security Best Practices

1. ✅ **Use IAM roles**, not users
2. ✅ **Avoid hardcoding** credentials in code
3. ✅ **Use principle of least privilege** - Use specific access policies instead of full admin
   - Use `AmazonEKSViewPolicy` for read-only access
   - Use `AmazonEKSEditPolicy` for standard users
   - Reserve `AmazonEKSClusterAdminPolicy` for actual administrators
4. ✅ **Scope access to namespaces** when possible instead of cluster-wide
5. ✅ **Audit access regularly** via `aws eks list-access-entries`
6. ✅ **Use environment-specific roles** for different deployments
7. ✅ **Enable CloudTrail** for audit logging of API calls
8. ⚠️ **Never commit** IAM credentials or role ARNs to public repositories
9. ✅ **Use API authentication mode** (modern) over legacy ConfigMap mode

## References

- [Amazon EKS Access Entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)
- [EKS Access Policy Permissions](https://docs.aws.amazon.com/eks/latest/userguide/access-policies.html#access-policy-permissions)
- [Grant IAM users and roles access to Kubernetes APIs](https://docs.aws.amazon.com/eks/latest/userguide/grant-k8s-access.html)
- [A deep dive into simplified Amazon EKS access management controls](https://aws.amazon.com/blogs/containers/a-deep-dive-into-simplified-amazon-eks-access-management-controls/)
- [Kubernetes RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
