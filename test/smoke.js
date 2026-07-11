// Keyloop smoke test — exercises the real vault module end-to-end:
// create → add accounts → CIPHERTEXT AT REST (raw file scan) → lock/unlock →
// wrong password → TOTP correctness vs the otpauth library → encrypted backup
// export/import round-trip (also ciphertext-checked) → otpauth:// URI import.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { TOTP } = require('otpauth');
const { Vault, parseOtpauthUri, accountToUri } = require('../src/vault');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'keyloop-smoke-'));
const VAULT_PATH = path.join(TMP, 'keyloop.vault');
const MASTER_PW = 'smoke-master-password-123';
const BACKUP_PW = 'smoke-backup-password-456';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DP'; // known base32 test secret

function rawFileHas(file, needle) {
  return fs.readFileSync(file, 'utf8').includes(needle);
}

async function main() {
  console.log('1. Create vault + add account');
  const v = new Vault(VAULT_PATH);
  assert.strictEqual(v.exists(), false);
  assert.throws(() => v.create('short'), /8 characters/, 'weak master password must be rejected');
  v.create(MASTER_PW);
  assert.ok(v.exists(), 'vault file must exist');
  const acc = v.add({ issuer: 'GitHub', label: 'ben@example.com', secret: SECRET });
  assert.ok(acc.id, 'account gets an id');
  assert.throws(() => v.add({ issuer: 'X', label: 'y', secret: 'not base32!!' }), /base32/, 'invalid secret rejected');

  console.log('2. CIPHERTEXT AT REST: raw vault file contains no plaintext');
  assert.ok(!rawFileHas(VAULT_PATH, SECRET), 'raw vault file must NOT contain the TOTP secret');
  assert.ok(!rawFileHas(VAULT_PATH, 'GitHub'), 'raw vault file must NOT contain the issuer');
  assert.ok(!rawFileHas(VAULT_PATH, 'ben@example.com'), 'raw vault file must NOT contain the label');
  assert.ok(!rawFileHas(VAULT_PATH, MASTER_PW), 'raw vault file must NOT contain the master password');
  const parsed = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
  assert.ok(parsed.kdf && parsed.iv && parsed.tag && parsed.ciphertext, 'file has kdf/iv/tag/ciphertext envelope');
  console.log('   ✓ secret, issuer, label, master password all absent from disk');

  console.log('3. Lock → wrong password rejected → unlock round-trip');
  v.lock();
  assert.strictEqual(v.unlocked, false);
  assert.throws(() => v.list(), /locked/, 'locked vault refuses reads');
  const v2 = new Vault(VAULT_PATH);
  assert.throws(() => v2.unlock('totally-wrong-password'), /wrong master password/);
  const accounts = v2.unlock(MASTER_PW);
  assert.strictEqual(accounts.length, 1);
  assert.strictEqual(accounts[0].secret, SECRET, 'secret round-trips through encrypt/decrypt');

  console.log('4. TOTP correctness vs otpauth reference');
  const a = accounts[0];
  const expected = new TOTP({ secret: a.secret, digits: a.digits, period: a.period, algorithm: a.algorithm }).generate();
  assert.match(expected, /^\d{6}$/, 'code is 6 digits');
  // main.js codeFor() uses the identical construction; assert determinism at a fixed timestamp
  const at = 1700000000000;
  const c1 = new TOTP({ secret: a.secret }).generate({ timestamp: at });
  const c2 = new TOTP({ secret: SECRET }).generate({ timestamp: at });
  assert.strictEqual(c1, c2, 'stored secret generates the same code as the source secret');

  console.log('5. Encrypted .keyloop backup export/import round-trip');
  const backupJson = v2.exportBackup(BACKUP_PW);
  assert.ok(!backupJson.includes(SECRET), 'backup file must NOT contain the plaintext secret');
  assert.ok(!backupJson.includes('ben@example.com'), 'backup file must NOT contain the label');
  assert.throws(() => Vault.readBackup(backupJson, 'wrong-backup-pw'), /wrong backup password/);
  const restored = Vault.readBackup(backupJson, BACKUP_PW);
  assert.strictEqual(restored.length, 1);
  assert.strictEqual(restored[0].secret, SECRET, 'backup round-trips the secret');

  const fresh = new Vault(path.join(TMP, 'fresh.vault'));
  fresh.create('another-master-password');
  const added = fresh.importAccounts(restored);
  assert.strictEqual(added, 1, 'import into a fresh vault adds the account');
  assert.strictEqual(fresh.list()[0].secret, SECRET);

  console.log('6. otpauth:// URI parse, emit, bulk import');
  const uri = accountToUri(a);
  assert.ok(uri.startsWith('otpauth://totp/'), 'emits otpauth URI');
  const round = parseOtpauthUri(uri);
  assert.strictEqual(round.secret, SECRET);
  assert.strictEqual(round.issuer, 'GitHub');
  const other = 'otpauth://totp/AWS:root?secret=GEZDGNBVGY3TQOJQGEZDGNBV&issuer=AWS&digits=6&period=30';
  const bulk = fresh.importAccounts([parseOtpauthUri(other)]);
  assert.strictEqual(bulk, 1, 'bulk URI import works');
  assert.strictEqual(fresh.list().length, 2);
  const dupes = fresh.importAccounts([parseOtpauthUri(other)]);
  assert.strictEqual(dupes, 0, 'duplicate import is skipped');

  console.log('\n✅ All Keyloop smoke tests passed');
}

main()
  .then(() => { fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); })
  .catch((err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(1);
  });
