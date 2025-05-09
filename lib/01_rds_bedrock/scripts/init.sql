-- Create schema and use it
CREATE SCHEMA IF NOT EXISTS "01_rds_bedrock";
SET search_path TO "01_rds_bedrock", public;

-- Create table for storing the source text
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for storing embeddings
CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    embedding vector(1536), -- Titan embeddings are 1536 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id)
);

-- Function to generate embeddings directly in the database using Bedrock
CREATE OR REPLACE FUNCTION generate_embedding(input_text TEXT)
RETURNS vector(1536) AS $$
DECLARE
    embedding_result vector(1536);
BEGIN
    -- Call Bedrock to generate embedding
    EXECUTE $embed$ SELECT aws_bedrock.invoke_model_get_embeddings(
        model_id      := 'amazon.titan-embed-text-v1',
        content_type  := 'application/json',
        json_key      := 'embedding',
        model_input   := json_build_object('inputText', $1)::text)$embed$
    INTO embedding_result
    USING input_text;

    RETURN embedding_result;
END;
$$ LANGUAGE plpgsql;

-- Function to process the embedding result and store it
CREATE OR REPLACE FUNCTION store_embedding()
RETURNS TRIGGER AS $$
DECLARE
    embedding_vector vector(1536);
BEGIN
    -- Generate embedding using Bedrock
    embedding_vector := generate_embedding(NEW.content);

    -- Insert or update the embedding in document_embeddings table
    INSERT INTO document_embeddings (document_id, embedding)
    VALUES (NEW.id, embedding_vector)
    ON CONFLICT (document_id) 
    DO UPDATE SET 
        embedding = embedding_vector,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for synchronous embedding generation
-- Note: Use either this OR the async Lambda trigger above, not both
CREATE TRIGGER trigger_store_embedding
    BEFORE INSERT OR UPDATE OF content ON documents
    FOR EACH ROW
    WHEN (OLD.content IS DISTINCT FROM NEW.content)
    EXECUTE FUNCTION store_embedding();


-- Example usage:
-- INSERT INTO documents (content) VALUES ('This is a test document');
-- SELECT * FROM document_embeddings WHERE document_id = 1;
