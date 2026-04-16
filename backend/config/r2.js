import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Dosya yükle
 * @param {Buffer} buffer - Dosya içeriği
 * @param {string} key - R2'deki dosya yolu (ör: "urunler/abc123.webp")
 * @param {string} contentType - MIME type
 * @returns {string} Public URL
 */
export async function uploadFile(buffer, key, contentType) {
    await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
    return `${PUBLIC_URL}/${key}`;
}

/**
 * Dosya sil
 * @param {string} key - R2'deki dosya yolu
 */
export async function deleteFile(key) {
    await r2.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
    }));
}

/**
 * URL'den key çıkar
 * @param {string} url - Public URL
 * @returns {string} R2 key
 */
export function urlToKey(url) {
    if (!url || !PUBLIC_URL) return null;
    return url.replace(`${PUBLIC_URL}/`, '');
}

export { r2, BUCKET, PUBLIC_URL };
