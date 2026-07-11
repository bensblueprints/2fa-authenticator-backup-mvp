// Keyloop — local encrypted TOTP authenticator.
// Main process owns the vault (key never enters the renderer); the renderer
// gets codes + metadata over IPC. No network access anywhere in this app.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { TOTP } = require('otpauth');
const QRCode = require('qrcode');
const { Vault, parseOtpauthUri, accountToUri } = require('./src/vault');

let win;
let vault;

const SMOKE_BOOT = process.argv.includes('--smoke-boot');

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: 'Keyloop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  vault = new Vault(path.join(app.getPath('userData'), 'keyloop.vault'));
  createWindow();
  if (SMOKE_BOOT) {
    // Boot verification for CI: window created + vault module loaded → exit clean.
    setTimeout(() => {
      console.log('BOOT_OK');
      app.exit(0);
    }, 1500);
  }
});

app.on('window-all-closed', () => app.quit());

function codeFor(a) {
  const totp = new TOTP({ secret: a.secret, digits: a.digits, period: a.period, algorithm: a.algorithm });
  return totp.generate();
}

function publicAccount(a) {
  // secret stays in the main process — renderer gets metadata + live codes only
  return { id: a.id, issuer: a.issuer, label: a.label, digits: a.digits, period: a.period, algorithm: a.algorithm, added_at: a.added_at };
}

const ok = (data) => ({ ok: true, data });
const fail = (e) => ({ ok: false, error: e.message });

ipcMain.handle('vault:status', () => ok({ exists: vault.exists(), unlocked: vault.unlocked }));

ipcMain.handle('vault:create', (e, password) => {
  try { vault.create(password); return ok(true); } catch (err) { return fail(err); }
});

ipcMain.handle('vault:unlock', (e, password) => {
  try { vault.unlock(password); return ok(true); } catch (err) { return fail(err); }
});

ipcMain.handle('vault:lock', () => { vault.lock(); return ok(true); });

ipcMain.handle('accounts:list', () => {
  try { return ok(vault.list().map(publicAccount)); } catch (err) { return fail(err); }
});

ipcMain.handle('accounts:codes', () => {
  try {
    const now = Date.now();
    return ok(vault.list().map((a) => ({
      id: a.id,
      code: codeFor(a),
      remaining: a.period - (Math.floor(now / 1000) % a.period)
    })));
  } catch (err) { return fail(err); }
});

ipcMain.handle('accounts:add', (e, input) => {
  try { return ok(publicAccount(vault.add(input))); } catch (err) { return fail(err); }
});

ipcMain.handle('accounts:addUri', (e, uri) => {
  try { return ok(publicAccount(vault.add(parseOtpauthUri(uri)))); } catch (err) { return fail(err); }
});

ipcMain.handle('accounts:update', (e, id, patch) => {
  try { return ok(publicAccount(vault.update(id, patch))); } catch (err) { return fail(err); }
});

ipcMain.handle('accounts:remove', (e, id) => {
  try { vault.remove(id); return ok(true); } catch (err) { return fail(err); }
});

// ── backup / restore ─────────────────────────────────────────────────────────
ipcMain.handle('backup:export', async (e, backupPassword) => {
  try {
    const json = vault.exportBackup(backupPassword);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save encrypted backup',
      defaultPath: `keyloop-backup-${new Date().toISOString().slice(0, 10)}.keyloop`,
      filters: [{ name: 'Keyloop backup', extensions: ['keyloop'] }]
    });
    if (canceled) return ok(false);
    fs.writeFileSync(filePath, json);
    return ok(filePath);
  } catch (err) { return fail(err); }
});

ipcMain.handle('backup:import', async (e, backupPassword) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Open encrypted backup',
      filters: [{ name: 'Keyloop backup', extensions: ['keyloop', 'json'] }],
      properties: ['openFile']
    });
    if (canceled) return ok(false);
    const accounts = Vault.readBackup(fs.readFileSync(filePaths[0], 'utf8'), backupPassword);
    const added = vault.importAccounts(accounts);
    return ok({ added, total: accounts.length });
  } catch (err) { return fail(err); }
});

ipcMain.handle('backup:importUris', (e, text) => {
  try {
    const uris = String(text).split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('otpauth://'));
    const parsed = uris.map(parseOtpauthUri);
    const added = vault.importAccounts(parsed);
    return ok({ added, total: uris.length });
  } catch (err) { return fail(err); }
});

// Printable QR sheet: data-URL QR per account (offline paper backup)
ipcMain.handle('backup:qrSheet', async () => {
  try {
    const out = [];
    for (const a of vault.list()) {
      out.push({
        issuer: a.issuer,
        label: a.label,
        qr: await QRCode.toDataURL(accountToUri(a), { width: 220, margin: 1 })
      });
    }
    return ok(out);
  } catch (err) { return fail(err); }
});
