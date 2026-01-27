import React from 'react';
import { useAuth } from '@/hooks/useAuth';

interface RoleBasedLayoutProps {
  children: React.ReactNode;
  requiredPermission?: number;
  fallback?: React.ReactNode;
  className?: string;
}

const RoleBasedLayout: React.FC<RoleBasedLayoutProps> = ({
  children,
  requiredPermission = 1,
  fallback = null,
  className = ""
}) => {
  const { profile } = useAuth();
  
  const hasPermission = profile && profile.permission_lvl >= requiredPermission;
  
  if (!hasPermission) {
    return fallback ? <div className={className}>{fallback}</div> : null;
  }
  
  return <div className={className}>{children}</div>;
};

export default RoleBasedLayout;