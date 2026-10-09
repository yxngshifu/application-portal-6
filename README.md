# China Study Application Portal

React + Tailwind landing page with the application form from `form.doc`. On submit the server:

1. creates a unique ID (`APP-XXXX-XXXX`),
2. adds the answers as **one new row** in `data/applications.xlsx`,
3. creates a **Google Drive folder named with that ID** and stores the uploaded files in it,
4. fills the **original form** (same tables, borders and layout) and saves it in that folder as `<ID>_Application_Form.docx`, and offers it as a download.

Applicants can open `/application/<ID>` (or use the box on the landing page) to edit answers, replace files or add new ones. Their Excel row, Drive folder and filled form are updated in place.

## Run it

```bash
npm install
cp .env.example .env      # optional until you want Google Drive
npm run dev               # API on :3001, site on http://localhost:5173
```

Production: `npm start` builds the client and serves everything from one Node process on `PORT`.

Without Google credentials the app still works fully, keeping files in `data/uploads/<ID>/`. Add the credentials below and new applications go to Drive.

## Save to your Drive folder and Google Sheet (Apps Script)

`apps-script/Code.gs` already contains your Sheet ID, Drive folder ID and a shared secret. With it connected, every save puts the uploads **and the filled form** in `<parent folder>/<ID>/` and writes/updates the row in the "Applications" tab of your sheet (the local `data/applications.xlsx` is still kept).

1. script.google.com → open your project → replace its code with `apps-script/Code.gs`.
2. *Deploy → New deployment → Web app*, **Execute as: Me**, **Who has access: Anyone** → copy the `/exec` URL. Approve the Drive/Sheets permissions when asked.
3. Set `APPS_SCRIPT_URL` (that URL) and `APPS_SCRIPT_SECRET` (same value as `SECRET` in Code.gs; already filled in `.env`) in your host's environment variables or `.env`.
4. After changing Code.gs later: *Deploy → Manage deployments → Edit → New version*.

When these are set they take priority over the Google Drive API option below.

## Connect Google Drive (alternative)

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Drive API**.
2. *APIs & Services → OAuth consent screen*: set it up, add yourself as a test user, and **publish the app to "In production"**. In "Testing" mode Google expires refresh tokens after 7 days.
3. *Credentials → Create credentials → OAuth client ID*, type **Web application**, authorised redirect URI `http://localhost:53682/oauth2callback`.
4. Put the client ID and secret in `.env`, then run `npm run google:auth`, open the printed link, approve, and paste the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
5. (Optional) set `GOOGLE_DRIVE_PARENT_FOLDER_ID` to the folder that should hold all application folders.

The folders belong to the Google account you authorised. Workspace users can use a service account instead (see `.env.example`); it needs a Shared Drive because service accounts have no storage quota of their own.

## Files

| Path | Purpose |
|---|---|
| `shared/schema.js` | Form fields, option lists, the 13 document slots, validation (used by browser **and** server) |
| `server/template/application-form.docx` | Your original form converted to `.docx`. The exporter fills this file in place |
| `server/src/docx.js` | Fills text cells, ticks the Wingdings checkboxes, adds extra education/work rows if needed |
| `server/src/excel.js` | Column definitions and the upsert-by-ID row writer |
| `server/src/storage.js` | Google Drive store and local-folder fallback |
| `server/src/service.js` | Create/update flow, upload checks |
| `client/src` | React app |

`data/records/<ID>.json` is the source of truth for each application; the Excel sheet is regenerated from it, so if `applications.xlsx` is open and locked in Excel the save still succeeds and the row is written next time the server starts or that application is edited.

## Tests

```bash
npm run dev -w server &                     # in one terminal
DATA_DIR=$PWD/data npm test -w server       # API end-to-end (create → Excel → edit → replace files)
node server/scripts/drive-mock.js           # Drive request code against a fake Drive API
```

## Things to know

- **The ID is the only credential.** Anyone with it can view and edit that application. IDs are random (about 10¹² combinations) and lookups are rate limited, but add an extra check (e.g. passport number or email) if the data is sensitive.
- **The exported file is `.docx`**, not the original legacy `.doc`. Word opens it identically. The signature and date lines are left blank for the applicant to sign.
- Uploads: PDF, JPG, PNG, DOC, DOCX, up to 15 MB each; type is verified from file contents, not just the extension.
- Documents can be added after the first submission, which is why only the form fields are mandatory at submit time. The success page and Excel (`Missing Required Documents` column) list what is still outstanding.
