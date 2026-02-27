function showToast(message, timeoutMs) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.add('hidden');
  }, timeoutMs || 2500);
}

function setHidden(idOrEl, hidden) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  if (hidden) el.classList.add('hidden');
  else el.classList.remove('hidden');
}

/**
 * 動態塞進按鈕 loading 用的樣式：
 * - .btn-loading：變淡＋不能點擊
 * - .btn-spinner：右邊的小圈圈旋轉
 */
function ensureButtonLoadingStyles() {
  if (document.getElementById('btn-loading-style')) return;

  const style = document.createElement('style');
  style.id = 'btn-loading-style';
  style.textContent = `
.btn-loading {
  opacity: 0.7;
  cursor: default;
  pointer-events: none;
}
.btn-loading .btn-label {
  display: inline-block;
  margin-left: 0.35rem;
}
.btn-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: btn-spin 0.6s linear infinite;
  vertical-align: -0.125em;
}
@keyframes btn-spin {
  to { transform: rotate(360deg); }
}
`;
  if (document.head) {
    document.head.appendChild(style);
  }
}

/**
 * 切換按鈕的「載入中」狀態：
 * - isLoading = true  → 按鈕變淡、禁用、右邊出現小圈圈
 * - isLoading = false → 還原原本內容與狀態
 *
 * 已經在 student.js / admin.js 裡面，有像這樣呼叫：
 *   setButtonLoading(submitBtn, true);
 *   ...
 *   setButtonLoading(submitBtn, false);
 */
function setButtonLoading(button, isLoading) {
  if (!button) return;

  const btn = button;

  if (isLoading) {
    // 已經在 loading 狀態就不要重複套用
    if (btn.dataset && btn.dataset.loading === '1') return;

    ensureButtonLoadingStyles();

    if (!btn.dataset) btn.dataset = {};
    btn.dataset.loading = '1';
    btn.dataset.originalHtml = btn.innerHTML;

    btn.disabled = true;
    btn.classList.add('btn-loading');

    const label = btn.textContent || '';
    btn.innerHTML =
      '<span class="btn-spinner" aria-hidden="true"></span>' +
      '<span class="btn-label">' + label + '</span>';
  } else {
    if (!btn.dataset || btn.dataset.loading !== '1') return;

    btn.disabled = false;
    btn.classList.remove('btn-loading');

    if (btn.dataset.originalHtml != null) {
      btn.innerHTML = btn.dataset.originalHtml;
    }

    delete btn.dataset.loading;
    delete btn.dataset.originalHtml;
  }
}
