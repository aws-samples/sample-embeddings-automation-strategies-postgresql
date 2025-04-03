#!/bin/bash

# Check if required parameters are provided
if [ $# -ne 3 ]; then
    echo "Usage: $0 <secret-name> <database-endpoint> <region>"
    echo "Example: $0 my-db-secret my-cluster.cluster-123456789.region.rds.amazonaws.com us-east-1"
    exit 1
fi

SECRET_NAME=$1
DB_ENDPOINT=$2
AWS_REGION=$3

# Fetch credentials from Secrets Manager and parse JSON
echo "Fetching database credentials from Secrets Manager in region ${AWS_REGION}..."
SECRET_VALUE=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text)

if [ $? -ne 0 ]; then
    echo "Failed to fetch secret from Secrets Manager"
    exit 1
fi

# Extract username and password from JSON
DB_USERNAME=$(echo "$SECRET_VALUE" | jq -r '.username')
DB_PASSWORD=$(echo "$SECRET_VALUE" | jq -r '.password')

if [ -z "$DB_USERNAME" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Failed to parse database credentials from secret"
    exit 1
fi

# Download the SSL certificate if it doesn't exist
SSL_CERT="/tmp/global-bundle.pem"
if [ ! -f "$SSL_CERT" ]; then
    echo "Downloading RDS SSL certificate..."
    curl -s https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o "$SSL_CERT"
fi

# Set PGPASSWORD environment variable
export PGPASSWORD="$DB_PASSWORD"

# Connect to the database
echo "Connecting to database..."
psql "host=$DB_ENDPOINT \
    port=5432 \
    user=$DB_USERNAME \
    dbname=dev"

# Clear the password from environment
unset PGPASSWORD
