/* Keyloop renderer — all vault crypto lives in the main process; this file
   only renders metadata + live codes it receives over IPC. */
const $ = (id) => document.getElementById(id);
const K = window.keyloop;

const IDLE_LOCK_MS = 5 * 60 * 1000;
let accounts = [];
let codes = new Map();
let codeTimer = null;
let idleTimer = null;
let scannedUri = null;

// ── helpers ──────────────────────────────────────────────────────────────────
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function colorFor(name) {
  const palette = ['#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb7185', '#4ade80', '#38bdf8'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

async function unwrap(promise) {
  const res = await promise;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

// ── lock / unlock ────────────────────────────────────────────────────────────
async function refreshLockScreen() {
  const st = await unwrap(K.status());
  const isNew = !st.exists;
  $('lock-subtitle').textContent = isNew
    ? 'First run — choose a master password. It encrypts your vault and cannot be recovered.'
    : 'Your 2FA codes. Local. Encrypted. Exportable.';
  $('master-password2').classList.toggle('hidden', !isNew);
  $('unlock-btn').textContent = isNew ? 'Create vault' : 'Unlock';
  return isNew;
}

async function doUnlock() {
  const pw = $('master-password').value;
  const isNew = !(await unwrap(K.status())).exists;
  $('lock-error').textContent = '';
  try {
    if (isNew) {
      if (pw !== $('master-password2').value) throw new Error('passwords do not match');
      await unwrap(K.create(pw));
    } else {
      await unwrap(K.unlock(pw));
    }
    $('master-password').value = '';
    $('master-password2').value = '';
    showMain();
  } catch (e) {
    $('lock-error').textContent = e.message;
  }
}

async function lockNow() {
  await K.lock();
  clearInterval(codeTimer);
  clearTimeout(idleTimer);
  $('main-screen').classList.add('hidden');
  $('lock-screen').classList.remove('hidden');
  await refreshLockScreen();
  $('master-password').focus();
}

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockNow, IDLE_LOCK_MS);
}

// ── main view ────────────────────────────────────────────────────────────────
async function showMain() {
  $('lock-screen').classList.add('hidden');
  $('main-screen').classList.remove('hidden');
  await reload();
  clearInterval(codeTimer);
  codeTimer = setInterval(tick, 1000);
  resetIdle();
  tick();
}

async function reload() {
  accounts = await unwrap(K.list());
  renderAccounts();
}

async function tick() {
  try {
    const list = await unwrap(K.codes());
    codes = new Map(list.map((c) => [c.id, c]));
    for (const a of accounts) {
      const c = codes.get(a.id);
      if (!c) continue;
      const codeEl = document.querySelector(`[data-code="${a.id}"]`);
      const ring = document.querySelector(`[data-ring="${a.id}"]`);
      if (codeEl && !codeEl.classList.contains('copied')) {
        codeEl.textContent = c.code.replace(/(\d{3})(?=\d)/g, '$1 ');
      }
      if (ring) {
        const frac = c.remaining / a.period;
        const circ = 2 * Math.PI * 13;
        ring.querySelector('.fg').style.strokeDashoffset = String(circ * (1 - frac));
        ring.classList.toggle('low', c.remaining <= 5);
      }
    }
  } catch { /* locked mid-tick */ }
}

function renderAccounts() {
  const q = $('search').value.toLowerCase();
  const list = accounts.filter((a) => `${a.issuer} ${a.label}`.toLowerCase().includes(q));
  $('empty-state').classList.toggle('hidden', accounts.length > 0);
  const circ = 2 * Math.PI * 13;
  $('accounts').innerHTML = list.map((a) => {
    const name = a.issuer || a.label || '?';
    const initials = name.slice(0, 2).toUpperCase();
    return `
      <div class="account" data-id="${a.id}">
        <div class="avatar" style="background:${colorFor(name)}">${initials}</div>
        <div class="acc-meta">
          <div class="acc-issuer">${escapeHtml(a.issuer || a.label)}</div>
          <div class="acc-label">${escapeHtml(a.issuer ? a.label : '')}</div>
        </div>
        <span class="code" data-code="${a.id}" title="Click to copy">··· ···</span>
        <svg class="ring" data-ring="${a.id}" viewBox="0 0 34 34">
          <circle class="bg" cx="17" cy="17" r="13" fill="none" stroke-width="3"></circle>
          <circle class="fg" cx="17" cy="17" r="13" fill="none" stroke-width="3"
            stroke-dasharray="${circ}" stroke-dashoffset="0" transform="rotate(-90 17 17)"></circle>
        </svg>
        <button class="del" data-del="${a.id}" title="Delete account">🗑</button>
      </div>`;
  }).join('');

  document.querySelectorAll('[data-code]').forEach((el) => {
    el.addEventListener('click', async () => {
      const c = codes.get(el.dataset.code);
      if (!c) return;
      await navigator.clipboard.writeText(c.code);
      el.classList.add('copied');
      const orig = el.textContent;
      el.textContent = 'copied ✓';
      setTimeout(() => { el.classList.remove('copied'); el.textContent = orig; }, 900);
      setTimeout(async () => {
        try { if ((await navigator.clipboard.readText()) === c.code) await navigator.clipboard.writeText(''); } catch {}
      }, 20000);
    });
  });
  document.querySelectorAll('[data-del]').forEach((el) => {
    el.addEventListener('click', async () => {
      const a = accounts.find((x) => x.id === el.dataset.del);
      if (!confirm(`Delete ${a.issuer || a.label}? Make sure you have another way into that account.`)) return;
      await unwrap(K.remove(a.id));
      await reload();
      toast('Account deleted');
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── add modal ────────────────────────────────────────────────────────────────
function openAdd() {
  scannedUri = null;
  $('add-error').textContent = '';
  $('qr-result').textContent = '';
  ['add-issuer', 'add-label', 'add-secret', 'add-uri'].forEach((id) => ($(id).value = ''));
  $('add-modal').classList.remove('hidden');
  $('add-issuer').focus();
}

let activeTab = 'manual';
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.add('hidden'));
    $(`pane-${activeTab}`).classList.remove('hidden');
  });
});

async function scanImageFile(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const result = window.jsQR(data.data, canvas.width, canvas.height);
  if (!result || !result.data.startsWith('otpauth://')) throw new Error('no otpauth QR code found in that image');
  return result.data;
}

$('qr-file').addEventListener('change', async (e) => {
  try {
    scannedUri = await scanImageFile(e.target.files[0]);
    $('qr-result').textContent = `✓ found: ${scannedUri.slice(0, 60)}…`;
  } catch (err) {
    scannedUri = null;
    $('qr-result').textContent = err.message;
  }
});
const drop = $('qr-drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  try {
    scannedUri = await scanImageFile(e.dataTransfer.files[0]);
    $('qr-result').textContent = `✓ found: ${scannedUri.slice(0, 60)}…`;
  } catch (err) {
    scannedUri = null;
    $('qr-result').textContent = err.message;
  }
});

