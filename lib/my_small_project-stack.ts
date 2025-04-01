import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3'; //Getting the entire "S3 toolbox"
//import { Bucket } from 'aws-cdk-lib/aws-s3'; //Whereas import { Bucket } would be like dumping all tools on a table and picking one - harder to remember which service they belong to!

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications'; 
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
 

export class MySmallProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. S3 Bucket for file uploads
    const uploadBucket = new s3.Bucket(this, 'UploadBucket', {});

    // 3. SQS Queue for notifications
    const notificationQueue = new sqs.Queue(this, 'NotificationQueue');

    //2. S3 Event Triggers Processing
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new SqsDestination(notificationQueue)
    )

    //5. DynamoDB Table for metadata
    const metadataTable = new dynamodb.Table(this, 'MetadataTable', {
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    //4. Lambda to process files
    const lambdaProcessingTheFile = new lambda.Function(this, 'LambdaProcessingTheFile', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'), // <-- Looks for ./lambda directory
      handler: 'processor.handler', // Refers to 'processor.ts' file, 'handler' export
      environment: {
        TABLE_NAME: metadataTable.tableName,
        QUEUE_URL: notificationQueue.queueUrl,
      },
    });

    //4. Grant permissions
    uploadBucket.grantRead(lambdaProcessingTheFile);
    metadataTable.grantWriteData(lambdaProcessingTheFile);
    notificationQueue.grantSendMessages(lambdaProcessingTheFile);

    // 6. S3 Event Trigger
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new SqsDestination(notificationQueue), // Optional: Directly trigger Lambda if needed
    );

    // 7. API Gateway
    const api = new apigateway.RestApi(this, 'FileApi');

    // GET /files/{fileId}
    api.root.addResource('files').addResource('{fileId}').addMethod(
      'GET',
      new LambdaIntegration(lambdaProcessingTheFile)
    );

    /* 9. CI/CD Pipeline (Simplified)
    new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [ Connect to GitHub/Bitbucket ],
        },
        {
          stageName: 'Deploy',
          actions: [CDK deploy action],
        },
      ],
    });*/
  }
}



/* Scenario: File Processing System

1) User uploads a file to S3
2) S3 event triggers Lambda to process the file
3) Lambda saves metadata to DynamoDB
4) Success/failure notifications go to SQS queue
5) API Gateway exposes endpoints to:
6) Check processing status
7) Retrieve file metadata
8) CloudWatch monitors errors
9) CI/CD Pipeline auto-deploys updates */