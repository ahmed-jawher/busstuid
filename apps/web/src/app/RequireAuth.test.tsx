import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@/i18n';
import type { Me } from '@/lib/types';
import { ACCEPT_PATH, RequireAuth } from './RequireAuth';

// Clause 9 of the terms says a person agrees again after the documents change, before carrying
// on. That sentence is only true if this gate holds, so it is tested like any other rule.
const session = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/session', () => ({ useSession: () => session.value }));

initI18n('ar');
afterEach(cleanup);

const me = (extra: Partial<Me>): Me =>
  ({
    id: 'u1',
    email: 'parent@example.com',
    fullNameAr: 'ولي أمر',
    emailVerified: true,
    mustAcceptTerms: false,
    memberships: [],
    ...extra,
  }) as Me;

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<div>home</div>} />
          <Route path={ACCEPT_PATH} element={<div>agree again</div>} />
        </Route>
        {/* Public, exactly as in the real router: the code screen is reachable unverified. */}
        <Route path="/verify-email" element={<div>verify</div>} />
        <Route path="/welcome" element={<div>welcome</div>} />
        <Route path="/login" element={<div>sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('sends an account that has not agreed to the new documents to the agreement screen', () => {
    session.value = { signedIn: true, loading: false, me: me({ mustAcceptTerms: true }) };
    renderAt('/');
    expect(screen.getByText('agree again')).toBeTruthy();
  });

  it('does not send the agreement screen to itself', () => {
    session.value = { signedIn: true, loading: false, me: me({ mustAcceptTerms: true }) };
    renderAt(ACCEPT_PATH);
    expect(screen.getByText('agree again')).toBeTruthy();
  });

  it('lets an account that has agreed through', () => {
    session.value = { signedIn: true, loading: false, me: me({}) };
    renderAt('/');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('still asks for the email code first', () => {
    session.value = {
      signedIn: true,
      loading: false,
      me: me({ emailVerified: false, mustAcceptTerms: true }),
    };
    renderAt('/');
    expect(screen.getByText('verify')).toBeTruthy();
  });

  it('sends a signed-out visitor to the welcome screen', () => {
    session.value = { signedIn: false, loading: false, me: undefined };
    renderAt('/');
    expect(screen.getByText('welcome')).toBeTruthy();
  });
});
