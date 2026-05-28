import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('/Users/burak/Desktop/Burak İşler/kişisel/Sutluce/sutlucekadayif-web/backend/serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function check() {
  const user = await auth.getUserByEmail('mgg1599@gmail.com');
  console.log('Custom claims:', user.customClaims);
  const doc = await db.collection('kullanici_sube').doc(user.uid).get();
  console.log('Firestore doc:', doc.data());
  process.exit(0);
}
check();
