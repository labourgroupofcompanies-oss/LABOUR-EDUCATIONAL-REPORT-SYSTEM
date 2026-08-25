import React from 'react';
import { useAuth } from '../../store/AuthContext';
import AccessDenied403 from './AccessDenied403';
import LogoPreloader from '../common/LogoPreloader';

const SuperAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LogoPreloader fullScreen={true} size="lg" text="Authenticating..." />;
  }

  if (!user || user.role !== 'super_admin') {
    return <AccessDenied403 />;
  }

  return children;
};

export default SuperAdminRoute;
