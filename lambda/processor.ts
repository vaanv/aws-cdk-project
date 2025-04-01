// 1. Import the S3 event type from AWS Lambda types package
//    - Provides TypeScript interface for S3 trigger events
import { S3Event } from 'aws-lambda';

// 2. Import AWS SDK v3 clients for DynamoDB and SQS
//    - Modular imports reduce bundle size
//    - Each service has its own lightweight client
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'; //read below explanation
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// 3. Initialize AWS service clients with default configuration
//    - Uses execution role credentials automatically
//    - Inherits region from Lambda environment
const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});


// 4. Define Lambda response interface
//    - Ensures consistent return shape for API Gateway integration
interface LambdaResponse {
  statusCode: number;
  body: string;
}

// 5. Main Lambda handler function
//    - async keyword makes it return a Promise
//    - Explicit return type Promise<LambdaResponse> for type safety
export const handler = async (event: S3Event): Promise<LambdaResponse> => {


  // 6. Validate incoming event
  //    - Checks for empty or malformed S3 events
  if (!event.Records?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid event" }) };
  }

  // 7. Extract first record from S3 event
  //    - TypeScript knows Records[0] exists due to above check
  const record = event.Records[0];

  // 8. Get file details from S3 event
  //    - record.s3.object.key is typed as string
  const fileId = record.s3.object.key;

  try {
    // 9. Prepare DynamoDB item with strict typing
    //    - S: String, N: Number are DynamoDB attribute types
    const metadata = {
      fileId: { S: fileId },                  // Partition key
      status: { S: 'PROCESSED' as const },    // Const assertion for literal type
      timestamp: { S: new Date().toISOString() },
      size: { N: String(record.s3.object.size) }
    };

    // 10. Write to DynamoDB
    //     - PutItemCommand enforces correct input structure
    //     - process.env.TABLE_NAME is guaranteed by CDK
    await dynamo.send(new PutItemCommand({
      TableName: process.env.TABLE_NAME!,
      Item: metadata
    }));

    // 11. Send success notification to SQS
    //     - Queue URL injected by CDK
    //     - MessageAttributes provide additional metadata
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL!,
      MessageBody: JSON.stringify(metadata),
      MessageAttributes: { /* ... */ }
    }));

     // 12. Return success response
    //     - Matches API Gateway proxy integration format
    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true, fileId }) 
    };

  } catch (error) {
    // 13. Error handling with proper typing
    //     - TypeScript 4.0+ treats errors as unknown
    const err = error instanceof Error ? error : new Error(String(error));

    // 14. Detailed error logging
    //     - Includes stack trace for debugging
    console.error(`FAILED ${fileId}:`, err.stack);
    
    // 15. Error response
    //     - Maintains consistent response format
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal error", requestId: fileId })
    };
  }
};




/*
While importing when to use cdk and when to use sdk explanation below 

Aspect	   CDK (aws-cdk-lib)	    Lambda SDK (@aws-sdk)
Purpose	   Defines infrastructure	Interacts with AWS services
When Used  During cdk deploy	    During Lambda execution
Example	   Creates tables/queues	Puts items into tables
Location   lib/stack.ts	            lambda/processor.ts


Key Takeaways:-
CDK is for infrastructure definition (what gets deployed)
AWS SDK is for runtime operations (what happens after deployment)

CDK automatically:

     Configures IAM permissions
     Injects resource names (like TABLE_NAME)
    Manages dependencies between resources

When to Use Which:-
Need to create/modify AWS resources? → Use CDK (aws-cdk-lib)
Need to put/get data from services? → Use SDK (@aws-sdk)
*/