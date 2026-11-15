/*
 * UZBMB's official conversion of the raw multilevel speaking total to the 0-75 speaking score.
 *
 * SOURCE: UZBMB, "Ko'p darajali format gapirish ko'nikmasini baholash reyting shkalasi" (rating scale for multilevel speaking),
 *   https://uzbmb.uz/upload/file/pdf/phone/reyting_shkala.pdf, listed on https://gov.uz/oz/uzbmb/sections/view/49531.
 *   Table supplied by the project owner as text and checked against the source on 2026-11-13.
 *
 * RAW is the SUM of the four speaking marks: Q1-3 (0-5) + Q4-6 (0-5) + Q7 (0-5) + Q8 (0-6), maximum 21. It goes in HALF-point
 * steps (an examiner average can end in .5), so there are 43 rows, not 22. Our part bands are those marks (docs/official-scale.md,
 * section 1.4), so our own sums are whole numbers; the half points are kept because the official table has them.
 *
 * Do not edit a value without the source in hand, and never add a row by interpolation.
 */
export const SPEAKING_SCORE_TABLE_SOURCE = {
  title: "Ko'p darajali format gapirish ko'nikmasini baholash reyting shkalasi",
  url: "https://uzbmb.uz/upload/file/pdf/phone/reyting_shkala.pdf",
  listedAt: "https://gov.uz/oz/uzbmb/sections/view/49531",
  checked: "2026-11-13",
} as const;

/** [raw total, official 0-75 speaking score], from raw 0 up to raw 21 in half-point steps. */
export const SPEAKING_SCORE_TABLE: readonly (readonly [raw: number, score: number])[] = [
  [0, 0],
  [0.5, 10],
  [1, 11],
  [1.5, 13],
  [2, 15],
  [2.5, 17],
  [3, 19],
  [3.5, 21],
  [4, 23],
  [4.5, 24],
  [5, 26],
  [5.5, 27],
  [6, 29],
  [6.5, 30],
  [7, 32],
  [7.5, 33],
  [8, 35],
  [8.5, 37],
  [9, 38],
  [9.5, 39],
  [10, 40],
  [10.5, 42],
  [11, 43],
  [11.5, 45],
  [12, 46],
  [12.5, 47],
  [13, 49],
  [13.5, 50],
  [14, 51],
  [14.5, 52],
  [15, 54],
  [15.5, 56],
  [16, 57],
  [16.5, 59],
  [17, 61],
  [17.5, 63],
  [18, 64],
  [18.5, 65],
  [19, 67],
  [19.5, 69],
  [20, 71],
  [20.5, 73],
  [21, 75],
];
