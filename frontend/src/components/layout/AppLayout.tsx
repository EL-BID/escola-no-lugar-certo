import { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

/** Main layout wrapper for the application content. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Main content area */}
      <main className="flex-1 min-h-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
