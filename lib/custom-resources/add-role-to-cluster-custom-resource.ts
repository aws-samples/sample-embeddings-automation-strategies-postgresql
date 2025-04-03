import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { NagSuppressions } from 'cdk-nag'
/**
 * A custom resource that associates an IAM role with an Amazon RDS DB cluster.
 * This construct creates the necessary infrastructure to add or remove an IAM role
 * to/from an RDS cluster during CloudFormation stack deployment and deletion.
 * 
 * This is particularly useful when you need to grant specific AWS service permissions
 * to your RDS cluster, such as allowing it to invoke Lambda functions or access
 * other AWS services.
 * 
 * The custom resource handles the following scenarios:
 * - During stack creation: Adds the specified role to the DB cluster
 * - During stack update: Updates the role association if properties change
 * - During stack deletion: Removes the role from the DB cluster
 * 
 * @example
 * ```typescript
 * const cluster = new rds.DatabaseCluster(this, 'Database', {
 *   // ... cluster configuration
 * });
 * 
 * const rdsRole = new iam.Role(this, 'RDSRole', {
 *   // ... role configuration
 * });
 * 
 * new AddRoleToCluster(this, 'AddRoleToCluster', {
 *   cluster: cluster,
 *   role: rdsRole,
 *   featureName: 'Lambda'
 * });
 * ```
 */


interface AddRoleToClusterProps {
  cluster: rds.DatabaseCluster;
  role: iam.IRole;
  featureName: string;
}

export class AddRoleToCluster extends Construct {
  constructor(scope: Construct, id: string, props: AddRoleToClusterProps) {
    super(scope, id);

    const customResource = new cr.AwsCustomResource(this, 'AddRoleToClusterCR', {
      onCreate: {
        service: 'RDS',
        action: 'addRoleToDBCluster',
        parameters: {
          DBClusterIdentifier: props.cluster.clusterIdentifier,
          RoleArn: props.role.roleArn,
          FeatureName: props.featureName,
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `${props.role.roleArn}-${props.featureName}`
        ),
      },
      onDelete: {
        service: 'RDS',
        action: 'removeRoleFromDBCluster',
        parameters: {
          DBClusterIdentifier: props.cluster.clusterIdentifier,
          RoleArn: props.role.roleArn,
          FeatureName: props.featureName,
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `${props.role.roleArn}-${props.featureName}`
        ),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({
          actions: ['rds:AddRoleToDBCluster', 'rds:RemoveRoleFromDBCluster'],
          resources: [props.cluster.clusterArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [props.role.roleArn],
        }),
      ]),
    })

  }
}
