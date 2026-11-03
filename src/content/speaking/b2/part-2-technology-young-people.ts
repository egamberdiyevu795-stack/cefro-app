import type { SpeakingTask } from "@/domain/speaking/task";

/**
 * Multilevel Part 2 (official Question 7): three questions on one topic, target level B2.
 *
 * Version 2: re-authored for the official band scale. The opinion question that used to sit above the points is now
 * the topic introduction, so the student answers exactly the three numbered questions the rubric scores.
 */
export const b2Part2TechnologyYoungPeople: SpeakingTask = {
  id: "b2-part2-technology-young-people",
  version: 2,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "Technology and young people",
  topic: "Technology & society",
  question:
    "Some people say that smartphones and social media are making young people less sociable. Others believe technology helps young people build and keep friendships. Answer the three questions below.",
  prompts: [
    "How do you and people your age use technology to communicate?",
    "What are the main advantages and disadvantages of social media for young people?",
    "Should schools limit the use of smartphones? Why or why not?",
  ],
  instructions: [
    "You will have 1 minute to prepare. You may make notes on paper.",
    "Then speak for up to 2 minutes. Try to use most of the time.",
    "Answer all three questions. Each one you leave out lowers your band.",
    "Give reasons and at least one specific example from your own experience.",
  ],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: [
    "Question 1 is answered when the student describes how they or people their age communicate with technology (apps, calls, messages, social media).",
    "Question 2 is answered when the student gives at least one advantage or disadvantage of social media for young people; both sides make a fuller answer but one side is still on topic.",
    "Question 3 is answered when the student gives a position on schools limiting smartphones; a reason makes it a full answer.",
    "General talk about technology that never touches a question's point does not answer that question.",
    "Typical topic vocabulary at B2: face-to-face interaction, screen time, distraction, stay in touch, addicted, cyberbullying.",
  ].join("\n"),
};
