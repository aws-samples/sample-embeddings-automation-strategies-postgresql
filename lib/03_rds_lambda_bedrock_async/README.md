# Vector Embedding Generation Pipeline

This section implements an asynchronous pipeline that automatically generates vector embeddings for text data using Amazon Bedrock and stores them in Amazon RDS PostgreSQL.

## Architecture Overview

The pipeline consists of:
- Amazon Aurora PostgreSQL trigger function
- AWS Lambda function for embedding generation
- Amazon Bedrock Titan Embeddings model
- RDS PostgreSQL table for storing embeddings

## How it Works

1. When text data is inserted/updated in the source table, a PostgreSQL trigger is activated
2. The trigger asynchronously invokes the Lambda function with the text payload
3. Lambda function:
   - Retrieves database credentials from Secrets Manager
   - Calls Amazon Bedrock to generate vector embeddings
   - Writes the embeddings back to a dedicated PostgreSQL table

## Key Components

- `embedding-function.ts`: Lambda function that processes text and generates embeddings
- Database objects:
  - Trigger function for async Lambda invocation
  - Table schema for storing embeddings
  - Required indexes and constraints

## Configuration

The Lambda function requires:
- Access to Amazon Bedrock Titan Embeddings model
- Secrets Manager access for database credentials
- VPC configuration to connect to RDS
- IAM permissions for Bedrock and Secrets Manager

