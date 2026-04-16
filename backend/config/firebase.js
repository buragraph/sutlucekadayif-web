import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Firebase Functions ortamında otomatik init — lokal ortamda service account key kullan
if (!admin.apps.length) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (credPath) {
        // Lokal geliştirme ortamı
        try {
            const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        } catch (err) {
            console.error('Service account key okunamadı:', err.message);
            // Fallback: default credentials (Cloud ortamında)
            admin.initializeApp();
        }
    } else {
        // Firebase Functions / Cloud ortamı — otomatik credential
        admin.initializeApp();
    }
}

const db = admin.firestore();
const auth = admin.auth();

export { admin, db, auth };
