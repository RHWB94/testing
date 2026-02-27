// Simple state helpers for student/admin sessions

const STORAGE_KEYS = {
  student: 'renhe_replies_student',
  admin: 'renhe_replies_admin'
};

// ======= 學生登入：本來就用 sessionStorage，是正確的 =======

function saveStudentSession(cls, name) {
  const obj = { class: cls, name: name };
  try {
    sessionStorage.setItem(STORAGE_KEYS.student, JSON.stringify(obj));
  } catch (e) {}
}

function getStudentSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.student);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearStudentSession() {
  try { sessionStorage.removeItem(STORAGE_KEYS.student); } catch (e) {}
  try { localStorage.removeItem(STORAGE_KEYS.student); } catch (e) {}
}


// ======= 管理員登入：改為 sessionStorage（重點） =======

function saveAdminSession(token) {
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.admin,
      JSON.stringify({ adminToken: token })
    );
  } catch (e) {}
}

function getAdminSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.admin);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearAdminSession() {
  try { sessionStorage.removeItem(STORAGE_KEYS.admin); } catch (e) {}
}
