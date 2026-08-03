import './env.js';
import {
    S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';

// Node/Functions tarafının depolama uygulaması (S3 API ile R2).
// Workers tarafı bunu HİÇ import etmez — bkz. config/depo-binding.js.

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.R2_BUCKET_NAME;

export const depoS3 = {
    async yaz(key, govde, tur) {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: govde, ContentType: tur }));
    },
    async sil(key) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    },
    async oku(key) {
        try {
            const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
            const parcalar = [];
            for await (const p of r.Body) parcalar.push(p);
            return {
                govde: Buffer.concat(parcalar),
                tur: r.ContentType ?? null,
                boyut: r.ContentLength ?? null,
            };
        } catch (e) {
            if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
            throw e;
        }
    },
    async listele(onek) {
        const cikti = [];
        let devam;
        do {
            const r = await s3.send(new ListObjectsV2Command({
                Bucket: BUCKET, Prefix: onek, ContinuationToken: devam,
            }));
            for (const o of r.Contents ?? []) {
                cikti.push({ key: o.Key, boyut: o.Size ?? 0, tarih: o.LastModified ?? null });
            }
            devam = r.IsTruncated ? r.NextContinuationToken : undefined;
        } while (devam);
        return cikti;
    },
};
