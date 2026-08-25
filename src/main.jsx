import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './assets/styles/global.css'
import { formatUserFriendlyMessage } from './utils/errorMessageHelper'

// One-time cleanup: clear old session if from a previous DB version
const DB_KEY = 'labour_edu_db_version';
if (localStorage.getItem(DB_KEY) !== 'LabourEduReportSystem_v1') {
  localStorage.removeItem('labour_edu_session');
  localStorage.setItem(DB_KEY, 'LabourEduReportSystem_v1');
}

// Global override for window.alert to provide premium, unified styled toast notifications
window.alert = (rawMessage) => {
  const isErrorOrWarning = 
    typeof rawMessage === 'object' ||
    (typeof rawMessage === 'string' && (
      rawMessage.toLowerCase().includes('failed') ||
      rawMessage.toLowerCase().includes('error') ||
      rawMessage.toLowerCase().includes('exception') ||
      rawMessage.toLowerCase().includes('cannot read') ||
      rawMessage.toLowerCase().includes('pgrst') ||
      rawMessage.toLowerCase().includes('constraint') ||
      rawMessage.toLowerCase().includes('jwt') ||
      rawMessage.toLowerCase().includes('network')
    ));

  const message = isErrorOrWarning ? formatUserFriendlyMessage(rawMessage) : String(rawMessage || '');
  const msgLower = message.toLowerCase();

  let icon = 'fa-info-circle';
  let title = 'Notification';
  let accentColor = '#2563eb';
  let bgGradient = '#eff6ff';
  let textColor = '#18181b';
  let progressBg = '#2563eb';

  if (msgLower.includes('success') || msgLower.includes('saved') || msgLower.includes('activated') || msgLower.includes('sync')) {
    if (!msgLower.includes('failed')) {
      icon = 'fa-circle-check';
      title = 'Success';
      accentColor = '#10B981';
      bgGradient = '#ecfdf5';
      textColor = '#18181b';
      progressBg = '#10B981';
    }
  }
  
  if (isErrorOrWarning || msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('must') || msgLower.includes('please') || msgLower.includes('invalid') || msgLower.includes('already')) {
    icon = 'fa-triangle-exclamation';
    title = 'Notice';
    accentColor = '#EF4444';
    bgGradient = '#fef2f2';
    textColor = '#18181b';
    progressBg = '#EF4444';
  }

  // Create toast DOM element
  const container = document.createElement('div');
  container.className = 'custom-alert-toast';
  container.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 999999;
    width: 360px;
    max-width: calc(100vw - 48px);
    background: ${bgGradient};
    border: 1px solid ${accentColor}40;
    border-left: 5px solid ${accentColor};
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(9, 9, 11, 0.1), 0 10px 10px -5px rgba(9, 9, 11, 0.04);
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: ${textColor};
    transform: translateX(130%);
    transition: transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    overflow: hidden;
  `;

  container.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <i class="fa-solid ${icon}" style="font-size: 1.35rem; color: ${accentColor}; margin-top: 2px;"></i>
      <div style="flex: 1; min-width: 0;">
        <h5 style="margin: 0; font-size: 0.88rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${accentColor};">
          ${title}
        </h5>
        <p style="margin: 4px 0 0 0; font-size: 0.85rem; font-weight: 600; line-height: 1.45; color: ${textColor}; word-break: break-word;">
          ${message}
        </p>
      </div>
      <button class="custom-alert-close" style="background: none; border: none; font-size: 1.2rem; color: ${accentColor}; cursor: pointer; padding: 0 4px; opacity: 0.7; line-height: 1; font-weight: bold; transition: opacity 0.2s;">
        &times;
      </button>
    </div>
    <div style="position: absolute; bottom: 0; left: 5px; right: 0; height: 3px; background: rgba(0,0,0,0.05);">
      <div class="custom-alert-progress" style="width: 100%; height: 100%; background: ${progressBg}; transition: width 4s linear;"></div>
    </div>
  `;

  document.body.appendChild(container);

  // Trigger transition
  setTimeout(() => {
    container.style.transform = 'translateX(0)';
    const progressBar = container.querySelector('.custom-alert-progress');
    if (progressBar) progressBar.style.width = '0%';
  }, 50);

  const dismiss = () => {
    container.style.transform = 'translateX(130%)';
    setTimeout(() => {
      container.remove();
    }, 450);
  };

  container.querySelector('.custom-alert-close').addEventListener('click', dismiss);
  setTimeout(dismiss, 4000);
  return false;
};

