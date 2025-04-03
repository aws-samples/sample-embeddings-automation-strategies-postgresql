import { Context, Handler } from 'aws-lambda';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';
import { 
  RDSDataClient, 
  ExecuteStatementCommand 
} from '@aws-sdk/client-rds-data';

interface EmbeddingEvent {
  documentId: string;
  inputText: string;
}

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const rdsClient = new RDSDataClient({ region: process.env.AWS_REGION });

async function generateEmbedding(text: string): Promise<number[]> {
  console.log('Generating embedding for text length:', text.length);
  
  const command = new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v1',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text
    }),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  console.log('Generated embedding of length:', responseBody.embedding.length);
  return responseBody.embedding;
}

async function updateDatabaseEmbedding(documentId: string, embedding: number[]): Promise<void> {
  console.log('Updating database for document:', documentId);

  const params = {
    secretArn: process.env.DB_SECRET_ARN,
    resourceArn: process.env.DB_CLUSTER_ARN,
    database: process.env.DB_NAME,
    sql: 'SELECT "03_rds_lambda_bedrock_async".update_document_embedding(:documentId::UUID, :embedding::vector)',
    parameters: [
      {
        name: 'documentId',
        value: { stringValue: documentId }
      },
      {
        name: 'embedding',
        value: { stringValue: `[${embedding.join(',')}]` }
      }
    ]
  };

  console.log('RDS Params:', JSON.stringify(params, null, 2));

  try {
    const command = new ExecuteStatementCommand(params);
    await rdsClient.send(command);
    console.log('Successfully updated embedding for document:', documentId);
  } catch (error) {
    console.error('Error updating database:', error);
    throw error;
  }
}

export const handler: Handler = async (event: EmbeddingEvent, context: Context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Input validation
    if (!event.documentId || !event.inputText) {
      throw new Error('Missing required parameters: documentId or inputText');
    }

    // Generate embedding
    const embedding = await generateEmbedding(event.inputText);

    // Update database with the embedding
    await updateDatabaseEmbedding(event.documentId, embedding);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully processed document',
        documentId: event.documentId
      })
    };

  } catch (error) {
    console.error('Error processing document:', error);
    throw error; // Let Lambda handle the error
  }
};
