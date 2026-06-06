import { requireAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return (
    <div className="flex min-h-screen w-screen max-w-[100vw] overflow-x-hidden">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0 w-full max-w-[100vw] overflow-x-hidden">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8 lg:py-8 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
