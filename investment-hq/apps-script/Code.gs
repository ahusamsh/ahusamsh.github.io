/**
 * Investment HQ — read-only Google Sheets API for the PWA.
 * Deploy as Web App: Execute as "Me"; access "Anyone".
 * Set Script Properties:
 *   MASTER_SHEET_ID = <Investment HQ Master spreadsheet id>
 *   ACCESS_TOKEN    = <same private token you keep on your device>
 */
function doGet(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = String(props.getProperty('ACCESS_TOKEN') || '');
    const supplied = String((e && e.parameter && e.parameter.token) || '');
    if (!expected || !safeEqual_(supplied, expected)) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
    if (!spreadsheetId) return json_({ ok: false, error: 'MASTER_SHEET_ID is not configured' });

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const projects = normalizeProjects_(readTable_(ss, 'Projects'));
    const actions = normalizeActions_(readTable_(ss, 'Actions'));
    const communications = readTable_(ss, 'Communications');
    const money = readTable_(ss, 'Money');

    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'Investment HQ - Master Control Center',
      projects: projects,
      actions: actions,
      communications: communications,
      money: money
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
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

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
