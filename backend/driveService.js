import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your service account credentials file
const KEY_FILE_PATH = path.join(__dirname, 'service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Replace with your Google Drive Folder ID
const FOLDER_ID = '12576U2OJs2D3zv7luOsuD62DEFpfr6GS';

let drive = null;

const initDrive = () => {
  if (drive) return drive;

  if (!fs.existsSync(KEY_FILE_PATH)) {
    console.warn('Google Drive service-account.json not found. Drive uploads disabled.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: SCOPES,
    });
    drive = google.drive({ version: 'v3', auth });
    console.log('Google Drive API initialized.');
    return drive;
  } catch (error) {
    console.error('Failed to initialize Google Drive API:', error);
    return null;
  }
};

export const uploadToDrive = async (fileName, fileContent) => {
  const driveInstance = initDrive();
  if (!driveInstance) return;

  try {
    const fileMetadata = {
      name: fileName,
      parents: FOLDER_ID !== 'YOUR_GOOGLE_DRIVE_FOLDER_ID' ? [FOLDER_ID] : [],
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
