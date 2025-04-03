SET search_path TO public;
-- First, create the extension for AWS Lambda integration
CREATE EXTENSION IF NOT EXISTS aws_lambda CASCADE;
-- Create the pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;
-- Create the aws_ml extension if not exists
CREATE EXTENSION IF NOT EXISTS aws_ml CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Create the pg cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;