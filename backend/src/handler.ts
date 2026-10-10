import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { parseEmails } from "./auth";
import { awsPublisher, awsStore } from "./aws";
import { route, type ApiRequest, type Deps } from "./router";

export function toRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): ApiRequest {
  const body = event.body ?? null;
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    rawBody:
      body !== null && event.isBase64Encoded
        ? Buffer.from(body, "base64").toString("utf8")
        : body,
    // Present only on routes behind the JWT authorizer, already verified.
    claims: event.requestContext.authorizer?.jwt?.claims,
  };
}

let deps: Deps | undefined;
// Built on first use so importing this module in a test needs no AWS config.
function getDeps(): Deps {
  const env = process.env;
  return (deps ??= {
    store: awsStore(env.TABLE_NAME!),
    publish: awsPublisher(env.SITE_BUCKET!),
    adminEmails: parseEmails(env.ADMIN_EMAILS),
    config: {
      cognitoDomain: env.COGNITO_DOMAIN ?? null,
      clientId: env.COGNITO_CLIENT_ID ?? null,
      // Never true in the Lambda: test tokens exist only in scripts/local-api.ts.
      devLogin: false,
    },
    now: () => new Date().toISOString(),
  });
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const res = await route(toRequest(event), getDeps());
  return {
    statusCode: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(res.body),
  };
}
