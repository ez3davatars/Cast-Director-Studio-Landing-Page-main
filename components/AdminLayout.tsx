import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  Inbox
} from 'lucide-react';

interface AdminLayoutProps {
  session: Session;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ session }) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const phase1Items = [
    { name: 'Orders', path: '/admin/orders', icon: <ShoppingBag size={18} /> },
    { name: 'Subscriptions', path: '/admin/subscriptions', icon: <Repeat size={18} /> },
    { name: 'Licenses', path: '/admin/licenses', icon: <Key size={18} /> },
    { name: 'Webhooks', path: '/admin/webhooks', icon: <Activity size={18} /> },
  ];

  const phase2Items = [
    { name: 'Downloads', path: '/admin/downloads', icon: <Download size={18} /> },
    { name: 'Emails', path: '/admin/emails', icon: <Mail size={18} /> },
    { name: 'Customers', path: '/admin/customers', icon: <Users size={18} /> },
  ];

  const phase3Items = [
    { name: 'Support Inbox', path: '/admin/inbox', icon: <Inbox size={18} /> },
  ];

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
        
        <nav className="flex-1 overflow-y-auto py-6 flex flex-col gap-2 px-4">
          <div className="text-xs font-bold text-nano-text uppercase tracking-widest mb-2 px-2">
            Phase 1
          </div>
          {phase1Items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.icon}
              <span className="font-medium text-sm">{item.name}</span>
            </NavLink>
          ))}
          
          <div className="text-xs font-bold text-nano-text uppercase tracking-widest mt-6 mb-2 px-2">
            Phase 2
          </div>
          {phase2Items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.icon}
              <span className="font-medium text-sm">{item.name}</span>
            </NavLink>
          ))}
          
          {import.meta.env.VITE_INBOUND_EMAIL_ENABLED === 'true' && (
            <>
              <div className="text-xs font-bold text-nano-text uppercase tracking-widest mt-6 mb-2 px-2">
                Phase 3
              </div>
              {phase3Items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                      isActive
                        ? 'bg-nano-yellow/10 text-nano-yellow border border-nano-yellow/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {item.icon}
                  <span className="font-medium text-sm">{item.name}</span>
                </NavLink>
              ))}
            </>
          )}
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
            Operations Dashboard
          </h1>
          <div className="text-xs text-nano-text bg-black px-3 py-1 rounded border border-nano-border">
            {session.user.email} (Admin)
          </div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
