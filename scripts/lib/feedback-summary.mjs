// Pure summary of "Was this feedback helpful?" rows, shared by scripts/feedback-stats.mjs and its unit test.
// Each row: { part: number | null, helpful: 0 | 1 | null (SQLite) or boolean, provider: string | null }.

const count = (rows) => {
  let yes = 0;
  let no = 0;
  let open = 0;
  for (const { helpful } of rows) {
    if (helpful === null || helpful === undefined) open += 1;
    else if (helpful === 1 || helpful === true) yes += 1;
    else no += 1;
  }
  return { yes, no, open };
};

const line = (label, rows) => {
  const { yes, no, open } = count(rows);
  const answered = yes + no;
  const share = answered === 0 ? "—" : `${Math.round((yes / answered) * 100)}% Yes`;
  return `  ${label.padEnd(22)} scored=${String(rows.length).padEnd(5)} yes=${String(yes).padEnd(4)} no=${String(no).padEnd(4)} not answered=${String(open).padEnd(5)} ${share}`;
};

/** Lines to print: all scored attempts, then per part (1, 2, 3), then per scorer. */
export function feedbackSummary(rows) {
  const lines = [line("All scored attempts", rows)];
  const parts = [...new Set(rows.map((r) => r.part ?? null))].sort((a, b) => (a ?? 99) - (b ?? 99));
  for (const part of parts) lines.push(line(part === null ? "Part unknown" : `Part ${part}`, rows.filter((r) => (r.part ?? null) === part)));
  const providers = [...new Set(rows.map((r) => r.provider ?? "none"))].sort();
  for (const provider of providers) {
    const label = provider === "mock" ? "Scorer mock (test)" : `Scorer ${provider}`;
    lines.push(line(label, rows.filter((r) => (r.provider ?? "none") === provider)));
  }
  return lines;
}

export const countFeedback = count;
