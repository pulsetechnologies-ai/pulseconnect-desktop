# PulseConnect Desktop

A thin Electron shell around PulseConnect's standalone Agent Console web
app (`apps/web` in [pulse-connect](https://github.com/pulsetechnologies-ai/pulse-connect)).
Control-surface only — presence, current-call status, agent-assist payment
capture. No WebRTC/audio in this window; the agent's actual voice call
stays on their existing PulseVoice softphone or desk phone (see the
extraction plan's Phase B3 note on why, and Phase E for when that changes).

Built by copying [`pulsevoice-desktop`](https://github.com/pulsetechnologies-ai/pulsevoice-desktop)'s
proven pattern directly (same signing pipeline, same electron-builder
config shape) rather than reinventing one — see that repo's
`docs/macos-signing.md` for the full runbook this one follows. The real
differences from that repo: no mic/camera entitlements (`build/entitlements.mac.plist`),
no Chromium DNS-SVCB workaround in `main.js` (both exist there only because
that app carries real call audio), and a lighter default window size.

## Status

- [x] Repo scaffolded: `main.js`/`preload.js`, `package.json` (electron-builder
      config), `build/entitlements.mac.plist`, `.github/workflows/release.yml`
      (ported from pulsevoice-desktop's CI)
- [x] **2026-09-04: all 8 GitHub Actions secrets set** (`APPLE_API_KEY_B64`,
      `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `MAC_CSC_LINK`,
      `MAC_CSC_KEY_PASSWORD`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
      `AZURE_CLIENT_SECRET`) — a dedicated Apple API key and a fresh
      Developer ID Application certificate (G2 Sub-CA) were generated for
      this app rather than reusing pulsevoice-desktop's (its original .p12
      export password was lost, so its cert had to be regenerated from
      scratch on a rented macOS session). `v0.1.0` shipped signed and
      notarized on all 3 platforms and is live in
      [Releases](https://github.com/pulsetechnologies-ai/pulseconnect-desktop/releases) —
      confirmed via two real dry-run CI passes plus a tagged publish.
- [x] **Windows signing reuses `pulsevoice-desktop`'s existing Azure
      certificate profile** (`win.azureSignOptions.certificateProfileName`
      in `package.json` = `"pulsevoice-desktop"`, deliberately not a
      separate `pulseconnect-desktop` profile) — 2026-09-04 decision: the
      `pulse-technologies` Trusted Signing account's Basic tier caps
      Public Trust profiles at 1 (already used), and a 2nd account would
      need its own fresh identity validation. Both apps publish as the
      same legal entity (Pulse Payments LLC) either way, so one shared
      profile is correct, not a workaround — costs nothing and needs no
      new Azure setup. The `AZURE_*` auth secrets above are this same
      shared service principal, unrelated to which profile gets signed
      with.
- [ ] `build/icon.png` is a placeholder — copied directly from
      `pulsevoice-desktop`, not a real PulseConnect icon.

## Known gotchas (inherited from pulsevoice-desktop, worth carrying over)

- Build **universal** on macOS (`arch: universal`, already set) — a
  host-arch-only build bit Allegiant's original PulseVoice download.
- electron-builder publishes releases as a **draft by default** — a
  tagged CI run still needs a manual "Publish release" click on GitHub.
- `build.publish.owner` must point at `pulsetechnologies-ai` (already set).

## Local dev

```bash
npm install
PULSECONNECT_APP_URL=http://localhost:3100 npm start
```
