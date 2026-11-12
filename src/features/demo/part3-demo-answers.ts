import { POINT_IDS, sideOf, type PointId } from "@/domain/speaking/argument-task";

/**
 * Made-up demo answers for the Part 3 mock demo (`?mock=1`), written as a student might say them. Pure data,
 * browser-safe. They are fed to the Part 3 mock evaluator (`server/demo/part3-demo.ts`), never to a real model, and
 * are not the anchor answers (those are test-only, in test/evaluation-samples/part3-anchors.ts).
 *
 * The answer follows the points the student chose on the preparation screen:
 *  - "first": each chosen FOR point is developed with a reason and an example; each chosen AGAINST point is only
 *    stated and then argued against ("Some people say …, but …"), the rebuttal rule of docs/part3-plan.md, decision 8.
 *    So the AGAINST side is covered but gets no reason of its own: the band stops at 4 and the goal is to support it.
 *  - "full" (a retry): every chosen point is developed.
 */
export interface Part3DemoAnswer {
  intro: string;
  /** One or two sentences per point: the point, a reason and an example. */
  developed: Record<PointId, string>;
  /** AGAINST points stated only to be argued against. */
  rebutted: Record<"A1" | "A2" | "A3", string>;
  /** Turns from the FOR side to the AGAINST side. */
  turn: string;
  conclusion: string;
}

export type Part3DemoVariant = "first" | "full";

