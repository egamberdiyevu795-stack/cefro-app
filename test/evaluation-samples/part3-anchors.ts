/**
 * Part 3 anchor answers (TEST-ONLY, made up): one set per v1 topic (docs/part3-plan.md, sections 8 and 9), with the
 * judgements a correct examiner would give and the band code must compute from them. Topic 1 is the plan's own set
 * (verbatim, from prompt-overlap.fixtures.ts); topics 2 and 3 follow the same profiles:
 *   A0 below B1 · A1 reads the lists · A2 heavily dependent, B1 · A3 one side only, B2 · A4 both sides in full, B2 ·
 *   A5 both sides in full, C1 · R1 two points per side, one side only stated and then rebutted, C1 (cap 4).
 * Never shown to students and never sent to a model in this branch; calibration material for the live run.
 */
import { ANCHOR_0, ANCHOR_1, ANCHOR_2, ANCHOR_3, ANCHOR_4, ANCHOR_5, FIXTURE_R1 } from "@/domain/evaluation/multilevel/prompt-overlap.fixtures";
import type { PromptDependence } from "@/domain/evaluation/multilevel/prompt-overlap";
import type { Q8BiggestFix } from "@/domain/evaluation/q8/band-scoring";
import type { Q8Level } from "@/domain/evaluation/q8/levels";
import type { PointStatus } from "@/domain/evaluation/q8/model-output";
import type { Coverage } from "@/domain/evaluation/q8/rubric-config";
import type { PointId } from "@/domain/speaking/argument-task";

export interface Part3Anchor {
  id: string;
  taskId: string;
  transcript: string;
  /** Expected judgements (what a correct examiner says). Points not listed are not_addressed. */
  points: Partial<Record<PointId, PointStatus>>;
  rebutted?: PointId[];
  modelDependence: PromptDependence;
  /** One level for the four transcript features (pronunciation not assessed). */
  language: Q8Level;
  expected: {
    band: number;
    coverage: Coverage;
    /** Measured in code by prompt-overlap.ts. */
    codeDependence: PromptDependence;
    override: boolean;
    fix: Q8BiggestFix["kind"];
  };
}

const CARS = "c1-part3-cars-in-city-centres";
const PHONES = "c1-part3-smartphones-under-14";
const TAX = "c1-part3-sugar-tax";
const ALL_RESTATED = { F1: "restated", F2: "restated", F3: "restated", A1: "restated", A2: "restated", A3: "restated" } as const;

