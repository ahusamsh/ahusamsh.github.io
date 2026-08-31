/**
 * Investment HQ — direct read-only dashboard relay + Gmail tracker.
 * Architecture: GitHub PWA -> Apps Script -> Google Sheets (+ Gmail sync).
 * Deploy as Web App: Execute as "Me"; access "Anyone".
 * Script Properties:
 *   MASTER_SHEET_ID = Investment HQ Master spreadsheet id
 *   ACCESS_TOKEN    = private dashboard API token
 * Optional:
 *   OWNER_EMAIL     = mailbox address used to determine reply direction
 */

const DASHBOARD_URL_ = 'https://darbpath.com/investment-hq/';
const EMAIL_TRACKER_SHEET_ = 'Email Tracker';
const EMAIL_TRACKER_HEADERS_ = [
  'Thread ID','Project ID','Project','Gmail Label','Subject','Counterparty',
  'Last Direction','Last Sender','Last Message At','Reply Status','Replied','Thread Link'
];

function doGet() {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_top"><title>Investment HQ</title></head>' +
    '<body style="margin:0;background:#000;color:#fff;font-family:ui-monospace,Consolas,monospace">' +
    '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box">' +
    '<a href="' + DASHBOARD_URL_ + '" target="_top" style="color:#55ff88;text-decoration:none;border:1px solid #55ff88;padding:12px 16px">[ فتح لوحة الاستثمار ]</a>' +
    '</main></body></html>'
  ).setTitle('Investment HQ');
}

function doPost(e) {
  const mode = String((e && e.parameter && e.parameter.mode) || '');
  if (mode !== 'relay') return relayOutput_({ ok:false, error:'Invalid relay mode' }, e);
  return relayOutput_(buildPayload_(e), e);
}

function relayOutput_(payload, e) {
  const nonce = String((e && e.parameter && e.parameter.nonce) || '')
    .replace(/[^0-9a-f]/gi,'').slice(0,64);
  const envelope = JSON.stringify({ payload:payload });
  const gz = Utilities.gzip(Utilities.newBlob(envelope,'application/json'));
  const encoded = Utilities.base64EncodeWebSafe(gz.getBytes()).replace(/=+$/,'');
  const destination = DASHBOARD_URL_ + '#ihq=' + encoded + '&n=' + nonce;
  const safeHref = escapeHtml_(destination);
  const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"><title>Investment HQ</title></head>' +
    '<body style="margin:0;background:#000;color:#fff;font-family:ui-monospace,Consolas,monospace">' +
    '<main style="min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box">' +
    '<section style="width:min(92vw,390px);border:1px solid #333;padding:22px;box-sizing:border-box">' +
    '<div style="color:#55ff88;margin-bottom:14px">● SYNC COMPLETE</div>' +
    '<a href="' + safeHref + '" target="_top" rel="noreferrer" style="display:block;border:1px solid #55ff88;color:#55ff88;padding:13px;text-align:center;text-decoration:none">[ العودة للوحة ]</a>' +
    '</section></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Investment HQ');
}

function escapeHtml_(value) {
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildPayload_(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = String(props.getProperty('ACCESS_TOKEN') || '');
    const supplied = String((e && e.parameter && e.parameter.token) || '');
    if (!expected || !safeEqual_(supplied, expected)) return { ok:false, error:'Unauthorized' };

    const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
    if (!spreadsheetId) return { ok:false, error:'MASTER_SHEET_ID is not configured' };

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const projectRows = readTable_(ss,'Projects');
    let emails = [];
    let emailSyncError = '';
    try {
      emails = syncEmailTracker_(ss, projectRows, props);
    } catch (err) {
      emailSyncError = String(err && err.message || err);
      emails = normalizeEmailTracker_(readTable_(ss, EMAIL_TRACKER_SHEET_));
    }

    return {
      ok:true,
      generatedAt:new Date().toISOString(),
      projects:normalizeProjects_(projectRows),
      actions:normalizeActions_(readTable_(ss,'Actions')),
      emails:emails,
      emailSyncError:emailSyncError
    };
  } catch (err) {
    return { ok:false, error:String(err && err.message || err) };
  }
}

/** Run once from the Apps Script editor to authorize Gmail + Sheets and install a 15-minute sync. */
function installEmailSyncTrigger() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
  if (!spreadsheetId) throw new Error('MASTER_SHEET_ID is not configured');
  GmailApp.getInboxThreads(0,1);
  const ss = SpreadsheetApp.openById(spreadsheetId);
  syncEmailTracker_(ss, readTable_(ss,'Projects'), props);
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'syncEmailTrackerScheduled_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncEmailTrackerScheduled_').timeBased().everyMinutes(15).create();
}

function syncEmailTrackerScheduled_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = String(props.getProperty('MASTER_SHEET_ID') || '');
  if (!spreadsheetId) return;
  const ss = SpreadsheetApp.openById(spreadsheetId);
  syncEmailTracker_(ss, readTable_(ss,'Projects'), props);
}

