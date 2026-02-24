'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/providers/ThemeProvider';
import {
  LayoutDashboard,
  FolderKanban,
  LayoutTemplate,
  Users,
  Shield,
  Sun,
  Moon,
  LogOut,
  RefreshCw,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  user: {
    id: string;
    name: string;
    username: string;
    role: string;
  };
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/team', label: 'Team', icon: Users },
];

const adminItems = [
  { href: '/admin', label: 'Admin', icon: Shield },
];

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const allItems = user.role === 'ADMIN' ? [...navItems, ...adminItems] : navItems;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-200 dark:border-surface-800">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">A</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-base font-bold text-surface-900 dark:text-white truncate">
              AgencyHub
            </h1>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hidden lg:flex"
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {allItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200'
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-surface-200 dark:border-surface-800 px-3 py-4 space-y-1">
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200 w-full transition-all"
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-surface-600 hover:bg-red-50 hover:text-red-700 dark:text-surface-400 dark:hover:bg-red-950 dark:hover:text-red-300 w-full transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* User */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-lg bg-surface-50 dark:bg-surface-800/50">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 dark:text-brand-300 text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-surface-900 shadow-elevated border border-surface-200 dark:border-surface-700"
      >
        <Menu className="w-5 h-5 text-surface-700 dark:text-surface-300" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-white dark:bg-surface-950 border-r border-surface-200 dark:border-surface-800 transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-white dark:bg-surface-950 border-r border-surface-200 dark:border-surface-800 transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-[260px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Spacer */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[260px]'}`} />
    </>
  );
}
