/**
 * Investment HQ — read-only Google Sheets endpoint for the PWA.
 * Deploy as Web App: Execute as "Me"; access "Anyone".
 * Script Properties:
 *   MASTER_SHEET_ID = <Investment HQ Master spreadsheet id>
 *   ACCESS_TOKEN    = <private dashboard API token>
 *
 * Supports JSON and JSONP. JSONP is used by the GitHub Pages dashboard
 * so live sync works across origins without relying on CORS headers.
 */
function doGet(e) {
  let payload;
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = String(props.getProperty('ACCESS_TOKEN') || '');
    const supplied = String((e && e.parameter && e.parameter.token) || '');

    if (!expected || !safeEqual_(supplied, expected)) {
      payload = { ok: false, error: 'Unauthorized' };
      return output_(payload, e);
    }

    const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
    if (!spreadsheetId) {
      payload = { ok: false, error: 'MASTER_SHEET_ID is not configured' };
      return output_(payload, e);
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'Investment HQ - Master Control Center',
      projects: normalizeProjects_(readTable_(ss, 'Projects')),
      actions: normalizeActions_(readTable_(ss, 'Actions')),
      communications: readTable_(ss, 'Communications'),
      money: readTable_(ss, 'Money')
    };
  } catch (err) {
    payload = { ok: false, error: String(err && err.message || err) };
  }

  return output_(payload, e);
}

function output_(data, e) {
  const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');

  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      return ContentService.createTextOutput('/* invalid callback */')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
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
