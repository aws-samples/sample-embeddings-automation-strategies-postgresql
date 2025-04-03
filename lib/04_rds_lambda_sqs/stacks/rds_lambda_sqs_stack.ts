import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'path';
import { AURORA_SECRET_NAME, DEFAULT_DATABASE_NAME } from '../../app-constants';

export interface RdsLambdaBedrockAsyncStackProps extends cdk.StackProps {
  cluster: rds.IDatabaseCluster;
  vpc: ec2.IVpc;
  secretName: string;
  secretArn: string;
}

export class RdsLambdaSqsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsLambdaBedrockAsyncStackProps) {
    super(scope, id, props);

    // Create SQS Queue
    const queue = new sqs.Queue(this, 'EmbeddingQueue', {
      visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'DeadLetterQueue', {
          retentionPeriod: cdk.Duration.days(14),
          enforceSSL: true
        }),
      },
    });

    // Create Producer Lambda
    const producerFunction = new nodejs.NodejsFunction(this, 'ProducerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      functionName: 'embeddings_function_producer',
      entry: path.join(__dirname, '../lambda/producer.ts'),
      environment: {
        QUEUE_URL: queue.queueUrl,
      },
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions to producer lambda to send messages to SQS
    queue.grantSendMessages(producerFunction);


    // Create Consumer Lambda
    const consumerFunction = new nodejs.NodejsFunction(this, 'ConsumerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      functionName: 'embeddings_function_consumer',
      entry: path.join(__dirname, '../lambda/consumer.ts'),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_CLUSTER_ARN: props.cluster.clusterArn,
        DB_SECRET_ARN: props.secretArn,
        DB_NAME: DEFAULT_DATABASE_NAME
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
    });

    // Add SQS event source to consumer lambda with batching
    consumerFunction.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 10, // Process up to 10 messages per batch
      maxBatchingWindow: cdk.Duration.seconds(30), // Wait up to 30 seconds to gather messages
    }));

    // Grant Bedrock permissions to consumer lambda
    consumerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`],
      })
    );

    // Grant RDS Data API permissions to consumer lambda
    consumerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-data:ExecuteStatement'],
        resources: [props.cluster.clusterArn],
      })
    );

    // Grant Secrets Manager permissions to consumer lambda
    consumerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.secretArn],
      })
    );
  }
}