// Global override for window.confirm to provide premium, unified styled confirm modal dialogs
window.confirm = (message) => {
  return new Promise((resolve) => {
    // Create backdrop overlay container
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-confirm-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(9, 9, 11, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Outfit', 'Inter', system-ui, sans-serif;
    `;

    // Create confirm card dialog
    const card = document.createElement('div');
    card.className = 'custom-confirm-card';
    card.style.cssText = `
      background: #ffffff;
      border-radius: 24px;
      padding: 2.25rem 2rem 1.75rem;
      width: 450px;
      max-width: calc(100vw - 32px);
      box-shadow: 0 25px 50px -12px rgba(9, 9, 11, 0.2);
      border: 1px solid #E4E4E7;
      transform: scale(0.9) translateY(15px);
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    `;

    // Check if the message is danger/destructive in nature
    const isDanger = message.toLowerCase().includes('delete') || 
                     message.toLowerCase().includes('reset') || 
                     message.toLowerCase().includes('remove') ||
                     message.toLowerCase().includes('revoke');

    const iconClass = isDanger ? 'fa-triangle-exclamation' : 'fa-circle-question';
    const iconColor = isDanger ? '#EF4444' : '#2563eb';
    const iconBg = isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(37, 99, 235, 0.1)';
    const actionBtnColor = isDanger ? '#EF4444' : '#09090b';
    const actionBtnShadow = isDanger ? 'rgba(239, 68, 68, 0.25)' : 'rgba(9, 9, 11, 0.25)';

    card.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: flex-start;">
        <div style="width: 48px; height: 48px; border-radius: 14px; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <h4 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #18181b; letter-spacing: -0.01em;">
            ${isDanger ? 'Are you sure?' : 'Please Confirm'}
          </h4>
          <p style="margin: 0; font-size: 0.9rem; font-weight: 500; color: #71717a; line-height: 1.5;">
            ${message}
          </p>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 0.5rem;">
        <button class="custom-confirm-cancel" style="
          padding: 0.75rem 1.35rem;
          border-radius: 12px;
          border: 1.5px solid #E4E4E7;
          background: #FAFAFA;
          color: #71717a;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        ">Cancel</button>
        <button class="custom-confirm-ok" style="
          padding: 0.75rem 1.35rem;
          border-radius: 12px;
          border: none;
          background: ${actionBtnColor};
          color: #ffffff;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px ${actionBtnShadow};
          font-family: inherit;
        ">Confirm Action</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // Trigger scale-in transition
    setTimeout(() => {
      backdrop.style.opacity = '1';
      card.style.transform = 'scale(1) translateY(0)';
    }, 10);

    const closeDialog = (result) => {
      backdrop.style.opacity = '0';
      card.style.transform = 'scale(0.9) translateY(15px)';
      setTimeout(() => {
        backdrop.remove();
        resolve(result);
      }, 220);
    };

    // Style hover effects dynamically
    const cancelBtn = backdrop.querySelector('.custom-confirm-cancel');
    cancelBtn.addEventListener('mouseenter', () => cancelBtn.style.background = '#e2e8f0');
    cancelBtn.addEventListener('mouseleave', () => cancelBtn.style.background = '#f8fafc');

    const okBtn = backdrop.querySelector('.custom-confirm-ok');
    okBtn.addEventListener('mouseenter', () => okBtn.style.opacity = '0.9');
    okBtn.addEventListener('mouseleave', () => okBtn.style.opacity = '1');

    cancelBtn.addEventListener('click', () => closeDialog(false));
    okBtn.addEventListener('click', () => closeDialog(true));
  });
};

// Global button click micro-interaction & processing animation processor
if (typeof window !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .btn');
    if (btn && !btn.disabled && !btn.classList.contains('sidebar-link') && !btn.classList.contains('custom-alert-close')) {
      const icon = btn.querySelector('i.fas, i.far, i.fa-solid, i.fa');
      btn.classList.add('btn-processing');

      if (icon && !icon.classList.contains('fa-spin')) {
        const originalClasses = icon.className;
        icon.className = 'fas fa-circle-notch fa-spin';
        setTimeout(() => {
          btn.classList.remove('btn-processing');
          icon.className = originalClasses;
        }, 650);
      } else {
        setTimeout(() => {
          btn.classList.remove('btn-processing');
        }, 650);
      }
    }
  }, true);
}

// Request persistent storage to protect IndexedDB from browser eviction.
// Browsers only grant this automatically for installed PWAs or bookmarked sites.
// We try once immediately, then retry silently on first user interaction.
if (typeof window !== 'undefined' && navigator.storage?.persist) {
  const requestPersist = async () => {
    try {
      const already = await navigator.storage.persisted();
      if (already) return; // Already granted — nothing to do

      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('[Storage] Persistent storage granted ✅');
      }
      // Silently ignore denial — not a code error, purely a browser decision
    } catch (_) {
      // Storage API not supported or blocked — ignore silently
    }
  };

  // Try immediately (works for installed PWAs)
  requestPersist();

  // Retry once on first user gesture (click/keydown) — browsers are more likely
  // to grant persistent storage when triggered by a real user interaction
  const retryOnInteraction = () => {
    requestPersist();
    window.removeEventListener('click', retryOnInteraction);
    window.removeEventListener('keydown', retryOnInteraction);
  };
  window.addEventListener('click', retryOnInteraction, { once: true, passive: true });
  window.addEventListener('keydown', retryOnInteraction, { once: true, passive: true });
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
