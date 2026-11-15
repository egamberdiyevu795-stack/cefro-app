import { part11QuestionsOf } from "./part1-1-sets";

/**
 * MOCK MODE ONLY, for the Part 1.1 question bank: the development evaluator's key words per question
 * (server/evaluation/mock-part1-rules.ts) and a made-up demo answer per question (features/demo/demo-answers.ts).
 * Never read by real scoring. Answers are short A2 answers with a typical small mistake or two.
 */
const BY_QUESTION: Record<number, { keywords: readonly string[]; answer: string }> = {
  1: { keywords: ["house", "flat", "apartment", "live", "floor"], answer: "I live in a flat. It is on the fourth floor, and it have three rooms." },
  2: { keywords: ["house", "home", "rooms", "kitchen", "garden", "big", "small", "flat"], answer: "My home is not very big. We have a kitchen, a living room and two bedroom, and a small garden." },
  3: { keywords: ["room", "bed", "desk", "window", "wall", "small", "big"], answer: "My room is small but cosy. There is a bed, a desk and a big window, and the walls is blue." },
  4: { keywords: ["hometown", "town", "city", "tashkent", "samarkand", "bukhara", "live", "born"], answer: "My hometown is Samarkand. It is an old city with many beautiful buildings, and many tourist come there." },
  5: { keywords: ["free", "time", "play", "read", "watch", "games", "football", "music", "friends"], answer: "In my free time I usually play football with my friends, or I watching films at home." },
  6: { keywords: ["weekend", "weekends", "saturday", "sunday", "sleep", "visit", "park", "play"], answer: "At the weekends I usually sleep late, and then I visit my grandmother with my family." },
  7: { keywords: ["evening", "evenings", "homework", "dinner", "watch", "read", "family"], answer: "In the evenings I do my homework, and after dinner I watch TV with my family." },
  8: { keywords: ["teacher", "first", "kind", "taught", "school", "name"], answer: "My first teacher was very kind. Her name was Malika, and she teach us reading and writing." },
  9: { keywords: ["food", "meal", "favourite", "plov", "manti", "lagman", "pizza", "tasty", "eat"], answer: "My favourite food is plov. I like it because it is very tasty, and my mother cook it every Friday." },
  10: { keywords: ["breakfast", "eat", "eggs", "bread", "tea", "porridge", "morning"], answer: "For breakfast I usually eat eggs and bread, and I drink a cup of tea." },
  11: { keywords: ["pet", "pets", "cat", "dog", "bird", "fish"], answer: "Yes, I have a cat. Her name is Mosh, and she like sleeping on my bed." },
  12: { keywords: ["healthy", "health", "sport", "walk", "vegetables", "sleep", "water", "exercise"], answer: "To stay healthy I walk to school every day, and I try to eat vegetables and drink water." },
  13: { keywords: ["sport", "sports", "exercise", "football", "swimming", "gym", "run", "play"], answer: "Yes, I do. I play basketball two times a week, and sometimes I go to the gym." },
  14: { keywords: ["friend", "best", "close", "together", "name", "kind", "funny"], answer: "My best friend is Aziz. We are friends since school, and he is very funny and kind." },
  15: { keywords: ["school", "university", "lyceum", "teachers", "classes", "students", "big"], answer: "My school is big and it has a nice sports hall. The teachers is friendly, and I have many friends there." },
  16: { keywords: ["room", "favourite", "kitchen", "bedroom", "living"], answer: "My favourite room is the living room, because it is big and we watch films there together." },
  17: { keywords: ["internet", "online", "every", "day", "hours", "use", "phone"], answer: "I use the internet every day, maybe three hours. I watch videos and I am chatting with friends." },
  18: { keywords: ["phone", "mobile", "smartphone", "samsung", "iphone", "have"], answer: "Yes, I have a mobile phone. It is a Samsung, and I use it for calling and for study." },
  19: { keywords: ["season", "spring", "summer", "autumn", "winter", "favourite", "warm", "snow"], answer: "My favourite season is spring, because the weather is warm and everything are green." },
  20: { keywords: ["neighbourhood", "neighbours", "street", "shops", "park", "area", "quiet"], answer: "My neighbourhood is quiet. There is a small park and some shops near my house, and the neighbours is friendly." },
  21: { keywords: ["music", "singer", "song", "songs", "pop", "rap", "listen", "band"], answer: "I like pop music. My favourite singer is Shahzoda, and I listen her songs every day." },
  22: { keywords: ["sports", "player", "footballer", "favourite", "ronaldo", "messi", "champion"], answer: "My favourite sports person is Ronaldo. He is very strong and he work very hard." },
  23: { keywords: ["family", "together", "parents", "mother", "father", "brother", "sister", "dinner"], answer: "With my family we eat dinner together every evening, and on Sundays we go to the park." },
  24: { keywords: ["drink", "favourite", "tea", "juice", "coffee", "water", "lemonade"], answer: "My favourite drink is green tea. I drink it every morning, it is very good for health." },
  25: { keywords: ["hometown", "like", "people", "parks", "food", "buildings", "city", "town"], answer: "I like the people in my hometown, they are very friendly. Also there is many green parks." },
  26: { keywords: ["cooking", "cook", "like", "kitchen", "make", "soup"], answer: "Yes, I like cooking. I can make soup and fried eggs, and sometimes I help my mother." },
  27: { keywords: ["tv", "watch", "television", "news", "films", "cartoons", "evening"], answer: "I don't watch TV very often, maybe two times a week. I prefer watch videos on my phone." },
  28: { keywords: ["get", "bed", "o'clock", "morning", "night", "seven", "eleven", "early", "late"], answer: "I usually get up at seven o'clock, and I go to bed at eleven, sometimes later." },
  29: { keywords: ["day", "weekday", "morning", "school", "evening", "breakfast", "homework"], answer: "On a typical day I get up early, I go to school, and in the evening I doing my homework." },
  30: { keywords: ["outdoor", "outside", "activities", "hiking", "park", "walk", "mountains", "play"], answer: "Yes, I like outdoor activities. In summer we go to the mountains and we walking a lot." },
};

/** The demo "first" answer's third question: off topic, so its result has a goal (like the first Part 1.1 task). */
const OFF_TOPIC = "Um, sorry. Yesterday the bus was very late, so I was late too.";

/** Key words per question of a bank task (set or entry), or null for any other task. */
export function part11MockKeywords(taskId: string): readonly (readonly string[])[] | null {
  const questions = part11QuestionsOf(taskId);
  return questions ? questions.map((q) => BY_QUESTION[q.n]!.keywords) : null;
}

/** Demo answers of a bank task: "first" leaves question 3 off topic, "full" answers all three. Null for any other task. */
export function part11DemoAnswers(taskId: string): { first: [string, string, string]; full: [string, string, string] } | null {
  const questions = part11QuestionsOf(taskId);
  if (!questions) return null;
  const [a, b, c] = questions.map((q) => BY_QUESTION[q.n]!.answer) as [string, string, string];
  return { first: [a, b, OFF_TOPIC], full: [a, b, c] };
}

/** For the content test: every bank question has mock key words and a demo answer. */
export const PART11_MOCK_QUESTION_NUMBERS = Object.keys(BY_QUESTION).map(Number);
