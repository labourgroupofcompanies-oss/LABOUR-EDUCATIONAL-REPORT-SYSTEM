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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
