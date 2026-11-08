/** Cars topic and its transcripts, verbatim from docs/part3-plan.md section 8 (anchors 0–5) and section 6 (N1, R1). */
import type { PromptText } from "./prompt-overlap";

export const CARS_PROMPT: PromptText = {
  statement: "Cities should ban private cars from their centres.",
  points: [
    { id: "F1", text: "Cleaner air and less noise" },
    { id: "F2", text: "Safer streets for pedestrians and cyclists" },
    { id: "F3", text: "More people would use public transport" },
    { id: "A1", text: "Difficult for elderly and disabled people" },
    { id: "A2", text: "Shops and businesses in the centre may lose customers" },
    { id: "A3", text: "Public transport is not good enough in many cities" },
  ],
};

export const ANCHOR_0 =
  "Car... car is good. I have car, my father car. Chevrolet. In my city many car. I go to school with car, it is fast. Car is... expensive. I like car. Yes. Bus is bad, very... many people. I like my city, Tashkent is big city, beautiful. That's all.";

export const ANCHOR_1 =
  "Cities should ban private cars from their centres. For: cleaner air and less noise. Safer streets for pedestrians and cyclists. More people would use public transport. Against: difficult for elderly and disabled people. Shops and businesses in the centre may lose customers. Public transport is not good enough in many cities. So, I think, cleaner air and less noise is good. And safer streets for pedestrians and cyclists is good. But difficult for elderly and disabled people. It is my opinion.";

export const ANCHOR_2 =
  "Today I will speak about cars in the city centre. Some people think cities should ban private cars from their centres. First, I think the air will be cleaner and there is less noise. It is good for people health. Second, safer streets for pedestrians and cyclists, because there is no many cars. But there are also against points. It is difficult for elderly and disabled people, because they can't walk long. And shops and businesses in the centre may lose customers. So there are good sides and bad sides. In my opinion it is good and bad. Thank you.";

export const ANCHOR_3 =
  "Well, I strongly believe that private cars should be banned from city centres, and I have two main reasons. First of all, the air would be much cleaner. In Tashkent, for example, in summer the traffic jams on Amir Temur street are terrible, and you can actually smell the exhaust when you walk there. If cars were not allowed, people could breathe normally and it would be quieter as well. My second reason is safety. A lot of accidents happen because drivers are always in a hurry, and children who walk to school have to cross busy roads. Without private cars, parents wouldn't be so worried and more people would ride bicycles, which is also healthy. Also, the metro in our city is quite cheap and fast, so I think people would get used to it quickly. To sum up, banning cars has a lot of benefits and I think every big city should do it.";

export const ANCHOR_4 =
  "In my opinion, this is quite a difficult question, because there are strong arguments on both sides. On the one hand, banning cars would make the air cleaner. Nowadays in big cities like Tashkent the pollution is really serious, especially in winter, and many people have problems with breathing. Also, streets would be safer, because children and old people could walk without worrying about traffic. On the other hand, there are some disadvantages. For example, my grandmother can't walk very far, so for her it would be very difficult to visit the hospital in the centre if she can't go by car. Besides, small shops in the centre might lose their customers, because people prefer to go to shopping malls where there is a parking. If people stop coming, the owners will lose their money and maybe close the shop. So, I think the idea is good, but the government should first improve buses and give special permission for old and disabled people. That's why I partly agree with this statement.";

export const ANCHOR_5 =
  "Whether cities should ban private cars from their centres is a question that divides opinion, and I think both sides have a point. Let me start with the arguments in favour. The most obvious benefit would be cleaner air. Exhaust fumes are one of the main causes of respiratory illness in cities, and if the centre were car-free, residents would notice the difference almost immediately, not to mention how much quieter it would be. Closely linked to this is safety: with fewer vehicles around, pedestrians and cyclists would no longer have to compete for space, which would encourage people to walk or cycle rather than drive short distances. That said, the counter-arguments shouldn't be dismissed. For elderly or disabled people, a car is often not a luxury but a necessity, and a blanket ban could effectively cut them off from hospitals and government offices which located in the centre. What's more, businesses could suffer. Small shops depend on passing trade, and if customers can't drive in, they may simply take their money to out-of-town shopping centres instead. Having weighed up both sides, I'd say a complete ban would be too drastic, at least until public transport is reliable enough. A more sensible approach might be to restrict cars gradually, while making exceptions for those who genuinely depend on them.";

export const FIXTURE_N1 =
  "I'd like to start with safer streets for pedestrians and cyclists. My younger brother cycles to school every morning, and twice last year he was nearly hit by a taxi driver who was speeding. Then, against the idea, shops and businesses in the centre may lose customers. My uncle runs a small bakery near Chorsu bazaar and most of his regular buyers stop their cars right outside the door for a minute.";

export const FIXTURE_R1 =
  "Personally, I'm against banning cars from the centre, although I can see why the idea is popular. Some people say the air would be cleaner and there would be less noise, but in my view the real problem is old buses and factories, not private cars. Others claim the streets would be safer for pedestrians and cyclists, yet most serious accidents in our city happen on the ring road rather than in the centre. On the other side, a ban would be very hard on elderly and disabled people. My grandfather, for instance, uses a walking stick and simply couldn't manage the distance from the nearest metro station to his clinic. What's more, shops in the centre would probably lose customers, since people who drive would rather go to a shopping mall with free parking than carry heavy bags to a bus stop. So, all things considered, I think a ban would cause more problems than it solves.";
