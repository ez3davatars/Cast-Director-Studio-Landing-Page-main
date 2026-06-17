import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  ShoppingBag,
  Repeat,
  Key,
  Activity,
  Download,
  Mail,
  Users,
  LogOut,
  ChevronLeft,
  Inbox,
  MessageSquare,
  UserCheck,
  Banknote,
  LayoutDashboard,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { AdminFeedbackProvider } from './AdminFeedback';

interface AdminLayoutProps {
  session: Session;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  featureFlag?: string;
}

interface NavGroup {
  name: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ session }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Define navigation groups with business-focused names
  const navGroups: NavGroup[] = [
    {
      name: 'Dashboard',
      items: [],
      defaultOpen: true,
    },
    {
      name: 'Commerce',
      items: [
        { name: 'Orders', path: '/admin/orders', icon: <ShoppingBag size={18} /> },
        { name: 'Subscriptions', path: '/admin/subscriptions', icon: <Repeat size={18} /> },
        { name: 'Licenses', path: '/admin/licenses', icon: <Key size={18} /> },
        { name: 'Downloads', path: '/admin/downloads', icon: <Download size={18} /> },
      ],
      defaultOpen: true,
    },
    {
      name: 'Customers & CRM',
      items: [
        { name: 'Customers', path: '/admin/customers', icon: <Users size={18} /> },
        { name: 'Contact Leads', path: '/admin/leads', icon: <MessageSquare size={18} /> },
        { name: 'Emails', path: '/admin/emails', icon: <Mail size={18} /> },
        { name: 'Support Inbox', path: '/admin/inbox', icon: <Inbox size={18} />, featureFlag: 'VITE_INBOUND_EMAIL_ENABLED' },
      ],
      defaultOpen: false,
    },
    {
      name: 'Affiliate Program',
      items: [
        { name: 'Affiliates', path: '/admin/affiliates', icon: <UserCheck size={18} /> },
        { name: 'Affiliate Applications', path: '/admin/affiliate-applications', icon: <UserCheck size={18} /> },
        { name: 'Affiliate Program', path: '/admin/affiliate-program', icon: <FileText size={18} /> },
        { name: 'Payouts', path: '/admin/payouts', icon: <Banknote size={18} /> },
        { name: 'Affiliate Assets', path: '/admin/affiliate-assets', icon: <FileText size={18} /> },
      ],
      defaultOpen: false,
    },
    {
      name: 'System',
      items: [
        { name: 'Webhooks', path: '/admin/webhooks', icon: <Activity size={18} /> },
      ],
      defaultOpen: false,
    },
  ];

  // State for managing expanded groups with localStorage persistence
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('cds_admin_sidebar_groups');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // localStorage not available, use defaults
    }
    // Default state
    return {
      Dashboard: true,
      Commerce: true,
      'Customers & CRM': false,
      'Affiliate Program': false,
      System: false,
    };
  });

  // Auto-expand group if it contains the active route
  useEffect(() => {
    navGroups.forEach(group => {
      const hasActiveChild = group.items.some(item => location.pathname === item.path);
      if (hasActiveChild && !expandedGroups[group.name]) {
        setExpandedGroups(prev => {
          const next = { ...prev, [group.name]: true };
          localStorage.setItem('cds_admin_sidebar_groups', JSON.stringify(next));
          return next;
        });
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [groupName]: !prev[groupName] };
      localStorage.setItem('cds_admin_sidebar_groups', JSON.stringify(next));
      return next;
    });
  };

  // Helper to check if group has visible items (considering feature flags)
  const getVisibleItems = (group: NavGroup) => {
    return group.items.filter(item => {
      if (!item.featureFlag) return true;
      return import.meta.env[item.featureFlag] === 'true';
    });
  };

  const activeItem = navGroups
    .flatMap(group => group.items)
    .find(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const pageTitle = location.pathname === '/admin' ? 'Operations Overview' : activeItem?.name || 'Admin Operations';

  return (
    <div className="flex h-screen bg-nano-dark text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-black border-r border-nano-border flex flex-col flex-shrink-0">
        <div className="h-20 flex flex-col justify-center px-6 border-b border-nano-border">
          <span className="font-mono text-nano-yellow font-bold tracking-wider">
            CDS ADMIN OPS
          </span>
          <span className="text-[10px] text-nano-text uppercase tracking-widest">
            v2.0 Operations
          </span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 flex flex-col gap-3 px-4">
          {/* Dashboard - Always visible, not collapsible */}
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <LayoutDashboard size={18} />
            <span className="font-medium text-sm">Dashboard</span>
          </NavLink>

          {/* Collapsible Groups */}
          {navGroups.slice(1).map((group) => {
            const visibleItems = getVisibleItems(group);
            const isExpanded = expandedGroups[group.name];
            const groupHasActiveChild = visibleItems.some(item => location.pathname === item.path);

            return (
              <div key={group.name}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={isExpanded}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-md transition-colors w-full text-left text-xs font-bold text-nano-text uppercase tracking-widest hover:text-white hover:bg-white/5"
                >
                  <span>{group.name}</span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Group Items */}
                {isExpanded && (
                  <div className="mt-1 space-y-1 ml-2 border-l border-nano-border/40 pl-3">
                    {visibleItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${
                            isActive
                              ? 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`
                        }
                      >
                        {item.icon}
                        <span className="font-medium">{item.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-nano-border flex flex-col gap-2">
           <button 
             onClick={() => navigate('/')}
             className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors w-full"
           >
             <ChevronLeft size={16} /> Exit Admin
           </button>
           <button 
             onClick={handleSignOut}
             className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors w-full"
           >
             <LogOut size={16} /> Sign Out
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-nano-dark overflow-y-auto">
        <header className="h-20 border-b border-nano-border flex items-center justify-between px-8 flex-shrink-0 bg-black/50 backdrop-blur-md sticky top-0 z-10">
          <h1 className="text-xl font-bold font-sans tracking-wide">
            {pageTitle}
          </h1>
          <div className="text-xs text-nano-text bg-black px-3 py-1 rounded border border-nano-border">
            {session.user.email} (Admin)
          </div>
        </header>
        <div className="p-8">
          <AdminFeedbackProvider>
            <Outlet />
          </AdminFeedbackProvider>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
