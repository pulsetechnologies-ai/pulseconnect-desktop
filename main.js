// PulseConnect Agent Console desktop (Electron) — a native shell around the
// standalone Agent Console web app: presence, call status, agent-assist
// payment triggers, AND (since Phase E) a real WebRTC softphone — an agent
// can register this window as a device and take calls with no PulseVoice
// relationship at all. Content is the hosted web app, so it auto-updates
// with each deploy — no desktop rebuild needed for app changes; today's
// change is enabling what that page can already do, not adding new UI here.

// Chromium's HTTPS-SVCB DNS path can fail (-105 NAME_NOT_RESOLVED) for some
// hosts while the OS resolver succeeds — hit on stun/turn.telnyx.com in
// pulsevoice-desktop, which breaks WebRTC media the same way it would here.
// Disable it so Electron resolves those hosts like the rest of the system.
// Must be pushed onto process.argv BEFORE `electron` is required: as of
// Electron 36, app.commandLine.appendSwitch() lowercases both the switch and
// its value, and these Chromium feature names are case-sensitive — lowercased,
// this switch is silently ignored and the DNS bug comes back.
process.argv.push('--disable-features=UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn');

const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('node:path');

// Production default goes through the hosted login's deep-link
// (/?platform=pulseconnect): shows a sign-in form if the Electron session
// has no identity token yet, then auto-mints an SSO launch token and
// redirects into the real app — the same handoff a browser user gets by
// clicking the PulseConnect tile at login.pulsetechnologies.ai. Loading
// the app's bare root URL directly (the previous default) has no path
// for a signed-out visit at all — apps/web's page.tsx only ever handles
// a `?token=` in the URL, and shows a static "not supported" message
// otherwise, which is what every fresh desktop launch hit. Local dev
// overrides this to point straight at a local pulse-connect web server,
// bypassing login entirely — see README.md.
const APP_URL = process.env.PULSECONNECT_APP_URL || 'https://login.pulsetechnologies.ai/?platform=pulseconnect';
const ICON = path.join(__dirname, 'build', 'icon.png');

let win = null;
let tray = null;
let quitting = false;

// Single instance: focus the existing window instead of launching a second copy.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(createWindow);
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 640,
    minHeight: 520,
    title: 'PulseConnect',
    backgroundColor: '#391E6D', // Pulse brand purple — matches the app splash
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // WebRTC calls need the mic (Phase E); auto-grant media, deny everything else.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });

  win.loadURL(APP_URL);

  // External links open in the OS browser, not the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close hides to tray so the console stays quickly reachable — a
  // convenience for an agent's shift, not a technical requirement the way
  // it is for pulsevoice-desktop's persistent inbound-call connection.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  createTray();
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(trayIcon);
  tray.setToolTip('PulseConnect');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open PulseConnect', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', showWindow);
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* intentionally do not quit — stays in the tray */ });
app.on('activate', showWindow); // macOS dock click
