import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Publisher } from "./publish";

// CloudFront serves /tournament.json with caching disabled, so a put is live
// immediately — no invalidation.
export function s3Publisher(
  s3: Pick<S3Client, "send">,
  bucket: string,
): Publisher {
  return async (body) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: "tournament.json",
        Body: body,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "no-cache",
      }),
    );
  };
}
