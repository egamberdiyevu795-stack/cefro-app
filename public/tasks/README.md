# Task pictures

Pictures shown with speaking tasks (official Part 2 shows one beside the three questions). Every file here must be
original CEFRO artwork or freely licensed. All current pictures are CEFRO's own: © 2026 CEFRO. All rights reserved.
(They were first drafted as CC0 1.0; that was changed before any of them was merged or published.)

Each picture's source and licence are recorded twice: in the task's `picture` field (`src/content/speaking/…`, stored
in each task snapshot) and in the table below. A test checks the two agree.

The picture only sets the scene. The student answers the questions, not the picture. The evaluator is told what the
picture shows (the task's `alt` text) and that describing it answers no question.

| File | Task | What it shows | Source | Licence |
|---|---|---|---|---|
| `advice-from-someone.svg` | `b2-part2-advice-from-someone` (v3) | An older man with grey hair and glasses on a park bench, one hand raised, giving advice to a teenage girl who holds a notebook and listens. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `important-decision.svg` | `b2-part2-important-decision` (v1) | A young man at the point where a path splits, hand on his chin; one path leads to a small house among trees, the other to a town; a signpost with two blank boards. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `goal-you-set.svg` | `b2-part2-goal-you-set` (v1) | A young woman with a backpack walking up a winding hill path towards a small red flag at the top, still far ahead. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `working-in-a-team.svg` | `b2-part2-working-in-a-team` (v1) | Four young people around a classroom table with a sheet of paper (simple shapes) and a block model; one points at the paper, one adds a block. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `trying-and-failing.svg` | `b2-part2-trying-and-failing` (v1) | A teenage boy in a helmet sitting on a park path, hand on his knee; his skateboard lies upside down a little way off. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `a-tradition.svg` | `b2-part2-a-tradition` (v1) | Three generations of a family behind a long table with a shared dish, flat breads, a teapot and bowls, under a string of small coloured flags. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `happy-day.svg` | `b2-part2-happy-day` (v1) | Three smiling young friends on the grass by a lake on a sunny day; the one in the middle has both arms raised; birds over the water. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |

### Part 1.2 pictures (`part1/`)

Part 1.2 shows two pictures. Their fields are stored in the task's `images` (`src`, `alt`, `author`, `sourceUrl`,
`licence`, `retrievedAt`; a test fails if one is missing) and listed here.

| File | Task | What it shows | Source | Licence |
|---|---|---|---|---|
| `part1/local-market.svg` | `b1-part1-2-shopping` (v1) | An open-air market: a seller in an apron behind a wooden stall of tomatoes, apples and green vegetables under a striped awning; a woman with a cloth bag points at the fruit. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |
| `part1/supermarket.svg` | `b1-part1-2-shopping` (v1) | Inside a large supermarket: long shelves of packets and bottles under bright ceiling lights; a man pushes a full trolley along the aisle towards the checkouts. | Original illustration made for CEFRO (2026). Not based on any existing image. | © 2026 CEFRO. All rights reserved. |

## Adding a picture

1. Use an original drawing (licence `© 2026 CEFRO. All rights reserved.`, no `licenceUrl`) or a freely licensed image
   (its licence name and `licenceUrl`, e.g. CC0 1.0). Never use a picture from an exam paper or a textbook.
2. Put it in this folder and set the task's `picture` (`src`, `alt`, `width`, `height`, `source`, `licence`, and
   `licenceUrl` for an open licence). Write `alt` as a plain description of what is in the picture: the evaluator reads it.
3. Add a row to the table above. For an existing task, bump its `version`; a new task starts at version 1.
4. The picture shows the topic, never an answer to a question: no text, no brands, no real people.
