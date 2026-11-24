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
  scoring: (
    <path d="M7 3h10M7 21h10M8 3v3.5l4 5.5 4-5.5V3M8 21v-3.5l4-5.5 4 5.5V21" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
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
  /** Signed-out home: "See your own words quoted". */
  quote: (
    <path
      d="M4 11.5C4 8 6 5.6 9.2 5l.6 1.6C8 7.3 7.2 8.5 7 10h2.5a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 17h-4A1.5 1.5 0 0 1 4 15.5v-4ZM13 11.5C13 8 15 5.6 18.2 5l.6 1.6C17 7.3 16.2 8.5 16 10h2.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z"
      fill="currentColor"
    />
  ),
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />,
  /** Status glyphs (result page questions): a full check, a half-filled circle, a cross. */
  info: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1.25" fill="currentColor" />
    </>
  ),
  partly: (
    <>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15Z" fill="currentColor" />
    </>
  ),
  cross: <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  /** Task list: "Random topic", a topic picked for the student, as in the exam. */
  shuffle: (
    <path
      d="M4 7h3.2c1.6 0 3 .8 3.9 2.1l2.8 4.3c.9 1.3 2.3 2.1 3.9 2.1H20M4 17h3.2c1.2 0 2.3-.5 3.1-1.3M13.7 8.3c.8-.8 1.9-1.3 3.1-1.3H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  /** Practice brief: the questions stay hidden until the student starts, as in the exam. Drawn for a grey (well) circle. */
  eyeOff: (
    <>
      <path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      <path d="M4 4l16 16" stroke="var(--color-well)" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  /** Teacher view: Create class, Join a class. */
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  /** Practice: "Finish" (stop recording), and a microphone that is blocked or missing. */
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />,
  micOff: (
    <>
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="var(--color-card)" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
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
