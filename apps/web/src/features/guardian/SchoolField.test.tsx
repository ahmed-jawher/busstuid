import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@/i18n';
import { SchoolField } from './AddChildPage';

vi.mock('@/lib/api', () => ({
  api: vi.fn(async () => [
    { ar: 'المدرسة البريطانية', en: 'British School', kind: 'private', gov: 'northern' },
  ]),
}));

initI18n('ar');

function Harness() {
  const [value, setValue] = useState('');
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SchoolField value={value} onChange={setValue} />
      <button type="button">outside</button>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe('SchoolField', () => {
  it('closes the list on a tap outside or Escape, and reopens on tap', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    expect(await screen.findByText('المدرسة البريطانية')).toBeTruthy();

    // A tap inside the list does not close it.
    act(() => {
      fireEvent.pointerDown(screen.getByText('المدرسة البريطانية'));
    });
    expect(screen.queryByText('المدرسة البريطانية')).toBeTruthy();

    act(() => {
      fireEvent.pointerDown(screen.getByText('outside'));
    });
    expect(screen.queryByText('المدرسة البريطانية')).toBeNull();

    fireEvent.click(input);
    expect(await screen.findByText('المدرسة البريطانية')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByText('المدرسة البريطانية')).toBeNull();
  });

  it('fills the field when a school is picked', async () => {
    render(<Harness />);
    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.focus(input);
    fireEvent.click(await screen.findByText('المدرسة البريطانية'));
    expect(input.value).toBe('المدرسة البريطانية');
  });
});
