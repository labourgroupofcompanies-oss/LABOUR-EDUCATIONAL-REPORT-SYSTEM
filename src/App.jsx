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
import SyncEngineProvider from './store/SyncEngineProvider';
import ReferralPage from './pages/referrals/ReferralPage';
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

// Platform Developer & Operations Imports
import SuperAdminRoute from './components/layout/SuperAdminRoute';
import PlatformShellLayout from './components/layout/PlatformShellLayout';
import DeveloperLayout from './components/developer/DeveloperLayout';
import DeveloperDashboard from './pages/developer/DeveloperDashboard';
import ApiKeyManager from './pages/developer/ApiKeyManager';
import ApiDocsCenter from './pages/developer/ApiDocsCenter';
import ApiVersionManager from './pages/developer/ApiVersionManager';
import WebhookManager from './pages/developer/WebhookManager';
import SandboxEnvironment from './pages/developer/SandboxEnvironment';
import ApiAnalytics from './pages/developer/ApiAnalytics';
import SecurityCenter from './pages/developer/SecurityCenter';
import SdkDownloads from './pages/developer/SdkDownloads';
import AcademicCalendarManager from './pages/developer/AcademicCalendarManager';

import OperationsLayout from './components/operations/OperationsLayout';
import OperationsDashboard from './pages/operations/OperationsDashboard';
import OperationsSchoolsDirectory from './pages/operations/OperationsSchoolsDirectory';
import SchoolDetailView from './pages/operations/SchoolDetailView';
import OperationsSupportCenter from './pages/operations/OperationsSupportCenter';
import OperationsSubscriptions from './pages/operations/OperationsSubscriptions';
import OperationsInterventionsAudit from './pages/operations/OperationsInterventionsAudit';
import OperationsSchoolAnalytics from './pages/operations/OperationsSchoolAnalytics';
import ReferralManagementDashboard from './pages/developer/ReferralManagementDashboard';
import PlatformDeveloperRegister from './pages/auth/PlatformDeveloperRegister';
import BlogManager from './pages/operations/BlogManager';
import KnowledgeBase from './pages/knowledge/KnowledgeBase';


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
  return (
    <AuthProvider>
      <SyncEngineProvider>
        <ReloadPrompt />
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthListener />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Onboarding />} />
            <Route path="/join" element={<Onboarding />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/developer" element={<Navigate to="/platform/operations" replace />} />
            <Route path="/platform/register" element={<PlatformDeveloperRegister />} />
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

            {/* Platform Console Shell (Super Admin Only) */}
            <Route 
              path="/platform" 
              element={
                <SuperAdminRoute>
                  <PlatformShellLayout />
                </SuperAdminRoute>
              }
            >
              <Route index element={<Navigate to="/platform/operations" replace />} />

              {/* Developer Portal Sub-Routes */}
              <Route path="developer" element={<DeveloperLayout />}>
                <Route index element={<DeveloperDashboard />} />
                <Route path="transactions" element={<OperationsSubscriptions />} />
                <Route path="api-keys" element={<ApiKeyManager />} />
                <Route path="api-docs" element={<ApiDocsCenter />} />
                <Route path="api-versions" element={<ApiVersionManager />} />
                <Route path="webhooks" element={<WebhookManager />} />
                <Route path="sandbox" element={<SandboxEnvironment />} />
                <Route path="analytics" element={<ApiAnalytics />} />
                <Route path="security" element={<SecurityCenter />} />
                <Route path="sdk" element={<SdkDownloads />} />
                <Route path="blog" element={<BlogManager />} />
              </Route>

              {/* Platform Operations Center Sub-Routes */}
              <Route path="operations" element={<OperationsLayout />}>
                <Route index element={<OperationsDashboard />} />
                <Route path="schools" element={<OperationsSchoolsDirectory />} />
                <Route path="schools/:schoolId" element={<SchoolDetailView />} />
                <Route path="support" element={<OperationsSupportCenter />} />
                <Route path="subscriptions" element={<OperationsSubscriptions />} />
                <Route path="transactions" element={<OperationsSubscriptions />} />
                <Route path="referrals" element={<ReferralManagementDashboard />} />
                <Route path="calendar" element={<AcademicCalendarManager />} />
                <Route path="blog" element={<BlogManager />} />
                <Route path="interventions" element={<OperationsInterventionsAudit />} />
                <Route path="analytics" element={<OperationsSchoolAnalytics />} />
              </Route>
            </Route>

            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </SyncEngineProvider>
    </AuthProvider>
  );
}

export default App;

