import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Use googleapis directly to query Cloud Logging since firebase-admin doesn't have a direct logs API
import { google } from 'googleapis';

async function getLogs() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './serviceAccountKey.json',
    scopes: ['https://www.googleapis.com/auth/logging.read'],
  });

  const authClient = await auth.getClient();
  const logging = google.logging({ version: 'v2', auth: authClient });

  const projectId = 'sutlucekadayif-web';
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND severity>=DEFAULT`;

  try {
    const res = await logging.entries.list({
      requestBody: {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: 'timestamp desc',
        pageSize: 20,
      },
    });

    if (res.data.entries) {
      res.data.entries.forEach(entry => {
        console.log(`[${entry.timestamp}] [${entry.severity}] ${entry.textPayload || JSON.stringify(entry.jsonPayload)}`);
      });
    } else {
      console.log('No logs found.');
    }
  } catch (error) {
    console.error('Error fetching logs:', error.message);
  }
}

getLogs();
