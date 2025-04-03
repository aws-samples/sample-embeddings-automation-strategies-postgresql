# Vector Similarity Search with PostgreSQL and pgvector

This guide demonstrates different approaches to performing similarity searches using pgvector after storing embeddings in PostgreSQL.

## 1. Basic Similarity Search using L2 Distance (Euclidean)

```sql
-- Create an index for better performance (if not already created)
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

-- Basic similarity search function
CREATE OR REPLACE FUNCTION similarity_search(
    query_text TEXT,
    num_results INTEGER DEFAULT 5
) RETURNS TABLE (
    document_id INTEGER,
    content TEXT,
    similarity FLOAT
) AS $$
DECLARE
    query_embedding vector(1536);
BEGIN
    -- Generate embedding for the query text
    query_embedding := generate_embedding(query_text);
    
    RETURN QUERY
    SELECT 
        d.id,
        d.content,
        1 - (de.embedding <-> query_embedding) as similarity
    FROM document_embeddings de
    JOIN documents d ON d.id = de.document_id
    ORDER BY de.embedding <-> query_embedding
    LIMIT num_results;
END;
$$ LANGUAGE plpgsql;

-- Usage example:
SELECT * FROM similarity_search('What is machine learning?', 3);
```

## 2. Cosine Similarity Search

```sql
-- Create an index for cosine similarity
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Cosine similarity search function
CREATE OR REPLACE FUNCTION cosine_similarity_search(
    query_text TEXT,
    num_results INTEGER DEFAULT 5,
    similarity_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
    document_id INTEGER,
    content TEXT,
    similarity FLOAT
) AS $$
DECLARE
    query_embedding vector(1536);
BEGIN
    query_embedding := generate_embedding(query_text);
    
    RETURN QUERY
    SELECT 
        d.id,
        d.content,
        1 - (de.embedding <=> query_embedding) as similarity
    FROM document_embeddings de
    JOIN documents d ON d.id = de.document_id
    WHERE 1 - (de.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT num_results;
END;
$$ LANGUAGE plpgsql;

-- Usage example:
SELECT * FROM cosine_similarity_search('What is machine learning?', 5, 0.7);
```

## 3. Advanced Search with Metadata Filtering

```sql
-- Assuming we have additional metadata columns in the documents table
CREATE OR REPLACE FUNCTION filtered_similarity_search(
    query_text TEXT,
    category TEXT DEFAULT NULL,
    date_after TIMESTAMP DEFAULT NULL,
    num_results INTEGER DEFAULT 5
) RETURNS TABLE (
    document_id INTEGER,
    content TEXT,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
) AS $$
DECLARE
    query_embedding vector(1536);
BEGIN
    query_embedding := generate_embedding(query_text);
    
    RETURN QUERY
    SELECT 
        d.id,
        d.content,
        d.category,
        d.created_at,
        1 - (de.embedding <-> query_embedding) as similarity
    FROM document_embeddings de
    JOIN documents d ON d.id = de.document_id
    WHERE 
        (category IS NULL OR d.category = category) AND
        (date_after IS NULL OR d.created_at >= date_after)
    ORDER BY de.embedding <-> query_embedding
    LIMIT num_results;
END;
$$ LANGUAGE plpgsql;

-- Usage example:
SELECT * FROM filtered_similarity_search(
    'What is machine learning?',
    category := 'AI',
    date_after := '2023-01-01'::timestamp
);
```

## 4. Hybrid Search (Combining Full-Text and Vector Search)


```sql
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text TEXT,
    num_results INTEGER DEFAULT 5,
    vector_weight FLOAT DEFAULT 0.7
) RETURNS TABLE (
    document_id INTEGER,
    content TEXT,
    combined_score FLOAT
) AS $$
DECLARE
    query_embedding vector(1536);
BEGIN
    -- Create a ts_query from the search text
    query_embedding := generate_embedding(query_text);
    
    RETURN QUERY
    WITH vector_scores AS (
        SELECT 
            de.document_id,
            1 - (de.embedding <-> query_embedding) as vector_similarity
        FROM document_embeddings de
    ),
    text_scores AS (
        SELECT 
            d.id,
            ts_rank_cd(to_tsvector('english', d.content), 
                      plainto_tsquery('english', query_text)) as text_similarity
        FROM documents d
    )
    SELECT 
        d.id,
        d.content,
        (vs.vector_similarity * vector_weight + 
         ts.text_similarity * (1 - vector_weight)) as combined_score
    FROM documents d
    JOIN vector_scores vs ON vs.document_id = d.id
    JOIN text_scores ts ON ts.id = d.id
    ORDER BY combined_score DESC
    LIMIT num_results;
END;
$$ LANGUAGE plpgsql;

-- Usage example:
SELECT * FROM hybrid_search('machine learning algorithms', 5, 0.7);
```

## Performance Tips
### 1. Create appropriate indexes:

```sql
-- For L2 distance searches
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_l2_ops);

-- For cosine similarity searches
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops);

-- For hybrid searches
CREATE INDEX ON documents USING gin(to_tsvector('english', content));

```

### 2. Optimize index parameters:

```sql
-- Adjust the number of lists based on your data size
CREATE INDEX ON document_embeddings 
USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

```

### 3. Use materialized views for complex queries:

```sql
CREATE MATERIALIZED VIEW cached_embeddings AS
SELECT 
    d.id,
    d.content,
    de.embedding
FROM documents d
JOIN document_embeddings de ON de.document_id = d.id;

-- Refresh when needed
REFRESH MATERIALIZED VIEW cached_embeddings;

```

## Best Practices

### 1. Monitor query performance

### 2. Adjust index parameters based on your data size

### 3. Consider using connection pooling for better performance

### 4. Implement caching strategies for frequently accessed results

### 5. Use EXPLAIN ANALYZE to optimize your queries

The choice between L2 distance, cosine similarity, or hybrid search depends on your specific use case and the nature of your data. The hybrid search approach can be particularly useful when you want to combine the benefits of traditional full-text search with vector similarity search.