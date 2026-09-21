import { createBrowserRouter } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { RootLayout } from './RootLayout';

// Browser routing works both on the web and under capacitor://localhost, where Capacitor
// serves index.html for unknown paths. Deep links: /trip/:id, /child/:id, /alert/:id (PLAN §9.1).
export const routes = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'driver/*', element: <PlaceholderPage titleKey="home.driver" /> },
      { path: 'guardian/*', element: <PlaceholderPage titleKey="home.guardian" /> },
      { path: 'admin/*', element: <PlaceholderPage titleKey="home.admin" /> },
      { path: 'trip/:id', element: <PlaceholderPage titleKey="home.driver" /> },
      { path: 'child/:id', element: <PlaceholderPage titleKey="home.guardian" /> },
      { path: 'alert/:id', element: <PlaceholderPage titleKey="home.admin" /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
