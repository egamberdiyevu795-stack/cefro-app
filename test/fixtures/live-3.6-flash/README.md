# Live evaluator outputs: gemini-3.6-flash (NOT the production model)

> **Not production.** Production evaluates with `gemini-3.8-flash`. These outputs come from a free-tier run with
> `gemini-3.6-flash` (set only for that run with `GEMINI_EVALUATION_MODEL`), so bands and judgements may differ from
> what production would return. Use them as realistic model output for offline tests, never as production evidence.

- **What:** the 19 scorings that finished in the live check of 2026-11-06 (evaluator 3.5.0, commit `4edee53`), one
  file per Part 2 band anchor, every finished run. Made-up anchors only (`test/evaluation-samples/part2-band-anchors.ts`);
  no student data, no S15, no key.
- **Not included:** `A0-picture-only` and runs 2–3 of `A0-memorized-off-topic` (the free tier's 20-requests-per-day
  limit stopped the run), S15 and the retry pair.
- **Shape:** each run's `evaluation` is the evaluator's `SpeakingEvaluation` without `quality`
  (`LiveFixtureEvaluation` in `index.ts`). `result` is exactly what the model run produced; `latencyMs`,
  `modelCalls`, tokens and the answering model come from the run's report. Version stamps, `promptHash` (deterministic)
  and `modelConfig.audioAssessment` were rebuilt from the code at that commit. The quality-gate report was not saved by
  the run, so it is left out; `qualityPassed` is `true` where the live test asserted it and `null` where it did not.
- **Checked:** `test/live-3.6-flash-fixtures.test.ts` validates every `result` against the evaluator's result schema and
  recomputes every band from the saved judgements.

| Anchor | Expected band | Bands per run |
|---|---|---|
| A0-below-b1 | 0 | **2, 2, 0** (differs in runs 1–2) |
| A1-b1-only-q3 | 1 | 1, 1, 1 |
| A2-b1-all-three | 2 | 2, 2, 2 |
| A3-b2-q3-missing | 3 | 3, 3, 3 |
| A4-b2-all-three | 4 | 4, 4, 4 |
| A5-above-b2 | 5 | 5, 5, 5 |
| A0-memorized-off-topic | 0 | 0 (1 run) |
