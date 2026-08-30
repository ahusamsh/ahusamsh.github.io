refreshData = async function () {
  const badge = $('#syncBadge');
  let detail = document.querySelector('#syncDetail');
  if (!detail) {
    detail = document.createElement('div');
    detail.id = 'syncDetail';
    detail.style.cssText = 'font-size:12px;color:#9aa7b5;margin-top:7px;text-align:left;max-width:230px;direction:rtl;line-height:1.5';
    const actions = document.querySelector('.top-actions');
    if (actions) actions.appendChild(detail);
  }

  const url = state.data?.liveApi?.url;
  const token = state.data?.liveApi?.token;
  if (!url || !token) {
    badge.textContent = 'Snapshot';
    badge.className = 'sync-badge snapshot';
    detail.textContent = 'إعداد الربط الحي غير موجود في البيانات المشفّرة.';
    return false;
  }

  badge.textContent = 'جارٍ الربط…';
  badge.className = 'sync-badge snapshot';
  detail.textContent = 'الاتصال بـ Google Sheets…';

  try {
    const live = await liveFetch();
    if (live) {
      state.data = normalize({ ...state.data, ...live, liveApi: state.data.liveApi });
      render();
      badge.textContent = 'Live';
      badge.className = 'sync-badge live';
      detail.textContent = 'متصل بالبيانات الحية · ' + new Date().toLocaleTimeString('ar-SA', {hour:'2-digit', minute:'2-digit'});
      return true;
    }
    throw new Error('Empty live response');
  } catch (e) {
    const msg = String(e?.message || e || 'Unknown error');
    badge.textContent = 'Snapshot';
    badge.className = 'sync-badge snapshot';
    if (/Unauthorized/i.test(msg)) detail.textContent = 'فشل الربط: رمز ACCESS_TOKEN غير مطابق.';
    else if (/timeout/i.test(msg)) detail.textContent = 'فشل الربط: انتهت المهلة ولم يصل رد من Apps Script.';
    else if (/load failed/i.test(msg)) detail.textContent = 'فشل الربط: تعذر تحميل Apps Script من المتصفح.';
    else if (/Invalid API response/i.test(msg)) detail.textContent = 'فشل الربط: Apps Script ردّ بصيغة غير صالحة.';
    else detail.textContent = 'فشل الربط: ' + msg.slice(0, 140);
    console.warn('Investment HQ live sync:', e);
    return false;
  }
};