export const PART3_ANCHORS: Part3Anchor[] = [
  // ── Topic 1: cars in city centres (the plan's anchors, section 8) ──
  { id: "cars-A0", taskId: CARS, transcript: ANCHOR_0, points: {}, modelDependence: "heavily_dependent", language: "below_B1", expected: { band: 0, coverage: "none", codeDependence: "heavily_dependent", override: false, fix: "feature" } },
  { id: "cars-A1", taskId: CARS, transcript: ANCHOR_1, points: ALL_RESTATED, modelDependence: "reads_prompts", language: "B1", expected: { band: 1, coverage: "both_sides", codeDependence: "reads_prompts", override: false, fix: "prompt_dependence" } },
  { id: "cars-A2", taskId: CARS, transcript: ANCHOR_2, points: { F1: "developed", F2: "restated", A1: "developed", A2: "restated" }, modelDependence: "heavily_dependent", language: "B1", expected: { band: 2, coverage: "both_sides_full", codeDependence: "heavily_dependent", override: false, fix: "prompt_dependence" } },
  { id: "cars-A3", taskId: CARS, transcript: ANCHOR_3, points: { F1: "developed", F2: "developed", F3: "developed" }, modelDependence: "own_development", language: "B2", expected: { band: 3, coverage: "one_side", codeDependence: "own_development", override: false, fix: "section_coverage" } },
  { id: "cars-A4", taskId: CARS, transcript: ANCHOR_4, points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed" }, modelDependence: "own_development", language: "B2", expected: { band: 4, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" } },
  { id: "cars-A5", taskId: CARS, transcript: ANCHOR_5, points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed", A3: "restated" }, modelDependence: "own_development", language: "C1", expected: { band: 5, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" } },
  { id: "cars-R1", taskId: CARS, transcript: FIXTURE_R1, points: { F1: "restated", F2: "restated", A1: "developed", A2: "developed" }, rebutted: ["F1", "F2"], modelDependence: "own_development", language: "C1", expected: { band: 4, coverage: "both_sides", codeDependence: "own_development", override: false, fix: "point_development" } },

  // ── Topic 2: smartphones under 14 ──
  {
    id: "phones-A0",
    taskId: PHONES,
    transcript:
      "Phone is good. I have phone, my brother phone. Samsung. I play game in phone, it is fun. Phone is... expensive. Children like phone. Yes. School is boring, very... many lesson. I like my phone, my phone is new, black. That's all.",
    points: {},
    modelDependence: "heavily_dependent",
    language: "below_B1",
    expected: { band: 0, coverage: "none", codeDependence: "heavily_dependent", override: false, fix: "feature" },
  },
  {
    id: "phones-A1",
    taskId: PHONES,
    transcript:
      "Children under 14 should not be allowed to own a smartphone. For: less screen time and better sleep. Protection from harmful content online. More face-to-face time with friends. Against: parents can reach them in an emergency. Useful for learning and homework. Children without one may feel left out. So, I think, less screen time and better sleep is good. And protection from harmful content online is good. But parents can reach them in an emergency. It is my opinion.",
    points: ALL_RESTATED,
    modelDependence: "reads_prompts",
    language: "B1",
    expected: { band: 1, coverage: "both_sides", codeDependence: "reads_prompts", override: false, fix: "prompt_dependence" },
  },
  {
    id: "phones-A2",
    taskId: PHONES,
    transcript:
      "Today I will speak about children and smartphones. Some people think children under 14 should not be allowed to own a smartphone. First, less screen time and better sleep. It is good for children health. Second, protection from harmful content online, because internet has many bad things. But there are also against points. Parents can reach them in an emergency, because children can call. And useful for learning and homework. So there are good sides and bad sides. In my opinion it is good and bad. Thank you.",
    points: { F1: "restated", F2: "developed", A1: "developed", A2: "restated" },
    modelDependence: "heavily_dependent",
    language: "B1",
    expected: { band: 2, coverage: "both_sides_full", codeDependence: "heavily_dependent", override: false, fix: "prompt_dependence" },
  },
  {
    id: "phones-A3",
    taskId: PHONES,
    transcript:
      "Well, I'm quite sure that young children shouldn't have smartphones, and I have two main reasons. First of all, they would sleep much better. My little cousin, for example, used to watch videos in bed until midnight, and in the morning he was always too tired to concentrate at school. Secondly, the internet is full of things that children shouldn't see, like violent videos or strangers who pretend to be their friends. If they didn't have their own phone, parents could control this much more easily. Also, children who don't have phones play outside more and talk to each other instead of looking at screens. To sum up, I think it's better to wait until children are older.",
    points: { F1: "developed", F2: "developed", F3: "developed" },
    modelDependence: "own_development",
    language: "B2",
    expected: { band: 3, coverage: "one_side", codeDependence: "own_development", override: false, fix: "section_coverage" },
  },
  {
    id: "phones-A4",
    taskId: PHONES,
    transcript:
      "In my opinion, this is a difficult question, because both sides have strong arguments. On the one hand, children without smartphones would sleep better. Many teenagers in my class stay awake at night playing games, and then they are tired in lessons. Also, they would be safer, because on the internet there are many dangerous videos and people. On the other hand, there are some disadvantages. For example, if a child gets lost or misses the bus, they can't call their parents quickly. Besides, smartphones are useful for studying, because students can find information and use dictionary apps for homework. So I think the idea is good, but parents should decide together with the school. That's why I partly agree.",
    points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed" },
    modelDependence: "own_development",
    language: "B2",
    expected: { band: 4, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" },
  },
  {
    id: "phones-A5",
    taskId: PHONES,
    transcript:
      "Whether children under fourteen should be allowed to own a smartphone is a question that divides parents, and I think both sides have a point. Let me begin with the arguments in favour of a ban. The most obvious benefit would be better sleep: children who scroll late into the night are often exhausted the next day, which inevitably affects their concentration at school. Closely linked to this is safety, since young children are rarely able to recognise manipulative strangers or disturbing content, not to mention the scams that target them. That said, the counter-arguments shouldn't be dismissed. A phone gives parents a way to contact their children if something goes wrong, for instance when a bus is cancelled late in the evening. What's more, a smartphone can be a genuinely useful study tool, giving pupils access to dictionaries and online lessons that many families couldn't otherwise afford. Having weighed up both sides, I'd say a complete ban would be too drastic. A more sensible approach might be to give younger children a basic phone and introduce a smartphone gradually.",
    points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed" },
    modelDependence: "own_development",
    language: "C1",
    expected: { band: 5, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" },
  },
  {
    id: "phones-R1",
    taskId: PHONES,
    transcript:
      "Personally, I'm against a ban, although I understand why many parents support it. Some people say children would get less screen time and better sleep, but in my view the problem is the rules at home, not the phone itself. Others claim a ban would protect them from harmful content online, yet parental controls already block most of it. On the other side, parents need to reach their children in an emergency. My younger sister, for instance, once missed the last bus and was able to call our father within a minute. What's more, phones are useful for learning, since pupils can watch lessons again and check new words while doing homework. So, all things considered, I think a ban would cause more problems than it solves.",
    points: { F1: "restated", F2: "restated", A1: "developed", A2: "developed" },
    rebutted: ["F1", "F2"],
    modelDependence: "own_development",
    language: "C1",
    expected: { band: 4, coverage: "both_sides", codeDependence: "own_development", override: false, fix: "point_development" },
  },

  // ── Topic 3: a tax on sugary drinks and fast food ──
  {
    id: "tax-A0",
    taskId: TAX,
    transcript:
      "Cola is good. I drink cola, my friend cola. Burger. In my city many burger. I eat burger with friend, it is tasty. Burger is... cheap. I like burger. Yes. Doctor is bad, very... long time. I like my city, it is big, beautiful. That's all.",
    points: {},
    modelDependence: "heavily_dependent",
    language: "below_B1",
    expected: { band: 0, coverage: "none", codeDependence: "heavily_dependent", override: false, fix: "feature" },
  },
  {
    id: "tax-A1",
    taskId: TAX,
    transcript:
      "Governments should put a special tax on sugary drinks and fast food. For: fewer people would become overweight or ill. The money could pay for health services. Companies would make healthier products. Against: unfair to families on low incomes. Adults should decide what they eat. Lack of exercise is a bigger problem than food. So, I think, fewer people would become overweight or ill is good. And the money could pay for health services is good. But unfair to families on low incomes. It is my opinion.",
    points: ALL_RESTATED,
    modelDependence: "reads_prompts",
    language: "B1",
    expected: { band: 1, coverage: "both_sides", codeDependence: "reads_prompts", override: false, fix: "prompt_dependence" },
  },
  {
    id: "tax-A2",
    taskId: TAX,
    transcript:
      "Today I will speak about tax on sugary drinks. Some people think governments should put a special tax on sugary drinks and fast food. First, fewer people would become overweight or ill. It is good for people health. Second, the money could pay for health services, because hospital need money. But there are also against points. It is unfair to families on low incomes, because they have not much money. And adults should decide what they eat. So there are good sides and bad sides. In my opinion it is good and bad. Thank you.",
    points: { F1: "restated", F2: "developed", A1: "developed", A2: "restated" },
    modelDependence: "heavily_dependent",
    language: "B1",
    expected: { band: 2, coverage: "both_sides_full", codeDependence: "heavily_dependent", override: false, fix: "prompt_dependence" },
  },
  {
    id: "tax-A3",
    taskId: TAX,
    transcript:
      "Well, I strongly believe that this tax is a good idea, and I have two main reasons. First of all, people would become healthier. In my neighbourhood, for example, teenagers drink two or three bottles of cola every day, and many of them already have problems with their teeth. If cola were more expensive, they would buy water or tea instead. My second reason is that the government could spend the money on hospitals, which really need new equipment. Also, food companies would probably reduce the sugar in their drinks, because they don't want to lose customers. To sum up, the tax has a lot of benefits and every country should introduce it.",
    points: { F1: "developed", F2: "developed", F3: "developed" },
    modelDependence: "own_development",
    language: "B2",
    expected: { band: 3, coverage: "one_side", codeDependence: "own_development", override: false, fix: "section_coverage" },
  },
  {
    id: "tax-A4",
    taskId: TAX,
    transcript:
      "In my opinion, this is quite a complicated question, because there are good arguments on both sides. On the one hand, the tax could help people to lose weight. Nowadays many young people eat fast food every day, and doctors say that diabetes is becoming more common. Also, the government could use this money for hospitals, because many hospitals in small towns are old. On the other hand, there are some disadvantages. For example, poor families would suffer, because cheap fast food is sometimes the only thing they can afford after work. Besides, adults have the right to choose their food themselves, and the government shouldn't control everything in our lives. So, I think the idea is good, but the tax should be small. That's why I partly agree with this statement.",
    points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed" },
    modelDependence: "own_development",
    language: "B2",
    expected: { band: 4, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" },
  },
  {
    id: "tax-A5",
    taskId: TAX,
    transcript:
      "Whether governments should tax sugary drinks and fast food is a question that divides opinion, and I think both sides have a point. Let me start with the arguments in favour. The most obvious benefit would be a healthier population: when prices go up, consumption tends to fall, and fewer people would end up with diabetes or heart disease, not to mention the damage sugar does to children's teeth. Closely linked to this is funding, since the revenue could be spent on clinics and prevention programmes which are badly needed in rural areas. That said, the counter-arguments shouldn't be dismissed. A tax of this kind hits low-income households hardest, because they spend a far larger share of their budget on food. What's more, many people feel that adults are perfectly capable of deciding what to eat, and that the state has no business interfering in such personal choices. Having weighed up both sides, I'd say a modest tax could work, provided that the money is visibly spent on public health.",
    points: { F1: "developed", F2: "developed", A1: "developed", A2: "developed" },
    modelDependence: "own_development",
    language: "C1",
    expected: { band: 5, coverage: "both_sides_full", codeDependence: "own_development", override: false, fix: "feature" },
  },
  {
    id: "tax-R1",
    taskId: TAX,
    transcript:
      "Personally, I'm against this tax, although I can see why the idea is popular. Some people say fewer people would become overweight, but in my view people would simply pay more and keep eating the same food. Others claim the money could pay for health services, yet governments rarely spend such taxes on what they promise. On the other side, the tax would be unfair to poorer families. My neighbours, for instance, have four children and already struggle to pay for food at the end of each month. What's more, adults should be free to choose their own meals, since nobody likes being told what to eat by the state. So, all things considered, I think the tax would cause more problems than it solves.",
    points: { F1: "restated", F2: "restated", A1: "developed", A2: "developed" },
    rebutted: ["F1", "F2"],
    modelDependence: "own_development",
    language: "C1",
    expected: { band: 4, coverage: "both_sides", codeDependence: "own_development", override: false, fix: "point_development" },
  },
];
