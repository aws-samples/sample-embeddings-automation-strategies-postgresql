#!/bin/bash

# Set up error handling
set -e
exec 1> >(tee -a /var/log/userdata.log) 2>&1

# Function for error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    echo "Error occurred in script at line: ${line_number}, exit code: ${exit_code}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Error at line ${line_number}, exit code: ${exit_code}" >> /var/log/userdata_errors.log
}

trap 'handle_error ${LINENO}' ERR

echo "Starting userdata script execution at $(date '+%Y-%m-%d %H:%M:%S')"

# Update system packages
echo "Updating system packages..."
yum update -y || {
    echo "Failed to update system packages"
    exit 1
}

# Install PostgreSQL 15
echo "Installing PostgreSQL 15..."
yum install -y postgresql15 || {
    echo "Failed to install PostgreSQL 15"
    exit 1
}

# Install additional tools
echo "Installing additional tools..."
yum install -y jq aws-cli || {
    echo "Failed to install additional tools"
    exit 1
}

# Make connect.sh executable
echo "Setting execute permissions for connect.sh..."
if [ ! -f /home/ec2-user/connect.sh ]; then
    echo "Error: connect.sh not found in /home/ec2-user/"
    exit 1
fi
chmod +x /home/ec2-user/connect.sh

# Make connect.sh executable
echo "Setting execute permissions for connect.sh..."
if [ ! -f /home/ec2-user/init-db.sh ]; then
    echo "Error: init-db.sh not found in /home/ec2-user/"
    exit 1
fi
chmod +x /home/ec2-user/init-db.sh

echo "Userdata script completed successfully at $(date '+%Y-%m-%d %H:%M:%S')"
