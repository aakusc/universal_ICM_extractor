/**
 * Minimal toast notification system — no dependencies.
 */

let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string, duration = 2000) {
  const el = document.createElement('div');
  el.className = 'toast-enter';
  el.textContent = message;
  el.style.cssText =
    'background:#1e1e1e;color:#ededed;border:1px solid #333;padding:8px 16px;border-radius:8px;font-size:13px;pointer-events:auto;';
  getContainer().appendChild(el);
  setTimeout(() => {
    el.classList.remove('toast-enter');
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}
