// Vercel serverless function — receives the results-page feedback widget submission
// (thumbs up/down, an optional comment, an optional follow-up email, the session id, and
// the workload inputs from the current session) and appends it as a row to the "Feedback"
// tab of the AIFA Assessment Log spreadsheet. Always responds 200 so the widget can show
// its thank-you message even if the append fails.

import { logFeedback } from '../lib/sheets.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { thumbs, comment, email, sessionId, inputs = {} } = req.body ?? {};

  try {
    await logFeedback({
      timestamp: new Date().toISOString(),
      session_id: sessionId ?? '',
      thumbs:  thumbs ?? '',
      comment: comment ?? '',
      email:   email ?? '',
      workload_type:         inputs.workload_type ?? '',
      model_params_billions: inputs.model_params_billions ?? '',
      concurrent_users:      inputs.concurrent_users ?? '',
      interaction_length:    inputs.interaction_length ?? '',
    });
  } catch (err) {
    console.error('[AIFA] Feedback logging failed:', err.message);
  }

  res.status(200).json({ ok: true });
}
