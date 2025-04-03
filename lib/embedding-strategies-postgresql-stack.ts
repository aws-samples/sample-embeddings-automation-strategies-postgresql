import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Duration } from 'aws-cdk-lib';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';
import { AURORA_SECRET_NAME, DEFAULT_DATABASE_NAME } from './app-constants';
import { NagSuppressions } from 'cdk-nag'
import { AddRoleToCluster } from './custom-resources/add-role-to-cluster-custom-resource';

export class EmbeddingStrategiesPostgresqlStack extends cdk.Stack {
  cluster: rds.DatabaseCluster;
  vpc: cdk.aws_ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC with no nat gateway and three private subnets
    this.vpc = new cdk.aws_ec2.Vpc(this, 'VPC', {
      natGateways: 1,
      flowLogs: {
        'VPCFlowLogs': {
          trafficType: cdk.aws_ec2.FlowLogTrafficType.ALL
        }
      },
      vpcName: 'postgresql-vpc',
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'private',
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: 'public',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Create Security Group for the Database
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora PostgreSQL database',
      allowAllOutbound: true,
    });

    // Create Security Group for the Bastion Host
    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Bastion Host',
      allowAllOutbound: true,
    });

    // Allow inbound PostgreSQL connection from Bastion to DB
    //allow inbound PostgreSQL connection from bastionSecurityGroup to dbSecurity Group
    dbSecurityGroup.addIngressRule(
      bastionSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL connection'
    );

    // Create the Aurora Serverless v2 cluster
    this.cluster = new rds.DatabaseCluster(this, 'AuroraPostgreSQLCluster-1', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_7
      }),
      storageEncrypted: true,
      securityGroups: [dbSecurityGroup],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 1,
      iamAuthentication: true,
      defaultDatabaseName: DEFAULT_DATABASE_NAME,
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      vpc: this.vpc,
      credentials: rds.Credentials.fromGeneratedSecret('postgresadmin', {
        secretName: AURORA_SECRET_NAME
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      parameters: {
        'shared_preload_libraries': 'pg_cron',
        'cron.database_name': DEFAULT_DATABASE_NAME, // database where pg_cron metadata tables will be created
        'max_worker_processes': '20', // ensure enough workers for pg_cron
        'max_parallel_workers': '20',
      }
    });

    // add secret rotation
    this.cluster.addRotationSingleUser({
      automaticallyAfter: Duration.days(30),
      excludeCharacters: '!@#$%^&*()_+=-[]{}|;:,.<>?/`~',
    });

    // Output the writer cluster endpoint
    new cdk.CfnOutput(this, 'WriterClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
    });


    // Create VPC Endpoint for Lambda
    const lambdaEndpoint = new ec2.InterfaceVpcEndpoint(this, 'LambdaVpcEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
      // Create the endpoint in private subnets
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      // Enable private DNS
      privateDnsEnabled: true,
    });
    const endpointSG = lambdaEndpoint.connections.securityGroups[0];
    if (endpointSG) {
      endpointSG.addIngressRule(
        this.cluster.connections.securityGroups[0],
        ec2.Port.tcp(443),
        'Allow RDS to access Lambda endpoint'
      );
    }
    this.createBastionHost(this.vpc, bastionSecurityGroup)

    // ### Create roles to allow Aurora invoke Bedrock and Lambda
    // create a role that allow to invoke bedrock models
    const rdsBedrockRole = new iam.Role(this, 'BedrockRole', {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });
    rdsBedrockRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`],
    }))

    const rdsLambdaRole = new iam.Role(this, 'RDSLambdaInvokeRole', {
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
      description: 'IAM role to allow RDS to invoke Lambda function',
    });

    // Add policy to allow invoking the specific Lambda function
    rdsLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: 'lambda',
            resource: 'function',
            resourceName: '*',
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME
          })
        ],
      })
    );

    
    new AddRoleToCluster(this, 'AddRoleForBedrockToCluster', {
      cluster: this.cluster,
      role: rdsBedrockRole,
      featureName: 'Bedrock',
    });
    new AddRoleToCluster(this, 'AddRoleForLambdaToCluster', {
      cluster: this.cluster,
      role: rdsLambdaRole,
      featureName: 'Lambda',
    });

    // Add the suppression for the Lambda runtime used in AWSCustomResource
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Lambda runtime is managed by AWS Custom Resource',
        },
      ],
      true
    );

    // Add the suppression for lambda functions invoke from rds
    NagSuppressions.addResourceSuppressions(
      rdsLambdaRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'RDS is allowed to invoke any Lambda function in the current account as part of the embedding creation workflow',
        }
      ],
      true
    );
  }

  private createBastionHost(vpc: ec2.Vpc, bastionSecurityGroup: ec2.SecurityGroup) {
    // First, create the user data script
    const userdata = new Asset(this, 'UserDataAsset', {
      path: path.join(__dirname, './userdata.sh')
    });
    const init_script = new Asset(this, 'ConnectScript', {
      path: path.join(__dirname, './connect.sh')
    });

    const bastionHostRole=new iam.Role(this, 'BastionHostRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ],
      description: 'Role for Bastion Host',
      inlinePolicies: {
        'SecretsManagerReadPolicy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['secretsmanager:GetSecretValue'],
              resources: [
                this.cluster.secret?.secretArn!
                ],
            })
          ]
        }),
        'S3UserdataAccess': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject'],
              resources: [ cdk.Stack.of(this).formatArn({
                service: 's3',
                region: '', // S3 ARNs don't include region
                account: '', // S3 ARNs don't include account
                resource: userdata.s3BucketName,
                resourceName: userdata.s3ObjectKey
              })]
              
              //resources: [userdata.s3ObjectUrl],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject'],
              resources: [ cdk.Stack.of(this).formatArn({
                service: 's3',
                region: '', // S3 ARNs don't include region
                account: '', // S3 ARNs don't include account
                resource: init_script.s3BucketName,
                resourceName: init_script.s3ObjectKey
              })]
            }),
          ]
        })
      }
    })

    // Modify the EC2 instance to include the user data
    const bastion = new ec2.Instance(this, 'BastionHost-1', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: bastionSecurityGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
      }),
      detailedMonitoring: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            encrypted: true,
          }),
        },
      ],
      // Grant the instance role read access to Secrets Manager
      role: bastionHostRole
    });

    // add ec2 userdata from a local userdata.sh script
    const userdataLocalPath = bastion.userData.addS3DownloadCommand({
      bucket: userdata.bucket,
      bucketKey: userdata.s3ObjectKey,
    });
    const init_scriptLocalPath = bastion.userData.addS3DownloadCommand({
      bucket: init_script.bucket,
      bucketKey: init_script.s3ObjectKey,
      localFile: '/home/ec2-user/connect.sh',
    })
    bastion.userData.addExecuteFileCommand({
      filePath: userdataLocalPath,
      arguments: '--verbose -y',
    });
    bastion.userData.addCommands('echo "Done"');
    //userdata.grantRead(bastion.role);

    // new cfnoutput for localpath
    new cdk.CfnOutput(this, 'localPath', { value: userdataLocalPath });
    new cdk.CfnOutput(this, 'asset', { value: userdata.s3ObjectKey });

    // Add the suppression for the SSM managed policy as it is required for EC2
    NagSuppressions.addResourceSuppressions(bastionHostRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'SSM Managed Instance Core policy is required for Session Manager access and follows AWS best practices'
        }
      ],
      true
    );


  }
}


