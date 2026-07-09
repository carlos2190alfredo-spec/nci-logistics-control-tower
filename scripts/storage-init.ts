import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const bucket = process.env.MINIO_BUCKET ?? "nci-logistics-local";

const client = new S3Client({
  region: "local",
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
  },
});

async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket already exists: ${bucket}`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket created: ${bucket}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
