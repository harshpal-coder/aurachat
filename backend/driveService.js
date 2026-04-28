import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths for credentials
const CLIENT_SECRET_PATH = path.join(__dirname, 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const FOLDER_ID = '12576U2OJs2D3zv7luOsuD62DEFpfr6GS'; 

let drive = null;

const getAuthClient = async () => {
  let credentials;
  let token;

  // 1. Try Environment Variables (for Production)
  if (process.env.GDRIVE_CLIENT_SECRET) {
    try {
      credentials = JSON.parse(process.env.GDRIVE_CLIENT_SECRET);
      if (process.env.GDRIVE_TOKEN) {
        token = JSON.parse(process.env.GDRIVE_TOKEN);
      }
    } catch (e) {
      console.error('Error parsing Google Drive environment variables:', e);
    }
  }

  // 2. Fallback to Local Files (for Development)
  if (!credentials && fs.existsSync(CLIENT_SECRET_PATH)) {
    const content = fs.readFileSync(CLIENT_SECRET_PATH);
    credentials = JSON.parse(content);
  }

  if (!credentials) {
    console.warn('Google Drive credentials not found (env or file). Drive uploads disabled.');
    return null;
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris ? redirect_uris[0] : 'http://localhost');

  if (token) {
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  if (!token && fs.existsSync(TOKEN_PATH)) {
    const localToken = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(localToken));
    return oAuth2Client;
  }

  // If no token exists anywhere, we need to authorize (only works locally)
  return await getNewToken(oAuth2Client);
};

const getNewToken = (oAuth2Client) => {
  return new Promise((resolve) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('\n--- GOOGLE DRIVE AUTHORIZATION REQUIRED ---');
    console.log('1. Open this link in your browser:', authUrl);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('2. Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
};

export const uploadToDrive = async (fileName, fileContent) => {
  try {
    const auth = await getAuthClient();
    if (!auth) return;

    const driveInstance = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
      parents: [FOLDER_ID],
    };

    const media = {
      mimeType: 'text/plain',
      body: fileContent,
    };

    const response = await driveInstance.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    console.log(`File uploaded to Google Drive. File ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
  }
};
