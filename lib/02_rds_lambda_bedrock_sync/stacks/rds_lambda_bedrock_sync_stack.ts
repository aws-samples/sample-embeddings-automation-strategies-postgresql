import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';

export interface RdsLambdaBedrockSyncStackProps extends cdk.StackProps {
  cluster: rds.IDatabaseCluster;
  vpc: ec2.IVpc;
  secretName: string;
}

export class RdsLambdaBedrockSyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsLambdaBedrockSyncStackProps) {
    super(scope, id, props);
    this.createLambdaFunction('sync', props)
  }

  private createLambdaFunction(type: 'sync' | 'async', props: RdsLambdaBedrockSyncStackProps) {
    const fn = new nodejs.NodejsFunction(this, `FNTrigger_${type}`, {
      runtime: lambda.Runtime.NODEJS_22_X,
      functionName: `embeddings_function_${type}`,
      handler: 'handler',
      entry: path.join(__dirname, `../lambda/embedding-function-${type}.ts`),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: [
          '@aws-sdk/client-bedrock-runtime', // Will be included in bundle
        ],
      },
    });
    // Grant Lambda permissions to invoke Bedrock
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
        ],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`],
      })
    );
  }
}
