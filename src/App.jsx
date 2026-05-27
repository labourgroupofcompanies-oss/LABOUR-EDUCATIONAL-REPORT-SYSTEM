import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './store/AuthContext';
import Login from './pages/auth/Login';
import Onboarding from './pages/auth/Onboarding';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import LearnerList from './pages/learners/LearnerList';
import TeacherList from './pages/teachers/TeacherList';
import SchoolSetup from './pages/setup/SchoolSetup';
import Settings from './pages/setup/Settings';
import ScoreEntry from './pages/scores/ScoreEntry';
import Reports from './pages/reports/Reports';
import ClassTeacherEntry from './pages/teachers/ClassTeacherEntry';
import Financials from './pages/financials/Financials';
import Promotions from './pages/learners/Promotions';
import NotFound from './pages/NotFound';
import ReloadPrompt from './components/common/ReloadPrompt';
import SyncEngineProvider from './store/SyncEngineProvider';

// Parent Portal Imports
import ParentLogin from './pages/parent/ParentLogin';
import ParentDashboard from './pages/parent/ParentDashboard';
import ParentReportView from './pages/parent/ParentReportView';
import ParentFeesView from './pages/parent/ParentFeesView';
import HeadTeacherMessages from './pages/parent/HeadTeacherMessages';
import authService from './services/authService';


const ParentProtectedRoute = ({ children }) => {
  const parent = authService.getCurrentParent();
  if (!parent) return <Navigate to="/parent/login" replace />;
  return children;
};


function App() {
  return (
    <AuthProvider>
      <SyncEngineProvider>
        <ReloadPrompt />
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
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
                <ProtectedRoute role="super_admin">
                  <Settings />
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
              path="/scores" 
              element={
                <ProtectedRoute>
                  <ScoreEntry />
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
              path="/parent/fees/:learnerId" 
              element={
                <ParentProtectedRoute>
                  <ParentFeesView />
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

            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </SyncEngineProvider>
    </AuthProvider>
  );
}

export default App;

