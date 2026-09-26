import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DirectorySchool } from '@wusool/shared';
import { FieldLabel, inputClass } from '@/components/ui/kit';
import { api } from '@/lib/api';

/**
 * Schools published by the ministry (docs: packages/shared/src/schools.ts). Picking from the
 * list means every family writes the same school the same way; a school that is not listed yet
 * can still be typed.
 */
export function SchoolField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Close the list on a touch or click anywhere outside the field, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const schools = useQuery({
    queryKey: ['schools', value],
    queryFn: () => api<DirectorySchool[]>(`/schools?country=BH&q=${encodeURIComponent(value)}`),
    enabled: open,
  });
  const label = (s: DirectorySchool) => (i18n.language === 'en' ? s.en : s.ar);
  const matches = (schools.data ?? []).filter((s) => label(s) !== value.trim());
  return (
    <div ref={box} className="flex flex-col gap-1.5">
      <FieldLabel label={t('guardian.schoolName')}>
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder={t('gd.add.schoolPh')}
          autoComplete="off"
          className={inputClass}
        />
      </FieldLabel>
      <p className="text-xs text-muted">{t('gd.add.schoolHint')}</p>
      {open && matches.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-[14px] border border-border bg-surface">
          {matches.map((s) => (
            <li key={s.ar}>
              <button
                type="button"
                onClick={() => {
                  onChange(label(s));
                  setOpen(false);
                }}
                className="flex min-h-12 w-full items-center px-3.5 py-2 text-start text-[15px]"
              >
                {label(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
