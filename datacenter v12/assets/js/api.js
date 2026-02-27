
// Replace this with your deployed GAS web app URL (the one ending with /exec)
const API_BASE = 'https://script.google.com/macros/s/AKfycbxKm72cfcsF1QRTjoKmk60grmu7VPTMIblOpIjpJwZN_ru5xldiOjTfGgnB5F3aJjA2hQ/exec';

async function apiGet(params) {
  const url = new URL(API_BASE);
  Object.keys(params || {}).forEach(k => {
    if (params[k] !== undefined && params[k] !== null) {
      url.searchParams.set(k, params[k]);
    }
  });
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

async function apiPost(fn, body) {
  const url = new URL(API_BASE);
  url.searchParams.set('fn', fn);

  const res = await fetch(url.toString(), {
    method: 'POST',
    // 不手動設定 Content-Type，讓瀏覽器自動帶 text/plain，
    // 這樣就不會觸發 CORS preflight。
    body: JSON.stringify(body || {})
  });

  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}


// Student APIs
async function authStudent(cls, name, pin) {
  return await apiPost('auth', { class: cls, name: name, pin: pin });
}

async function getEvents(cls, name) {
  return await apiGet({ fn: 'events', class: cls, name: name });
}

async function getEvent(eventId) {
  return await apiGet({ fn: 'event', id: eventId });
}

async function getStudentLatestAll(cls, name) {
  return await apiGet({ fn: 'latestAll', class: cls, name: name });
}

async function getRoster() {
  return await apiGet({ fn: 'roster' });
}

async function postReply(payload) {
  return await apiPost('reply', payload);
}

// Admin APIs
async function authAdmin(adminToken) {
  return await apiPost('auth', { adminToken });
}

async function adminSummary(adminToken) {
  return await apiGet({ fn: 'adminSummary', adminToken });
}

async function adminEventDetail(adminToken, eventId) {
  return await apiGet({
    fn: 'adminEventDetail',
    adminToken,
    eventId
  });
}