# Launch strategy — Keyloop

## Target communities

- **r/privacy** — angle: "no cloud, no phone number, no telemetry authenticator." Zero selling in the post; link in comments if asked (subreddit is strict on self-promo — lead with the lock-in problem discussion).
- **r/selfhosted** — technically not hosted, but the audience overlaps perfectly with "own your data." Post as show-and-tell with the paper-backup angle.
- **r/Bitwarden & r/2fa** — participate in the weekly "Authy export" complaint threads (they are constant) with genuinely helpful migration advice; mention Keyloop where relevant, never as a drive-by.
- **r/DataHoarder** — the printable QR paper backup is catnip here. Frame: "cold-storage for your 2FA."
- **Hacker News** — see Show HN below. The Authy-lock-in resentment thread reliably front-pages.

## Show HN draft

**Title:** Show HN: Keyloop – a desktop TOTP authenticator you can actually back up ($19)

**Body:**
After a friend lost 14 accounts to a dead phone (Authy: "we can't export secrets"), I built the authenticator I wanted: local Electron app, scrypt→AES-256-GCM vault via Node built-ins, secrets never leave the main process, zero network calls.

The point is the exit: encrypted .keyloop backup files, a printable QR sheet (every account as otpauth:// QR for your safe), and bulk import/export of standard otpauth URIs, so migration in either direction is trivial.

MIT source — the vault is ~200 lines and I'd love hostile review. Honest gaps: no webcam scanning yet (screenshot drag-drop instead), no mobile app — this is deliberately the desktop cold-copy of your 2FA.

## SEO keywords (10)

1. authy alternative desktop
2. totp authenticator backup
3. offline authenticator app windows
4. export 2fa secrets
5. 2fa app no cloud
6. authenticator app with export
7. self hosted 2fa app
8. google authenticator desktop alternative
9. paper backup 2fa
10. encrypted totp vault

## AppSumo / PitchGround pitch

Keyloop is a desktop 2FA authenticator that solves the industry's ugliest dark pattern: authenticator lock-in. Users' TOTP secrets live in an AES-256 encrypted vault on their own disk, with three export paths (encrypted backup file, printable QR paper backup, standard otpauth URIs) so nobody ever loses accounts to a dead phone again. No cloud, no account, no recurring costs for us or the buyer — which makes a lifetime deal genuinely sustainable. Your audience buys "own your data" tools; this is the most visceral one there is, because everyone has felt the fear of losing their 2FA phone.

## Pricing math

**$19 one-time.** 1Password (the usual "2FA + backup" answer) is $2.99/mo minimum → **Keyloop pays for itself in under 7 months**, and vs a $36/yr subscription it's paid off in 6. Authy is free but the exit cost is measured in lost accounts.
