import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoStore } from "./dynamo-store";
import type { Publisher } from "./publish";
import { s3Publisher } from "./s3-publisher";
import type { TournamentStore } from "./store";

// Region and credentials come from the environment, in the Lambda and on a
// laptop alike.
export const awsStore = (table: string): TournamentStore =>
  new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), table);

export const awsPublisher = (bucket: string): Publisher =>
  s3Publisher(new S3Client({}), bucket);