function syncEmailTracker_(ss, projectRows, props) {
  const owner = String(
    props.getProperty('OWNER_EMAIL') || Session.getEffectiveUser().getEmail() || 'ahusamalshiekh@gmail.com'
  ).toLowerCase();
  const seen = {};
  const out = [];

  projectRows.forEach(function(p){
    const projectId = String(p['Project ID'] || '').trim();
    const projectName = String(p['Arabic Name'] || p['Project'] || '').trim();
    const labelName = String(p['Gmail Label'] || '').trim();
    if (!projectId || !labelName) return;
    const label = GmailApp.getUserLabelByName(labelName);
    if (!label) return;

    let start = 0;
    while (start < 300) {
      const threads = label.getThreads(start,100);
      if (!threads.length) break;
      threads.forEach(function(thread){
        const threadId = thread.getId();
        if (seen[threadId]) return;
        seen[threadId] = true;
        const messages = thread.getMessages();
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const from = String(last.getFrom() || '');
        const subject = String(last.getSubject() || '');
        const fromUs = from.toLowerCase().indexOf(owner) !== -1;
        const bounced = isBounce_(from, subject);
        const status = bounced ? 'BOUNCED' : (fromUs ? 'WAITING_EXTERNAL' : 'NEEDS_OUR_REPLY');
        const counterparty = fromUs ? String(last.getTo() || '') : from;
        out.push({
          threadId:threadId,
          projectId:projectId,
          project:projectName,
          gmailLabel:labelName,
          subject:subject,
          counterparty:counterparty,
          lastDirection:fromUs ? 'Outbound' : 'Inbound',
          lastSender:from,
          lastMessageAt:last.getDate().toISOString(),
          replyStatus:status,
          replied:fromUs ? 'YES' : 'NO',
          threadLink:'https://mail.google.com/mail/u/0/#all/' + threadId
        });
      });
      if (threads.length < 100) break;
      start += threads.length;
    }
  });

  out.sort(function(a,b){ return String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)); });
  writeEmailTracker_(ss, out);
  return out.slice(0,120);
}

function writeEmailTracker_(ss, rows) {
  let sh = ss.getSheetByName(EMAIL_TRACKER_SHEET_);
  if (!sh) sh = ss.insertSheet(EMAIL_TRACKER_SHEET_);
  sh.clearContents();
  sh.getRange(1,1,1,EMAIL_TRACKER_HEADERS_.length).setValues([EMAIL_TRACKER_HEADERS_]);
  if (rows.length) {
    const values = rows.map(function(r){ return [
      r.threadId,r.projectId,r.project,r.gmailLabel,r.subject,r.counterparty,
      r.lastDirection,r.lastSender,r.lastMessageAt,r.replyStatus,r.replied,r.threadLink
    ]; });
    sh.getRange(2,1,values.length,EMAIL_TRACKER_HEADERS_.length).setValues(values);
  }
  sh.setFrozenRows(1);
}

function normalizeEmailTracker_(rows) {
  return rows.map(function(r){ return {
    threadId:r['Thread ID']||'', projectId:r['Project ID']||'', project:r['Project']||'',
    gmailLabel:r['Gmail Label']||'', subject:r['Subject']||'', counterparty:r['Counterparty']||'',
    lastDirection:r['Last Direction']||'', lastSender:r['Last Sender']||'', lastMessageAt:r['Last Message At']||'',
    replyStatus:r['Reply Status']||'', replied:r['Replied']||'', threadLink:r['Thread Link']||''
  }; });
}

function isBounce_(from, subject) {
  const s = (String(from||'') + ' ' + String(subject||'')).toLowerCase();
  return s.indexOf('mailer-daemon') !== -1 || s.indexOf('mail delivery subsystem') !== -1 ||
    s.indexOf('delivery status notification') !== -1 || s.indexOf('undeliver') !== -1 || s.indexOf('delivery failure') !== -1;
}

function readTable_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function(v){ return String(v || '').trim(); });
  return values.slice(1).filter(function(row){
    return row.some(function(v){ return String(v || '').trim() !== ''; });
  }).map(function(row){
    const obj = {};
    headers.forEach(function(h,i){ if (h) obj[h] = row[i] || ''; });
    return obj;
  });
}

function normalizeProjects_(rows) {
  return rows.map(function(r){ return {
    id:r['Project ID']||'',
    name:r['Project']||'',
    nameAr:r['Arabic Name']||r['Project']||'',
    category:r['Category']||'',
    market:r['Market']||'',
    status:r['Status']||'',
    priority:r['Priority']||'',
    stage:r['Stage']||'',
    deadline:r['Deadline']||'',
    score:r['Score']||'',
    nextAction:r['Next Action']||'',
    lastUpdate:r['Last Update']||'',
    gmailLabel:r['Gmail Label']||''
  }; });
}

function normalizeActions_(rows) {
  return rows.map(function(r){ return {
    id:r['Action ID']||'', projectId:r['Project ID']||'', action:r['Action']||'', priority:r['Priority']||'', status:r['Status']||'',
    dueDate:r['Due Date']||'', relatedCompany:r['Related Company']||'', owner:r['Owner']||''
  }; });
}

function safeEqual_(a,b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
