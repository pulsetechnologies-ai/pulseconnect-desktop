// PulseConnect Agent Console desktop (Electron) — a native shell around the
// standalone Agent Console web app. Control-surface only (presence, call
// status, agent-assist payment triggers) — no WebRTC/audio in this window,
// so unlike pulsevoice-desktop this needs neither the mic/camera
// entitlements nor its Chromium DNS-SVCB workaround (both exist there only
// because that app carries real call audio). The agent's actual voice call
// stays on their existing PulseVoice softphone/desk phone. Content is the
// hosted web app, so it auto-updates with each deploy — no desktop rebuild
// needed for app changes.

const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('node:path');

const APP_URL = process.env.PULSECONNECT_APP_URL || 'https://pulseconnect.pulsetechnologies.ai';
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
