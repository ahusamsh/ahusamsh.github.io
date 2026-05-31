// =========================================================================
// Google Apps Script - Unified Script (Applications + Analytics + Referrals)
// Deploy this as a Web App in Google Apps Script (extensions -> Apps Script)
// =========================================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your Google Sheet ID or leave empty to use active spreadsheet

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
    // 1. If action is track (Analytics page views / form opens)
    if (action === 'track') {
      return trackEvent(params);
    } 
    // 2. If action is getData (Retrieve dashboard data)
    else if (action === 'getData') {
      return getData(params);
    } 
    // 3. If action is getApplicationStats (Retrieve referrals submissions counts for admin)
    else if (action === 'getApplicationStats') {
      return getApplicationStats();
    }
    // 4. Default: If sheet is 'applications' or it's a form submission (has full_name)
    else if (params.sheet === 'applications' || (!action && params.full_name)) {
      return saveApplication(params);
    }

    return jsonResponse({ error: 'Unknown action or invalid parameters' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Get Active Spreadsheet
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// 1. Track a page visit or event
function trackEvent(params) {
  const ss = getSpreadsheet();
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

  return jsonResponse({ status: 'ok', message: 'Event tracked successfully' });
}

// 2. Get analytics data for dashboard
function getData(params) {
  const ss = getSpreadsheet();
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
      const codeUpper = String(e.ref_code).trim().toUpperCase();
      summary.ref_codes[codeUpper] = (summary.ref_codes[codeUpper] || 0) + 1;
    }

    // Languages
    if (e.language && e.event_type === 'page_view') {
      summary.languages[e.language] = (summary.languages[e.language] || 0) + 1;
    }
  });

  return jsonResponse({ summary: summary, total_events: events.length });
}

// 3. Get application stats (Referral code submissions counts)
function getApplicationStats() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('applications');
  const stats = { ref_codes: {} };

  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse(stats);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const refCodeIndex = headers.indexOf('referral_code');

  if (refCodeIndex === -1) {
    return jsonResponse(stats);
  }

  const rows = data.slice(1);
  rows.forEach(row => {
    const code = row[refCodeIndex];
    if (code) {
      const codeUpper = String(code).trim().toUpperCase();
      if (codeUpper) {
        stats.ref_codes[codeUpper] = (stats.ref_codes[codeUpper] || 0) + 1;
      }
    }
  });

  return jsonResponse(stats);
}

// 4. Save form application submission
function saveApplication(params) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('applications');

  // Create sheet if not exists
  if (!sheet) {
    sheet = ss.insertSheet('applications');
    sheet.appendRow([
      'timestamp', 'language', 'full_name', 'email', 'phone', 'whatsapp',
      'dob', 'nationality', 'country', 'gender', 'program', 'arrival_date',
      'accommodation', 'arabic_level', 'goals', 'referral', 'requirements',
      'notes', 'emergency_name', 'emergency_relation', 'emergency_phone',
      'referral_code', 'referral_source', 'referral_discount'
    ]);
    sheet.getRange(1, 1, 1, 24).setFontWeight('bold');
  }

  sheet.appendRow([
    params.timestamp || Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss'),
    params.language || '',
    params.full_name || '',
    params.email || '',
    params.phone || '',
    params.whatsapp || '',
    params.dob || '',
    params.nationality || '',
    params.country || '',
    params.gender || '',
    params.program || '',
    params.arrival_date || '',
    params.accommodation || '',
    params.arabic_level || '',
    params.goals || '',
    params.referral || '',
    params.requirements || '',
    params.notes || '',
    params.emergency_name || '',
    params.emergency_relation || '',
    params.emergency_phone || '',
    params.referral_code || '',
    params.referral_source || '',
    params.referral_discount || ''
  ]);

  return jsonResponse({ result: 'success', message: 'Data saved to applications sheet' });
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
