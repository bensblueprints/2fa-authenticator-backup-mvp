# Product Hunt — Keyloop

**Name:** Keyloop

**Tagline (60 chars):** The 2FA authenticator you can actually back up. $19 once.

**Description (260 chars):**
Keyloop is a local, encrypted desktop TOTP authenticator that does what Authy won't: full encrypted export, printable QR paper backups, and bulk otpauth:// import. AES-256 vault on your disk, zero cloud, zero telemetry. Pay once, never get locked out again.

**Full description:**
Every mainstream authenticator has the same dark pattern: getting your secrets IN is easy, getting them OUT is impossible. Lose your phone, lose your accounts.

Keyloop is a desktop TOTP authenticator built around the exit:

- Live codes with countdown rings, search, click-to-copy (auto-clearing clipboard)
- Add via QR screenshot drag-and-drop, otpauth:// URI, or manual secret
- scrypt + AES-256-GCM encrypted vault, auto-lock on idle
- Export: encrypted .keyloop file AND a printable QR paper backup for your safe
- Import: encrypted backups or otpauth:// lists from any other app
- No account, no cloud, no network calls at all

**Maker first comment:**
Hey PH 👋 I built this after watching a friend lose access to 14 accounts when his phone died — Authy support couldn't help because "we can't export secrets for security reasons." That's not security, that's lock-in. Keyloop keeps your TOTP secrets in an AES-256 vault on YOUR disk, and gives you three ways out: an encrypted backup file, a printable QR sheet for your safe, and standard otpauth:// URIs. It's $19 once, MIT source on GitHub so you can audit the crypto (it's ~200 lines of Node built-ins, no custom primitives). Honest limitation: desktop only for now, and webcam QR scanning isn't in v1 — screenshot drag-and-drop covers the flow. AMA!

**Gallery shots (5):**
1. Main window — account list with live codes, amber countdown rings, search bar.
2. Add modal — QR screenshot drop zone with "✓ found: otpauth://totp/GitHub…".
3. Printable QR paper backup sheet preview.
4. Lock screen — "AES-256-GCM · scrypt · nothing ever leaves this machine."
5. Comparison card: "Authy: no export. Keyloop: encrypted file + paper QR + URIs. $19 once."
