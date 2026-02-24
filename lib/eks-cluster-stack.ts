import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
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
      version: eks.KubernetesVersion.V1_31, // Will update to 1.35 when available
      kubectlLayer: new KubectlV31Layer(this, 'kubectl'),
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

    // Grant Admin role access to the cluster
    // This allows the current IAM user/role to access the cluster with kubectl
    const adminRole = iam.Role.fromRoleArn(
      this,
      'AdminRole',
      'arn:aws:iam::985955614379:role/Admin',
      { mutable: false }
    );

    this.cluster.awsAuth.addRoleMapping(adminRole, {
      groups: ['system:masters'],
      username: 'admin-role',
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
