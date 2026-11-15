import Link from "next/link";
import { Card, CardHeader, Icon, cx, styles } from "@/components/ds";

/** One row of T3's "Class mocks" list: "Mock 3 · 10.11.26 · 8 of 9 finished". */
export interface ClassMockSummary {
  id: string;
  title: string;
  /** dd.mm.yy */
  date: string;
  finished: number;
  total: number;
  closed: boolean;
}

export const classMockLine = (m: Pick<ClassMockSummary, "date" | "finished" | "total" | "closed">) =>
  `${m.date} · ${m.finished} of ${m.total} finished${m.closed ? " · Closed" : ""}`;

/** T3's "Class mocks": each opens T8 (that mock's results). No black button. */
export function ClassMocksCard({ mocks, resultsHref }: { mocks: readonly ClassMockSummary[]; resultsHref: (classMockId: string) => string }) {
  return (
    <Card aria-labelledby="class-mocks-title" data-testid="class-mocks">
      <CardHeader id="class-mocks-title" title="Class mocks" />
      {mocks.length === 0 ? (
        <p className="text-body text-fg-muted">No class mock yet. Start the exam laptop to run one in class.</p>
      ) : (
        <ul className="-my-1">
          {mocks.map((m) => (
            <li key={m.id}>
              <Link href={resultsHref(m.id)} className={cx("-mx-2 flex items-center gap-3 rounded-tile px-2 py-2.5 transition-colors hover:bg-well", styles.FOCUS_RING)} data-testid="class-mock-row">
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-fg">{m.title}</span>
                  <span className="block text-label text-fg-muted">{classMockLine(m)}</span>
                </span>
                <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
