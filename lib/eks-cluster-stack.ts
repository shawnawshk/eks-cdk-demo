import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { KubectlV35Layer } from '@aws-cdk/lambda-layer-kubectl-v35';
import { Construct } from 'constructs';

export interface EksClusterStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EksClusterStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // NOTE: kubectlLayer not in original spec but required by CDK v2.215.0
    // Without it, TypeScript compilation fails with:
    // "Property 'kubectlLayer' is missing... but required in type 'ClusterProps'"
    this.cluster = new eks.Cluster(this, 'EksCluster', {
      vpc,
      version: eks.KubernetesVersion.of('1.35'),
      kubectlLayer: new KubectlV35Layer(this, 'kubectl'),
      authenticationMode: eks.AuthenticationMode.API,
      defaultCapacity: 0,
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

    // Grant additional IAM principals access to the cluster
    // You can configure this via CDK context or environment variable
    // Option 1: cdk deploy -c adminRoleArn=arn:aws:iam::ACCOUNT:role/ROLE_NAME
    // Option 2: export ADMIN_ROLE_ARN=arn:aws:iam::ACCOUNT:role/ROLE_NAME
    const adminRoleArn =
      this.node.tryGetContext('adminRoleArn') ||
      process.env.ADMIN_ROLE_ARN;

    if (adminRoleArn) {
      // Use EKS access entry API (modern approach) instead of ConfigMap
      this.cluster.grantAccess('ClusterAdminAccess', adminRoleArn, [
        eks.AccessPolicy.fromAccessPolicyName('AmazonEKSClusterAdminPolicy', {
          accessScopeType: eks.AccessScopeType.CLUSTER,
        }),
      ]);

      new cdk.CfnOutput(this, 'AdminRoleArn', {
        value: adminRoleArn,
        description: 'IAM Role granted cluster admin access',
      });
    }

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

    new cdk.CfnOutput(this, 'ConfigCommand', {
      value: `aws eks update-kubeconfig --name ${this.cluster.clusterName} --region ${cdk.Stack.of(this).region}`,
      description: 'Command to configure kubectl',
    });
  }
}
