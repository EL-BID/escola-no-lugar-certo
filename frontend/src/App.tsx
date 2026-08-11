import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { queryClient } from './lib/api/client';
import { DashboardPage } from './pages/DashboardPage';
import { AppErrorBoundary, AppLayout, MobileGuard } from './components/layout';
import { Toaster } from 'sonner';
import './App.css'

function App() {
  return (
    <MobileGuard>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <BrowserRouter>
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors />
        </AppErrorBoundary>
      </QueryClientProvider>
    </MobileGuard>
  );
}

export default App
