let deferredPrompt = null;

export async function initPwa(onReady) {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    onReady?.(true);
  });

  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'push-click') {
      window.focus();
    }
  });
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  return true;
}
