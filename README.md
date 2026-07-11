# 🔑 Keyloop

**The 2FA authenticator that never holds your codes hostage. Local, encrypted, fully exportable. Pay once, own it forever.**

![MIT](https://img.shields.io/badge/license-MIT-green) ![Electron](https://img.shields.io/badge/desktop-Electron-blue)

Authy locks your 2FA secrets inside their app and their cloud. Google Authenticator loses them with your phone. Keyloop is a desktop TOTP authenticator where **you** hold the vault: AES-256 encrypted on your disk, exportable to an encrypted file or a printable QR paper backup, importable from any standard `otpauth://` list — so you are never locked out and never locked in.

![screenshot](docs/screenshot.png)

## Features

- 🔢 **Live 6-digit codes** with per-account countdown rings; click to copy (clipboard auto-clears).
- ➕ **Add accounts three ways** — scan a QR screenshot (drag & drop an image), paste an `otpauth://` URI, or type the secret manually. SHA1/256/512, 6–8 digits, custom periods.
- 🔒 **Encrypted local vault** — scrypt key derivation + AES-256-GCM (Node's built-in crypto). Master password never stored. Auto-locks after 5 minutes idle.
- 💾 **Encrypted `.keyloop` backups** — one file, one password, restore anywhere.
- 🖨 **Printable QR paper backup** — every account as a QR code on one sheet for your safe/deposit box. The escape hatch Authy refuses to give you.
- 📥 **Bulk migration** — paste an `otpauth://` URI list from any other authenticator's export.
- 🚫 **Zero network** — no accounts, no cloud, no telemetry. The app makes no network calls at all.

## Quick start

```bash
npm i
npm start
```

Build a Windows installer (NSIS): `npm run dist`.

## Keyloop vs the incumbents

| | Keyloop | Authy | 1Password (2FA) |
|---|---|---|---|
| Price | **$19 once** | free* (account lock-in) | $2.99+/mo |
| Export your secrets | ✅ encrypted file + QR sheet + URIs | ❌ deliberately blocked | partial |
| Works fully offline | ✅ | ❌ needs phone number/cloud | ❌ |
| Encrypted local vault | ✅ AES-256-GCM | cloud-side | ✅ |
| Your data leaves the machine | never | always | always |
| Desktop-first | ✅ | discontinued desktop app | ✅ |

*Authy's price is your exit: there is no supported way to export your secrets.

## Security notes (honest version)

- Vault: scrypt (N=2¹⁵) → AES-256-GCM via Node's built-in `crypto`. No custom primitives.
- The TOTP secrets stay in the main process; the renderer only receives metadata and live codes.
- A paper QR backup contains your **raw secrets** — that's the point. Store it like cash.
- Forget the master password with no backup = locked out. Keyloop gives you three backup formats; use one.

## Tech stack

Electron (main + preload + renderer, context-isolated) · `otpauth` (RFC 6238) · `jsqr` (QR decode) · `qrcode` (QR generate) · vanilla HTML/CSS/JS renderer.

## ☕ Skip the setup — get the 1-click installer

Grab the packaged Windows installer: **[https://whop.com/onetime-suite](https://whop.com/onetime-suite)** — pay once, own it forever, no subscription.

## License

MIT © 2026 Ben (bensblueprints)
