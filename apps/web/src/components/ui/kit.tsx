import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Icon, type IconName } from '@/components/Icon';
import { cn } from '@/lib/cn';

// Building blocks of the Tammeni redesign (Claude Design "Tammeni Brand"): rounded panels,
// tinted status pills, icon tiles, switches, bottom sheets. Colour is never the only signal:
// pills carry an icon and a word (PLAN §15).

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('overflow-hidden rounded-[18px] border border-border bg-surface', className)}
    >
      {children}
    </div>
  );
}

export type Tone = 'neutral' | 'primary' | 'ok' | 'warning' | 'alert' | 'alertSolid';

export const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  ok: 'bg-ok-soft text-status-alighted',
  warning: 'bg-warning-soft text-warning',
  alert: 'bg-alert-soft text-alert',
  alertSolid: 'bg-alert text-alert-foreground',
};

/** Text colour alone, for icons and figures of a tone. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  primary: 'text-primary',
  ok: 'text-status-alighted',
  warning: 'text-warning',
  alert: 'text-alert',
  alertSolid: 'text-alert',
};

export function Pill({
  tone,
  icon,
  children,
  className,
}: {
  tone: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold',
        TONES[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} fill size={15} />}
      {children}
    </span>
  );
}

/** Tinted icon square at the start of list rows. */
export function IconTile({
  icon,
  tone = 'primary',
  size = 40,
  fill,
  className,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-xl', TONES[tone], className)}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} fill={fill ?? tone === 'alertSolid'} size={Math.round(size * 0.55)} />
    </span>
  );
}

/** Striped placeholder with the first letter, where a child's photo is not shown. */
export function Initial({
  name,
  size = 36,
  round = false,
  className,
}: {
  name: string;
  size?: number;
  round?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center font-bold text-muted',
        round ? 'rounded-full' : 'rounded-[10px]',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background:
          'repeating-linear-gradient(45deg, var(--color-surface-2) 0 6px, var(--color-border) 6px 12px)',
      }}
    >
      {name.trim()[0]}
    </span>
  );
}

/** A child's photo when there is one, otherwise the striped initial. */
export function ChildAvatar({
  name,
  photoUrl,
  size = 52,
  round = true,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  round?: boolean;
}) {
  return photoUrl ? (
    <img
      src={photoUrl}
      alt=""
      className={cn('shrink-0 object-cover', round ? 'rounded-full' : 'rounded-2xl')}
      style={{ width: size, height: size }}
    />
  ) : (
    <Initial name={name} size={size} round={round} />
  );
}

/** Round initial on a tinted background, for people (drivers, admins, the account owner). */
export function PersonBadge({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {name.trim()[0]}
    </span>
  );
}

const rowClass =
  'flex min-h-13.5 w-full items-center gap-3 border-b border-border px-4 text-start last:border-b-0 active:bg-surface-2';

/** Tappable list row (link) with a disclosure chevron. */
export function RowLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cn(rowClass, className)}>
      {children}
      <Icon name="chevron_right" size={20} flip="rtl" className="text-muted" />
    </Link>
  );
}

export function RowButton({
  onClick,
  children,
  className,
  chevron = false,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  chevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(rowClass, 'disabled:opacity-60', className)}
    >
      {children}
      {chevron && <Icon name="chevron_right" size={20} flip="rtl" className="text-muted" />}
    </button>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(rowClass, 'active:bg-transparent', className)}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pt-1.5 text-[13px] font-semibold text-muted">{children}</h2>;
}

/** On/off switch drawn like the design; it is a real `role="switch"` button. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(rowClass, 'py-3 disabled:opacity-60')}
    >
      {icon && <Icon name={icon} className="text-muted" />}
      <span className="flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] text-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex h-7.5 w-12.5 shrink-0 rounded-full p-0.75 transition-colors',
          checked ? 'justify-end bg-primary' : 'justify-start bg-border',
        )}
      >
        <span className="size-6 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

/** Two or three mutually exclusive options in a pill track (filters, modes). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-surface-2 p-0.75">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 flex-1 rounded-[10px] text-sm font-semibold',
              on ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Choice chip (a child, a relationship, a weekday). */
export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-10 rounded-full border px-4 text-sm font-semibold',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface',
      )}
    >
      {children}
    </button>
  );
}

