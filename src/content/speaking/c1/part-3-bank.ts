import { ARGUMENT_INSTRUCTIONS, POINT_IDS, type BalancedArgumentTask, type PointId } from "@/domain/speaking/argument-task";

/**
 * Part 3 topic bank (2026-11-15): the topics a teacher counted as most frequent in the real exam, the rarer ones, and one
 * topic seen on a real exam screenshot (owner uploads in /mnt/project-files/uzbmb/teacher-lists/: part3-topic-frequency.jpg
 * and part3-exam-screenshot-*.png).
 *
 * The STATEMENTS are the exam's topics (standard wording, lightly edited). Every FOR / AGAINST point is OUR OWN writing,
 * three per side like the real exam; the screenshots were used only as a format reference.
 *
 * Left out on purpose (owner, 2026-11-15): "Gambling should be banned" (on the teacher's rare list), not a topic for teenagers.
 *
 * `weight` is how often the topic comes up in a mock (content/speaking/part3.ts): the teacher's count for the frequent
 * topics (5, 4 or 3; a row with two topics shares its count), 1 for the rarer ones.
 */

type Point = readonly [text: string, developedBy: string];

interface BankTopic {
  slug: string;
  title: string;
  topic: string;
  statement: string;
  weight: number;
  /** Where the topic comes from. */
  source: "frequent" | "rare" | "exam screenshot";
  for: readonly [Point, Point, Point];
  against: readonly [Point, Point, Point];
  /** Extra evaluator notes (a classic confusion between sides). */
  notes?: readonly string[];
}

