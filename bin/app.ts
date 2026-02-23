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
