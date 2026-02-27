// Per-event form definitions.
// Key: eventId (from Config sheet), or "default" as fallback.
const FORM_DEFINITIONS = {
  default: {
    title: '活動回條',
    fields: [
      {
        id: 'attend',
        label: '是否參加本次活動？',
        type: 'radio',
        options: ['會參加', '不克前往']
      },
      {
        id: 'note',
        label: '備註（可不填）',
        type: 'textarea',
        placeholder: '如有特殊情況或家長留言，請在此說明'
      }
    ]
  },

  // 範例：家長同意書的專屬表單（請記得在 Config 中新增對應 eventId）
  '20250301-consent': {
    title: '家長線上同意書',
    fields: [
      {
        id: 'content',
        type: 'textblock',
        value: '這裡放同意書內文，可以很多行，系統會自動換行顯示。'
      },
      {
        id: 'agree',
        type: 'checkbox',
        label: '我已閱讀並同意上述內容'
      },
      {
        id: 'parentName',
        type: 'text',
        label: '家長姓名',
        placeholder: '請輸入家長姓名'
      },
      {
        id: 'signature',
        type: 'signature',
        label: '家長簽名'
      }
    ]
  }
  // 在此可針對特定 eventId 客製化，例如：
  // '20251015-camp': { ... }

};

function isConsentEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return id.endsWith('-consent');
}

// ✅ 僅特定活動要顯示「去程/回程搭乘遊覽車」選項
// 請把下面的 '2025-trip-consent' 改成你這次活動的 eventId（可加多個）
const BUS_TRIP_EVENT_IDS = ['20260307-consent', '20260307c-consent', '20260316a-consent', '20260316b-consent', '20260316c-consent'];

// ✅ 僅特定活動要顯示「家長是否搭乘遊覽車 + 人數（上限5）」
const PARENT_BUS_EVENT_IDS = ['20260316a-consent', '20260316b-consent', '20260316c-consent'
  // 在此加入需要顯示家長搭乘欄位的 eventId
];
function isParentBusEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return PARENT_BUS_EVENT_IDS.includes(id);
}

function isBusTripEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return BUS_TRIP_EVENT_IDS.includes(id);
}

let _eventsCache = [];
let _latestCache = [];
let _currentEvent = null;
let _rosterByClass = {}; // { className: [ '學生A', '學生B', ... ] }

// 統一簽名圖的解析度，避免不同裝置大小不一致
const SIGNATURE_WIDTH = 960;
const SIGNATURE_HEIGHT = 540;


// 匯出時再壓縮成較小的圖，確保 Base64 長度不會太長
const SIGNATURE_EXPORT_WIDTH = 480;
const SIGNATURE_EXPORT_HEIGHT = 270;

// 簽名板：canvas 畫線，回傳壓縮過的 JPEG dataURL
function initSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  let isEmpty = true;

  function resize() {
    const ratio = window.devicePixelRatio || 1;

    // 真實畫布固定解析度，確保不同裝置畫出來一致
    canvas.width = SIGNATURE_WIDTH * ratio;
    canvas.height = SIGNATURE_HEIGHT * ratio;

    // 視覺尺寸填滿外層 wrapper
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }

  function getPos(evt) {
    const rect = canvas.getBoundingClientClientRect ? canvas.getBoundingClientRect() : canvas.getBoundingClientRect();
    const hasTouch = evt.touches && evt.touches.length > 0;
    const point = hasTouch ? evt.touches[0] : evt;

    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;

    const scaleX = rect.width ? (SIGNATURE_WIDTH / rect.width) : 1;
    const scaleY = rect.height ? (SIGNATURE_HEIGHT / rect.height) : 1;

    return {
      x: x * scaleX,
      y: y * scaleY
    };
  }

  function startDraw(evt) {
    drawing = true;
    const pos = getPos(evt);
    lastX = pos.x;
    lastY = pos.y;
  }

  function draw(evt) {
    if (!drawing) return;
    const pos = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
    isEmpty = false;
  }

  function endDraw() {
    drawing = false;
  }

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDraw(e);
  });
  canvas.addEventListener('mousemove', (e) => {
    e.preventDefault();
    draw(e);
  });
  window.addEventListener('mouseup', () => {
    endDraw();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDraw(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    endDraw();
  }, { passive: false });

  // 初始尺寸
  resize();
  window.addEventListener('resize', () => {
    resize();
  });

  function clear() {
    isEmpty = true;
    resize();
  }

  // 匯出時：先縮成較小畫布 + JPEG 壓縮，避免超過 Google Sheet 每格 50000 字元限制
  function getDataURL() {
    if (isEmpty) return '';

    const tmp = document.createElement('canvas');
    tmp.width = SIGNATURE_EXPORT_WIDTH;
    tmp.height = SIGNATURE_EXPORT_HEIGHT;
    const tctx = tmp.getContext('2d');

    // 白底
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);
    // 把原始簽名等比例塞進匯出畫布
    tctx.drawImage(canvas, 0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);

    let quality = 0.8;
    let dataUrl = tmp.toDataURL('image/jpeg', quality);

    // 根據長度動態降低品質（dataUrl 字串本身長度，不是 byte，但足夠估算）
    while (dataUrl.length > 42000 && quality > 0.3) {
      quality -= 0.1;
      dataUrl = tmp.toDataURL('image/jpeg', quality);
    }

    return dataUrl;
  }

  return {
    clear,
    getDataURL,
    resize
  };
}



function buildDrivePreviewUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';

  // 已經是 preview 連結
  if (trimmed.includes('/preview')) {
    return trimmed;
  }

  // 標準：https://drive.google.com/file/d/FILE_ID/view?usp=xxx
  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)\//);
  if (fileMatch && fileMatch[1]) {
    return 'https://drive.google.com/file/d/' + fileMatch[1] + '/preview';
  }

  // 另一種：...open?id=FILE_ID 或 uc?export=download&id=FILE_ID
  const idMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (idMatch && idMatch[1]) {
    return 'https://drive.google.com/file/d/' + idMatch[1] + '/preview';
  }

  // 其他情況就原樣返回（例如已是可用的嵌入網址）
  return trimmed;
}


document.addEventListener('DOMContentLoaded', () => {
  // ⚠️ 原本這裡有 clearStudentSession()，會讓「登入後重新整理」也被登出
  // 已移除，改由下方依照 session 狀態決定是否清除快取

  const loginSection = document.getElementById('login-section');
  const studentSection = document.getElementById('student-section');

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

  const classSelect = document.getElementById('class-select');
  const nameSelect = document.getElementById('name-select');

  const studentNameEl = document.getElementById('student-name');
  const studentClassEl = document.getElementById('student-class');
  const logoutBtn = document.getElementById('logout-btn');

  const eventsListEl = document.getElementById('events-list');
  const eventsEmptyEl = document.getElementById('events-empty');

  const eventDetailSection = document.getElementById('event-detail-section');
  const backToEventsBtn = document.getElementById('back-to-events-btn');
  const eventTitleEl = document.getElementById('event-title');
  const eventMetaEl = document.getElementById('event-meta');
  const eventDescEl = document.getElementById('event-desc');
  const eventDeadlineInfoEl = document.getElementById('event-deadline-info');
  const eventFormContainer = document.getElementById('event-form-container');
  const eventStatusMessageEl = document.getElementById('event-status-message');

  function renderLoggedInView(student) {
    studentNameEl.textContent = student.name;
    studentClassEl.textContent = student.class;
    setHidden(loginSection, true);
    setHidden(studentSection, false);
  }

  function renderLoggedOutView() {
    setHidden(studentSection, true);
    setHidden(loginSection, false);
  }

  function buildClassOptions() {
    // 清空
    classSelect.innerHTML = '';
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = '請選擇班級';
    classSelect.appendChild(optPlaceholder);

    const classes = Object.keys(_rosterByClass).sort();
    classes.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });

    classSelect.disabled = false;
  }

  function buildNameOptions(cls, preselectName) {
    nameSelect.innerHTML = '';
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = cls ? '請選擇姓名' : '請先選擇班級';
    nameSelect.appendChild(optPlaceholder);

    if (!cls || !_rosterByClass[cls] || !_rosterByClass[cls].length) {
      nameSelect.disabled = true;
      return;
    }

    const names = Array.from(new Set(_rosterByClass[cls])).sort();
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (preselectName && preselectName === n) {
        opt.selected = true;
      }
      nameSelect.appendChild(opt);
    });
    nameSelect.disabled = false;
  }

  classSelect.addEventListener('change', () => {
    const cls = classSelect.value;
    buildNameOptions(cls, null);
  });

  // 載入 roster 並建立班級 / 姓名下拉選單
  async function loadRosterAndBuildSelects() {
    try {
      const res = await getRoster();
      if (!res.ok) throw new Error(res.error || 'roster error');
      const roster = res.roster || [];

      _rosterByClass = {};
      roster.forEach(r => {
        const cls = String(r.class || '').trim();
        const name = String(r.name || '').trim();
        if (!cls || !name) return;
        if (!_rosterByClass[cls]) _rosterByClass[cls] = [];
        _rosterByClass[cls].push(name);
      });

      buildClassOptions();

      // 初始狀態下姓名禁用，等選班級後再開啟
      buildNameOptions('', null);
    } catch (err) {
      console.error(err);
      classSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '載入名單失敗，請重新整理頁面';
      classSelect.appendChild(opt);
      classSelect.disabled = true;
      nameSelect.innerHTML = '';
      const opt2 = document.createElement('option');
      opt2.value = '';
      opt2.textContent = '無法載入姓名';
      nameSelect.appendChild(opt2);
    }
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.add('hidden');

    const cls = classSelect.value;
    const name = nameSelect.value;
    const pin = (new FormData(loginForm).get('pin') || '').toString().trim();

    if (!cls || !name || !pin) {
      loginError.textContent = '請完整選擇班級、姓名並輸入密碼。';
      loginError.classList.remove('hidden');
      return;
    }

    if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
      setButtonLoading(loginSubmitBtn, true);
    }

    try {
      const res = await authStudent(cls, name, pin);
      if (!res.ok) {
        if (res.error === 'INVALID_CREDENTIALS') {
          loginError.textContent = '帳號或密碼格式錯誤。';
        } else if (res.error === 'NOT_FOUND_OR_DISABLED') {
          loginError.textContent = '找不到此學生或帳號已停用，請確認班級、姓名與密碼。';
        } else {
          loginError.textContent = '登入失敗：' + (res.error || '未知錯誤');
        }
        loginError.classList.remove('hidden');
        return;
      }
      // ✅ 登入成功：存入 sessionStorage，讓重新整理可以保留登入
      saveStudentSession(res.class, res.name);
      renderLoggedInView({ class: res.class, name: res.name });
      showToast('登入成功');
      refreshEventsAndLatest();
    } catch (err) {
      console.error(err);
      loginError.textContent = '登入失敗（網路或系統錯誤）';
      loginError.classList.remove('hidden');
    } finally {
      if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
        setButtonLoading(loginSubmitBtn, false);
      }
    }
  });

  logoutBtn.addEventListener('click', () => {
    // ✅ 主動登出：清除當前學生登入狀態與相關快取
    clearStudentSession();
    _eventsCache = [];
    _latestCache = [];
    _currentEvent = null;
    eventsListEl.innerHTML = '';
    setHidden(eventDetailSection, true);

    // 回到登入視圖，並要求重新選擇班級與姓名
    renderLoggedOutView();
    if (loginForm) {
      loginForm.reset();
    }
    buildClassOptions();
    buildNameOptions('', null);

    showToast('已登出');
  });

  backToEventsBtn.addEventListener('click', () => {
    setHidden(eventDetailSection, true);
    const card = eventsListEl.closest('.card');
    if (card) {
      setHidden(card, false);
    }
    _currentEvent = null;
  });

  async function refreshEventsAndLatest() {
    const session = getStudentSession();
    if (!session) return;

    try {
      const [evRes, latestRes] = await Promise.all([
        getEvents(session.class, session.name),
        getStudentLatestAll(session.class, session.name)
      ]);

      if (!evRes.ok) throw new Error(evRes.error || 'events error');
      if (!latestRes.ok) throw new Error(latestRes.error || 'latest error');

      _eventsCache = evRes.events || [];
      _latestCache = latestRes.latest || [];

      renderEventsList();
    } catch (err) {
      console.error(err);
      showToast('讀取活動列表失敗');
    }
  }

  function findLatestForEvent(eventId) {
    return _latestCache.find(r => String(r.eventId) === String(eventId)) || null;
  }

  function renderEventsList() {
    eventsListEl.innerHTML = '';
    if (!_eventsCache.length) {
      eventsEmptyEl.classList.remove('hidden');
      return;
    }
    eventsEmptyEl.classList.add('hidden');

    _eventsCache.forEach(ev => {
      const latest = findLatestForEvent(ev.eventId);
      const hasReplied = !!latest;

      const card = document.createElement('div');
      card.className = 'event-card';

      const title = document.createElement('div');
      title.className = 'event-title';
      title.textContent = ev.title || ev.eventId;
      card.appendChild(title);

      const metaLine = document.createElement('div');
      metaLine.className = 'event-meta-line';
      const dateText = ev.date || ev.startAt || '';
      const placeText = ev.place || '';
      metaLine.textContent = [dateText, placeText].filter(Boolean).join('｜');
      card.appendChild(metaLine);

      const footer = document.createElement('div');
      footer.className = 'event-card-footer';

      const statusChip = document.createElement('span');
      statusChip.className = 'event-status-chip ' + (hasReplied ? 'done' : 'pending');
      statusChip.textContent = hasReplied ? '已填寫' : '尚未填寫';

      const btn = document.createElement('button');
      btn.className = 'btn primary small';
      btn.textContent = hasReplied ? '修改回條' : '填寫回條';
      btn.addEventListener('click', () => openEventDetail(ev.eventId, btn));

      footer.appendChild(statusChip);
      footer.appendChild(btn);
      card.appendChild(footer);

      eventsListEl.appendChild(card);
    });
  }

  async function openEventDetail(eventId, triggerBtn) {
    const session = getStudentSession();
    if (!session) {
      showToast('請先登入');
      return;
    }

    if (typeof setButtonLoading === 'function' && triggerBtn) {
      setButtonLoading(triggerBtn, true);
    }

    try {
      const res = await getEvent(eventId);
      if (!res.ok) {
        showToast('找不到此活動');
        return;
      }
      const ev = res.event;
      _currentEvent = ev;

      eventTitleEl.textContent = ev.title || ev.eventId;
      eventMetaEl.textContent = [ev.date || ev.startAt || '', ev.place || ''].filter(Boolean).join('｜');
      eventDescEl.textContent = ev.statDescription || '';

      // deadline display
      if (ev.deadline) {
        eventDeadlineInfoEl.textContent = '回覆截止時間：' + ev.deadline;
      } else {
        eventDeadlineInfoEl.textContent = '';
      }

      // 清空表單區，準備插入 PDF + 回條表單
      eventFormContainer.innerHTML = '';

      // 若此活動設定了 pdfUrl，則顯示 Google Drive PDF 預覽
      const rawPdfUrl = (ev.pdfUrl || '').toString().trim();
      if (rawPdfUrl) {
        const pdfWrapper = document.createElement('div');
        pdfWrapper.className = 'event-pdf-wrapper';

        const iframe = document.createElement('iframe');
        iframe.className = 'event-pdf-frame';
        iframe.src = buildDrivePreviewUrl(rawPdfUrl);
        iframe.width = '100%';
        iframe.height = (window.innerWidth && window.innerWidth < 640) ? '420' : '520';
        iframe.style.border = 'none';
        iframe.setAttribute('allow', 'autoplay');
        iframe.setAttribute('loading', 'lazy');

        pdfWrapper.appendChild(iframe);
        eventFormContainer.appendChild(pdfWrapper);
      }

      // Build form
      const def = FORM_DEFINITIONS[ev.eventId] || FORM_DEFINITIONS.default;
      const latest = findLatestForEvent(ev.eventId);
      let existingAnswer = {};
      if (latest && latest.answer) {
        try {
          existingAnswer = JSON.parse(latest.answer);
        } catch (_) {}
      }

      buildEventForm(def, existingAnswer, ev);

      const eventsCard = eventsListEl.closest('.card');
      if (eventsCard) {
        setHidden(eventsCard, true);
      }
      setHidden(eventDetailSection, false);
      eventStatusMessageEl.textContent = '';
    } catch (err) {
      console.error(err);
      showToast('讀取活動資料失敗');
    } finally {
      if (typeof setButtonLoading === 'function' && triggerBtn) {
        setButtonLoading(triggerBtn, false);
      }
    }
  }

  function buildEventForm(def, existingAnswer, ev) {
    // eventFormContainer 已在 openEventDetail 中清空並插入 PDF（若有）

    const form = document.createElement('form');
    form.className = 'form';

    const isConsent = isConsentEvent(ev);
    const isBusTripConsent = isConsent && isBusTripEvent(ev);

    // 儲存每個簽名欄位目前的狀態（值、pad 等）
    const signatureStates = {};

    (def.fields || []).forEach(field => {
      // 同意書活動：上半部只顯示「資訊」（textblock）
      if (isConsent && field.type !== 'textblock') {
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'form-field';

      // 純文字區塊（同意書內容）
      if (field.type === 'textblock') {
        if (field.label) {
          const title = document.createElement('div');
          title.textContent = field.label;
          wrapper.appendChild(title);
        }
        const text = document.createElement('div');
        text.className = 'textblock';
        text.textContent = field.value || '';
        wrapper.appendChild(text);
        form.appendChild(wrapper);
        return;
      }

      const label = document.createElement('label');
      label.textContent = field.label || '';
      wrapper.appendChild(label);

      if (field.type === 'radio') {
        const opts = document.createElement('div');
        opts.className = 'options';

        const current = (existingAnswer && existingAnswer[field.id]) || '';

        (field.options || []).forEach(opt => {
          const optLabel = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = field.id;
          input.value = opt;
          if (opt === current) input.checked = true;
          optLabel.appendChild(input);
          optLabel.appendChild(document.createTextNode(' ' + opt));
          opts.appendChild(optLabel);
        });

        wrapper.appendChild(opts);
      } else if (field.type === 'checkbox') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = field.id;

        const current = existingAnswer && existingAnswer[field.id];
        if (current === true || current === 'true' || current === '是' || current === 'on') {
          input.checked = true;
        }

        const checkboxLabel = document.createElement('label');
        checkboxLabel.appendChild(input);
        const text = field.checkboxLabel || field.label || '';
        if (text) {
          checkboxLabel.appendChild(document.createTextNode(' ' + text));
        }
        wrapper.innerHTML = '';
        wrapper.appendChild(checkboxLabel);
      } else if (field.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.name = field.id;
        textarea.placeholder = field.placeholder || '';
        textarea.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(textarea);
      } else if (field.type === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.placeholder = field.placeholder || '';
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      } else if (field.type === 'signature') {
        const existingDataUrl = (existingAnswer && existingAnswer[field.id]) || '';

        const container = document.createElement('div');
        container.className = 'signature-container';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn secondary small';
        openBtn.textContent = existingDataUrl ? '重新簽名' : '點擊簽名';

        const preview = document.createElement('div');
        preview.className = 'signature-preview';
        const img = document.createElement('img');
        preview.appendChild(img);

        container.appendChild(openBtn);
        container.appendChild(preview);
        wrapper.appendChild(container);

        const modal = document.createElement('div');
        modal.className = 'signature-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'signature-modal-content';

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'signature-canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'signature-canvas';
        canvasWrapper.appendChild(canvas);
        modalContent.appendChild(canvasWrapper);

        const footer = document.createElement('div');
        footer.className = 'signature-modal-footer';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn secondary small';
        resetBtn.textContent = '↻';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn secondary small';
        cancelBtn.textContent = 'X';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn primary small';
        okBtn.textContent = 'O';

        footer.appendChild(resetBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modalContent.appendChild(footer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        const pad = initSignaturePad(canvas);

        const state = {
          value: existingDataUrl || '',
          pad,
          modal,
          modalContent,
          canvasWrapper,
          openBtn,
          preview,
          img
        };
        signatureStates[field.id] = state;

        function updatePreview() {
          if (state.value) {
            state.img.src = state.value;
            state.preview.classList.remove('hidden');
            state.openBtn.textContent = '重新簽名';
          } else {
            state.img.src = '';
            state.preview.classList.add('hidden');
            state.openBtn.textContent = '點擊簽名';
          }
          state.openBtn.disabled = false;
        }

        function openModal() {
          state.modal.classList.add('active');
          state.openBtn.disabled = true;
          state.pad.clear();
          requestAnimationFrame(() => {
            state.pad.resize();
          });
        }

        function closeModal() {
          state.modal.classList.remove('active');
          state.openBtn.disabled = false;
        }

        updatePreview();

        openBtn.addEventListener('click', () => {
          openModal();
        });

        cancelBtn.addEventListener('click', () => {
          closeModal();
        });

        okBtn.addEventListener('click', () => {
          const dataUrl = state.pad.getDataURL();
          if (!dataUrl) {
            showToast('請先簽名');
            return;
          }
          state.value = dataUrl;
          updatePreview();
          closeModal();
        });

        resetBtn.addEventListener('click', () => {
          state.pad.clear();
        });

      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      }

      form.appendChild(wrapper);
    });

    // === 同意書專用下半部：是否同意 + (可選)遊覽車 + 50字備註 + 家長簽名 ===
    if (isConsent) {
      const consentSection = document.createElement('section');
      consentSection.className = 'reply-section';

      // 問句：是否同意 XXX 出席？
      const questionP = document.createElement('p');
      questionP.className = 'reply-question';

      const session = getStudentSession();
      const studentName = session && session.name ? session.name : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'reply-question-name';
      nameSpan.textContent = studentName;

      questionP.append('是否同意「');
      questionP.appendChild(nameSpan);
      questionP.append('」出席？');
      consentSection.appendChild(questionP);

      // 同意 / 不同意 選項
      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'reply-consent-options';

      const currentConsent = existingAnswer && existingAnswer.consentChoice;

      ['同意', '不同意'].forEach(val => {
        const optLabel = document.createElement('label');
        optLabel.className = 'reply-consent-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'consentChoice';
        input.value = val;
        if (currentConsent === val) {
          input.checked = true;
        }

        const span = document.createElement('span');
        span.className = 'reply-consent-label';
        span.textContent = val;

        optLabel.appendChild(input);
        optLabel.appendChild(span);
        optionsDiv.appendChild(optLabel);
      });

      consentSection.appendChild(optionsDiv);

      // ✅ 只有特定活動才顯示「去程/回程搭乘遊覽車」欄位
      if (isBusTripConsent) {
        const existingGoBus = existingAnswer && existingAnswer.goBus;
        const existingBackBus = existingAnswer && existingAnswer.backBus;

        // 去程
        const goWrapper = document.createElement('div');
        goWrapper.className = 'reply-bus-field';

        const goLabel = document.createElement('div');
        goLabel.className = 'reply-bus-label';
        goLabel.textContent = '學生去程搭乘遊覽車';
        goWrapper.appendChild(goLabel);

        const goOptions = document.createElement('div');
        goOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'goBus';
          input.value = val;
          if (existingGoBus === val) {
            input.checked = true;
          }

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          goOptions.appendChild(optLabel);
        });

        goWrapper.appendChild(goOptions);
        consentSection.appendChild(goWrapper);

        // 回程
        const backWrapper = document.createElement('div');
        backWrapper.className = 'reply-bus-field';

        const backLabel = document.createElement('div');
        backLabel.className = 'reply-bus-label';
        backLabel.textContent = '學生回程搭乘遊覽車';
        backWrapper.appendChild(backLabel);

        const backOptions = document.createElement('div');
        backOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'backBus';
          input.value = val;
          if (existingBackBus === val) {
            input.checked = true;
          }

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          backOptions.appendChild(optLabel);
        });

        backWrapper.appendChild(backOptions);
        consentSection.appendChild(backWrapper);
      }

      
      // 家長是否搭乘遊覽車（上限5人）
      const showParentBus = isConsent && isParentBusEvent(ev);
      if (showParentBus) {
        const existingParentBus = existingAnswer && existingAnswer.parentBus;
        const existingParentCount = existingAnswer && existingAnswer.parentBusCount;

        const parentWrapper = document.createElement('div');
        parentWrapper.className = 'reply-bus-field';

        const parentLabel = document.createElement('div');
        parentLabel.className = 'reply-bus-label';
        parentLabel.textContent = '家長是否搭乘遊覽車';
        parentWrapper.appendChild(parentLabel);

        const parentOptions = document.createElement('div');
        parentOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'parentBus';
          input.value = val;
          if (existingParentBus === val) input.checked = true;

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          parentOptions.appendChild(optLabel);
        });

        parentWrapper.appendChild(parentOptions);

        const countWrapper = document.createElement('div');
        countWrapper.className = 'reply-bus-field';
        countWrapper.style.display = existingParentBus === '是' ? '' : 'none';

        const countLabel = document.createElement('div');
        countLabel.className = 'reply-bus-label';
        countLabel.textContent = '搭乘人數（1-5人）';

        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.name = 'parentBusCount';
        countInput.min = '1';
        countInput.max = '5';
        countInput.value = existingParentCount || '';
        countInput.className = 'reply-parent-count-input';

        countWrapper.appendChild(countLabel);
        countWrapper.appendChild(countInput);

        parentWrapper.appendChild(countWrapper);
        consentSection.appendChild(parentWrapper);

        parentOptions.querySelectorAll('input[name="parentBus"]').forEach(r => {
          r.addEventListener('change', () => {
            if (r.value === '是' && r.checked) {
              countWrapper.style.display = '';
            } else if (r.value === '否' && r.checked) {
              countWrapper.style.display = 'none';
              countInput.value = '';
            }
          });
        });
      }

      // 備註（限 50 字）
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'reply-note-wrapper';

      const noteLabel = document.createElement('label');
      noteLabel.className = 'reply-note-label';
      noteLabel.textContent = '家長備註（限 50 字內）';

      const noteTextarea = document.createElement('textarea');
      noteTextarea.name = 'parentNote';
      noteTextarea.className = 'reply-note-textarea';
      noteTextarea.rows = 2;
      noteTextarea.maxLength = 50;
      noteTextarea.placeholder = '如有補充說明，請簡短填寫。';
      noteTextarea.value = (existingAnswer && existingAnswer.parentNote) || '';

      noteWrapper.appendChild(noteLabel);
      noteWrapper.appendChild(noteTextarea);
      consentSection.appendChild(noteWrapper);

      // 家長簽名
      const sigWrapper = document.createElement('div');
      sigWrapper.className = 'reply-signature-field';

      const sigLabel = document.createElement('div');
      sigLabel.textContent = '家長簽名';
      sigWrapper.appendChild(sigLabel);

      const container = document.createElement('div');
      container.className = 'signature-container';

      const existingSig = existingAnswer && (existingAnswer.parentSignature || existingAnswer.signature || '');

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn secondary small';
      openBtn.textContent = existingSig ? '重新簽名' : '點擊簽名';

      const preview = document.createElement('div');
      preview.className = 'signature-preview';
      const img = document.createElement('img');
      preview.appendChild(img);

      container.appendChild(openBtn);
      container.appendChild(preview);
      sigWrapper.appendChild(container);
      consentSection.appendChild(sigWrapper);

      const modal = document.createElement('div');
      modal.className = 'signature-modal';

      const modalContent = document.createElement('div');
      modalContent.className = 'signature-modal-content';

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'signature-canvas-wrapper';

      const canvas = document.createElement('canvas');
      canvas.className = 'signature-canvas';
      canvasWrapper.appendChild(canvas);
      modalContent.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'signature-modal-footer';

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn secondary small';
      resetBtn.textContent = '↻';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn secondary small';
      cancelBtn.textContent = 'X';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'btn primary small';
      okBtn.textContent = 'O';

      footer.appendChild(resetBtn);
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);
      modalContent.appendChild(footer);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      const pad = initSignaturePad(canvas);

      const state = {
        value: existingSig || '',
        pad,
        modal,
        modalContent,
        canvasWrapper,
        openBtn,
        preview,
        img
      };
      signatureStates['consentSignature'] = state;

      function updatePreview() {
        if (state.value) {
          state.img.src = state.value;
          state.preview.classList.remove('hidden');
          state.openBtn.textContent = '重新簽名';
        } else {
          state.img.src = '';
          state.preview.classList.add('hidden');
          state.openBtn.textContent = '點擊簽名';
        }
        state.openBtn.disabled = false;
      }

      function openModal() {
        state.modal.classList.add('active');
        state.openBtn.disabled = true;
        state.pad.clear();
        requestAnimationFrame(() => {
          state.pad.resize();
        });
      }

      function closeModal() {
        state.modal.classList.remove('active');
        state.openBtn.disabled = false;
      }

      updatePreview();

      openBtn.addEventListener('click', () => {
        openModal();
      });

      cancelBtn.addEventListener('click', () => {
        closeModal();
      });

      okBtn.addEventListener('click', () => {
        const dataUrl = state.pad.getDataURL();
        if (!dataUrl) {
          showToast('請先簽名');
          return;
        }
        state.value = dataUrl;
        updatePreview();
        closeModal();
      });

      resetBtn.addEventListener('click', () => {
        state.pad.clear();
      });

      form.appendChild(consentSection);
    } else {
      // 非同意書：保留家長備註欄位
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'form-field';

      const noteLabel = document.createElement('label');
      noteLabel.textContent = '家長備註（限 50 字內）';

      const noteTextarea = document.createElement('textarea');
      noteTextarea.name = 'parentNote';
      noteTextarea.rows = 2;
      noteTextarea.maxLength = 50;
      noteTextarea.placeholder = '如有補充說明，請簡短填寫。';
      noteTextarea.value = (existingAnswer && existingAnswer.parentNote) || '';

      noteWrapper.appendChild(noteLabel);
      noteWrapper.appendChild(noteTextarea);
      form.appendChild(noteWrapper);
    }

    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '0.8rem';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn primary full-width';
    submitBtn.textContent = '送出回條';
    btnRow.appendChild(submitBtn);
    form.appendChild(btnRow);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const session = getStudentSession();
      if (!session) {
        showToast('請先登入');
        return;
      }

      const answerObj = {};
      (def.fields || []).forEach(field => {
        if (field.type === 'radio') {
          const checked = form.querySelector(`input[name="${field.id}"]:checked`);
          answerObj[field.id] = checked ? checked.value : '';
        } else if (field.type === 'checkbox') {
          const el = form.querySelector(`input[name="${field.id}"]`);
          answerObj[field.id] = !!(el && el.checked);
        } else if (field.type === 'textarea' || field.type === 'text') {
          const el = form.querySelector(`[name="${field.id}"]`);
          answerObj[field.id] = el ? el.value : '';
        } else if (field.type === 'signature') {
          const state = signatureStates[field.id];
          answerObj[field.id] = state ? state.value : '';
        }
      });

      const noteEl = form.querySelector('textarea[name="parentNote"]');
      if (noteEl) {
        let txt = noteEl.value || '';
        if (txt.length > 50) {
          txt = txt.slice(0, 50);
        }
        answerObj.parentNote = txt;
      }

      if (isConsent) {
        const consentChecked = form.querySelector('input[name="consentChoice"]:checked');
        if (!consentChecked) {
          eventStatusMessageEl.textContent = '請選擇「同意」或「不同意」。';
          return;
        }
        answerObj.consentChoice = consentChecked.value;

        // ✅ 若是這次遊覽車活動，兩個欄位必填
        if (isBusTripConsent) {
          const goChecked = form.querySelector('input[name="goBus"]:checked');
          const backChecked = form.querySelector('input[name="backBus"]:checked');

          if (!goChecked) {
            eventStatusMessageEl.textContent = '請選擇「去程是否搭乘遊覽車」。';
            return;
          }
          if (!backChecked) {
            eventStatusMessageEl.textContent = '請選擇「回程是否搭乘遊覽車」。';
            return;
          }

          answerObj.goBus = goChecked.value;   // "是" or "否"
          answerObj.backBus = backChecked.value;
        }

        const sigState = signatureStates['consentSignature'];
        if (!sigState || !sigState.value) {
          eventStatusMessageEl.textContent = '請完成家長簽名。';
          return;
        }
        answerObj.parentSignature = sigState.value;
      }

      const answerJsonString = JSON.stringify(answerObj || {});
      if (answerJsonString.length > 48000) {
        eventStatusMessageEl.textContent = '簽名圖檔過大，請簽得稍微小一點或不要塗滿整個簽名區再試一次。';
        console.warn('answerJson too long:', answerJsonString.length);
        return;
      }

      if (typeof setButtonLoading === 'function') {
        setButtonLoading(submitBtn, true);
      }

      try {
        const res = await postReply({
          eventId: ev.eventId,
          class: session.class,
          name: session.name,
          answer: answerObj
        });
        if (!res.ok) {
          if (res.error === 'DEADLINE_PASSED') {
            eventStatusMessageEl.textContent = '已超過回覆截止時間，無法再送出或修改。';
          } else {
            eventStatusMessageEl.textContent = '送出失敗：' + (res.error || '未知錯誤');
          }
          return;
        }
        eventStatusMessageEl.textContent = '已成功送出回條（時間：' + res.ts + '）';
        showToast('送出成功');
        await refreshEventsAndLatest();
      } catch (err) {
        console.error(err);
        eventStatusMessageEl.textContent = '送出失敗（網路或系統錯誤）';
      } finally {
        if (typeof setButtonLoading === 'function') {
          setButtonLoading(submitBtn, false);
        }
      }
    });

    eventFormContainer.appendChild(form);
  }

  // ---- 頁面載入時：依照 session 狀態決定登入 / 未登入 ----
  const existingSession = getStudentSession();
  if (existingSession && existingSession.class && existingSession.name) {
    // ✅ 已登入：保持登入狀態（不清除 session / cache）
    renderLoggedInView({
      class: existingSession.class,
      name: existingSession.name
    });
    refreshEventsAndLatest();
  } else {
    // ✅ 未登入：視為未登入並清除殘留快取
    clearStudentSession();
    renderLoggedOutView();
  }

  // 不論登入與否，都需要載入名單來建立班級/姓名下拉
  loadRosterAndBuildSelects();
});
