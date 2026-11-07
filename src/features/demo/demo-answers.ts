/**
 * Made-up demo answers for mock mode, one per Part 2 task, written as a student might say them. Each is three parts,
 * one per question. The "first" answer leaves out question 3 (the common mistake), so its result has a question goal;
 * the "full" answer (a retry) answers all three. They are fed to the mock evaluator (`server/demo/demo-data.ts`), never to a
 * real model. Pure data, browser-safe.
 */
export interface DemoAnswer {
  /** Questions 1 and 2: the student's own story. */
  story: [string, string];
  /** Question 3: the general opinion. */
  opinion: string;
}

export type DemoAnswerVariant = "first" | "full";

export const DEMO_ANSWERS: Record<string, DemoAnswer> = {
  "b2-part2-advice-from-someone": {
    story: [
      "The best advice I got came from my grandfather. I was in a difficult situation, because I had failed my maths exam and I wanted to give up school.",
      "His advice was simple: study a little every day and ask the teacher when I don't understand. I decided to do exactly that, and after three months my marks went up.",
    ],
    opinion:
      "However, I don't think young people should always follow advice from older people. Older people have experience, but the world changes fast, so young people should listen and then decide for themselves.",
  },
  "b2-part2-important-decision": {
    story: [
      "The most important decision I made was to move to Tashkent for university. I made the decision two years ago, when I finished school in Samarkand.",
      "Why did I decide this? The courses were much stronger there. It did change my life: I live on my own now, I cook for myself and I have friends from every region.",
    ],
    opinion:
      "In my view it is better to ask others for help with big decisions. Although you decide alone in the end, other people see problems that you can't see yourself.",
  },
  "b2-part2-goal-you-set": {
    story: [
      "Last year I set a goal to run five kilometres without stopping. Why did I choose it? I felt tired all the time and I wanted to be healthier.",
      "To reach it I ran three times a week and added a little more distance every week. After four months I did succeed, and I was really proud of myself.",
    ],
    opinion:
      "I think some people never reach their goals because their goals are too big. On the other hand, a small step every day is easy, so people should start with a small goal.",
  },
  "b2-part2-working-in-a-team": {
    story: [
      "At school our task was to make a short film about our city, and there were four of us in the team: two friends, my cousin and me.",
      "My role was to write the script and organise the filming days. The team did well in the end, and our film won second prize in the school competition.",
    ],
    opinion:
      "I believe people achieve more working in a team than working alone. However, a team only works when everyone knows their role, otherwise people argue and nothing gets done.",
  },
  "b2-part2-trying-and-failing": {
    story: [
      "I was trying to get a place in the national chess tournament, because chess has been my hobby since I was seven.",
      "Everything went wrong in the last game: I was nervous, I made a silly mistake and I lost. I felt terrible for a week and I didn't want to play at all.",
    ],
    opinion:
      "Still, I think failure can be very useful for young people. As a result of failing, you learn what to change, whereas success teaches you much less.",
  },
  "b2-part2-a-tradition": {
    story: [
      "My favourite tradition is Navruz, the spring holiday. It happens every year on the twenty-first of March, when spring begins.",
      "My whole family takes part: we get together at my grandmother's house and cook sumalak all night. What I enjoy about it most is singing and talking until the morning.",
    ],
    opinion:
      "I think young people should keep old traditions in the modern world. Although life is faster now, traditions keep families together and remind us of our roots.",
  },
  "b2-part2-happy-day": {
    story: [
      "It was last summer. Where was it? At the lake near our village, and I was with my parents and my two sisters.",
      "What happened was that my sister came home from abroad after two years, and we spent the whole day together. I was so happy that I couldn't stop smiling.",
    ],
    opinion:
      "Money doesn't really make people happier, in my opinion. On the other hand, people need enough money to live, but after that, family and friends matter much more.",
  },
};

/** The transcript of a demo answer: the story only ("first"), or the story and the opinion ("full"). */
export function demoAnswerText(taskId: string, variant: DemoAnswerVariant): string | null {
  const answer = DEMO_ANSWERS[taskId];
  if (!answer) return null;
  return [...answer.story, ...(variant === "full" ? [answer.opinion] : [])].join(" ");
}
