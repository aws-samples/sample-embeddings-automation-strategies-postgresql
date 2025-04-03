CREATE SCHEMA IF NOT EXISTS "06_rds_polling";
SET search_path TO "06_rds_polling", public;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
-- Function to generate embeddings using Bedrock
CREATE OR REPLACE FUNCTION generate_embedding(doc_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    doc_content TEXT;
    embedding_vector vector(1536);
BEGIN
    -- Get the document content
    SELECT content INTO STRICT doc_content
    FROM documents
    WHERE id = doc_id;

    IF doc_content IS NULL OR length(doc_content) = 0 THEN
        RAISE EXCEPTION 'Document % has no content', doc_id;
    END IF;

    -- Call Bedrock to generate embedding
    EXECUTE $embed$ SELECT aws_bedrock.invoke_model_get_embeddings(
        model_id      := 'amazon.titan-embed-text-v1',
        content_type  := 'application/json',
        json_key      := 'embedding',
        model_input   := json_build_object('inputText', $1)::text)$embed$
    INTO embedding_vector
    USING doc_content;

    IF embedding_vector IS NULL THEN
        RAISE EXCEPTION 'Bedrock returned null embedding for document %', doc_id;
    END IF;

    -- Store the embedding
    INSERT INTO document_embeddings (document_id, embedding)
    VALUES (doc_id, embedding_vector)
    ON CONFLICT (document_id)
    DO UPDATE SET 
        embedding = embedding_vector,
        created_at = CURRENT_TIMESTAMP;

    -- Update document status
    UPDATE documents 
    SET processing_status = 'COMPLETED'
    WHERE id = doc_id;

EXCEPTION 
    WHEN NO_DATA_FOUND THEN
        UPDATE documents 
        SET processing_status = 'ERROR'
        WHERE id = doc_id;
        RAISE EXCEPTION 'Document % not found', doc_id;
        
    WHEN OTHERS THEN
        -- Update status to error if something goes wrong
        UPDATE documents 
        SET processing_status = 'ERROR'
        WHERE id = doc_id;
        
        -- Reraise the exception
        RAISE;
END;
$$;


-- Function to process a batch of pending documents

CREATE OR REPLACE FUNCTION process_embedding_queue(batch_size INT DEFAULT 5)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    doc_record RECORD;
    processed_count INT := 0;
    error_count INT := 0;
BEGIN
    SET search_path TO "06_rds_polling", public;
    FOR doc_record IN
        SELECT id 
        FROM documents
        WHERE processing_status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT batch_size
        FOR NO KEY UPDATE SKIP LOCKED
    LOOP
        BEGIN
            -- Update row setting status as 'PROCESSING'
            UPDATE documents
            SET processing_status = 'PROCESSING'
            WHERE id = doc_record.id;
        
            -- Generate embedding for each document
            PERFORM generate_embedding(doc_record.id);
            processed_count := processed_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error and continue with next document
            RAISE NOTICE 'Error processing document %: %', doc_record.id, SQLERRM;
            error_count := error_count + 1;
            
            -- Update document status to ERROR
            UPDATE documents 
            SET processing_status = 'ERROR'
            WHERE id = doc_record.id;
            
            -- Continue with next document
            CONTINUE;
        END;
    END LOOP;

    -- Log processing summary
    IF processed_count > 0 OR error_count > 0 THEN
        RAISE NOTICE 'Embedding processing complete. Successfully processed: %, Errors: %', 
                    processed_count, error_count;
    END IF;
END;
$$;

-- Create an index to optimize the polling query
CREATE INDEX IF NOT EXISTS idx_documents_status_created
ON documents(processing_status, created_at)
WHERE processing_status = 'PENDING';


-- Schedule the job to run every 2 minutes
SELECT cron.schedule('process_embeddings', '*/2 * * * * *', 'SELECT "06_rds_polling".process_embedding_queue()');


-- Example usage:
-- Just insert documents and they will be processed automatically:
-- INSERT INTO documents (title, content) VALUES ('Sample Document', 'This is a sample document content.');

-- To check the scheduled job:
-- SELECT * FROM cron.job;

-- To check job runs:
-- SELECT * FROM cron.job_run_details;

-- To stop the job:
-- SELECT cron.unschedule('process_embeddings');