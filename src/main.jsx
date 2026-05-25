import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './assets/styles/global.css'

// One-time cleanup: clear old session if from a previous DB version
const DB_KEY = 'labour_edu_db_version';
if (localStorage.getItem(DB_KEY) !== 'LabourEduReportSystem_v1') {
  localStorage.removeItem('labour_edu_session');
  localStorage.setItem(DB_KEY, 'LabourEduReportSystem_v1');
}

// Global override for window.alert to provide premium, unified styled toast notifications
window.alert = (message) => {
  const msgLower = (message || '').toLowerCase();
  let icon = 'fa-info-circle';
  let title = 'Notification';
  let accentColor = '#3b82f6';
  let bgGradient = 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)';
  let textColor = '#1e40af';
  let progressBg = '#3b82f6';

  if (msgLower.includes('success') || msgLower.includes('saved') || msgLower.includes('activated') || msgLower.includes('sync')) {
    if (!msgLower.includes('failed')) {
      icon = 'fa-circle-check';
      title = 'Success';
      accentColor = '#10b981';
      bgGradient = 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
      textColor = '#065f46';
      progressBg = '#10b981';
    }
  }
  
  if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('must') || msgLower.includes('please') || msgLower.includes('invalid') || msgLower.includes('already')) {
    icon = 'fa-triangle-exclamation';
    title = 'Alert / Warning';
    accentColor = '#ef4444';
    bgGradient = 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
    textColor = '#991b1b';
    progressBg = '#ef4444';
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
    border-left: 6px solid ${accentColor};
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
        <h5 style="margin: 0; font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${accentColor};">
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
    <div style="position: absolute; bottom: 0; left: 6px; right: 0; height: 3px; background: rgba(0,0,0,0.05);">
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
      background: rgba(15, 23, 42, 0.4);
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
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.05);
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
    const iconColor = isDanger ? '#ef4444' : '#0d9488';
    const iconBg = isDanger ? 'rgba(239, 68, 68, 0.08)' : 'rgba(13, 148, 136, 0.08)';
    const actionBtnColor = isDanger ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)';
    const actionBtnShadow = isDanger ? 'rgba(239, 68, 68, 0.25)' : 'rgba(13, 148, 136, 0.25)';

    card.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: flex-start;">
        <div style="width: 48px; height: 48px; border-radius: 14px; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <h4 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a; letter-spacing: -0.01em;">
            ${isDanger ? 'Are you sure?' : 'Please Confirm'}
          </h4>
          <p style="margin: 0; font-size: 0.9rem; font-weight: 600; color: #475569; line-height: 1.5;">
            ${message}
          </p>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 0.5rem;">
        <button class="custom-confirm-cancel" style="
          padding: 0.75rem 1.35rem;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #475569;
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
