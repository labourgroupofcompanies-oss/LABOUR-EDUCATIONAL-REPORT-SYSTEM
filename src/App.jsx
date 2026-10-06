import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './store/AuthContext';
import Login from './pages/auth/Login';
import Onboarding from './pages/auth/Onboarding';
import { supabase } from './lib/supabase';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import LearnerList from './pages/learners/LearnerList';
import TeacherList from './pages/teachers/TeacherList';
import SchoolSetup from './pages/setup/SchoolSetup';
import Settings from './pages/setup/Settings';
import ScoreEntry from './pages/scores/ScoreEntry';
import MasterScoreViewer from './pages/scores/MasterScoreViewer';
import Reports from './pages/reports/Reports';
import ClassTeacherEntry from './pages/teachers/ClassTeacherEntry';
import Financials from './pages/financials/Financials';
import ScoreDiagnostic from './pages/setup/ScoreDiagnostic';
import Promotions from './pages/learners/Promotions';
import NotFound from './pages/NotFound';
import ReloadPrompt from './components/common/ReloadPrompt';
import MobileInstallPrompt from './components/common/MobileInstallPrompt';
import SyncEngineProvider from './store/SyncEngineProvider';
import ReferralPage from './pages/referrals/ReferralPage';
import referralService from './services/referralService';
import HeadteacherSupport from './pages/support/HeadteacherSupport';
import RecycleBin from './pages/recycle-bin/RecycleBin';

// Parent Portal Imports
import ParentLogin from './pages/parent/ParentLogin';
import ParentDashboard from './pages/parent/ParentDashboard';
import ParentReportView from './pages/parent/ParentReportView';
import ParentFeesView from './pages/parent/ParentFeesView';
import HeadTeacherMessages from './pages/parent/HeadTeacherMessages';
import PublicReceiptVerification from './pages/financials/PublicReceiptVerification';
import authService from './services/authService';

// Public Knowledge Base & Legal
import KnowledgeBase from './pages/knowledge/KnowledgeBase';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';



const ParentProtectedRoute = ({ children }) => {
  const parent = authService.getCurrentParent();
  if (!parent) return <Navigate to="/parent/login" replace />;
  return children;
};


const AuthListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AuthListener] Event received: ${event}`);
      if (event === 'PASSWORD_RECOVERY') {
        console.log('[AuthListener] PASSWORD_RECOVERY event received, navigating to /reset-password');
        navigate('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return null;
};


function App() {
  useEffect(() => {
    // One-time self-healing reset for DODI-PAPASE RC JHS test referral and notifications
    const KEY = 'dodi_papase_test_referral_cleared_v1';
    if (!localStorage.getItem(KEY)) {
      referralService.clearSchoolReferralsAndHistory('SCH-DRJ3984')
        .then(() => {
          localStorage.setItem(KEY, 'true');
          console.info('[App] Cleaned DODI-PAPASE RC JHS test referral and messages.');
        })
        .catch(err => console.warn('[App] Auto-clear DODI notice:', err));
    }
  }, []);

  return (
    <AuthProvider>
      <SyncEngineProvider>
        <ReloadPrompt />
        <MobileInstallPrompt />
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthListener />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Onboarding />} />
            <Route path="/join" element={<Onboarding />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/learners" 
              element={
                <ProtectedRoute role="super_admin">
                  <LearnerList />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/all-scores" 
              element={
                <ProtectedRoute role="super_admin">
                  <MasterScoreViewer />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/promotions" 
              element={
                <ProtectedRoute role="super_admin">
                  <Promotions />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/teachers" 
              element={
                <ProtectedRoute role="super_admin">
                  <TeacherList />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/setup" 
              element={
                <ProtectedRoute role="super_admin">
                  <SchoolSetup />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/support" 
              element={
                <ProtectedRoute>
                  <HeadteacherSupport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/manuals" 
              element={
                <ProtectedRoute>
                  <KnowledgeBase />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/financials" 
              element={
                <ProtectedRoute role="super_admin">
                  <Financials />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/recycle-bin" 
              element={
                <ProtectedRoute role="super_admin">
                  <RecycleBin />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/referrals" 
              element={
                <ProtectedRoute>
                  <ReferralPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/scores" 
              element={
                <ProtectedRoute>
                  <ScoreEntry />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/score-diagnostic" 
              element={
                <ProtectedRoute role="super_admin">
                  <ScoreDiagnostic />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reports" 
              element={
                <ProtectedRoute role="super_admin">
                  <Reports />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/class-remarks" 
              element={
                <ProtectedRoute>
                  <ClassTeacherEntry />
                </ProtectedRoute>
              } 
            />
            {/* Parent Portal Routes */}
            <Route path="/parent/login" element={<ParentLogin />} />
            <Route 
              path="/parent/dashboard" 
              element={
                <ParentProtectedRoute>
                  <ParentDashboard />
                </ParentProtectedRoute>
              } 
            />
            <Route 
              path="/parent/report/:learnerId" 
              element={
                <ParentProtectedRoute>
                  <ParentReportView />
                </ParentProtectedRoute>
              } 
            />
            <Route 
              path="/messages" 
              element={
                <ProtectedRoute role="super_admin">
                  <HeadTeacherMessages />
                </ProtectedRoute>
              } 
            />

            {/* Public Receipt Verification Route */}
            <Route path="/verify-receipt/:receiptNumber" element={<PublicReceiptVerification />} />

            {/* Public Privacy Policy & Legal Terms */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* Public Educational Blog, Circulars & User Guides */}
            <Route path="/blog" element={<KnowledgeBase />} />
            <Route path="/blog/:slug" element={<KnowledgeBase />} />
            <Route path="/resources/blog" element={<KnowledgeBase />} />
            <Route path="/resources/blog/:slug" element={<KnowledgeBase />} />
            <Route path="/guides" element={<KnowledgeBase />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </SyncEngineProvider>
    </AuthProvider>
  );
}

export default App;

