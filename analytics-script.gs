// ============================================
// Google Apps Script - Analytics Tracker for Darb | Path
// Deploy this as a Web App in Google Apps Script
// ============================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your Google Sheet ID

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter;
  const action = params.action;

  try {
    if (action === 'track') {
      return trackEvent(params);
    } else if (action === 'getData') {
      return getData(params);
    }
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Track a page visit or event
function trackEvent(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('analytics');

  // Create sheet if not exists
  if (!sheet) {
    sheet = ss.insertSheet('analytics');
    sheet.appendRow([
      'timestamp', 'event_type', 'page', 'referrer',
      'user_agent', 'language', 'screen_width', 'country',
      'ref_code', 'session_id'
    ]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  }

  const now = new Date();
  const timestamp = Utilities.formatDate(now, 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    timestamp,
    params.event_type || 'page_view',
    params.page || '',
    params.referrer || '',
    params.user_agent || '',
    params.language || '',
    params.screen_width || '',
    params.country || '',
    params.ref_code || '',
    params.session_id || ''
  ]);

  return jsonResponse({ status: 'ok' });
}

// Get analytics data for dashboard
function getData(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('analytics');

  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ events: [], summary: getEmptySummary() });
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Build events array
  const events = rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  // Calculate summary
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const summary = {
    total_views: events.filter(e => e.event_type === 'page_view').length,
    total_form_opens: events.filter(e => e.event_type === 'form_open').length,
    total_form_submits: events.filter(e => e.event_type === 'form_submit').length,
    today_views: events.filter(e => e.event_type === 'page_view' && new Date(e.timestamp) >= today).length,
    today_submits: events.filter(e => e.event_type === 'form_submit' && new Date(e.timestamp) >= today).length,
    week_views: events.filter(e => e.event_type === 'page_view' && new Date(e.timestamp) >= weekAgo).length,
    month_views: events.filter(e => e.event_type === 'page_view' && new Date(e.timestamp) >= monthAgo).length,
    unique_sessions: [...new Set(events.map(e => e.session_id))].length,

    // Page breakdown
    pages: {},
    // Daily breakdown (last 30 days)
    daily: {},
    // Referrer breakdown
    referrers: {},
    // Ref codes
    ref_codes: {},
    // Languages
    languages: {}
  };

  events.forEach(e => {
    // Pages
    const page = e.page || 'unknown';
    if (!summary.pages[page]) summary.pages[page] = { views: 0, form_opens: 0, form_submits: 0 };
    if (e.event_type === 'page_view') summary.pages[page].views++;
    if (e.event_type === 'form_open') summary.pages[page].form_opens++;
    if (e.event_type === 'form_submit') summary.pages[page].form_submits++;

    // Daily
    const day = String(e.timestamp).substring(0, 10);
    if (!summary.daily[day]) summary.daily[day] = { views: 0, submits: 0 };
    if (e.event_type === 'page_view') summary.daily[day].views++;
    if (e.event_type === 'form_submit') summary.daily[day].submits++;

    // Referrers
    if (e.referrer && e.event_type === 'page_view') {
      try {
        const host = e.referrer.includes('//') ? new URL(e.referrer).hostname : e.referrer;
        summary.referrers[host] = (summary.referrers[host] || 0) + 1;
      } catch (_) {
        summary.referrers[e.referrer] = (summary.referrers[e.referrer] || 0) + 1;
      }
    }

    // Ref codes
    if (e.ref_code) {
      summary.ref_codes[e.ref_code] = (summary.ref_codes[e.ref_code] || 0) + 1;
    }

    // Languages
    if (e.language && e.event_type === 'page_view') {
      summary.languages[e.language] = (summary.languages[e.language] || 0) + 1;
    }
  });

  return jsonResponse({ summary: summary, total_events: events.length });
}

function getEmptySummary() {
  return {
    total_views: 0, total_form_opens: 0, total_form_submits: 0,
    today_views: 0, today_submits: 0, week_views: 0, month_views: 0,
    unique_sessions: 0, pages: {}, daily: {}, referrers: {}, ref_codes: {}, languages: {}
  };
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
