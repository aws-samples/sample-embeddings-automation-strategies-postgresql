import { Handler } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION });

interface DocumentInput {
  documentId: string;
  inputText: string;
}

export const handler: Handler = async (event: DocumentInput) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    if (!event.documentId || !event.inputText) {
      throw new Error('Missing required parameters: documentId or inputText');
    }

    const command = new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify({
        documentId: event.documentId,
        inputText: event.inputText,
        timestamp: new Date().toISOString(),
      }),
    });

    const response = await sqs.send(command);
    console.log('Message sent to SQS:', response.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Document queued for processing',
        messageId: response.MessageId,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
