import type { APIGatewayProxyHandler } from "aws-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { S3Repository } from "./storage/s3-repository";
import { route } from "./router";
const repo = new S3Repository(new S3Client({}), process.env.DATA_BUCKET ?? "");
export const handler: APIGatewayProxyHandler = async (event) =>
  route(
    repo,
    {
      method: event.httpMethod,
      path: event.path,
      headers: event.headers,
      body: event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf8")
          : event.body
        : undefined,
      claims: event.requestContext.authorizer?.claims,
      cursor: event.queryStringParameters?.cursor,
    },
    {
      issuer: process.env.COGNITO_ISSUER ?? "",
      clientId: process.env.COGNITO_CLIENT_ID ?? "",
    },
  );
