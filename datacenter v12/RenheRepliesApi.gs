
/**
 * Renhe Replies API (GAS) - Sheet-aligned version
 * Timezone: Asia/Taipei
 *
 * Sheets structure (must match your Google Sheet):
 *  Config:    eventId, title, startAt, deadline, allowEdit, statDescription, status, date, place, contact
 *  Roster:    class, name, pin, enabled
 *  Replies:   ts, eventId, class, name, answer, email, ua
 *  Latest:    eventId, studentKey, class, name, lastReplyTs, answer
 *  Auditlog:  ts, actor, action, eventId, detail
 */
const TZ = 'Asia/Taipei';

function _props() {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (!p.SPREADSHEET_ID || !p.ADMIN_TOKEN) {
    throw new Error('Missing Script Properties: SPREADSHEET_ID / ADMIN_TOKEN');
  }
  return p;
}
function _ss() { return SpreadsheetApp.openById(_props().SPREADSHEET_ID); }

// IMPORTANT: sheet names must match your spreadsheet exactly.
const SHEETS = {
  CONFIG:  'Config',
  ROSTER:  'Roster',
  REPLIES: 'Replies',
  LATEST:  'Latest',
  AUDIT:   'Auditlog' // <- NOTICE: matches your sheet name (Auditlog)
};

