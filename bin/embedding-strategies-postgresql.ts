#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EmbeddingStrategiesPostgresqlStack } from '../lib/embedding-strategies-postgresql-stack';
import { RdsLambdaBedrockSyncStack } from '../lib/02_rds_lambda_bedrock_sync/stacks/rds_lambda_bedrock_sync_stack';
import { AURORA_SECRET_NAME } from '../lib/app-constants';
import { RdsLambdaBedrockAsyncStack } from '../lib/03_rds_lambda_bedrock_async/stacks/rds_lambda_bedrock_async_stack';
import { RdsLambdaSqsStack } from '../lib/04_rds_lambda_sqs/stacks/rds_lambda_sqs_stack';

// import Aspects
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks())
const mainStack = new EmbeddingStrategiesPostgresqlStack(app, 'EmbeddingStrategiesMainStack', {
  env: { region: 'eu-central-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// 02
const stack02 = new RdsLambdaBedrockSyncStack(app, 'EmbeddingStrategies02Stack', {
  description: 'RdsLambdaBedrockSyncStack',
  vpc: mainStack.vpc,
  cluster: mainStack.cluster,
  secretName: AURORA_SECRET_NAME,
  env: { region: 'eu-central-1' },
})

// 03
const stack03 = new RdsLambdaBedrockAsyncStack(app, 'EmbeddingStrategies03Stack', {
  description: 'RdsLambdaBedrockAsyncStack',
  vpc: mainStack.vpc,
  cluster: mainStack.cluster,
  secretName: AURORA_SECRET_NAME,
  secretArn: mainStack.cluster.secret?.secretArn!,
  env: { region: 'eu-central-1' },
})

// 04
const stack04 = new RdsLambdaSqsStack(app, 'EmbeddingStrategies04Stack', {
  description: 'RdsLambdaSqsStack',
  vpc: mainStack.vpc,
  cluster: mainStack.cluster,
  secretName: AURORA_SECRET_NAME,
  secretArn: mainStack.cluster.secret?.secretArn!,
  env: { region: 'eu-central-1' },
})


// Add suppression for deletion protection as these resources have to be deleted when cleaning up
NagSuppressions.addStackSuppressions(mainStack, [
  {
    id: 'AwsSolutions-RDS10',
    reason: 'Demo database that will be deleted after testing - no backup needed'
  },
  {
    id: 'AwsSolutions-EC29',
    reason: 'Demo instances that need to be destroyed during cleanup - termination protection not needed'
  }
]);


// Add the suppression for the AWS Lambda managed policies as they are used
[mainStack,stack02,stack03,stack04].forEach((stack) => {
  NagSuppressions.addResourceSuppressions(stack,
    [{
        id: 'AwsSolutions-IAM4',
        reason: 'Lambda basic execution role is required for CloudWatch Logs access',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole']
      },
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Lambda VPC execution role is required for VPC access',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole']
      }
    ],
    true
  );
})