/** Back arrow and a title, at the top of inner screens. */
export function BackBar({
  to,
  onBack,
  title,
  end,
  light = false,
}: {
  to?: string;
  onBack?: () => void;
  title?: ReactNode;
  end?: ReactNode;
  /** White arrow on a dark background. */
  light?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1.5 py-2">
      <button
        type="button"
        aria-label={t('common.back')}
        onClick={() => (onBack ? onBack() : to ? navigate(to) : navigate(-1))}
        className={cn(
          '-ms-2.5 flex size-11 shrink-0 items-center justify-center rounded-full',
          light ? 'text-white active:bg-white/10' : 'text-foreground active:bg-surface-2',
        )}
      >
        <Icon name="chevron_right" size={26} flip="ltr" />
      </button>
      {title && <div className="min-w-0 flex-1 truncate text-lg font-bold">{title}</div>}
      {!title && <span className="flex-1" />}
      {end}
    </div>
  );
}

/** Bottom sheet on <dialog> (focus trap and Escape come from the browser). */
export function Sheet({
  open,
  onClose,
  title,
  tone = 'default',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={id}
      className="mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-lg rounded-t-[26px] border-0 bg-surface p-0 text-foreground backdrop:bg-[#050814]/55"
    >
      <div
        className="flex flex-col gap-3 px-4 pt-5"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <span className="h-1.25 w-10 self-center rounded-full bg-border" aria-hidden="true" />
        <h2 id={id} className={cn('text-xl font-bold', tone === 'danger' && 'text-alert')}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

/** Big primary action at the bottom of onboarding and wizard screens. */
export const bigButton =
  'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-bold disabled:opacity-60';

/** Standard input look of the redesign. */
export const inputClass =
  'min-h-13 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary aria-invalid:border-[1.5px] aria-invalid:border-alert';

export function FieldLabel({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[12.5px] font-semibold text-alert">
          {error}
        </span>
      ) : (
        hint && <span className="text-[12.5px] font-normal text-muted">{hint}</span>
      )}
    </label>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2 text-sm font-semibold text-alert">
      <Icon name="error" size={20} />
      {children}
    </div>
  );
}

/** Bahrain-only phone field: fixed +973 and 8 digits (Claude Design "Tammeni Onboarding"). */
export function PhoneInput({
  value,
  onChange,
  invalid,
  placeholder = '3312 4455',
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2" dir="ltr">
      <span className="flex min-h-13 items-center rounded-xl border border-border bg-surface-2 px-3 text-base font-medium">
        +973
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, '').slice(0, 9))}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, 'min-w-0 flex-1')}
      />
    </div>
  );
}

/**
 * A full phone-style screen. It draws under the notch and home indicator itself (the page body
 * has no safe-area padding), in a centred column on wide screens.
 */
export function Screen({
  children,
  className,
  tone = 'default',
  tabs = false,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'navy' | 'alert' | 'ok';
  /** Leaves room for the bottom tab bar. */
  tabs?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      data-screen={tone}
      className={cn(
        'flex flex-col',
        // Inside a tab shell the screen fills what the tab bar leaves; otherwise the viewport.
        tabs ? 'flex-1' : 'min-h-dvh',
        tone === 'navy' && 'bg-brand-navy text-white',
        tone === 'alert' && 'bg-alert text-alert-foreground',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full flex-1 flex-col gap-4 px-4.5',
          wide ? 'max-w-3xl' : 'max-w-lg',
          className,
        )}
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: tabs ? '1.5rem' : 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Big rounded icon at the top of onboarding and result screens. */
export function IconBadge({
  icon,
  tone = 'primary',
  size = 64,
  round = false,
  fill = false,
}: {
  icon: IconName;
  tone?: 'primary' | 'warning' | 'ok' | 'alert';
  size?: number;
  round?: boolean;
  fill?: boolean;
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    warning: 'bg-warning-soft text-warning',
    ok: 'bg-ok-soft text-status-alighted',
    alert: 'bg-alert-soft text-alert',
  };
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center',
        round ? 'rounded-full' : 'rounded-[20px]',
        tones[tone],
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} fill={fill} size={Math.round(size * 0.54)} />
    </div>
  );
}
