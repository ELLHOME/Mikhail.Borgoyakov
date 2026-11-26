/* Installable app: service worker, install prompt, iPhone/Android hints, standalone mode. */
const DISMISS_KEY = 'siluetika:install-card-dismissed';
const SW_DEV_KEY = 'siluetika:sw-dev';

const ua = navigator.userAgent || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const standaloneQuery = window.matchMedia('(display-mode: standalone)');

let deferredPrompt = null;
let toast = () => {};

export function isStandalone() {
  return standaloneQuery.matches || navigator.standalone === true;
}

function $(id) {
  return document.getElementById(id);
}

function canShowHint() {
  return isIOS || isAndroid;
}

function cardDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function render() {
  const standalone = isStandalone();
  document.documentElement.classList.toggle('is-standalone', standalone);
  const row = $('profileInstallBtn');
  if (row) {
    row.classList.toggle('hidden', standalone || !(deferredPrompt || canShowHint()));
    const val = $('profileInstallVal');
    if (!val) {
      /* no value slot */
    } else if (!deferredPrompt) val.textContent = 'Как добавить';
    else val.textContent = isIOS || isAndroid ? 'На главный экран' : 'Как программу';
  }
  const card = $('installCard');
  if (card) {
    // Android Chrome fires beforeinstallprompt only when not yet installed, so wait for it there.
    const show = !standalone && !cardDismissed() && (deferredPrompt || isIOS);
    card.classList.toggle('hidden', !show);
  }
}

function openHint() {
  const list = $('installSteps');
  const share = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const menu = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
  const steps = isIOS
    ? [
      `Нажмите «Поделиться» <span class="install-key">${share}</span> в панели браузера.`,
      'Пролистайте вниз и выберите «На экран „Домой“».',
      'Нажмите «Добавить» — иконка Силуэтики появится рядом с другими приложениями.',
    ]
    : [
      `Откройте меню браузера <span class="install-key">${menu}</span>.`,
      'Выберите «Установить приложение» или «Добавить на главный экран».',
      'Подтвердите — Силуэтика откроется с иконки, как обычное приложение.',
    ];
  if (list) list.innerHTML = steps.map((s) => `<li><span>${s}</span></li>`).join('');
  $('installModal')?.classList.remove('hidden');
}

async function install() {
  if (!deferredPrompt) {
    openHint();
    return;
  }
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome !== 'accepted') deferredPrompt = promptEvent;
  } catch {
    /* prompt() may be called once per event */
  }
  render();
}

function dismissCard() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch { /* private mode */ }
  render();
}

function swAllowed() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!local) return true;
  // Locally files change without a version bump, so the worker is opt-in: ?pwa=1 / ?pwa=0.
  const flag = new URLSearchParams(location.search).get('pwa');
  try {
    if (flag === '1') localStorage.setItem(SW_DEV_KEY, '1');
    if (flag === '0') localStorage.removeItem(SW_DEV_KEY);
    return localStorage.getItem(SW_DEV_KEY) === '1';
  } catch {
    return flag === '1';
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (!swAllowed()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const reg = await navigator.serviceWorker.ready;
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => (u.startsWith(location.origin) && !u.includes('/api/')) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
    reg.active?.postMessage({ type: 'warm', urls });
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

// Registered at import time: the browser may offer installation before the app finishes booting.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  render();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  render();
  toast('Силуэтика установлена — открывайте её с иконки');
});

export function initPwa(options = {}) {
  if (typeof options.toast === 'function') toast = options.toast;
  standaloneQuery.addEventListener?.('change', render);

  $('profileInstallBtn')?.addEventListener('click', install);
  $('installCardBtn')?.addEventListener('click', install);
  $('installCardClose')?.addEventListener('click', dismissCard);

  window.addEventListener('offline', () => toast('Нет сети — работаем офлайн. AI и онлайн-музыка недоступны'));
  window.addEventListener('online', () => toast('Сеть снова есть'));

  render();
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}
