// Server-only S3 client for Yandex Object Storage. Never import this from
// client code — the secret key must not reach the browser bundle. Mirrors
// the shape of src/integrations/supabase/client.server.ts.
import { S3Client } from "@aws-sdk/client-s3";

export const YANDEX_S3_ENDPOINT = "https://storage.yandexcloud.net";
export const YANDEX_S3_REGION = "ru-central1";

let _client: S3Client | undefined;
let _bucket: string | undefined;

function readEnv(): { accessKeyId: string; secretAccessKey: string; bucket: string } {
  const accessKeyId = process.env.YANDEX_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YANDEX_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.YANDEX_S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    const missing = [
      ...(!accessKeyId ? ["YANDEX_S3_ACCESS_KEY_ID"] : []),
      ...(!secretAccessKey ? ["YANDEX_S3_SECRET_ACCESS_KEY"] : []),
      ...(!bucket ? ["YANDEX_S3_BUCKET"] : []),
    ];
    throw new Error(`Missing Yandex Object Storage environment variable(s): ${missing.join(", ")}.`);
  }
  return { accessKeyId, secretAccessKey, bucket };
}

export function yandexS3(): S3Client {
  if (!_client) {
    const { accessKeyId, secretAccessKey } = readEnv();
    _client = new S3Client({
      region: YANDEX_S3_REGION,
      endpoint: YANDEX_S3_ENDPOINT,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

export function yandexBucket(): string {
  if (!_bucket) _bucket = readEnv().bucket;
  return _bucket;
}
