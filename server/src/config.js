import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const PORT = Number(process.env.PORT || 3001);
export const TEMPLATE_PATH = path.join(here, '../template/application-form.docx');
export const CLIENT_DIST = path.join(ROOT, 'client/dist');

const env = process.env;
export const googleCfg = {
  clientId: env.GOOGLE_CLIENT_ID || '',
  clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  refreshToken: env.GOOGLE_REFRESH_TOKEN || '',
  serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE || '',
  // Parent folder in Drive (ID from its URL). Empty = "My Drive" root.
  parentFolderId: env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '',
};
export const driveConfigured = Boolean(
  googleCfg.serviceAccountFile ||
    (googleCfg.clientId && googleCfg.clientSecret && googleCfg.refreshToken),
);

// Google Apps Script bridge (apps-script/Code.gs): saves files + sheet rows into the owner's Drive/Sheet.
export const scriptCfg = {
  url: env.APPS_SCRIPT_URL || '',
  secret: env.APPS_SCRIPT_SECRET || '',
};
export const scriptConfigured = Boolean(scriptCfg.url && scriptCfg.secret);
