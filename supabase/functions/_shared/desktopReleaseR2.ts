import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@^3.699.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@^3.699.0";

export const RELEASE_UPLOAD_URL_TTL_SECONDS = 3_600;
export const RELEASE_DOWNLOAD_URL_TTL_SECONDS = 300;
export const RELEASE_SHA256_METADATA_KEY = "sha256";

export interface R2HeadResult {
  contentLength: number | null;
  contentType: string | null;
  sha256: string | null;
  etag: string | null;
}

export interface R2PresignedPut {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface R2PresignedGet {
  url: string;
  expiresInSeconds: number;
}

export interface DesktopReleaseR2Port {
  headObject(objectKey: string): Promise<R2HeadResult | null>;
  presignPut(input: {
    objectKey: string;
    contentType: string;
    sha256: string;
  }): Promise<R2PresignedPut>;
  presignGet(input: {
    objectKey: string;
    filename: string;
    contentType: string;
  }): Promise<R2PresignedGet>;
}

interface DesktopReleaseR2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required R2 configuration: ${name}`);
  }
  return value;
}

function readConfigFromEnv(): DesktopReleaseR2Config {
  return {
    endpoint: requireEnv("CLOUDFLARE_R2_ENDPOINT"),
    bucket: requireEnv("CLOUDFLARE_R2_BUCKET_DOWNLOADS"),
    accessKeyId: requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  };
}

function normalizeContentType(value: string | undefined): string | null {
  if (!value) return null;
  return value.split(";", 1)[0].trim().toLowerCase() || null;
}

export function createDesktopReleaseR2Port(): DesktopReleaseR2Port {
  const config = readConfigFromEnv();
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async headObject(objectKey) {
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
          }),
        );

        const metadata = result.Metadata ?? {};
        return {
          contentLength:
            typeof result.ContentLength === "number"
              ? result.ContentLength
              : null,
          contentType: normalizeContentType(result.ContentType),
          sha256: metadata[RELEASE_SHA256_METADATA_KEY]?.trim().toLowerCase() ?? null,
          etag: result.ETag ?? null,
        };
      } catch (error) {
        const candidate = error as {
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (
          candidate.$metadata?.httpStatusCode === 404 ||
          candidate.name === "NotFound" ||
          candidate.name === "NoSuchKey"
        ) {
          return null;
        }
        throw error;
      }
    },

    async presignPut({ objectKey, contentType, sha256 }) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: contentType,
        Metadata: {
          [RELEASE_SHA256_METADATA_KEY]: sha256,
        },
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: RELEASE_UPLOAD_URL_TTL_SECONDS,
      });

      return {
        url,
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          [`x-amz-meta-${RELEASE_SHA256_METADATA_KEY}`]: sha256,
        },
        expiresInSeconds: RELEASE_UPLOAD_URL_TTL_SECONDS,
      };
    },

    async presignGet({ objectKey, filename, contentType }) {
      const safeFilename = filename.replace(/[\r\n"]/g, "_");
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
        ResponseContentType: contentType,
      });

      const url = await getSignedUrl(client, command, {
        expiresIn: RELEASE_DOWNLOAD_URL_TTL_SECONDS,
      });

      return {
        url,
        expiresInSeconds: RELEASE_DOWNLOAD_URL_TTL_SECONDS,
      };
    },
  };
}
