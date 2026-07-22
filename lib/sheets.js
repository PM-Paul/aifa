// Shared Google Sheets logging helper for both /api/analyze and /api/feedback.
//
// Authenticates with a Google service account whose full JSON key is stored in the
// GOOGLE_SERVICE_ACCOUNT_JSON env var (as a single-line JSON string) and appends rows
// to the "AIFA Assessment Log" spreadsheet. The service account's email must be shared
// as an Editor on that spreadsheet for appends to succeed.
//
// The two tabs ("Assessments" and "Feedback") and their header rows are created lazily
// on first append (idempotent), so no manual sheet setup is required.

import { google } from 'googleapis';

const SPREADSHEET_ID = '18IeIFwYZu-AQMHD_ZjlG7FToZpbZ_V-6EoFmGYedn9o';

const ASSESSMENTS_SHEET = 'Assessments';
const FEEDBACK_SHEET    = 'Feedback';

const ASSESSMENT_HEADERS = [
  'timestamp', 'session_id', 'workload_type', 'model_params_billions', 'concurrent_users',
  'interaction_length', 'scale_pattern', 'latency', 'gpu_tier_selected',
  'aws_instance', 'aws_fleet_cost_hr', 'aws_instances_needed', 'aws_confidence',
  'azure_instance', 'azure_fleet_cost_hr', 'azure_instances_needed', 'azure_confidence',
  'gcp_instance', 'gcp_fleet_cost_hr', 'gcp_instances_needed', 'gcp_confidence',
  'lowest_cost_provider', 'input_tokens', 'output_tokens', 'total_tokens', 'response_time_ms',
];

const FEEDBACK_HEADERS = [
  'timestamp', 'session_id', 'thumbs', 'comment', 'email',
  'workload_type', 'model_params_billions', 'concurrent_users', 'interaction_length',
];

// Auth client is created once and reused while the serverless container stays warm.
let sheetsClientPromise = null;

function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
      const credentials = JSON.parse(raw);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const authClient = await auth.getClient();
      return google.sheets({ version: 'v4', auth: authClient });
    })();
  }
  return sheetsClientPromise;
}

// Tracks which tabs we've already confirmed/created this process, to avoid a metadata
// round-trip on every append once the container is warm.
const ensuredSheets = new Set();

async function ensureSheet(sheets, title, headers) {
  if (ensuredSheets.has(title)) return;
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
  ensuredSheets.add(title);
}

// Appends a single row. `row` is a plain object keyed by header name; values are written
// in the header column order, with missing keys rendered as empty cells.
async function appendRow(title, headers, row) {
  const sheets = await getSheetsClient();
  await ensureSheet(sheets, title, headers);
  const values = headers.map(h => row[h] ?? '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

export async function logAssessment(row) {
  await appendRow(ASSESSMENTS_SHEET, ASSESSMENT_HEADERS, row);
}

export async function logFeedback(row) {
  await appendRow(FEEDBACK_SHEET, FEEDBACK_HEADERS, row);
}
