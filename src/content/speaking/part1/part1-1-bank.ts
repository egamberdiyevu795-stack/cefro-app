/**
 * Part 1.1 question bank (official Questions 1–3, target A2).
 *
 * Source: a teacher's "Part 1.1 full list" (owner upload, 2026-11-15, /mnt/project-files/uzbmb/teacher-lists/
 * part1.1-question-list.jpg). **Owner decision 2026-11-15:** these are standard exam phrases, so the questions are used
 * WORD FOR WORD, including the "a / b" alternatives (the screen shows the slash; the audio says "or").
 *
 * Tiers are the list's colours: red = most common (1–10), blue = very common (11–20), black = rare (21–30).
 * Themes follow the list's note: the exam usually asks one home/hometown question, one daily life/free time question and
 * one personal preference question (food, teacher, pets, …). The theme of each question is our classification.
 *
 * `n` is the list's own number and is part of every set's id (`a2-part1-1-set-04-06-08`): never renumber or reuse one.
 * Changing a question's wording changes what stored attempts were asked: add a new question instead, and bump
 * `PART11_BANK_VERSION` only for a change that affects assessment.
 */

export type Part11Tier = "most_common" | "very_common" | "rare";
export type Part11Theme = "home" | "daily" | "preference";

export interface Part11Question {
  /** The list's number (1–30). */
  n: number;
  /** Word for word from the list. */
  text: string;
  tier: Part11Tier;
  theme: Part11Theme;
  /**
   * Questions about the same thing in different themes (food, sport). A set never asks two questions with the same
   * subject, so "favourite food" and "breakfast" never come together.
   */
  subject?: "food" | "sport";
  /** Short label for the set's title ("Hometown, weekends, first teacher"). */
  label: string;
  /** For the evaluator: when the question counts as answered. Never sent to the browser. */
  answeredWhen: string;
}

export const PART11_BANK_VERSION = 1;

