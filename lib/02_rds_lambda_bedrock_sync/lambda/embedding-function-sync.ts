import { Context, APIGatewayProxyResult } from 'aws-lambda';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

async function generateEmbedding(text: string): Promise<number[]> {
  console.log('generateEmbedding - Input text:', text);
  
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
  
  console.log('generateEmbedding - Embedding length:', responseBody.embedding.length);
  console.log('generateEmbedding - First few values:', responseBody.embedding.slice(0, 5));
  
  return responseBody.embedding;
}

export async function handler(event: any, context: Context): Promise<APIGatewayProxyResult> {
  console.log('Lambda invocation - Event:', JSON.stringify(event, null, 2));
  console.log('Lambda invocation - Context:', JSON.stringify(context, null, 2));
  
  try {
    // Extract the text from the input event
    const inputText = event.inputText;
    
    if (!inputText) {
      throw new Error('No input text provided');
    }

    // Generate embedding using Bedrock
    const embedding = await generateEmbedding(inputText);

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        embedding: embedding
      })
    };

    console.log('Lambda response - Status:', response.statusCode);
    console.log('Lambda response - Embedding length:', embedding.length);
    
    return response;
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error generating embedding',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}
