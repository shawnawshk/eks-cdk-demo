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
