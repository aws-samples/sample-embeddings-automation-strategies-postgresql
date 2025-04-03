import { SQSHandler, SQSEvent, SQSRecord } from 'aws-lambda';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';
import { 
  RDSDataClient, 
  ExecuteStatementCommand,
  BatchExecuteStatementCommand 
} from '@aws-sdk/client-rds-data';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const rdsClient = new RDSDataClient({ region: process.env.AWS_REGION });

interface DocumentMessage {
  documentId: string;
  inputText: string;
}

async function generateEmbedding(text: string): Promise<number[]> {
  console.log('Generating embedding for text length:', text.length);

  const command = new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v1',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text
    })
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.embedding;
}

async function saveEmbedding(documentId: string, embedding: number[]): Promise<void> {
  const params = {
    secretArn: process.env.DB_SECRET_ARN,
    resourceArn: process.env.DB_CLUSTER_ARN,
    database: process.env.DB_NAME,
    sql: 'SELECT "04_rds_lambda_sqs".update_document_embedding(:documentId::UUID, :embedding::vector)',
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

  const command = new ExecuteStatementCommand(params);
  await rdsClient.send(command);
  console.log('Saved embedding for document:', documentId);
}

async function processRecord(record: SQSRecord): Promise<void> {
  const message: DocumentMessage = JSON.parse(record.body);
  console.log('Processing document:', message.documentId);

  try {
    const embedding = await generateEmbedding(message.inputText);
    await saveEmbedding(message.documentId, embedding);
  } catch (error) {
    console.error('Error processing record:', error);
    throw error; // This will cause the message to be returned to the queue
  }
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log('Received batch size:', event.Records.length);

  // Process all records in parallel
  const processPromises = event.Records.map(processRecord);
  
  try {
    await Promise.all(processPromises);
    console.log('Successfully processed all records in batch');
  } catch (error) {
    console.error('Error processing batch:', error);
    throw error; // Failed messages will be returned to the queue
  }
};
