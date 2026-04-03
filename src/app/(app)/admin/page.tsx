'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { User, ActivityLog } from '@/types';
import { Shield, Plus, UserX, UserCheck, Key, RefreshCw, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const { data: users, loading, refetch } = useFetch<User[]>('/api/users');
  const { data: activity } = useFetch<ActivityLog[]>('/api/activity?limit=30');
  const { data: me } = useFetch<any>('/api/auth/me', { pollInterval: false });
  const router = useRouter();
  const [showNewUser, setShowNewUser] = useState(false);
  const [showResetPw, setShowResetPw] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: '', name: '', role: 'MEMBER', password: '' });
  const [resetPassword, setResetPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (me && me.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [me, router]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { error } = await apiCall('/api/users', {
      method: 'POST',
      body: JSON.stringify(newUser),
    });
    if (error) toast.error(error);
    else {
      toast.success(`User ${newUser.username} created!`);
      setShowNewUser(false);
      setNewUser({ username: '', name: '', role: 'MEMBER', password: '' });
      refetch();
    }
    setCreating(false);
  };

  const handleToggleUser = async (userId: string, currentlyDisabled: boolean) => {
    const action = currentlyDisabled ? 'enable' : 'disable';
    if (!currentlyDisabled && !confirm('Disable this user? They will be logged out.')) return;

    const { error } = await apiCall('/api/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId, action }),
    });
    if (error) toast.error(error);
    else { toast.success(`User ${action}d`); refetch(); }
  };

  const handleResetPassword = async () => {
    if (!resetPassword || !showResetPw) return;
    const { error } = await apiCall('/api/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId: showResetPw, action: 'resetPassword', password: resetPassword }),
    });
    if (error) toast.error(error);
    else { toast.success('Password reset. User must change it on next login.'); setShowResetPw(null); setResetPassword(''); }
  };

  if (me && me.role !== 'ADMIN') return null;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Admin</h1>
            <p className="text-surface-500 dark:text-surface-400 text-sm">Manage team members and view activity</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="btn-ghost btn-sm"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowNewUser(true)} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add User</button>
        </div>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <h2 className="font-semibold text-surface-900 dark:text-white">Team Members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-surface-200 dark:border-surface-800">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-surface-500 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-surface-500 uppercase">Username</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-surface-500 uppercase">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-surface-500 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-surface-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-surface-400">Loading...</td></tr>
              ) : (
                users?.map(user => (
                  <tr key={user.id} className={user.disabled ? 'opacity-50' : ''}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center">
                          <span className="text-xs font-bold text-brand-700 dark:text-brand-300">{user.name.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-surface-900 dark:text-white">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-surface-600 dark:text-surface-400">@{user.username}</td>
                    <td className="px-5 py-3">
                      <span className={`badge ${
                        user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' :
                        user.role === 'GUEST' ? 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400' :
                        'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {user.disabled ? (
                        <span className="badge bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Disabled</span>
                      ) : user.mustChangePassword ? (
                        <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Needs password change</span>
                      ) : (
                        <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleUser(user.id, user.disabled)}
                          className="btn-ghost btn-sm"
                          title={user.disabled ? 'Enable user' : 'Disable user'}
                        >
                          {user.disabled ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => { setShowResetPw(user.id); setResetPassword(''); }}
                          className="btn-ghost btn-sm"
                          title="Reset password"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Log */}
      <div className="card p-0">
        <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <h2 className="font-semibold text-surface-900 dark:text-white">Recent Activity</h2>
        </div>
        <div className="divide-y divide-surface-100 dark:divide-surface-800 max-h-96 overflow-y-auto">
          {activity?.length === 0 ? (
            <div className="p-8 text-center text-surface-400 text-sm">No activity yet</div>
          ) : (
            activity?.map(log => (
              <div key={log.id} className="px-5 py-3">
                <p className="text-sm text-surface-700 dark:text-surface-300">
                  <span className="font-medium">{log.actor?.name}</span>
                  {' '}{log.action}{' '}
                  <span className="text-surface-500">{log.entityType}</span>
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {format(new Date(log.createdAt), 'MMM d, h:mm a')}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New User Modal */}
      {showNewUser && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowNewUser(false)}>
          <div className="card p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-surface-900 dark:text-white">Add Team Member</h2>
              <button onClick={() => setShowNewUser(false)} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="w-4 h-4 text-surface-500" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="label">Name *</label>
                <input value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="input" placeholder="Full name" required />
              </div>
              <div>
                <label className="label">Username *</label>
                <input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="input" placeholder="lowercase, no spaces" required />
              </div>
              <div>
                <label className="label">Initial Password *</label>
                <input value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="input" placeholder="At least 8 characters" required />
                <p className="text-xs text-surface-500 mt-1">User will be forced to change this on first login</p>
              </div>
              <div>
                <label className="label">Role</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="select">
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="GUEST">Guest</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNewUser(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPw && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowResetPw(null)}>
          <div className="card p-6 w-full max-w-sm animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Reset Password</h2>
            <div className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="input"
                  placeholder="Enter new password"
                  autoFocus
                />
                <p className="text-xs text-surface-500 mt-1">User will be required to change this on next login</p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowResetPw(null)} className="btn-secondary">Cancel</button>
                <button onClick={handleResetPassword} className="btn-primary">Reset Password</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
