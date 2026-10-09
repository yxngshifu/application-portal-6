// One-time helper: obtains a Google Drive refresh token for the account that will own the folders.
//   1. Create an OAuth client (type "Desktop app" or "Web" with redirect http://localhost:53682/oauth2callback)
//   2. put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env
//   3. run: npm run google:auth
import http from 'node:http';
import { google } from 'googleapis';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (run with: node --env-file=.env server/scripts/google-auth.js).');
  process.exit(1);
}
const redirect = 'http://localhost:53682/oauth2callback';
const client = new google.auth.OAuth2(id, secret, redirect);
const url = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/oauth2callback') return res.writeHead(404).end();
  try {
    const { tokens } = await client.getToken(u.searchParams.get('code'));
    res.end('Done. You can close this tab and return to the terminal.');
    console.log('\nAdd this line to your .env file:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    if (!tokens.refresh_token) console.log('No refresh token returned: revoke the app at myaccount.google.com/permissions and run again.');
  } catch (e) {
    res.end('Error: ' + e.message);
    console.error(e.message);
  }
  server.close();
});
server.listen(53682, () => console.log(`Open this URL in your browser and approve access:\n\n${url}\n`));
