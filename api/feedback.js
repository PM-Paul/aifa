// Vercel serverless function — receives the results-page feedback widget submission
// (thumbs up/down, an optional comment, an optional follow-up email, and the workload
// inputs from the current session). For now it just logs to the server console; a later
// step will wire this to Google Sheets. Always responds 200 so the widget can show its
// thank-you message even if downstream storage isn't configured yet.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { thumbs, comment, email, workload } = req.body ?? {};

  console.log('[AIFA] Feedback received:', JSON.stringify({
    thumbs:   thumbs ?? null,
    comment:  comment || null,
    email:    email || null,
    workload: workload ?? null,
  }));

  res.status(200).json({ ok: true });
}