$('add-save').addEventListener('click', async () => {
  $('add-error').textContent = '';
  try {
    if (activeTab === 'manual') {
      await unwrap(K.add({
        issuer: $('add-issuer').value,
        label: $('add-label').value,
        secret: $('add-secret').value,
        digits: $('add-digits').value,
        period: $('add-period').value,
        algorithm: $('add-algo').value
      }));
    } else if (activeTab === 'uri') {
      await unwrap(K.addUri($('add-uri').value.trim()));
    } else {
      if (!scannedUri) throw new Error('scan a QR image first');
      await unwrap(K.addUri(scannedUri));
    }
    $('add-modal').classList.add('hidden');
    await reload();
    tick();
    toast('Account added — encrypted on disk');
  } catch (e) {
    $('add-error').textContent = e.message;
  }
});

// ── backup menu ──────────────────────────────────────────────────────────────
$('backup-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('backup-menu').classList.toggle('hidden');
});
document.addEventListener('click', () => $('backup-menu').classList.add('hidden'));

function promptPw(title, hint, { textarea = false } = {}) {
  return new Promise((resolve) => {
    $('pw-title').textContent = title;
    $('pw-hint').textContent = hint;
    $('pw-error').textContent = '';
    $('pw-input').value = '';
    $('pw-textarea').value = '';
    $('pw-input').classList.toggle('hidden', textarea);
    $('pw-textarea').classList.toggle('hidden', !textarea);
    $('pw-modal').classList.remove('hidden');
    (textarea ? $('pw-textarea') : $('pw-input')).focus();
    const done = (v) => { $('pw-modal').classList.add('hidden'); cleanupHandlers(); resolve(v); };
    const onGo = () => done(textarea ? $('pw-textarea').value : $('pw-input').value);
    const onClose = (ev) => { if (ev.target.dataset.close !== undefined) done(null); };
    function cleanupHandlers() {
      $('pw-go').removeEventListener('click', onGo);
      $('pw-modal').removeEventListener('click', onClose);
    }
    $('pw-go').addEventListener('click', onGo);
    $('pw-modal').addEventListener('click', onClose);
  });
}