const TOPICS: readonly BankTopic[] = [
  // ---------------------------------------------------------------- frequent (the teacher's table, ranks 1–8)
  {
    slug: "social-media-under-16", title: "Social media for under-16s", topic: "Technology", weight: 5, source: "frequent",
    statement: "Social media should be banned for children under 16.",
    for: [
      ["Children would spend more time studying and sleeping", "homework, sleep, concentration, hours spent scrolling"],
      ["Less risk of online bullying and harmful content", "bullying, strangers, violent or adult content, scams"],
      ["Young people would feel less pressure about their looks", "comparing themselves with others, likes, self-esteem, anxiety"],
    ],
    against: [
      ["Social media helps teenagers stay in touch with friends", "group chats, classmates, relatives far away, feeling included"],
      ["Young people can learn useful skills and news online", "tutorials, language learning, news, creative hobbies"],
      ["A ban would be very hard to control", "fake ages, parents' accounts, VPNs, checking who is under 16"],
    ],
  },
  {
    slug: "optional-homework", title: "Optional homework", topic: "Education", weight: 4, source: "frequent",
    statement: "Homework should be optional for school students.",
    for: [
      ["Students would have more time for rest and hobbies", "sport, family time, sleep, free time after school"],
      ["Less stress and fewer arguments at home", "stress, pressure, tiredness, arguments with parents about homework"],
      ["Motivated students would still practise on their own", "choice, responsibility, self-study, students who want to learn"],
    ],
    against: [
      ["Homework helps students remember what they learned", "practice, revision, memory, preparing for exams"],
      ["Many students would simply stop studying at home", "laziness, phones, games, falling behind"],
      ["Homework teaches discipline and time management", "deadlines, planning, habits for university or work"],
    ],
  },
  {
    slug: "books-or-films", title: "Books or films", topic: "Culture", weight: 4, source: "frequent",
    statement: "Books are better than films for telling stories.",
    for: [
      ["Books let readers use their own imagination", "picturing characters and places, every reader seeing it differently"],
      ["Books can describe characters' thoughts in detail", "inner thoughts, feelings, details a film leaves out"],
      ["Reading improves vocabulary and concentration", "new words, attention span, focus, language skills"],
    ],
    against: [
      ["Films bring stories to life with images and music", "special effects, actors, soundtracks, visual storytelling"],
      ["A film takes two hours, a book many days", "busy people, time, finishing a story in one evening"],
      ["Films can be enjoyed together with family and friends", "watching together, cinemas, sharing the experience"],
    ],
  },
  {
    slug: "free-public-transport", title: "Free public transport", topic: "City life", weight: 4, source: "frequent",
    statement: "Public transport should be free for everyone.",
    for: [
      ["Fewer cars would mean less traffic and pollution", "traffic jams, exhaust, people leaving their cars at home"],
      ["It would help students and families on low incomes", "saving money, students, pensioners, families with small budgets"],
      ["People could travel to work and study more easily", "getting to jobs, universities, hospitals across the city"],
    ],
    against: [
      ["Taxpayers would have to pay for it", "taxes, the city budget, people who never use it paying anyway"],
      ["Buses and metro trains could become overcrowded", "crowds, rush hour, no seats, long waits"],
      ["Less money might mean worse service and repairs", "old buses, broken trains, fewer routes, maintenance"],
    ],
  },
  {
    slug: "calories-on-menus", title: "Calories on menus", topic: "Health", weight: 3, source: "frequent",
    statement: "Fast food restaurants should show calories on their menus.",
    for: [
      ["Customers could make healthier choices", "comparing meals, choosing smaller portions, knowing what they eat"],
      ["It could help reduce obesity and related illnesses", "being overweight, diabetes, heart problems, public health"],
      ["Restaurants might offer healthier meals", "new salads, smaller portions, changing recipes to look better"],
    ],
    against: [
      ["Many people ignore the numbers anyway", "habits, taste, price, not understanding calories"],
      ["It costs restaurants time and money to measure", "testing every dish, small cafés, printing new menus"],
      ["Calories alone do not show if food is healthy", "vitamins, sugar, salt, fat, a low-calorie meal that is still unhealthy"],
    ],
  },
  {
    slug: "ban-zoos", title: "Zoos", topic: "Animals", weight: 3, source: "frequent",
    statement: "Zoos should be banned.",
    for: [
      ["Large animals need far more space than any zoo has", "cages, small enclosures, elephants or lions, walking all day in the wild"],
      ["Wild animals lose their natural behaviour in zoos", "hunting, boredom, stress, strange repeated movements"],
      ["People can watch animals in documentaries instead", "nature films, online videos, virtual tours"],
    ],
    against: [
      ["Breeding programmes help rare species survive", "endangered animals, breeding, returning animals to the wild"],
      ["Children understand animals better after seeing them in person", "school trips, real size, curiosity, caring about nature"],
      ["Zoos care for injured animals that cannot return home", "rescued animals, vets, animals that would die in the wild"],
    ],
  },
  {
    slug: "free-university", title: "Free university", topic: "Education", weight: 2, source: "frequent",
    statement: "University education should be free for everyone.",
    for: [
      ["Talented students from poor families could still study", "fees, low incomes, equal chances, talent not money"],
      ["The country would have more doctors, engineers and teachers", "skilled workers, the economy, the country's future"],
      ["Graduates would start working life without debts", "loans, repaying money, starting a family or a business"],
    ],
    against: [
      ["Free universities would cost the government a lot", "taxes, the state budget, who pays"],
      ["Students may take their studies less seriously", "missing classes, changing courses, nothing to lose"],
      ["The money could improve schools or hospitals instead", "other priorities, schools, hospitals, roads"],
    ],
    notes: ["The teacher's list puts this and 'a university degree is necessary for success' in one row; they are two separate topics here."],
  },
  {
    slug: "degree-for-success", title: "A degree for success", topic: "Education", weight: 2, source: "frequent",
    statement: "A university degree is necessary for success.",
    for: [
      ["Many good jobs require a diploma", "doctors, lawyers, engineers, job adverts, employers' rules"],
      ["Graduates usually earn higher salaries", "income, promotion, careers, statistics or examples"],
      ["University gives deep knowledge and useful contacts", "specialist knowledge, teachers, classmates, networks"],
    ],
    against: [
      ["Many successful people never finished university", "famous business people, sportspeople, artists, local examples"],
      ["Practical skills matter more than a diploma in some jobs", "builders, programmers, chefs, experience, apprenticeships"],
      ["Online courses can teach many skills much more cheaply", "online certificates, self-study, cost of university"],
    ],
  },
  {
    slug: "musical-instrument", title: "Learning an instrument", topic: "Hobbies", weight: 4, source: "frequent",
    statement: "Everyone should learn to play a musical instrument.",
    for: [
      ["Playing music improves memory and concentration", "practice, focus, memory, doing better at school"],
      ["It is a healthy way to relax and reduce stress", "relaxing, emotions, a break from screens and work"],
      ["Playing with others builds teamwork and friendships", "bands, orchestras, school concerts, new friends"],
    ],
    against: [
      ["Instruments and lessons can be expensive", "the price of instruments, private teachers, poorer families"],
      ["Not everyone has musical talent or interest", "forcing people, other talents, sport or art instead"],
      ["Students already have too little free time", "homework, exams, courses, being tired"],
    ],
    notes: ["The teacher's list also says 'or have a hobby'. A student who talks about hobbies in general, not music, has not covered a music point."],
  },

  // ---------------------------------------------------------------- rarer (the teacher's list: 2–3 times each)
  {
    slug: "single-use-plastics", title: "Single-use plastics", topic: "Environment", weight: 1, source: "rare",
    statement: "Single-use plastics should be banned.",
    for: [
      ["Plastic waste pollutes rivers, seas and streets", "rubbish, rivers, beaches, plastic that lasts hundreds of years"],
      ["Animals are harmed when they eat plastic", "fish, birds, sea animals, plastic in the food chain"],
      ["People would switch to reusable bags and bottles", "cloth bags, glass or metal bottles, new habits"],
    ],
    against: [
      ["Plastic is cheap and convenient for shops", "prices, small shops, packaging costs"],
      ["Some alternatives, like paper, also harm the environment", "cutting trees, energy, water used to make paper"],
      ["Plastic keeps food and medicine clean and safe", "hygiene, hospitals, food lasting longer"],
    ],
  },
  {
    slug: "handwriting-in-schools", title: "Handwriting at school", topic: "Education", weight: 1, source: "rare",
    statement: "Handwriting should still be taught in schools.",
    for: [
      ["Writing by hand helps students remember information", "notes, memory, learning, understanding"],
      ["Exams and forms are often still handwritten", "exams, official forms, signatures, cards and letters"],
      ["Handwriting develops fine motor skills in young children", "small children, hand control, drawing, coordination"],
    ],
    against: [
      ["Most writing today is done on keyboards", "computers, phones, messages, work emails"],
      ["Typing is faster and easier to correct", "speed, spell-check, editing, sharing files"],
      ["Lesson time could be used for computer skills", "coding, typing, digital skills, the future job market"],
    ],
  },
  {
    slug: "online-education", title: "Online education", topic: "Education", weight: 1, source: "rare",
    statement: "Online education should replace traditional classrooms.",
    for: [
      ["Students can learn from anywhere at any time", "living far away, flexible times, recorded lessons"],
      ["Online courses are often cheaper than schools", "no travel, no buildings, cheaper fees and books"],
      ["Learners can study at their own speed", "pausing, repeating lessons, fast and slow learners"],
    ],
    against: [
      ["Students need face-to-face contact with teachers and classmates", "asking questions, friends, social skills, teamwork"],
      ["Many families lack fast internet or computers", "villages, slow connection, one computer for several children"],
      ["It is easy to lose focus at home", "phones, noise, games, no teacher watching"],
    ],
  },
  {
    slug: "working-from-home", title: "Working from home", topic: "Work", weight: 1, source: "rare",
    statement: "Working from home should be the standard.",
    for: [
      ["Workers save time and money on travel", "commuting, traffic, transport costs, time saved"],
      ["People can balance work and family life better", "children, cooking, flexible hours, family time"],
      ["Fewer commuters means less traffic in cities", "traffic jams, pollution, crowded buses and metro"],
    ],
    against: [
      ["Teamwork is harder without meeting in person", "meetings, misunderstandings, new employees learning"],
      ["Some people feel lonely working alone", "colleagues, isolation, mental health, motivation"],
      ["It is difficult to separate work and home life", "working late, distractions, no office, family noise"],
    ],
  },
  {
    slug: "surveillance-cameras", title: "Cameras in public places", topic: "Society", weight: 1, source: "rare",
    statement: "There should be more surveillance cameras in public places.",
    for: [
      ["Cameras help police find people who break the law", "theft, police, evidence, finding the person responsible"],
      ["People feel safer in streets and parks", "walking at night, parents, safety, peace of mind"],
      ["Footage can show what happened in road accidents", "traffic accidents, insurance, who was at fault"],
    ],
    against: [
      ["Cameras invade people's privacy", "being watched, personal life, freedom"],
      ["Recordings could be misused or stolen", "hacking, leaks, people misusing the videos"],
      ["Cameras alone do not prevent dangerous behaviour", "people hiding their faces, police still needed, false sense of safety"],
    ],
  },
  {
    slug: "electric-cars", title: "Electric cars", topic: "Environment", weight: 1, source: "rare",
    statement: "Electric cars should replace petrol cars.",
    for: [
      ["Electric cars make city air cleaner", "exhaust, smog, health, breathing in big cities"],
      ["They are cheaper to run than petrol cars", "fuel prices, charging costs, fewer repairs"],
      ["They are much quieter on the roads", "noise, quiet streets, sleeping near busy roads"],
    ],
    against: [
      ["Long journeys are hard because of charging times", "trips between cities, waiting, few charging stations outside cities"],
      ["Electric cars cost more to buy", "prices, families' budgets, second-hand cars"],
      ["Old batteries are difficult to recycle safely", "battery waste, metals, mining, recycling"],
    ],
  },
  {
    slug: "space-exploration", title: "Space exploration", topic: "Science", weight: 1, source: "rare",
    statement: "Space exploration is a waste of money.",
    for: [
      ["The money could fight poverty and disease on Earth", "hunger, hospitals, poor countries, other priorities"],
      ["Many space missions fail or bring few results", "failed launches, expensive missions, little practical use"],
      ["Rockets pollute the air and leave rubbish in space", "rocket fuel, space junk, old satellites"],
    ],
    against: [
      ["Space research has given us useful technology", "inventions, medicine, materials, GPS"],
      ["Satellites help with weather forecasts and phones", "weather, maps, phone signals, the internet"],
      ["Exploring space inspires young people to study science", "astronauts, curiosity, science careers, school subjects"],
    ],
  },
  // ---------------------------------------------------------------- seen on a real exam screenshot (not on the teacher's list)
  {
    slug: "one-global-language", title: "One global language", topic: "Society", weight: 1, source: "exam screenshot",
    statement: "All countries should use one global language.",
    for: [
      ["People from different countries could understand each other easily", "travel, friendships, the internet, fewer misunderstandings"],
      ["Business and travel would become simpler", "trade, tourism, working abroad, contracts"],
      ["Students would not spend years learning foreign languages", "time at school, courses, exams, money spent on lessons"],
    ],
    against: [
      ["Many local languages and traditions could disappear", "culture, songs, literature, identity, grandparents' language"],
      ["It would be unfair to people who speak other languages", "native speakers having an advantage, older people, equality"],
      ["Changing a whole country's language would take generations", "schools, books, official documents, time and cost"],
    ],
  },
];

