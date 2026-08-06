export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    const loc = typeof window !== 'undefined' ? window.location?.href : '';
    console.error('[Carrot Runtime] content script main() entered:', loc);
    console.log('[Carrot Main] main() function executing on:', loc);

    const attachBadge = () => {
      try {
        if (document.getElementById('carrot-detector-badge')) return;
        const badge = document.createElement('div');
        badge.id = 'carrot-detector-badge';
        badge.dataset.carrotUi = 'true';
        badge.textContent = '🥕 Carrot Detector Active';
        badge.style.cssText = `
          position: fixed;
          bottom: 12px;
          right: 12px;
          background: #ff6b00;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-family: sans-serif;
          font-size: 12px;
          font-weight: bold;
          z-index: 999999;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          pointer-events: none;
        `;
        (document.body || document.documentElement).appendChild(badge);
        console.log('[Carrot Badge] Attached to page.');
      } catch (e) {
        console.error('[Carrot Badge Error]:', e);
      }
    };

    if (document.body) {
      attachBadge();
    } else {
      document.addEventListener('DOMContentLoaded', attachBadge);
    }

    const initScanner = async () => {
      try {
        // Load the scanner after the content-script entrypoint has started.
        // This keeps a dependency failure from hiding the entrypoint logs.
        const { domTextScanner } = await import('../utils/domObserver');
        domTextScanner.init();
      } catch (err) {
        console.error('[Carrot Scanner Error]:', err);
      }
    };

    if (document.body) {
      initScanner();
    } else {
      document.addEventListener('DOMContentLoaded', () => void initScanner(), { once: true });
    }
  },
});
