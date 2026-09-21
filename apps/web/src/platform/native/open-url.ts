/**
 * Opens an in-app path from a notification. Only relative paths of this app are accepted, so a
 * notification can never send the app's web view to another site.
 */
export function openInApp(
  url: unknown,
  navigate: (url: string) => void = (u) => window.location.assign(u),
): void {
  // "//host" and "/\host" are treated as other sites by browsers.
  if (typeof url !== 'string' || !url.startsWith('/') || /^\/[/\\]/.test(url)) return;
  if (window.location.pathname + window.location.search === url) return;
  navigate(url);
}
