import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ToastProvider } from './components/toast';
import { applyTheme, prefs } from './app/preferences';
import { createAppRouter } from './app/router';
import { initI18n } from './i18n';
import { ApiError } from './lib/api';
import { SessionProvider } from './lib/session';
import './styles.css';

initI18n(prefs.locale());
applyTheme(prefs.theme(), prefs.scheme());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Client errors will not fix themselves; network hiccups might.
      retry: (count, e) =>
        count < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={createAppRouter()} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
