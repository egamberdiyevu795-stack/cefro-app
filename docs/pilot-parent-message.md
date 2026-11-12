# Pilot: message to a parent

**Draft, version `pilot-parent-message-2026-11-12b`. NOT SENT.** For the pilot only (about 10 known testers, nobody
under 14). Asadbek sends it by message (or prints it), fills in `[...]`, and keeps the parent's reply. Then he records
consent with `node scripts/set-consent.mjs <email> granted` (`docs/consent-design.md`, section 2b), which stores this
version. If the text changes, change the version here and in `scripts/set-consent.mjs` (`CURRENT_NOTICE`).

**Change 2026-11-12 (version `pilot-parent-message-2026-11-12b`, was `…-2026-11-08`):** owner decision: the sentence "Teachers see nothing" is
**deleted** in all three languages and **not replaced**. The message now says nothing about teachers at all. Anyone who agreed to an older
version did not agree to teacher listening either way: the message must be settled (see below) before `--teacher-sharing` is recorded.

Before sending:

- **The Uzbek and Russian texts need a native speaker's check.** They have not been checked.
- Points marked **[CHECK]** need a lawyer; the first lawyer question (data stored abroad) is still open.
- **30-day audio deletion is built** (a daily job), but it runs only on the production deployment with `CRON_SECRET`
  set (`docs/launch-checklist.md`, section 11). Don't send the message before that is live.
- The 30 days are for **CEFRO's own copy**. The AI service may keep request data for a while under its own terms (for
  Gemini, its abuse-monitoring page says 55 days); the message says so and promises nothing about that copy.
- **The message says nothing about teachers** (the "Teachers see nothing" sentence was deleted, not replaced). But the pilot's teacher listens
  to recordings. **"Who sees it: only your child and me" still stands** and is now untrue once a child joins a class. It does not say
  "teachers see nothing", so it was not removed, but **decide whether to reword it** and whether the lawyer must see the teacher-listening
  question first (`docs/lawyer-questions.md`, question 13).
- No price and no "free" claim (owner's rule until the pricing is decided): the word was removed from all three texts.

---

## O'zbekcha

Assalomu alaykum!

Men Asadbek, CEFRO ilovasini yaratuvchisiman. Farzandingiz [ism] ilovani sinab ko'rishga taklif qilindi.

**CEFRO nima:** UZBMB multilevel imtihonining gapirish (speaking) qismiga tayyorlanish uchun ilova.
Farzandingiz savollarga ovoz chiqarib javob beradi, sun'iy intellekt javobni baholaydi va nimani tuzatish kerakligini
aytadi.

**Nima saqlanadi:** ovozli yozuvlar, ularning matni (transkript), natijalar (ball va izohlar) va kirish uchun
elektron pochta manzili.

**Kim ko'radi:** faqat farzandingiz va men. Yozuvlar baholash uchun sun'iy intellekt xizmatiga ([provayder])
yuboriladi. Ma'lumotlar O'zbekistondan tashqaridagi serverlarda saqlanadi [CHECK].

**Qancha saqlanadi:** bizdagi ovozli yozuvlar baholangandan keyin 30 kun o'tib o'chiriladi [CHECK]. Matn va natijalar
akkaunt o'chirilguncha saqlanadi. Sun'iy intellekt xizmati so'rov ma'lumotlarini o'z qoidalariga ko'ra cheklangan
muddat (masalan, suiiste'mollikni aniqlash uchun) saqlashi mumkin; bu nusxani biz o'chira olmaymiz [CHECK].

**Qanday o'chiriladi:** farzandingiz istalgan vaqtda ilovadagi "Account" sahifasida "Delete my account" orqali
hamma narsani o'chirishi mumkin. Yoki menga yozing, men CEFRO saqlagan barcha ma'lumotlarni o'chiraman. Roziligingizni istalgan
vaqtda qaytarib olishingiz mumkin.

Agar rozi bo'lsangiz, iltimos, shu xabarga **"ha"** deb javob yozing va ismingizni hamda farzandingizga kim
bo'lishingizni (ona, ota yoki vasiy) yozing [CHECK: shunday javob yetarlimi].

Rahmat!
Asadbek, [telefon yoki Telegram]

---

## Русский

Здравствуйте!

Меня зовут Асадбек, я создатель приложения CEFRO. Вашему ребёнку [имя] предложили протестировать приложение.

**Что такое CEFRO:** приложение для подготовки к устной части (speaking) экзамена UZBMB multilevel.
Ребёнок отвечает на вопросы вслух, искусственный интеллект оценивает ответ и подсказывает, что исправить.

**Что сохраняется:** голосовые записи, их текст (расшифровка), результаты (баллы и комментарии) и адрес электронной
почты для входа.

**Кто видит:** только ваш ребёнок и я. Записи отправляются на оценку в сервис искусственного интеллекта
([провайдер]). Данные хранятся на серверах за пределами Узбекистана [CHECK].

**Сколько хранится:** наша копия голосовых записей удаляется через 30 дней после оценки [CHECK]. Текст и результаты
хранятся, пока аккаунт не удалён. Сервис искусственного интеллекта может по своим правилам хранить данные запросов
ограниченное время (например, для выявления злоупотреблений); эту копию мы удалить не можем [CHECK].

**Как удалить:** ребёнок в любой момент может удалить всё на странице «Account» в приложении («Delete my account»).
Или напишите мне, и я удалю все данные, которые хранит CEFRO. Вы можете отозвать согласие в любой момент.

Если вы согласны, пожалуйста, ответьте на это сообщение **«да»** и укажите ваше имя и кем вы приходитесь ребёнку
(мать, отец или опекун) [CHECK: достаточно ли такого ответа].

Спасибо!
Асадбек, [телефон или Telegram]

---

## English

Hello!

I'm Asadbek, and I made the CEFRO app. Your child [name] has been invited to test it.

**What CEFRO is:** an app for practising the speaking part of the UZBMB multilevel exam. Your child answers
questions out loud; AI scores the answer and says what to fix.

**What is kept:** voice recordings, their text (transcript), results (scores and feedback), and an email address to
sign in.

**Who sees it:** only your child and me. Recordings are sent to an AI service ([provider]) to be scored. The data is
stored on servers outside Uzbekistan [CHECK].

**How long:** we delete our copy of the voice recordings 30 days after scoring [CHECK]. Text and results are kept
until the account is deleted. The AI service may keep request data for a limited time under its own rules (for
example, to detect misuse); we cannot delete that copy [CHECK].

**How to delete it:** your child can delete everything at any time on the app's Account page ("Delete my account").
Or message me and I will delete all the data CEFRO holds. You can withdraw your consent at any time.

If you agree, please reply **"yes"** to this message with your name and your relationship to the child (mother,
father or guardian) [CHECK: whether such a reply is enough].

Thank you!
Asadbek, [phone or Telegram]
