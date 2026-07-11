// Keyloop encrypted vault — pure Node, no Electron dependency (unit-testable).
// File format (JSON): { version, kdf: {salt, N, r, p}, iv, tag, ciphertext }
// Crypto: scrypt(masterPassword) → 32-byte key, AES-256-GCM over the JSON
// account list. Nothing about accounts (issuer/label/secret) is stored in
// plaintext, and nothing is ever logged.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };

function deriveKey(password, saltHex, params = SCRYPT) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32, {
    N: params.N, r: params.r, p: params.p, maxmem: 128 * 1024 * 1024
  });
}

function encryptJson(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), ciphertext: ct.toString('base64') };
}

function decryptJson(key, { iv, tag, ciphertext }) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  const pt = Buffer.concat([d.update(Buffer.from(ciphertext, 'base64')), d.final()]);
  return JSON.parse(pt.toString('utf8'));
}

class Vault {
  constructor(filePath) {
    this.filePath = filePath;
    this.key = null;
    this.accounts = null; // [{id, issuer, label, secret, digits, period, algorithm, added_at}]
    this.kdf = null;
  }

  exists() {
    return fs.existsSync(this.filePath);
  }

  create(masterPassword) {
    if (this.exists()) throw new Error('vault already exists');
    if (String(masterPassword).length < 8) throw new Error('master password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    this.kdf = { salt, ...SCRYPT };
    this.key = deriveKey(masterPassword, salt);
    this.accounts = [];
    this._save();
  }

  unlock(masterPassword) {
    const file = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    const key = deriveKey(masterPassword, file.kdf.salt, file.kdf);
    let accounts;
    try {
      accounts = decryptJson(key, file);
    } catch {
      throw new Error('wrong master password');
    }
    this.key = key;
    this.kdf = file.kdf;
    this.accounts = accounts;
    return this.accounts;
  }

  lock() {
    if (this.key) this.key.fill(0);
    this.key = null;
    this.accounts = null;
  }

  get unlocked() {
    return this.key !== null;
  }

  _assertUnlocked() {
    if (!this.unlocked) throw new Error('vault is locked');
  }

  _save() {
    this._assertUnlocked();
    const payload = { version: 1, kdf: this.kdf, ...encryptJson(this.key, this.accounts) };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, this.filePath);
  }

  list() {
    this._assertUnlocked();
    return this.accounts;
  }

  add({ issuer = '', label = '', secret, digits = 6, period = 30, algorithm = 'SHA1' }) {
    this._assertUnlocked();
    const clean = String(secret || '').toUpperCase().replace(/[\s=-]/g, '');
    if (!/^[A-Z2-7]{8,}$/.test(clean)) throw new Error('secret must be base32 (A-Z, 2-7), 8+ chars');
    const account = {
      id: crypto.randomBytes(8).toString('hex'),
      issuer: String(issuer).slice(0, 100),
      label: String(label).slice(0, 100),
      secret: clean,
      digits: [6, 7, 8].includes(Number(digits)) ? Number(digits) : 6,
      period: Number(period) >= 5 && Number(period) <= 120 ? Number(period) : 30,
      algorithm: ['SHA1', 'SHA256', 'SHA512'].includes(String(algorithm).toUpperCase()) ? String(algorithm).toUpperCase() : 'SHA1',
      added_at: Date.now()
    };
    this.accounts.push(account);
    this._save();
    return account;
  }

  update(id, patch) {
    this._assertUnlocked();
    const a = this.accounts.find((x) => x.id === id);
    if (!a) throw new Error('account not found');
    if (patch.issuer != null) a.issuer = String(patch.issuer).slice(0, 100);
    if (patch.label != null) a.label = String(patch.label).slice(0, 100);
    this._save();
    return a;
  }

  remove(id) {
    this._assertUnlocked();
    const before = this.accounts.length;
    this.accounts = this.accounts.filter((x) => x.id !== id);
    if (this.accounts.length === before) throw new Error('account not found');
    this._save();
  }

  changePassword(newPassword) {
    this._assertUnlocked();
    if (String(newPassword).length < 8) throw new Error('master password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    this.kdf = { salt, ...SCRYPT };
    this.key = deriveKey(newPassword, salt);
    this._save();
  }

  // ── backup / migration ─────────────────────────────────────────────────────
  exportBackup(backupPassword) {
    this._assertUnlocked();
    if (String(backupPassword).length < 8) throw new Error('backup password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    const key = deriveKey(backupPassword, salt);
    const body = { version: 1, kind: 'keyloop-backup', exported_at: new Date().toISOString(), kdf: { salt, ...SCRYPT }, ...encryptJson(key, this.accounts) };
    key.fill(0);
    return JSON.stringify(body);
  }

  static readBackup(backupJson, backupPassword) {
    const file = typeof backupJson === 'string' ? JSON.parse(backupJson) : backupJson;
    if (file.kind !== 'keyloop-backup') throw new Error('not a .keyloop backup file');
    const key = deriveKey(backupPassword, file.kdf.salt, file.kdf);
    let accounts;
    try {
      accounts = decryptJson(key, file);
    } catch {
      throw new Error('wrong backup password');
    } finally {
      key.fill(0);
    }
    return accounts;
  }

  importAccounts(accounts) {
    this._assertUnlocked();
    let added = 0;
    for (const a of accounts) {
      if (!a.secret) continue;
      if (this.accounts.some((x) => x.secret === String(a.secret).toUpperCase().replace(/[\s=-]/g, '') && x.label === a.label)) continue;
      this.add(a);
      added++;
    }
    return added;
  }

  toOtpauthUris() {
    this._assertUnlocked();
    return this.accounts.map(accountToUri);
  }
}

// ── otpauth:// URI helpers ────────────────────────────────────────────────────
function parseOtpauthUri(uri) {
  const u = new URL(uri);
  if (u.protocol !== 'otpauth:' || u.host !== 'totp') throw new Error('only otpauth://totp/ URIs are supported');
  const labelRaw = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  let issuer = u.searchParams.get('issuer') || '';
  let label = labelRaw;
  if (labelRaw.includes(':')) {
    const [iss, ...rest] = labelRaw.split(':');
    if (!issuer) issuer = iss.trim();
    label = rest.join(':').trim();
  }
  const secret = u.searchParams.get('secret');
  if (!secret) throw new Error('URI missing secret');
  return {
    issuer,
    label,
    secret,
    digits: Number(u.searchParams.get('digits')) || 6,
    period: Number(u.searchParams.get('period')) || 30,
    algorithm: (u.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  };
}

function accountToUri(a) {
  const label = encodeURIComponent(a.issuer ? `${a.issuer}:${a.label}` : a.label);
  const params = new URLSearchParams({ secret: a.secret, digits: String(a.digits), period: String(a.period), algorithm: a.algorithm });
  if (a.issuer) params.set('issuer', a.issuer);
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { Vault, parseOtpauthUri, accountToUri };
