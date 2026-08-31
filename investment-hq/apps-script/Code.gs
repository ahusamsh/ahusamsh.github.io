/**
 * Investment HQ — read-only Google Sheets relay for the GitHub PWA.
 * Direct architecture: GitHub PWA -> Apps Script -> Google Sheets.
 * Deploy as Web App: Execute as "Me"; access "Anyone".
 * Script Properties:
 *   MASTER_SHEET_ID = <Investment HQ Master spreadsheet id>
 *   ACCESS_TOKEN    = <private dashboard API token>
 *
 * Uses HtmlService + top-level POST relay to avoid ContentService redirect/404,
 * CORS, JSONP and iframe restrictions.
 */

const DASHBOARD_URL_ = 'https://darbpath.com/investment-hq/';

function doGet() {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Investment HQ</title>' +
    '<p style="font-family:system-ui;text-align:center;margin-top:20vh">Investment HQ relay is ready.</p>' +
    '<script>setTimeout(function(){location.replace(' + JSON.stringify(DASHBOARD_URL_) + ');},700);</script>'
  ).setTitle('Investment HQ Relay');
}

function doPost(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '');
  if (mode !== 'relay') {
    return relayOutput_({ ok: false, error: 'Invalid relay mode' }, e);
  }
  return relayOutput_(buildPayload_(e), e);
}

function relayOutput_(payload, e) {
  const nonce = String((e && e.parameter && e.parameter.nonce) || '')
    .replace(/[^0-9a-f]/gi, '')
    .slice(0, 64);

  const envelope = JSON.stringify({ payload: payload });
  const gz = Utilities.gzip(Utilities.newBlob(envelope, 'application/json'));
  const encoded = Utilities.base64EncodeWebSafe(gz.getBytes()).replace(/=+$/, '');
  const destination = DASHBOARD_URL_ + '#ihq=' + encoded + '&n=' + nonce;

  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Investment HQ</title></head><body>' +
    '<p style="font-family:system-ui;text-align:center;margin-top:20vh">جارٍ تحديث لوحة المتابعة…</p>' +
    '<script>location.replace(' + JSON.stringify(destination) + ');</script>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('Investment HQ Relay');
}

function buildPayload_(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = String(props.getProperty('ACCESS_TOKEN') || '');
    const supplied = String((e && e.parameter && e.parameter.token) || '');

    if (!expected || !safeEqual_(supplied, expected)) {
      return { ok: false, error: 'Unauthorized' };
    }

    const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
    if (!spreadsheetId) {
      return { ok: false, error: 'MASTER_SHEET_ID is not configured' };
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'Investment HQ - Master Control Center',
      projects: normalizeProjects_(readTable_(ss, 'Projects')),
      actions: normalizeActions_(readTable_(ss, 'Actions')),
      communications: readTable_(ss, 'Communications'),
      money: readTable_(ss, 'Money')
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function readTable_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(v => String(v || '').trim());
  return values.slice(1)
    .filter(row => row.some(v => String(v || '').trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = row[i] || ''; });
      return obj;
    });
}

function normalizeProjects_(rows) {
  const ar = {
    'Bitumen':'البيتومين','Sulfur':'الكبريت','Electric Buses':'الحافلات الكهربائية',
    'Solar Irrigation':'الري الشمسي','Soda Ash':'كربونات الصوديوم','Dates Export':'التمور'
  };
  return rows.map(r => ({
    id: r['Project ID'] || '',
    name: r['Project'] || '',
    nameAr: ar[r['Project']] || r['Project'] || '',
    category: r['Category'] || '',
    market: r['Market'] || '',
    status: r['Status'] || '',
    priority: r['Priority'] || '',
    stage: r['Stage'] || '',
    deadline: r['Deadline'] || '',
    folder: r['Project Folder'] || '',
    sheet: r['Primary File'] || '',
    score: r['Score'] || '',
    nextAction: r['Next Action'] || '',
    lastUpdate: r['Last Update'] || '',
    notes: r['Notes'] || ''
  }));
}

function normalizeActions_(rows) {
  return rows.map(r => ({
    id: r['Action ID'] || '',
    projectId: r['Project ID'] || '',
    action: r['Action'] || '',
    priority: r['Priority'] || '',
    status: r['Status'] || '',
    dueDate: r['Due Date'] || '',
    relatedCompany: r['Related Company'] || '',
    owner: r['Owner'] || ''
  }));
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
