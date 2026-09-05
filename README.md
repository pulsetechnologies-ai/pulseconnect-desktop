# PulseConnect Desktop

A thin Electron shell around PulseConnect's standalone Agent Console web
app (`apps/web` in [pulse-connect](https://github.com/pulsetechnologies-ai/pulse-connect)):
presence, current-call status, agent-assist payment capture, and (since
Phase E) a real WebRTC softphone — an agent can register this window as a
device and take calls with no PulseVoice relationship at all.

Built by copying [`pulsevoice-desktop`](https://github.com/pulsetechnologies-ai/pulsevoice-desktop)'s
proven pattern directly (same signing pipeline, same electron-builder
config shape, same mic entitlement/DNS-SVCB workaround now that this app
also carries real call audio) rather than reinventing one — see that
repo's `docs/macos-signing.md` for the full runbook this one follows. The
one remaining difference: no camera entitlement, since PulseConnect is
voice-only (no video).

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
- [x] **2026-09-05: `build/icon.png` replaced with a real PulseConnect
      icon** — same visual language as pulsevoice-desktop's (purple
      gradient background, green rounded-square badge) but a headset
      glyph instead of a phone handset, matching the icon already used
      for PulseConnect on the marketing site's nav/product grid. No
      longer a copy of pulsevoice-desktop's icon.
- [x] **2026-09-05: fixed — every fresh launch landed on "Not signed
      in."** `main.js` loaded the web app's bare root URL directly
      (`PULSECONNECT_APP_URL`'s old default). `apps/web`'s `page.tsx`
      only ever handles a `?token=` in the URL from the SSO handoff; a
      signed-out visit with no token shows a static "not supported"
      message and goes nowhere — there was no login form to fall back
      to. Default now points at the hosted login's deep-link instead,
      `https://login.pulsetechnologies.ai/?platform=pulseconnect`: shows
      a real sign-in form if the Electron session has no identity token
      yet, then auto-mints an SSO launch token and redirects into the
      app — the same handoff a browser user gets clicking the
      PulseConnect tile there. Verified live end-to-end in a real
      browser session before shipping. Local dev is unaffected —
      `PULSECONNECT_APP_URL` still overrides straight to a local server,
      bypassing login entirely.
- [x] **2026-09-05: Phase E desktop follow-on — real WebRTC audio embedded.**
      Ported `pulsevoice-desktop`'s proven mic-permission plumbing:
      `setPermissionRequestHandler` auto-grants `media`/`audioCapture`, the
      `--disable-features=UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn` switch (a
      Chromium DNS bug breaks resolving `stun.telnyx.com` for some hosts),
      `com.apple.security.device.audio-input` in `entitlements.mac.plist`,
      and `NSMicrophoneUsageDescription` in `package.json`'s `mac.extendInfo`
      (no camera entitlement — voice only). Purely additive to the existing
      shell — `apps/web`'s `page.tsx` already has the device-registration UI
      from pulse-connect's own Phase E2, so this window gets it
      automatically since it just loads that hosted page. Verified locally
      on Windows: a throwaway smoke test confirmed `setPermissionRequestHandler`
      + `getUserMedia` actually captures a real microphone track inside this
      exact window config, before trusting it in a signed build.

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