function _nowISO(){ return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function _json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function _readSheet(name){
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  const rows = sh.getDataRange().getValues();
  if (!rows.length) return [];
  const header = rows.shift().map(String);
  return rows
    .filter(r => r.some(c => String(c).trim() !== '')) // skip fully empty rows
    .map(r => Object.fromEntries(header.map((h,i)=>[h, r[i]])));
}

function _append(name, obj){
  const sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  const header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const row = header.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sh.appendRow(row);
}

/**
 * Upsert into Latest sheet which has header:
 *  eventId, studentKey, class, name, lastReplyTs, answer
 */
function _upsertLatest(payload){
  const sh = _ss().getSheetByName(SHEETS.LATEST);
  if (!sh) throw new Error('Sheet not found: ' + SHEETS.LATEST);
  const data = sh.getDataRange().getValues();
  if (!data.length) {
    throw new Error('Latest sheet has no header row');
  }
  const header = data[0].map(String);
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  const eventId = String(payload.eventId || '');
  const cls = String(payload.class || '');
  const name = String(payload.name || '');

  // find existing row
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) { // start from row 1 (skip header)
    const row = data[i];
    const match =
      String(row[idx['eventId']] || '') === eventId &&
      String(row[idx['class']]   || '') === cls &&
      String(row[idx['name']]    || '') === name;
    if (match) {
      targetRow = i + 1; // 1-based row index in sheet
      break;
    }
  }

  // build row according to header
  const values = header.map(function(h){
    if (h === 'eventId')      return eventId;
    if (h === 'class')        return cls;
    if (h === 'name')         return name;
    if (h === 'studentKey')   return cls + '-' + name;
    if (h === 'lastReplyTs')  return payload.ts || '';
    if (h === 'answer')       return payload.answer || '';
    // fallback: if payload has a matching property, use it; otherwise empty
    return (payload[h] !== undefined ? payload[h] : '');
  });

  if (targetRow > 0) {
    sh.getRange(targetRow, 1, 1, header.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }
}

/**
 * Audit log aligned to your Auditlog sheet:
 *  ts, actor, action, eventId, detail
 */
function _audit(role, id, action, payload){
  const actor = (role || '') + ':' + (id || '');
  const detail = payload ? JSON.stringify(payload) : '';
  _append(SHEETS.AUDIT, {
    ts: _nowISO(),
    actor: actor,
    action: action,
    eventId: (payload && payload.eventId) || '',
    detail: detail
  });
}

function _isAdminToken(token){ return token && token === _props().ADMIN_TOKEN; }

function _findRoster(cls, name, pin){
  const roster = _readSheet(SHEETS.ROSTER);
  return roster.find(function(r){
    return String(r.class)   === String(cls) &&
           String(r.name)    === String(name) &&
           String(r.pin)     === String(pin) &&
           String(r.enabled).toLowerCase() !== 'false'; // '是' will be treated as enabled
  });
}

// Return enabled roster (only class + name) for dropdowns
function _getPublicRoster(){
  const roster = _readSheet(SHEETS.ROSTER);
  return roster
    .filter(function(r){
      return String(r.enabled).toLowerCase() !== 'false';
    })
    .map(function(r){
      return {
        class: r.class,
        name: r.name
      };
    });
}

function _getOpenEvents(){
  return _readSheet(SHEETS.CONFIG).filter(function(r){
    return String(r.status).toLowerCase() === 'open';
  });
}
function _getEventById(id){
  return _readSheet(SHEETS.CONFIG).find(function(r){
    return String(r.eventId) === String(id);
  });
}
function _getStudentLatestAll(cls, name){
  return _readSheet(SHEETS.LATEST).filter(function(r){
    return String(r.class) === String(cls) && String(r.name) === String(name);
  });
}

function _parseBool(val){
  const s = String(val || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === '是';
}
function _deadlinePassed(ev){
  if (!ev || !ev.deadline) return false;
  try {
    // deadline is something like "2025-10-14 23:59:00"
    const d = new Date(ev.deadline);
    if (!d || isNaN(d.getTime())) return false;
    return new Date() > d;
  } catch(e){
    return false;
  }
}

/* --- Handlers --- */
function handleAuth(payload){
  const cls = payload && payload.class;
  const name = payload && payload.name;
  const pin = payload && payload.pin;
  const adminToken = payload && payload.adminToken;

  if (adminToken && _isAdminToken(adminToken)) {
    _audit('admin','admin','auth',{mode:'admin'});
    return { ok:true, role:'admin' };
  }
  if (!cls || !name || !pin || String(pin).length !== 5) {
    return { ok:false, error:'INVALID_CREDENTIALS' };
  }
  const user = _findRoster(cls, name, pin);
  if (!user) {
    return { ok:false, error:'NOT_FOUND_OR_DISABLED' };
  }
  _audit('student', cls + '-' + name, 'auth', {mode:'student'});
  return { ok:true, role:'student', class:cls, name:name };
}

function handleGetEvents(){
  return { ok:true, events:_getOpenEvents() };
}
function handleGetEvent(query){
  const ev = _getEventById(query && query.id);
  return ev ? { ok:true, event:ev } : { ok:false, error:'EVENT_NOT_FOUND' };
}
function handleLatestAll(query){
  const cls = query && query.class;
  const name = query && query.name;
  if (!cls || !name) return { ok:false, error:'MISSING_STUDENT' };
  return { ok:true, latest:_getStudentLatestAll(cls, name) };
}

function handleGetRoster(){
  return { ok:true, roster:_getPublicRoster() };
}

function handlePostReply(payload, actor){
  const eventId = payload && payload.eventId;
  const cls = payload && payload.class;
  const name = payload && payload.name;
  const answer = payload && payload.answer;

  if (!eventId || !cls || !name) return { ok:false, error:'MISSING_FIELDS' };
  const ev = _getEventById(eventId);
  if (!ev) return { ok:false, error:'EVENT_NOT_FOUND' };

  const isAdmin = actor && actor.role === 'admin';
  const ddlPassed = _deadlinePassed(ev);
  const allowEdit = _parseBool(ev.allowEdit); // '是' will be treated as true
  if (ddlPassed && !allowEdit && !isAdmin) {
    return { ok:false, error:'DEADLINE_PASSED' };
  }

  const ts = _nowISO();
  const answerStr = JSON.stringify(answer || {});

  // Append to Replies sheet: ts, eventId, class, name, answer, email, ua
  _append(SHEETS.REPLIES, {
    ts: ts,
    eventId: eventId,
    class: cls,
    name: name,
    answer: answerStr
    // email, ua will be left empty by _append default
  });

  // Upsert into Latest sheet
  _upsertLatest({
    ts: ts,
    eventId: eventId,
    class: cls,
    name: name,
    answer: answerStr
  });

  _audit(actor.role, actor.id, 'reply', { eventId:eventId, class:cls, name:name });
  return { ok:true, ts:ts };
}

function handleAdminStudentLatestAll(query, actor){
  if (!actor || actor.role !== 'admin') return { ok:false, error:'FORBIDDEN' };
  const cls = query && query.class;
  const name = query && query.name;
  if (!cls || !name) return { ok:false, error:'MISSING_STUDENT' };
  return { ok:true, latest:_getStudentLatestAll(cls, name) };
}

function handleAdminReply(payload, actor){
  if (!actor || actor.role !== 'admin') return { ok:false, error:'FORBIDDEN' };
  return handlePostReply(payload, actor);
}

function handleAdminSummary(query, actor){
  if (!actor || actor.role !== 'admin') return { ok:false, error:'FORBIDDEN' };

  const events = _readSheet(SHEETS.CONFIG);
  const roster = _readSheet(SHEETS.ROSTER).filter(function(r){
    return String(r.enabled).toLowerCase() !== 'false';
  });
  const latest = _readSheet(SHEETS.LATEST);

  const byEvent = {};
  events.forEach(function(e){
    const eid = String(e.eventId);
    const repliedSet = new Set(
      latest
        .filter(function(l){ return String(l.eventId) === eid; })
        .map(function(l){ return String(l.class) + '|' + String(l.name); })
    );
    const total = roster.length;
    const replied = repliedSet.size;
    byEvent[eid] = {
      event: e,
      totalRoster: total,
      replied: replied,
      replyRate: total ? Math.round(replied / total * 100) : 0
    };
  });
  return { ok:true, summary:{ byEvent: byEvent } };
}

function handleAdminExportCSV(query, actor){
  if (!actor || actor.role !== 'admin') return { ok:false, error:'FORBIDDEN' };
  const eventId = query && query.eventId;
  if (!eventId) return { ok:false, error:'MISSING_EVENT_ID' };

  const sh = _ss().getSheetByName(SHEETS.LATEST);
  if (!sh) throw new Error('Sheet not found: ' + SHEETS.LATEST);
  const data = sh.getDataRange().getValues();
  if (!data.length) return { ok:true, csv:'' };

  const header = data[0].map(String);
  const idxMap = Object.fromEntries(header.map(function(h,i){ return [h,i]; }));
  const rows = data.slice(1).filter(function(row){
    return String(row[idxMap['eventId']] || '') === String(eventId);
  });

  const lines = [];
  lines.push(header.join(','));

  rows.forEach(function(row){
    const line = header.map(function(h, i){
      const v = row[i] == null ? '' : String(row[i]);
      const needQuote = /[",\n]/.test(v);
      const inner = v.replace(/"/g, '""');
      return needQuote ? '"' + inner + '"' : v;
    }).join(',');
    lines.push(line);
  });

  return { ok:true, csv: lines.join('\n') };
}

/* --- Router --- */
function doGet(e){
  try {
    const fn = (e && e.parameter && e.parameter.fn) || '';
    const adminToken = e && e.parameter && e.parameter.adminToken;
    const actor = (adminToken && _isAdminToken(adminToken)) ? {role:'admin', id:'admin'} : {role:'public', id:'anon'};
    let out;
    switch (fn) {
      case 'events':                out = handleGetEvents(); break;
      case 'event':                 out = handleGetEvent(e.parameter); break;
      case 'latestAll':             out = handleLatestAll(e.parameter); break;
      case 'roster':                out = handleGetRoster(); break;
      case 'adminStudentLatestAll': out = handleAdminStudentLatestAll(e.parameter, actor); break;
      case 'adminSummary':          out = handleAdminSummary(e.parameter, actor); break;
      case 'adminExportCSV':        out = handleAdminExportCSV(e.parameter, actor); break;
      default:
        out = { ok:false, error:'UNKNOWN_GET_ROUTE' };
    }
    return _json(out);
  } catch(err) {
    return _json({ ok:false, error:String(err) });
  }
}

function doPost(e){
  try {
    const fn = (e && e.parameter && e.parameter.fn) || '';
    const body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    const adminToken = (body && body.adminToken) || (e && e.parameter && e.parameter.adminToken);
    let actor = { role:'student', id:String((body.class || '') + '-' + (body.name || '')) };
    if (adminToken && _isAdminToken(adminToken)) actor = { role:'admin', id:'admin' };
    let out;
    switch (fn) {
      case 'auth':       out = handleAuth(body); break;
      case 'reply':      out = handlePostReply(body, actor); break;
      case 'adminReply': out = handleAdminReply(body, actor); break;
      default:
        out = { ok:false, error:'UNKNOWN_POST_ROUTE' };
    }
    return _json(out);
  } catch(err) {
    return _json({ ok:false, error:String(err) });
  }
}