function toTask(t: BankTopic): BalancedArgumentTask {
  const points = [...t.for, ...t.against];
  return {
    id: `c1-part3-${t.slug}`,
    version: 1,
    level: "C1",
    part: 3,
    taskType: "balanced_argument",
    rubricId: "multilevel-q8",
    title: t.title,
    topic: t.topic,
    statement: t.statement,
    points: POINT_IDS.map((id: PointId, i) => ({ id, side: i < 3 ? "for" : "against", text: points[i]![0] })),
    instructions: ARGUMENT_INSTRUCTIONS,
    preparationSeconds: 60,
    speakingSeconds: 120,
    evaluatorGuidance: [...POINT_IDS.map((id, i) => `${id} is developed by a reason or example about ${points[i]![1]}.`), ...(t.notes ?? [])].join("\n"),
  };
}

/** The bank's topics as tasks, most frequent first. */
export const PART3_BANK_TASKS: readonly BalancedArgumentTask[] = TOPICS.map(toTask);

/** Each bank topic's weight and source (frequency in content/speaking/part3.ts). */
export const PART3_BANK_META: Readonly<Record<string, { weight: number; source: BankTopic["source"] }>> = Object.fromEntries(
  TOPICS.map((t) => [`c1-part3-${t.slug}`, { weight: t.weight, source: t.source }]),
);
