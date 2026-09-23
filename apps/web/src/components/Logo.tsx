import { cn } from '@/lib/cn';

/** Tammeni mark: a smile under a sun, on indigo (Claude Design "Tammeni Brand"). */
export function Logo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect width="100" height="100" rx="26" fill="#243283" />
      <path
        d="M26 49 A24 24 0 0 0 74 49"
        fill="none"
        stroke="#fff"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <circle cx="50" cy="31" r="9" fill="#F5B82E" />
    </svg>
  );
}