$('export-btn').addEventListener('click', async () => {
  const pw = await promptPw('Export encrypted backup', 'Choose a backup password (8+ chars). The .keyloop file is AES-256 encrypted — useless without it.');
  if (!pw) return;
  try {
    const fp = await unwrap(K.exportBackup(pw));
    if (fp) toast(`Backup saved: ${fp}`);
  } catch (e) { toast(e.message); }
});

$('import-btn').addEventListener('click', async () => {
  const pw = await promptPw('Import backup', 'Enter the backup password for the .keyloop file you are about to open.');
  if (!pw) return;
  try {
    const r = await unwrap(K.importBackup(pw));
    if (r) { await reload(); tick(); toast(`Imported ${r.added} of ${r.total} accounts`); }
  } catch (e) { toast(e.message); }
});

$('import-uri-btn').addEventListener('click', async () => {
  const text = await promptPw('Import otpauth:// URIs', 'Paste one otpauth://totp/... URI per line (export format of most authenticator apps).', { textarea: true });
  if (!text) return;
  try {
    const r = await unwrap(K.importUris(text));
    await reload();
    tick();
    toast(`Imported ${r.added} of ${r.total} accounts`);
  } catch (e) { toast(e.message); }
});

$('qr-sheet-btn').addEventListener('click', async () => {
  try {
    const sheet = await unwrap(K.qrSheet());
    if (!sheet.length) return toast('Nothing to print yet');
    $('print-sheet').innerHTML =
      '<h2 style="grid-column:1/-1">Keyloop paper backup — ' + new Date().toLocaleDateString() +
      ' — store somewhere SAFE: these QR codes contain your raw 2FA secrets</h2>' +
      sheet.map((s) => `<div class="qr-cell"><img src="${s.qr}" /><div>${escapeHtml(s.issuer)}<br>${escapeHtml(s.label)}</div></div>`).join('');
    window.print();
    setTimeout(() => ($('print-sheet').innerHTML = ''), 2000);
  } catch (e) { toast(e.message); }
});

// ── wiring ───────────────────────────────────────────────────────────────────
$('unlock-btn').addEventListener('click', doUnlock);
$('master-password').addEventListener('keydown', (e) => e.key === 'Enter' && doUnlock());
$('master-password2').addEventListener('keydown', (e) => e.key === 'Enter' && doUnlock());
$('lock-btn').addEventListener('click', lockNow);
$('add-btn').addEventListener('click', openAdd);
$('search').addEventListener('input', renderAccounts);
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('.overlay').classList.add('hidden')));
for (const ev of ['mousemove', 'keydown', 'click']) document.addEventListener(ev, resetIdle);

refreshLockScreen();
