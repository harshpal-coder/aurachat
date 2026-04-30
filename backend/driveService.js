import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths for credentials
const CLIENT_SECRET_PATH = path.join(__dirname, 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'];

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '12576U2OJs2D3zv7luOsuD62DEFpfr6GS'; 

const getAuthClient = async () => {
  // 1. Try Environment Variables (OAuth2 - Production)
  if (process.env.GDRIVE_CLIENT_SECRET) {
    console.log('Detected GDRIVE_CLIENT_SECRET environment variable...');
    try {
      const credentials = JSON.parse(process.env.GDRIVE_CLIENT_SECRET);
      const token = process.env.GDRIVE_TOKEN ? JSON.parse(process.env.GDRIVE_TOKEN) : null;
      
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris ? redirect_uris[0] : 'http://localhost');
      
      if (token) {
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
      }
      console.warn('GDRIVE_TOKEN is missing in environment variables.');
    } catch (e) {
      console.error('CRITICAL: Error parsing Google Drive environment variables:', e.message);
    }
  }

  // 2. Try Local OAuth2 files (client_secret.json + token.json)
  if (fs.existsSync(CLIENT_SECRET_PATH)) {
    console.log('Using local client_secret.json for Google Drive...');
    const content = fs.readFileSync(CLIENT_SECRET_PATH);
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris ? redirect_uris[0] : 'http://localhost');

    if (fs.existsSync(TOKEN_PATH)) {
      const localToken = fs.readFileSync(TOKEN_PATH);
      oAuth2Client.setCredentials(JSON.parse(localToken));
      return oAuth2Client;
    }

    // Only prompt for token if running locally (not in CI/Prod)
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      return await getNewToken(oAuth2Client);
    }
  }

  // 3. Try Service Account (Fallback)
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.log('Falling back to service-account.json for Google Drive...');
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_PATH,
      scopes: SCOPES,
    });
    return await auth.getClient();
  }

  console.error('--- GOOGLE DRIVE ERROR: No valid credentials found (Service Account, Env Vars, or Local Files) ---');
  return null;
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
        if (err) {
          console.error('Error retrieving access token', err);
          return resolve(null);
        }
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token stored to', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
};

export const uploadToDrive = async (fileName, fileContent, mimeType = 'text/plain') => {
    try {
      const auth = await getAuthClient();
      if (!auth) {
        console.error(`Skipping upload for ${fileName}: No Auth Client available.`);
        return null;
      }
  
      const driveInstance = google.drive({ version: 'v3', auth });
  
      const fileMetadata = {
        name: fileName,
        parents: [FOLDER_ID],
      };
  
      let bodyData = fileContent;
      if (mimeType.startsWith('image/') && typeof fileContent === 'string' && fileContent.includes(',')) {
        bodyData = Buffer.from(fileContent.split(',')[1], 'base64');
      }
  
      const media = {
        mimeType: mimeType,
        body: Readable.from(bodyData), // Wrap in a Readable stream to avoid .pipe() errors
      };

    const response = await driveInstance.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    console.log(`✅ File uploaded successfully: ${fileName} (ID: ${response.data.id})`);
    return response.data.id;
  } catch (error) {
    console.error(`❌ Error uploading ${fileName} to Google Drive:`, error.message);
    if (error.errors) console.error('Detailed Errors:', error.errors);
    return null;
  }
};


