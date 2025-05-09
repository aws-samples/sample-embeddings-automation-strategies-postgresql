-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS "03_rds_lambda_bedrock_async";
SET search_path TO "03_rds_lambda_bedrock_async", public;


-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_status VARCHAR(50) DEFAULT 'PENDING'
);

-- Create document_embeddings table
CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    embedding vector(1536), -- Titan embeddings are 1536 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id)
);

-- Create function to invoke Lambda asynchronously
CREATE OR REPLACE FUNCTION invoke_embedding_lambda_async()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    payload JSON;
BEGIN
    -- Prepare the payload
    payload := json_build_object(
        'documentId', NEW.id,
        'inputText', NEW.content
    );

    -- Invoke Lambda asynchronously using 'Event' invocation type
    PERFORM aws_lambda.invoke(
        aws_commons.create_lambda_function_arn('arn:aws:lambda:<aws_region>:<aws_account>:function:embeddings_function_async'),
        payload::json,
        'Event'  -- This makes it asynchronous
    );

    -- Update the processing status
    UPDATE documents 
    SET processing_status = 'PROCESSING' 
    WHERE id = NEW.id;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error and update status
    RAISE NOTICE 'Error invoking Lambda: %', SQLERRM;
    
    UPDATE documents 
    SET processing_status = 'ERROR' 
    WHERE id = NEW.id;
    
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_async_embedding
    BEFORE INSERT OR UPDATE OF content ON documents
    FOR EACH ROW
    WHEN (OLD.content IS DISTINCT FROM NEW.content)
    EXECUTE FUNCTION invoke_embedding_lambda_async();


-- Create function to update embeddings (to be called by Lambda)
CREATE OR REPLACE FUNCTION update_document_embedding(
    p_document_id UUID,
    p_embedding vector(1536)
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    SET search_path TO "03_rds_lambda_bedrock_async", public;
    -- Insert or update the embedding
    INSERT INTO document_embeddings (document_id, embedding)
    VALUES (p_document_id, p_embedding)
    ON CONFLICT (document_id) 
    DO UPDATE SET 
        embedding = p_embedding,
        created_at = CURRENT_TIMESTAMP;

    -- Update the document status
    UPDATE documents 
    SET processing_status = 'COMPLETED' 
    WHERE id = p_document_id;

EXCEPTION WHEN OTHERS THEN
    -- Update status to error if something goes wrong
    UPDATE documents 
    SET processing_status = 'ERROR' 
    WHERE id = p_document_id;
    
    RAISE;
END;
$$;

-- Example usage:
-- INSERT INTO documents (title, content) VALUES ('Sample Document', 'This is a sample document content.');
-- SELECT count(*) from document_embeddings;
