/**
 * The design system's icon set: simple filled/line glyphs on a 24px grid, drawn in currentColor.
 * Decorative by default (aria-hidden); give the surrounding control an accessible name instead.
 */
const PATHS = {
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="9" rx="2" fill="currentColor" />
      <rect x="13" y="4" width="7" height="5" rx="2" fill="currentColor" />
      <rect x="4" y="15" width="7" height="5" rx="2" fill="currentColor" />
      <rect x="13" y="11" width="7" height="9" rx="2" fill="currentColor" />
    </>
  ),
  mic: (
    <>
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  book: (
    <path
      d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5v-15ZM5 20.5A2.5 2.5 0 0 0 7.5 23H19v-3"
      fill="currentColor"
      transform="translate(0 -1.5)"
    />
  ),
  tests: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" fill="currentColor" />
      <path d="M9 10h6M9 14h4" stroke="var(--color-card)" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4.5 20.5c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6H4.5Z" fill="currentColor" />
    </>
  ),
  settings: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M10.3 2.8h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.9L4.2 8.2l1.7-2.9 2.3.8 1.6-.9.5-2.4ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      transform="translate(0 0.2)"
    />
  ),
  search: (
    <path d="m20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  ),
  bell: (
    <path
      d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5l1.5-2ZM10 20.5a2 2 0 0 0 4 0"
      fill="currentColor"
    />
  ),
  layers: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" fill="currentColor" />
      <path d="M7 4h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" fill="currentColor" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 10h18" stroke="var(--color-card)" strokeWidth="1.6" />
    </>
  ),
  check: <path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  passed: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" fill="none" stroke="var(--color-card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  pending: (
    <path d="M7 3h10M7 21h10M8 3v3.5l4 5.5 4-5.5V3M8 21v-3.5l4-5.5 4 5.5V21" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  failed: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <path d="m9 9 6 6m0-6-6 6" stroke="var(--color-card)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="13" r="8" fill="currentColor" />
      <path d="M12 9v4.2l2.6 1.6" fill="none" stroke="var(--color-card)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 4.5 3 6.5M19 4.5l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.6" fill="currentColor" />
    </>
  ),
  chevronDown: <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  retry: (
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      {PATHS[name]}
    </svg>
  );
}
