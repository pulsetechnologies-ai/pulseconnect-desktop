// The one native bridge the web console can use. Context-isolated: the page
// gets a frozen object with two fire-and-forget calls and nothing else
// (no ipcRenderer, no Node). main.js only honours them from our own site.
//
//   window.pulseconnectDesktop.incomingCall({ from, queue })  — a call is ringing
//   window.pulseconnectDesktop.callEnded()                    — answered, declined or gone
//
// The web app feature-detects `window.pulseconnectDesktop` and does nothing
// in a plain browser tab, so the console needs no desktop-specific build.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulseconnectDesktop', Object.freeze({
  version: '1',
  incomingCall(info) {
    const from = info && typeof info.from === 'string' ? info.from.slice(0, 64) : '';
    const queue = info && typeof info.queue === 'string' ? info.queue.slice(0, 64) : '';
    ipcRenderer.send('pulseconnect:incoming-call', { from, queue });
  },
  callEnded() {
    ipcRenderer.send('pulseconnect:call-ended');
  },
}));
