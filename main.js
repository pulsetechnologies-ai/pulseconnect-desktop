// PulseConnect Agent Console desktop (Electron) — a native shell around the
// standalone Agent Console web app: presence, call status, agent-assist
// payment triggers, AND (since Phase E) a real WebRTC softphone — an agent
// can register this window as a device and take calls with no PulseVoice
// relationship at all. Content is the hosted web app, so app changes ship
// with each web deploy; this shell only adds what a browser tab cannot do:
// stay in the tray, start with the OS, alert on an incoming call from behind
// other windows, and update itself.

// Chromium's HTTPS-SVCB DNS path can fail (-105 NAME_NOT_RESOLVED) for some
// hosts while the OS resolver succeeds — hit on stun/turn.telnyx.com in
// pulsevoice-desktop, which breaks WebRTC media the same way it would here.
// Disable it so Electron resolves those hosts like the rest of the system.
// Must be pushed onto process.argv BEFORE `electron` is required: as of
// Electron 36, app.commandLine.appendSwitch() lowercases both the switch and
// its value, and these Chromium feature names are case-sensitive — lowercased,
// this switch is silently ignored and the DNS bug comes back.
process.argv.push('--disable-features=UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn');

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, Notification, nativeTheme } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

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
// Only pages from our own site may drive the native call alerts (preload.js
// exposes the bridge to every page in the window, including the login hop).
const TRUSTED_HOST_SUFFIX = '.pulsetechnologies.ai';
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

let win = null;
let tray = null;
let quitting = false;

// Single instance: focus the existing window instead of launching a second copy.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    createWindow();
    startUpdater();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 640,
    minHeight: 520,
    title: 'PulseConnect',
    backgroundColor: windowBackground(),
    icon: ICON,
    autoHideMenuBar: true,
    // Start hidden when launched at login (the tray icon is the presence);
    // a manual launch shows the window as before.
    show: !launchedAtLogin(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden-to-tray for a whole shift: Chromium would otherwise throttle
      // timers in a hidden window, which is exactly when the softphone's
      // keepalive and reconnect logic must keep running.
      backgroundThrottling: false,
    },
  });

  // WebRTC calls need the mic (Phase E); auto-grant media, deny everything else.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });

  win.loadURL(APP_URL);

  // Follow an OS light/dark switch while the app is running, so the backdrop
  // shown during a reload or the login → console hop matches the new theme.
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed()) win.setBackgroundColor(windowBackground());
  });

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

// The colour the window paints before (and behind) the hosted page. It must
// match the page's own theme or every launch flashes the wrong colour. The
// first page is the hosted login, which follows prefers-color-scheme (Electron
// passes the OS theme through, nativeTheme.themeSource is left at 'system'):
// measured #0F0C18 dark / #F7F5FC light. The console behind it is slate-900 /
// slate-50, close enough that the hop is seamless. The old fixed brand purple
// (#391E6D) matched neither theme.
function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? '#0F0C18' : '#F7F5FC';
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---- Incoming-call alerts -------------------------------------------------
// The web console tells us (via preload.js → window.pulseconnectDesktop) when
// a call starts ringing and when it is over. A browser tab can only ring in
// its own tab; here we bring the window forward, keep it on top until the
// agent answers or the caller hangs up, flash the taskbar and post an OS
// notification whose click focuses the window.

function trustedSender(event) {
  try {
    const url = new URL(event.senderFrame ? event.senderFrame.url : event.sender.getURL());
    return url.hostname.endsWith(TRUSTED_HOST_SUFFIX) || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

let alertOnTop = false;
function callAlert(info) {
  if (!win) return;
  const from = info && typeof info.from === 'string' && info.from.trim() ? info.from.trim() : 'Unknown caller';
  const queue = info && typeof info.queue === 'string' && info.queue.trim() ? ` · ${info.queue.trim()}` : '';
  showWindow();
  win.flashFrame(true);
  if (!alertOnTop) {
    alertOnTop = true;
    win.setAlwaysOnTop(true, 'floating');
  }
  if (Notification.isSupported()) {
    const n = new Notification({ title: 'Incoming call', body: `${from}${queue}`, icon: ICON, silent: true });
    n.on('click', showWindow);
    n.show();
  }
}

function callAlertEnd() {
  if (!win) return;
  win.flashFrame(false);
  if (alertOnTop) {
    alertOnTop = false;
    win.setAlwaysOnTop(false);
  }
}

ipcMain.on('pulseconnect:incoming-call', (event, info) => {
  if (trustedSender(event)) callAlert(info);
});
ipcMain.on('pulseconnect:call-ended', (event) => {
  if (trustedSender(event)) callAlertEnd();
});

// ---- Start at login -------------------------------------------------------
// A tray toggle; the OS remembers it. The app comes up hidden in the tray on
// a login launch so the agent's desktop is not covered before they sit down.

function launchedAtLogin() {
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin === true;
  } catch {
    return false;
  }
}

function openAtLogin() {
  try {
    return app.getLoginItemSettings().openAtLogin === true;
  } catch {
    return false;
  }
}

function setOpenAtLogin(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  createTray(); // rebuild the menu so the checkbox reflects the OS's answer
}

// ---- Auto-update ----------------------------------------------------------
// electron-builder publishes latest.yml / latest-mac.yml alongside each GitHub
// release (package.json "publish"); electron-updater reads them from there.
// Download quietly, install on quit, and mention it once via the OS
// notification that checkForUpdatesAndNotify posts. Dev runs skip it.

function startUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => console.error('[updater]', err && err.message ? err.message : err));
  const check = () => autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  check();
  setInterval(check, UPDATE_CHECK_MS);
}

function createTray() {
  if (!tray) {
    const trayIcon = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
    tray = new Tray(trayIcon);
    tray.setToolTip('PulseConnect');
    tray.on('click', showWindow);
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open PulseConnect', click: showWindow },
      { type: 'separator' },
      { label: 'Start at login', type: 'checkbox', checked: openAtLogin(), click: (item) => setOpenAtLogin(item.checked) },
      {
        label: 'Check for updates',
        enabled: app.isPackaged,
        click: () => autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('[updater]', err && err.message ? err.message : err)),
      },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* intentionally do not quit — stays in the tray */ });
app.on('activate', showWindow); // macOS dock click