export const PART3_DEMO_ANSWERS: Record<string, Part3DemoAnswer> = {
  "c1-part3-cars-in-city-centres": {
    intro:
      "Whether cities should ban private cars from their centres is a question that divides opinion, and I am agree that both sides have a point.",
    developed: {
      F1: "The most obvious benefit would be cleaner air, because exhaust fumes are one of the main causes of breathing problems in big cities. In Tashkent in winter you can actually see the smog hanging over the streets.",
      F2: "Streets would also be safer for pedestrians and cyclists, since most accidents in the centre happen when drivers is in a hurry. My younger brother cycles to school, and twice last year he was nearly hit by a taxi.",
      F3: "What's more, more people would use public transport if driving into the centre were no longer an option. When my uncle's office moved next to a metro station, he sold his car within a month.",
      A1: "For elderly and disabled people, a car is often a necessity rather than a luxury, because many of them cannot walk from a bus stop to a hospital. My grandmother, for instance, would simply stop visiting her doctor.",
      A2: "Shops in the centre could also lose customers, since people who drive would rather go to a shopping mall with free parking. Small family businesses depend on passing trade, and some of them might close.",
      A3: "Another problem is that public transport is not good enough in many cities, for example the buses in my district are overcrowded and irregular. Without a dependable alternative, a ban would leave people stuck.",
    },
    rebutted: {
      A1: "Some people say a ban would be difficult for elderly and disabled people, but in my view special permits could solve that easily.",
      A2: "Some people say shops and businesses in the centre may lose customers, but busy pedestrian streets usually attract more visitors, not fewer.",
      A3: "Some people say public transport is not good enough, but the metro here is cheap and fast, and new bus lines open every year.",
    },
    turn: "That said, the arguments against a ban should not be dismissed.",
    conclusion:
      "Having weighed up both sides, I'd say a complete ban would be too drastic for now. On balance, a gradual approach with clear exceptions seems more safer for everybody.",
  },
  "c1-part3-smartphones-under-14": {
    intro:
      "Whether children under 14 should be allowed to own a smartphone is a question that many parents argue about, and I can see both sides.",
    developed: {
      F1: "The clearest benefit of a ban would be less screen time, because many children stay up late scrolling and then struggle to concentrate in class. My cousin, for example, used to watch videos until two in the morning.",
      F2: "Children would also be protected from harmful content, since even a short search can lead to violent videos or strangers who send messages. Most young children cannot judge which websites deserve their trust.",
      F3: "What's more, they would spend more face-to-face time with friends, because they would play outside instead of sitting alone with a phone. When our school banned phones at break time, the playground became noisy and lively again.",
      A1: "Parents, however, need to reach them in an emergency, for instance when a bus is cancelled or a child gets lost on the way home. A phone gives the whole family real peace of mind.",
      A2: "A smartphone is also useful for learning and homework, because pupils can check a dictionary or join an online lesson from home. During the pandemic, my sister did a whole term of lessons on her phone.",
      A3: "Children without one may also feel left out, since most class news is shared in chats that they cannot join. Being the only one without a phone can be surprisingly lonely at that age.",
    },
    rebutted: {
      A1: "Some people say parents need to reach their children in an emergency, but a simple phone without internet would do that job.",
      A2: "Some people say smartphones are useful for learning and homework, but school computers and libraries already provide that.",
      A3: "Some people say children without one may feel left out, but if every family follows the same rule, nobody is different.",
    },
    turn: "That said, the arguments against a ban are just as serious.",
    conclusion:
      "Having weighed up both sides, I'd say an outright ban goes too far. On balance, a basic phone at first and a smartphone at around fourteen seems the wisest choice.",
  },
  "c1-part3-sugar-tax": {
    intro:
      "Whether governments should put a special tax on sugary drinks and fast food is a question that divides opinion, and both sides make fair points.",
    developed: {
      F1: "The main argument for the tax is that fewer people would become overweight, because higher prices really do change what families buy. Diabetes is becoming common even among teenagers in my city.",
      F2: "The money could also pay for health services, for example new equipment for hospitals or free check-ups at local clinics. With long queues for some doctors, that would make a real difference.",
      F3: "What's more, companies would make healthier products, since no firm wants to pay extra tax on every bottle it sells. Several drinks brands have already changed their recipes to avoid such taxes abroad.",
      A1: "On the other hand, the tax would be unfair to families on low incomes, because they spend a much larger share of their budget on food. For them, even a small rise in prices means something else has to go.",
      A2: "Many people also believe that adults should decide what they eat, since the state has no business choosing their meals for them. Personal freedom matters, even when people make choices that are not perfect.",
      A3: "Finally, lack of exercise may be a bigger problem than food, because many people sit at a desk all day and never do any sport. A tax on burgers will not get anyone to the gym.",
    },
    rebutted: {
      A1: "Some people say the tax would be unfair to families on low incomes, but healthy food at the bazaar is already cheaper than fast food.",
      A2: "Some people say adults should decide what they eat, but the state already taxes cigarettes for the same reason.",
      A3: "Some people say lack of exercise is a bigger problem than food, yet diet and exercise clearly go together.",
    },
    turn: "That said, the case against the tax deserves attention.",
    conclusion:
      "Having weighed up both sides, I think a small tax is reasonable if the money goes back into public health. All things considered, it should come together with cheaper fruit and vegetables.",
  },
};

/** The points used when the student ticked none on a side: the first two of that side. */
export const DEFAULT_POINTS: readonly PointId[] = ["F1", "F2", "A1", "A2"];

/** The demo answer for a task, the chosen points and a variant; null for a task without a demo answer. */
export function part3DemoTranscript(taskId: string, chosen: readonly PointId[], variant: Part3DemoVariant): string | null {
  const answer = PART3_DEMO_ANSWERS[taskId];
  if (!answer) return null;
  const ordered = POINT_IDS.filter((id) => chosen.includes(id));
  const forPoints = ordered.filter((id) => sideOf(id) === "for").map((id) => answer.developed[id]);
  const againstPoints = ordered
    .filter((id) => sideOf(id) === "against")
    .map((id) => (variant === "first" ? answer.rebutted[id as "A1" | "A2" | "A3"] : answer.developed[id]));
  return [answer.intro, ...forPoints, ...(againstPoints.length ? [answer.turn, ...againstPoints] : []), answer.conclusion].join(" ");
}
