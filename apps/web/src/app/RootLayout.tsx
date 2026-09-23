import { Outlet } from 'react-router';

/**
 * Every screen draws its own frame (title bar, tabs, sidebar) as in Claude Design, so the root
 * layout only hosts the routes. Language and dark mode live in each interface's account screen.
 */
export function RootLayout() {
  return <Outlet />;
}
