# Embedding Automation Strategies for Aurora PostgreSQL


## Overview

This repository contains five different strategies for automating vector embeddings creation in PostgreSQL using Amazon Aurora.

1. Direct RDS-Bedrock Integration (found in `lib/01_rds_bedrock/`).

    Uses direct database integration with Amazon Bedrock for embedding generation

2. RDS with Synchronous Lambda-Bedrock Integration (found in `lib/02_rds_lambda_bedrock_sync`/)

    Utilizes AWS Lambda functions to synchronously generate embeddings through Bedrock

3. RDS with Asynchronous Lambda-Bedrock Integration (found in `lib/03_rds_lambda_bedrock_async/`)

    Implements asynchronous embedding generation using Lambda functions and Bedrock

4. RDS with Lambda and SQS Integration (found in `lib/04_rds_lambda_sqs/`)

    Uses a combination of Lambda functions and SQS queues for managed embedding generation

5. RDS with Polling Mechanism (found in `lib/05_rds_polling/`)

    Implements a polling-based approach for embedding generation

These strategies showcase various approaches to generate and store embeddings using Amazon Bedrock and pgvector. The project includes infrastructure as code using AWS CDK to deploy a fully managed Aurora PostgreSQL cluster, along with a bastion host for database access. 

Running `make deploy` provisions the core infrastructure stack, which includes:
* the Aurora PostgreSQL database cluster
* networking components
* a bastion host for secure access. 

Additional nested stacks are deployed to support serverless integrations with AWS Lambda functions and Amazon SQS queues, enabling automated embedding generation workflows. Each strategy is implemented as a separate stack. 
The infrastructure includes proper IAM roles, VPC and communications between services.


## Table of Contents 📑
- [Overview](#overview) 🌟
- [Prerequisites](#prerequisites) ⚙️
  - [Node.js](#nodejs-v22x-or-later) 💚
  - [npm](#npm-v10x-or-later) 📦
  - [AWS CDK](#aws-cdk) ☁️
  - [TypeScript](#typescript) 📘
- [Project Setup](#project-setup) 🛠️
  - [Clone the repository](#clone-the-repository) 📋
  - [List available commands](#list-available-commands) 💻
  - [Install project dependencies](#install-project-dependencies) 📥
  - [Bootstrap CDK](#bootstrap-cdk-in-your-aws-account-if-not-already-done) 🔧
  - [Deploy the stack](#deploy-the-stack) 🚀
- [Database Connection](#database-connection) 🗄️
- [Security](#security) 🔒
- [Contributing](#contributing) 👥
- [Clean Up](#clean-up) 🧹



## Prerequisites

Before you begin, ensure you have the following installed on your machine:

### Node.js (v22.x or later)
   - For version management, we recommend using nvm (Node Version Manager)
   ```bash
   # Install nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   
   # Install Node.js
   nvm install 22
   nvm use 22
   ```

### npm (v10.x or later)

    Comes with Node.js installation

### AWS CDK

    npm install -g aws-cdk

### TypeScript

    npm install -g typescript


## Project Setup

### Clone the repository

    git clone <repository-url>

    cd embedding-strategies-postgresql

### list available commands

    make help

### Install project dependencies

    make install

### Bootstrap CDK in your AWS account (if not already done)

    make bootstrap

### Deploy the stack

    make deploy

### Database Connection

Once you deployed the stack with the `make deploy` command, you can connect to the PostgreSQL Aurora database from the Bastion Host with the following instructions:

1. SSH into the EC2 bastion host (or use AWS System manager)

2. Run the connect.sh script found in:
    
    * `/home/ec2-user/connect.sh`

    * `./connect.sh`

    example:

    ```
    cd /home/ec2-user/
    
    chmod +x connect.sh

    ./connect.sh
    ```

2. (alternative) Retrieve the database password from AWS Secrets Manager:

    ```bash
    export PGPASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id Aurora-credentials \
    --query SecretString \
    --output text \
    --region eu-central-1 | jq '.password')
    ```

3. (alternative) Connect using psql:

    ```bash
    psql -h <your-cluster-endpoint> \
    -U postgresadmin \
    -d postgres \
    -p 5432 \
    --set=sslmode=verify-full \
    --set=sslcert=/usr/local/share/postgresql/global-bundle.pem
    ```

### Run the scenarios provided

Under the `lib` directory, each solution folder contains SQL scripts that create the necessary database resources as described in the blog post, including:
* Tables (`documents` and `document_embeddings`) for storing text content and their vector representations
* Triggers for automated embedding generation
* Stored procedures for vector operations and embedding management

You can run the script that create the resources for all 5 scenarios along with installing the required extensions:
`./home/ec2-user/init-db.sh`

Otherwise, you can run your preferred scenario by executing one of these SQL scripts to automatically generate embedding vectors using the selected strategy:
* [`lib/01_rds_bedrock/scripts/init.sql`](lib/01_rds_bedrock/scripts/init.sql)
* [`lib/02_rds_lambda_bedrock_sync/scripts/init.sql`](lib/02_rds_lambda_bedrock_sync/scripts/init.sql)
* [`lib/03_rds_lambda_bedrock_async/scripts/init.sql`](lib/03_rds_lambda_bedrock_async/scripts/init.sql)
* [`lib/04_rds_lambda_sqs/scripts/init.sql`](lib/04_rds_lambda_sqs/scripts/init.sql)
* [`lib/05_rds_polling/scripts/init.sql`](lib/05_rds_polling/scripts/init.sql)


## Security

All database credentials are managed through AWS Secrets Manager

SSL/TLS is enforced for database connections

Infrastructure changes are version controlled and deployed through CDK

## Contributing

Create a new branch for your feature

Make your changes

Submit a pull request

## Clean Up

To avoid incurring charges, clean up your resources:

    make destroy

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
