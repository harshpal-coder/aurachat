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
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    console.warn('client_secret.json not found. Drive uploads disabled.');
    return null;
  }

  const content = fs.readFileSync(CLIENT_SECRET_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris ? redirect_uris[0] : 'http://localhost');

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // If no token exists, we need to authorize (this should be done manually once)
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
