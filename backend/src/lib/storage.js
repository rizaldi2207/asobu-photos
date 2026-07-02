import { Client } from "minio";

const bucket = process.env.MINIO_BUCKET || "photos";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: String(process.env.MINIO_USE_SSL) === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

export const BUCKET = bucket;

// Ensure the bucket exists (the createbuckets init container also does this,
// but this makes the backend self-sufficient and retries while MinIO boots).
export async function ensureBucket({ retries = 10, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) await minioClient.makeBucket(bucket);
      console.log(`[storage] bucket "${bucket}" ready`);
      return;
    } catch (err) {
      console.warn(`[storage] bucket init attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function putObject(key, buffer, contentType) {
  await minioClient.putObject(bucket, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}

export async function getObjectStream(key) {
  return minioClient.getObject(bucket, key);
}

// Stream a byte range of an object — used for HTTP Range requests (video seeking).
export async function getPartialObjectStream(key, offset, length) {
  return minioClient.getPartialObject(bucket, key, offset, length);
}

export async function removeObject(key) {
  try {
    await minioClient.removeObject(bucket, key);
  } catch (err) {
    console.warn(`[storage] failed to remove ${key}: ${err.message}`);
  }
}
