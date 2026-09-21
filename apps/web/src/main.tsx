import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { applyTheme, prefs } from './app/preferences';
import { createAppRouter } from './app/router';
import { initI18n } from './i18n';
import './styles.css';

initI18n(prefs.locale());
applyTheme(prefs.theme(), prefs.scheme());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 15_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createAppRouter()} />
    </QueryClientProvider>
  </StrictMode>,
);
