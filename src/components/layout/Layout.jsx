import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNavBar from './MobileNavBar';
import PortalGuide from '../common/PortalGuide';
import ImpersonationBanner from '../common/ImpersonationBanner';
import PlatformBroadcastBanner from '../common/PlatformBroadcastBanner';
import { SchoolNotificationProvider } from '../../context/SchoolNotificationContext';
import PortalToastContainer from '../common/PortalToastContainer';

const LayoutContent = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on route change (mobile)
  const handleOverlayClick = () => setSidebarOpen(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <ImpersonationBanner />
      <PlatformBroadcastBanner />
      <PortalToastContainer />
      
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Mobile Overlay */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={handleOverlayClick}
        />

        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <div className="main-content">
          <Header
            title={title}
            onMenuClick={() => setSidebarOpen(prev => !prev)}
          />
          <main className="page-content">
            {children}
          </main>
        </div>
      </div>

      {/* Role-Specific Sequential Spotlight Portal Guide */}
      <PortalGuide />

      {/* Mobile Native App Bottom Navigation Bar */}
      <MobileNavBar />
    </div>
  );
};

const Layout = ({ children, title }) => {
  return (
    <SchoolNotificationProvider>
      <LayoutContent title={title}>
        {children}
      </LayoutContent>
    </SchoolNotificationProvider>
  );
};

export default Layout;
