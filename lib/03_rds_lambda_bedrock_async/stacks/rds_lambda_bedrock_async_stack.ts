import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import { AURORA_SECRET_NAME, DEFAULT_DATABASE_NAME } from '../../app-constants';

export interface RdsLambdaBedrockAsyncStackProps extends cdk.StackProps {
  cluster: rds.IDatabaseCluster;
  vpc: ec2.IVpc;
  secretName: string;
  secretArn: string;
}

export class RdsLambdaBedrockAsyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsLambdaBedrockAsyncStackProps) {
    super(scope, id, props);
    this.createLambdaFunction('async', props)
  }


  private createLambdaFunction(type: 'sync' | 'async', props: RdsLambdaBedrockAsyncStackProps) {
    const fn = new nodejs.NodejsFunction(this, `FNTrigger_${type}`, {
      runtime: lambda.Runtime.NODEJS_22_X,
      functionName: `embeddings_function_${type}`,
      handler: 'handler',
      entry: path.join(__dirname, `../lambda/embedding-function-${type}.ts`),
      environment: {
        DB_CLUSTER_ARN: props.cluster.clusterArn,
        DB_SECRET_ARN: props.secretArn,
        DB_NAME: DEFAULT_DATABASE_NAME
      },
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: [
          '@aws-sdk/client-bedrock-runtime', // Will be included in bundle
          '@aws-sdk/client-secrets-manager', // Will be included in bundle
        ],
      },
    });
    // Grant Lambda permissions to invoke Bedrock
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`],
    })
    );

    // Add permissions for RDS Data API
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-data:ExecuteStatement'],
        resources: [props.cluster.clusterArn],
      })
    );

    // Grant Lambda permissions to access Secrets Manager
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.secretArn],
      })
    );

    // Grant Lambda permissions to access RDS Data API
    props.cluster.grantDataApiAccess(fn);
  }
}
