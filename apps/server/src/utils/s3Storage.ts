import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

let s3Client;

const getS3Client = () => {
  if (s3Client) return s3Client;

  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY or S3_SECRET_KEY is not set');
  }

  const config: S3ClientConfig = {
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };

  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
  }

  s3Client = new S3Client(config);
  return s3Client;
};

const getPublicBucket = () => {
  return process.env.S3_BUCKET_PUBLIC || process.env.S3_BUCKET;
};

export const putPublicObject = async ({ key, body, contentType }) => {
  const bucket = getPublicBucket();
  if (!bucket) {
    throw new Error('S3_BUCKET_PUBLIC is not set');
  }

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
  return { bucket, key };
};

export const deletePublicObjectsByPrefix = async (prefix) => {
  const bucket = getPublicBucket();
  if (!bucket) {
    throw new Error('S3_BUCKET_PUBLIC is not set');
  }

  const client = getS3Client();
  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  });

  const listed = await client.send(listCommand);
  const objects = (listed.Contents || [])
    .map(obj => obj.Key)
    .filter(Boolean)
    .map(Key => ({ Key }));

  if (!objects.length) {
    return { bucket, deleted: 0 };
  }

  const deleteCommand = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: objects, Quiet: true },
  });

  await client.send(deleteCommand);
  return { bucket, deleted: objects.length };
};

export const getPublicObject = async (key) => {
  const bucket = getPublicBucket();
  if (!bucket) {
    throw new Error('S3_BUCKET_PUBLIC is not set');
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return client.send(command);
};

export const deletePublicObject = async (key) => {
  const bucket = getPublicBucket();
  if (!bucket) {
    throw new Error('S3_BUCKET_PUBLIC is not set');
  }

  if (!key) {
    return { bucket, deleted: 0 };
  }

  const client = getS3Client();
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: [{ Key: key }], Quiet: true },
  });

  await client.send(deleteCommand);
  return { bucket, deleted: 1 };
};
