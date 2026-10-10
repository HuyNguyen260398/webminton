// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toRequest } from "../src/handler";
import { s3Publisher } from "../src/s3-publisher";

const event = (over: Record<string, unknown> = {}) =>
  ({
    rawPath: "/api/admin/commands",
    body: '{"a":1}',
    isBase64Encoded: false,
    requestContext: {
      http: { method: "POST" },
      authorizer: { jwt: { claims: { email: "btc@example.com" } } },
    },
    ...over,
  }) as never;

describe("toRequest", () => {
  it("lifts method, path, body and verified claims out of the event", () => {
    expect(toRequest(event())).toEqual({
      method: "POST",
      path: "/api/admin/commands",
      rawBody: '{"a":1}',
      claims: { email: "btc@example.com" },
    });
  });

  it("decodes a base64 body as UTF-8", () => {
    const body = Buffer.from('{"name":"Đỗ Thái Đãm"}').toString("base64");
    expect(toRequest(event({ body, isBase64Encoded: true })).rawBody).toBe(
      '{"name":"Đỗ Thái Đãm"}',
    );
  });

  it("has no claims on the open route", () => {
    const req = toRequest(
      event({
        rawPath: "/api/config",
        body: undefined,
        requestContext: { http: { method: "GET" } },
      }),
    );
    expect(req).toEqual({
      method: "GET",
      path: "/api/config",
      rawBody: null,
      claims: undefined,
    });
  });
});

describe("s3Publisher", () => {
  it("writes tournament.json as uncached UTF-8 JSON", async () => {
    const sent: any[] = [];
    const publish = s3Publisher(
      { send: async (cmd: { input: unknown }) => void sent.push(cmd.input) } as never,
      "site-bucket",
    );
    await publish('{"name":"Đỗ Thái Đãm"}\n');
    expect(sent[0]).toEqual({
      Bucket: "site-bucket",
      Key: "tournament.json",
      Body: '{"name":"Đỗ Thái Đãm"}\n',
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-cache",
    });
  });
});
