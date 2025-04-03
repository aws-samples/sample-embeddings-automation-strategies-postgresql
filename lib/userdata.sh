#!/bin/bash

yum update -y

#Install PostgreSQL 15 from Amazon Linux extras
yum install -y postgresql15

# Install useful tools
yum install -y jq aws-cli