export const PART11_QUESTIONS: readonly Part11Question[] = [
  // ---- Most common (red, 1–10)
  { n: 1, tier: "most_common", theme: "home", text: "Do you live in a house or a flat?", label: "House or flat",
    answeredWhen: "says whether they live in a house or a flat (an apartment); one word such as 'A flat.' is enough." },
  { n: 2, tier: "most_common", theme: "home", text: "Can you describe your house / your home?", label: "Your home",
    answeredWhen: "says anything about their house or home (size, rooms, where it is, what it looks like)." },
  { n: 3, tier: "most_common", theme: "home", text: "Can you describe your room?", label: "Your room",
    answeredWhen: "says anything about their own room (size, furniture, colour, what they do there)." },
  { n: 4, tier: "most_common", theme: "home", text: "Tell me about your hometown.", label: "Hometown",
    answeredWhen: "names or describes the town or city they come from or live in." },
  { n: 5, tier: "most_common", theme: "daily", text: "What do you do in your free time?", label: "Free time",
    answeredWhen: "names something they do in their free time." },
  { n: 6, tier: "most_common", theme: "daily", text: "What do you usually do at the weekends?", label: "Weekends",
    answeredWhen: "names something they do at the weekend (activities, places, people)." },
  { n: 7, tier: "most_common", theme: "daily", text: "What do you do in the evenings?", label: "Evenings",
    answeredWhen: "names something they do in the evening." },
  { n: 8, tier: "most_common", theme: "preference", text: "Tell me about your first teacher.", label: "First teacher",
    answeredWhen: "says anything about their first teacher (name, what they were like, what they taught). Talking about school in general without the teacher does not answer it." },
  { n: 9, tier: "most_common", theme: "preference", subject: "food", text: "What is your favourite food / meal?", label: "Favourite food",
    answeredWhen: "names a food or meal they like; a reason is welcome but not needed." },
  { n: 10, tier: "most_common", theme: "daily", subject: "food", text: "What do you usually eat for breakfast?", label: "Breakfast",
    answeredWhen: "names something they eat or drink for breakfast (or says they don't eat breakfast)." },

  // ---- Very common (blue, 11–20)
  { n: 11, tier: "very_common", theme: "preference", text: "Do you have any pets?", label: "Pets",
    answeredWhen: "says whether they have a pet (a 'no' answer counts), or names one." },
  { n: 12, tier: "very_common", theme: "daily", text: "What do you do to stay healthy?", label: "Staying healthy",
    answeredWhen: "names something they do for their health (food, sport, sleep, walking)." },
  { n: 13, tier: "very_common", theme: "daily", subject: "sport", text: "Do you do any sports / exercise?", label: "Sports",
    answeredWhen: "says whether they do sport or exercise (a 'no' answer counts), or names one." },
  { n: 14, tier: "very_common", theme: "preference", text: "Tell me about your close / best friend.", label: "Best friend",
    answeredWhen: "says anything about a close friend (name, what they are like, what they do together)." },
  { n: 15, tier: "very_common", theme: "preference", text: "Tell me about your school.", label: "Your school",
    answeredWhen: "says anything about their school (or university, college, lyceum)." },
  { n: 16, tier: "very_common", theme: "home", text: "What is your favourite room in your house?", label: "Favourite room",
    answeredWhen: "names a room in their house that they like." },
  { n: 17, tier: "very_common", theme: "daily", text: "How often do you use the internet?", label: "The internet",
    answeredWhen: "says how often or how much they use the internet, or what they use it for." },
  { n: 18, tier: "very_common", theme: "daily", text: "Do you have a mobile phone?", label: "Mobile phone",
    answeredWhen: "says whether they have a mobile phone (a 'no' answer counts), or says anything about their phone." },
  { n: 19, tier: "very_common", theme: "preference", text: "What is your favourite season?", label: "Favourite season",
    answeredWhen: "names a season (spring, summer, autumn, winter) they like." },
  { n: 20, tier: "very_common", theme: "home", text: "Tell me about your neighbourhood.", label: "Neighbourhood",
    answeredWhen: "says anything about the area where they live (streets, shops, neighbours, parks)." },

  // ---- Rare (black, 21–30)
  { n: 21, tier: "rare", theme: "preference", text: "What is your favourite singer / type of music?", label: "Music",
    answeredWhen: "names a singer, band or type of music they like." },
  { n: 22, tier: "rare", theme: "preference", subject: "sport", text: "Who is your favourite sports person?", label: "Sports person",
    answeredWhen: "names a sportsperson they like (or says they don't have one and why)." },
  { n: 23, tier: "rare", theme: "daily", text: "How do you spend time with your family?", label: "Family time",
    answeredWhen: "names something they do with their family. Talking about friends or school does not answer it." },
  { n: 24, tier: "rare", theme: "preference", subject: "food", text: "What is your favourite drink?", label: "Favourite drink",
    answeredWhen: "names a drink they like." },
  { n: 25, tier: "rare", theme: "home", text: "What do you like about your hometown?", label: "Your hometown",
    answeredWhen: "names something they like about their town or city." },
  { n: 26, tier: "rare", theme: "preference", subject: "food", text: "Do you like cooking?", label: "Cooking",
    answeredWhen: "says whether they like cooking (a 'no' answer counts), or what they cook." },
  { n: 27, tier: "rare", theme: "daily", text: "How often do you watch TV?", label: "TV",
    answeredWhen: "says how often they watch TV, or what they watch (a 'never' answer counts)." },
  { n: 28, tier: "rare", theme: "daily", text: "What time do you usually get up / go to bed?", label: "Getting up",
    answeredWhen: "gives a time (or a part of the day) when they get up or go to bed; either one is enough." },
  { n: 29, tier: "rare", theme: "daily", text: "Tell me about your typical weekday / typical day.", label: "Typical day",
    answeredWhen: "says anything they do on a normal day (morning, school or work, evening)." },
  { n: 30, tier: "rare", theme: "daily", text: "Do you like outdoor activities?", label: "Outdoor activities",
    answeredWhen: "says whether they like doing things outside, or names an outdoor activity." },
];

export function part11Question(n: number): Part11Question | undefined {
  return PART11_QUESTIONS.find((q) => q.n === n);
}

/** What the examiner's voice says: the list's "a / b" read as "a or b". The screen keeps the list's own text. */
export function spokenQuestionText(text: string): string {
  return text.replace(/\s*\/\s*/g, " or ");
}
