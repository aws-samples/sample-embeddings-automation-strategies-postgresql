-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS "02_rds_lambda_bedrock_sync";
SET search_path TO "02_rds_lambda_bedrock_sync", public;


-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create document_embeddings table
CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    embedding vector(1536), -- Titan embeddings are 1536 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id)
);

-- Create function to generate embeddings via Lambda
CREATE OR REPLACE FUNCTION generate_embeddings_from_lambda(text_content TEXT)
RETURNS vector(1536)
LANGUAGE plpgsql
AS $$
DECLARE
    lambda_response JSON;
    embedding_vector vector(1536);
BEGIN
    -- Invoke Lambda function synchronously (RequestResponse)
    SELECT payload FROM aws_lambda.invoke(
        aws_commons.create_lambda_function_arn('arn:aws:lambda:<aws_region>:<aws_account>:function:embeddings_function_sync'),
        json_build_object('inputText', text_content)::json,
        'RequestResponse'
    ) INTO lambda_response;

    SELECT  (lambda_response->>'body')::jsonb->'embedding'
    INTO embedding_vector;

    RETURN embedding_vector;
END;
$$;

-- Create trigger function
CREATE OR REPLACE FUNCTION process_document_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    embedding_vector vector(1536);
BEGIN
    -- Generate embeddings using Lambda
    embedding_vector := generate_embeddings_from_lambda(NEW.content);

    -- Insert the embedding into document_embeddings
    INSERT INTO document_embeddings (document_id, embedding)
    VALUES (NEW.id, embedding_vector)
    ON CONFLICT (document_id) 
    DO UPDATE SET 
        embedding = embedding_vector,
        created_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_document_embedding
    BEFORE INSERT OR UPDATE OF content ON documents
    FOR EACH ROW
    WHEN (OLD.content IS DISTINCT FROM NEW.content)
    EXECUTE FUNCTION process_document_embedding();


-- Example usage:
-- INSERT INTO documents (title, content) VALUES ('Sample Document', 'This is a sample document content.');
-- SELECT count(*) from document_embeddings;

