/** Investment HQ — Direct Apps Script dashboard (read-only) */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Investment HQ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function getDashboardData(accessKey) {
  const props = PropertiesService.getScriptProperties();
  const expected = String(props.getProperty('DASHBOARD_KEY') || props.getProperty('ACCESS_TOKEN') || '');
  if (!expected || !safeEqual_(String(accessKey || ''), expected)) {
    throw new Error('Unauthorized');
  }

  const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
  if (!spreadsheetId) throw new Error('MASTER_SHEET_ID is not configured');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    projects: normalizeProjects_(readTable_(ss, 'Projects')),
    actions: normalizeActions_(readTable_(ss, 'Actions')),
    communications: readTable_(ss, 'Communications'),
    money: readTable_(ss, 'Money')
  };
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
    nextAction: r['Next Action'] || '',
    lastUpdate: r['Last Update'] || ''
  }));
}

function normalizeActions_(rows) {
  return rows.map(r => ({
    id: r['Action ID'] || '',
    projectId: r['Project ID'] || '',
    action: r['Action'] || '',
    priority: r['Priority'] || '',
    status: r['Status'] || '',
    dueDate: r['Due Date'] || ''
  }));
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
