#!/bin/bash

# Set up error handling
set -e
exec 1> >(tee -a /var/log/init-db.log) 2>&1

# Function for error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    echo "Error occurred in script at line: ${line_number}, exit code: ${exit_code}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Error at line ${line_number}, exit code: ${exit_code}" >> /var/log/init-db_errors.log
}

# Function to execute SQL file
execute_sql_file() {
    local sql_file=$1
    local output_file="/var/log/sql_execution_$(basename "$sql_file").log"
    local error_file="/var/log/sql_execution_$(basename "$sql_file")_error.log"
    
    echo "Executing SQL file: $sql_file"
    echo "----------------------------------------"
    if /home/ec2-user/connect.sh < "$sql_file" > "$output_file" 2> "$error_file"; then
        echo "Successfully executed: $sql_file"
        echo "Output logged to $output_file"
    else
        echo "Error executing SQL file: $sql_file"
        echo "Error details:"
        cat "$error_file"
        return 1
    fi

    # Check if error log has content
    if [ -s "$error_file" ]; then
        echo "Warnings or errors were generated during SQL execution of $sql_file:"
        cat "$error_file"
    fi
    echo "----------------------------------------"
}

trap 'handle_error ${LINENO}' ERR

echo "Starting init-db script execution at $(date '+%Y-%m-%d %H:%M:%S')"

# Check if initial SQL file exists
if [ ! -f /home/ec2-user/sql/init-public.sql ]; then
    echo "Error: init-public.sql not found in /home/ec2-user/sql/"
    exit 1
fi

# Check if solutions directory exists
if [ ! -d /home/ec2-user/sql/solutions ]; then
    echo "Error: solutions directory not found in /home/ec2-user/sql/"
    exit 1
fi

# Source .bashrc to load environment variables
echo "Loading environment variables..."
if [ -f /home/ec2-user/.bashrc ]; then
    source /home/ec2-user/.bashrc
else
    echo "Error: .bashrc not found in /home/ec2-user/"
    exit 1
fi

# Check if environment variables are set
if [ -z "$AURORA_CLUSTER_ENDPOINT" ]; then
    echo "Error: AURORA_CLUSTER_ENDPOINT environment variable is not set"
    exit 1
fi

if [ -z "$AWS_REGION" ]; then
    echo "Error: AWS_REGION environment variable is not set"
    exit 1
fi

# Execute init-public.sql first
echo "Executing init-public.sql..."
execute_sql_file "/home/ec2-user/sql/init-public.sql" || {
    echo "Failed to execute init-public.sql"
    exit 1
}

# Execute all SQL files in the solutions directory
echo "Executing SQL files from solutions directory..."
# Sort files to ensure consistent execution order
find /home/ec2-user/sql/solutions -name "*.sql" -type f | sort | while read -r sql_file; do
    execute_sql_file "$sql_file" || {
        echo "Failed to execute $sql_file"
        exit 1
    }
done

echo "script completed successfully at $(date '+%Y-%m-%d %H:%M:%S')"
