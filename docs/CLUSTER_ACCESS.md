# EKS Cluster Access Configuration

This document explains how to configure kubectl access to your EKS cluster.

## Overview

By default, only the IAM principal that creates the EKS cluster has administrative access. To grant additional IAM roles or users access, you have several options.

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
// Grant specific role cluster admin access
const yourRole = iam.Role.fromRoleArn(
  this,
  'YourRole',
  'arn:aws:iam::123456789012:role/YourRoleName',
  { mutable: false }
);

this.cluster.awsAuth.addRoleMapping(yourRole, {
  groups: ['system:masters'],
  username: 'your-username',
});
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

To grant multiple roles access, deploy multiple times with different context values, or hardcode multiple role mappings:

```typescript
const roles = [
  { arn: 'arn:aws:iam::123456789012:role/DevRole', username: 'dev-team' },
  { arn: 'arn:aws:iam::123456789012:role/OpsRole', username: 'ops-team' },
];

roles.forEach((roleConfig, index) => {
  const role = iam.Role.fromRoleArn(
    this,
    `Role${index}`,
    roleConfig.arn,
    { mutable: false }
  );

  this.cluster.awsAuth.addRoleMapping(role, {
    groups: ['system:masters'],
    username: roleConfig.username,
  });
});
```

## Granting Limited Access

To grant read-only access instead of admin:

```typescript
this.cluster.awsAuth.addRoleMapping(role, {
  groups: ['system:viewers'], // or other RBAC group
  username: 'readonly-user',
});
```

Common Kubernetes RBAC groups:
- `system:masters` - Full cluster admin
- `system:viewers` - Read-only access to most resources
- `system:basic-user` - Basic authenticated user

Or create custom RBAC roles and role bindings.

## IAM Users vs Roles

### For IAM Roles (Recommended)

```bash
cdk deploy -c adminRoleArn=arn:aws:iam::123456789012:role/YourRole
```

Use `addRoleMapping()` in code.

### For IAM Users

```typescript
this.cluster.awsAuth.addUserMapping(
  iam.User.fromUserArn(
    this,
    'User',
    'arn:aws:iam::123456789012:user/username'
  ),
  {
    groups: ['system:masters'],
    username: 'username',
  }
);
```

**Note:** IAM roles are preferred over users for security best practices.

## Troubleshooting

### "You must be logged in to the server"

1. Verify you're using the correct AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Ensure the role/user is mapped to the cluster:
   ```bash
   kubectl describe configmap -n kube-system aws-auth
   ```

3. Update kubeconfig:
   ```bash
   aws eks update-kubeconfig --name eks-blueprints-cluster --region us-east-1
   ```

4. If needed, grant access by redeploying:
   ```bash
   cdk deploy EksClusterStack -c adminRoleArn=YOUR_ROLE_ARN
   ```

### "Forbidden" or "Access Denied"

Your role is authenticated but lacks permissions. Check:

1. The role is in the correct RBAC group
2. RBAC roles/bindings are configured properly
3. Try with `system:masters` group for testing

### Verify aws-auth ConfigMap

```bash
kubectl get configmap -n kube-system aws-auth -o yaml
```

This shows all IAM principals with cluster access.

## Security Best Practices

1. ✅ **Use IAM roles**, not users
2. ✅ **Avoid hardcoding** credentials in code
3. ✅ **Use principle of least privilege** (don't grant everyone system:masters)
4. ✅ **Audit access regularly** via aws-auth ConfigMap
5. ✅ **Use environment-specific roles** for different deployments
6. ✅ **Enable CloudTrail** for audit logging
7. ⚠️ **Never commit** IAM credentials or role ARNs to public repositories

## References

- [Amazon EKS Access Entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)
- [Managing users or IAM roles for your cluster](https://docs.aws.amazon.com/eks/latest/userguide/add-user-role.html)
- [Kubernetes RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
