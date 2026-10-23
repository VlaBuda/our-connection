/* Наш звʼязок — app logic. Data lives in Supabase; see supabase/schema.sql. */
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ---------- vocab ---------- */
const ESS=[{k:"water",t:"Вода",did:"+ Відмітити",gap:2.5},{k:"food",t:"Їжа",did:"+ Відмітити",gap:4.5}];
// Self-care by energy level. Levels add up: each level shows everything from the lower ones.
// "max" retires an item when a better version takes over (snack -> sandwich -> warm meal).
const CARE=[
  {k:"meds",t:"Ліки за розкладом, якщо є",min:1},
  {k:"snack",t:"Зʼїсти хоч щось, навіть снек",min:1,max:1},
  {k:"rest1",t:"Пауза: 10 хвилин полежати без телефону й роботи",min:1,max:2},
  {k:"sandwich",t:"Поїсти щось ситніше: бутерброд, йогурт, каша",min:2,max:2},
  {k:"teeth",t:"Почистити зуби або вмитися",min:2},
  {k:"clothes",t:"Переодягнутися в чисте й зручне",min:2},
  {k:"shower",t:"Душ",min:2},
  {k:"air",t:"5 хвилин на балконі чи біля відчиненого вікна",min:2},
  {k:"stretch",t:"Легка розтяжка, 5 хвилин",min:2},
  {k:"reach",t:"Написати комусь близькому",min:2},
  {k:"sleep",t:"Поставити телефон на зарядку й лягти до опівночі",min:2},
  {k:"meal",t:"Нормально поїсти чогось теплого",min:3},
  {k:"rest3",t:"Перерва 15 хвилин між справами",min:3},
  {k:"walk",t:"Прогулянка хвилин на 20",min:3},
  {k:"surface",t:"Прибрати одну поверхню, не всю кімнату",min:3},
  {k:"joy",t:"30 хвилин на щось просто для задоволення, без провини",min:3},
  {k:"prep",t:"Приготувати їжу наперед",min:4},
  {k:"stash",t:"Поставити воду й снек біля ліжка на «нульовий» день",min:4},
  {k:"stock",t:"Закупити базове: воду, снеки, ліки",min:4},
  {k:"sport",t:"Рух чи спорт",min:4},
  {k:"plan",t:"Запланувати відпочинок, щоб після розгону не впасти",min:4},
];
const LVL_NAME={1:"з нуля",2:"коли трохи є",3:"коли норм",4:"на розгоні"};
// Visible care for a level: built-in plus own items. Without a level, show the "трохи є" set.
function careFor(lvl){
  const L=lvl||2;
  const own=[...priv.entries()].filter(([,d])=>d.kind==="care_custom").map(([id,d])=>({k:id,t:d.text,min:d.min||1,own:true}));
  return [...CARE,...own].filter(c=>L>=c.min&&(!c.max||L<=c.max));
}
const NEED=[
  {k:"call",t:"Подзвони, коли зможеш",o:"Чекає дзвінка, коли буде можливість",tip:"Подзвони, щойно буде можливість. Навіть на кілька хвилин."},
  {k:"text",t:"Напиши мені щось",o:"Будь-яке повідомлення зараз допоможе",tip:"Фото, стікер чи дрібниця з дня, неважливо що."},
  {k:"know",t:"Просто знай, без питань",o:"Просто знай. Без питань",tip:"Питання зараз забирають сили. Можна просто написати «я поряд»."},
  {k:"alone",t:"Хочу побути сам(а)",o:"Потрібен час наодинці",tip:"Це не про тебе. Дай трохи простору і напиши пізніше."},
  {k:"together",t:"Хочу побути разом",o:"Хочеться побути разом",tip:"Дзвінок, голосове або спільна справа на відстані."}];
const SLEEP=[{k:"good",t:"Добре"},{k:"little",t:"Мало"},{k:"bad",t:"Погано"},{k:"woke",t:"Часті пробудження"},{k:"dreams",t:"Були сни",warn:1},{k:"nightmares",t:"Кошмари",warn:1}];
const HEAD=[{k:"ok",t:"Ок"},{k:"pain",t:"Болить"},{k:"prodrome",t:"Наближається мігрень",warn:1},{k:"migraine",t:"Мігрень",warn:1}];
const SIGNS=[{k:"aura",t:"Аура, мерехтіння"},{k:"light",t:"Ріже світло"},{k:"sound",t:"Ріжуть звуки"},{k:"smell",t:"Запахи"},{k:"nausea",t:"Нудить"},{k:"neck",t:"Тягне шию"},{k:"fog",t:"Туман у голові"},{k:"yawn",t:"Позіхання, сонливість"},{k:"crave",t:"Тягне на солодке"}];
const MOOD=[{k:"calm",t:"Спокійно"},{k:"happy",t:"Щасливо"},{k:"joy",t:"Радісно"},{k:"cope",t:"Я справлюсь"},{k:"tired",t:"Втомлено"},{k:"anx",t:"Тривожно"},{k:"scared",t:"Страшно"},{k:"sad",t:"Сумно"},{k:"hurt",t:"Боляче"},{k:"cry",t:"Хочу плакати"},{k:"irr",t:"Все дратує"},{k:"empty",t:"Пусто"}];
const COLORS=[{k:"red",c:"#d9584a",t:"Червоний"},{k:"yellow",c:"#e8c448",t:"Жовтий"},{k:"blue",c:"#5a96e6",t:"Синій"},{k:"green",c:"#64be78",t:"Зелений"},{k:"violet",c:"#aa78e6",t:"Фіолетовий"}];
// Themes: background image + accent palette. "pattern" images tile instead of stretching.
// HD versions (AI-upscaled) exist only for the images listed here.
const HD_READY=new Set(["apothecary","red-forest","lilac-forest","star-watercolor","glow-flowers","sakura","cosmos","pink-clouds","night-forest"]);
const T=(t,img,o,accent,onAccent,bg,surface,pattern)=>({t,img:"themes/"+img+".jpg",hd:HD_READY.has(img)?"themes/"+img+"-hd.jpg":null,sm:"themes/"+img+"-sm.jpg",o,accent,onAccent,bg,surface,pattern});
const wide=window.matchMedia("(min-width: 900px)");
const THEMES={
  apothecary:T("Аптека","apothecary",".58","#c9922e","#1b130b","#11140f","rgba(22,24,18,.86)"),
  moon:T("Місяць і квіти","moon",".7","#c9922e","#1b130b","#15100c","rgba(30,23,17,.86)",true),
  redforest:T("Червоний ліс","red-forest",".55","#e0485f","#fff4f4","#11171a","rgba(18,24,27,.86)"),
  lilacforest:T("Бузковий ліс","lilac-forest",".55","#ec9a34","#1d1206","#1a1220","rgba(32,20,40,.86)"),
  stars:T("Зоряна акварель","star-watercolor",".45","#dfba5c","#14110a","#0f1a33","rgba(14,24,50,.86)"),
  garden:T("Квіти-вогники","glow-flowers",".3","#f0a33c","#1c1004","#0a0a0b","rgba(18,16,14,.88)"),
  berries:T("Ягоди","berries",".62","#f28fab","#2a0c18","#3a1424","rgba(44,14,28,.88)",true),
  sakura:T("Сакура","sakura",".45","#f4a3c6","#2a0e1e","#0c1438","rgba(14,20,56,.86)"),
  cosmos:T("Космос","cosmos",".5","#ff5a8e","#24060f","#0b1030","rgba(16,16,44,.86)"),
  pumpkins:T("Гарбузи","pumpkins",".55","#f0812f","#1c0d03","#0d0b0a","rgba(22,18,16,.88)",true),
  ferns:T("Папороть і конюшина","ferns",".55","#cf92e6","#1d0d24","#121611","rgba(20,26,20,.88)",true),
  clouds:T("Рожеві хмари","pink-clouds",".5","#f5a9bb","#2a1018","#1e1420","rgba(36,22,38,.86)"),
  nightforest:T("Нічний ліс","night-forest",".42","#f2a55c","#1d1006","#0b1420","rgba(14,22,34,.88)"),
};
const ELBL={1:"майже нуль",2:"трохи є",3:"норм",4:"розгін"};
const WLABEL={1:"легка",2:"середня",3:"важка"};
const KIND={tell:"розповісти",dream:"мрія",talk:"обговорити"};
const DONE={tell:"Розказано",dream:"Здійснено",talk:"Обговорено"};
const NUDGE={water:"Нагадати попити",food:"Нагадати поїсти",rest:"Нагадати відпочити",embrace:"🫂 Обійняти",hug:"Думаю про тебе"};
const NUDGE_IN={water:"нагадує тобі попити води",food:"нагадує тобі поїсти",rest:"нагадує тобі відпочити",embrace:"обіймає тебе 🫂",hug:"думає про тебе"};
// Reply button on a nudge I received, and the thank-you my partner then sees (same words in notify/index.ts).
const REPLY={water:"💧 Пʼю воду",food:"🍽 Іду їсти",rest:"🌿 Роблю паузу",embrace:"🤍 Дякую",hug:"🤍 І я про тебе"};
const REPLY_THANKS={water:"Пʼю воду 💧 Дякую, що нагадуєш!",food:"Іду їсти 🍽 Дякую, що нагадуєш!",rest:"Роблю паузу 🌿 Дякую, що нагадуєш!",embrace:"Дякую за обійми 🤍 Стало трохи тепліше",hug:"І я про тебе думаю 🤍"};
const NUDGE_GAP=2*3600e3; // one nudge of each kind per 2 hours (also enforced in the database)
const MSG={1:"Сьогодні режим збереження. Вода, їжа, базова турбота, і все. Задачі почекають, це нормально.",2:"Трохи сил є. Одна-дві легкі речі, і перерва.",3:"Сили є. Можна взятися за щось вагоме, але не за все одразу.",4:"Є розгін. Візьмись за важке, поки воно легко йде. І не пропускай їжу та воду: після підйому часто буває спад."};
const TITLES={us:"Ми сьогодні",state:"Як ти зараз?",care:"Турбота",time:"Наш час",box:"Для нас",stats:"Статистика"};
// "Що я зараз роблю". Two sets; each person picks theirs in settings. tip = advice on the partner's card.
const STATUS={
  civil:[
    {k:"work",t:"Працюю",i:"💼",tip:"Може відповідати із затримкою."},
    {k:"home",t:"Домашні справи",i:"🏠"},
    {k:"out",t:"Справи поза домом",i:"🛒",tip:"Не вдома, відповідь може бути коротка."},
    {k:"reno",t:"Ремонт",i:"🔨",tip:"Руки зайняті й, мабуть, у пилюці. Голосове краще за дзвінок."},
    {k:"rest",t:"Відпочиваю",i:"🛋",tip:"Добрий момент написати чи подзвонити."},
    {k:"road",t:"У дорозі",i:"🚌"},
    {k:"sleep",t:"Сплю",i:"🌙",tip:"Не буди, прочитає зранку."},
  ],
  military:[
    {k:"position",t:"На позиції",i:"🪖",tip:"Може довго не відповідати. Пиши коротко і без питань, що вимагають відповіді.",push:1},
    {k:"task",t:"На завданні",i:"🎯",tip:"Може довго не відповідати. Пиши коротко і без питань, що вимагають відповіді.",push:1},
    {k:"duty",t:"Чергування",i:"🕑",tip:"Відповіді можуть бути уривками.",push:1},
    {k:"base",t:"Штаб або база",i:"🏢",tip:"Звʼязок є, але часу мало.",push:1},
    {k:"training",t:"Навчання",i:"📋",push:1},
    {k:"road",t:"У дорозі",i:"🚙",push:1},
    {k:"rest",t:"Відпочинок",i:"🛌",tip:"Час, коли можна подзвонити чи просто побути разом.",push:1},
    {k:"offline",t:"Без звʼязку",i:"📵",tip:"Тиша зараз не означає, що щось сталося. Напиши, прочитає, коли зʼявиться звʼязок.",push:1},
    {k:"sleep",t:"Сплю",i:"🌙",tip:"Не буди, якщо не терміново."},
  ],
};
const statusInfo=p=>{if(!p||!p.status)return null;if(p.status==="own")return p.status_text?{t:p.status_text,i:"📍"}:null;
  return [...STATUS.civil,...STATUS.military].find(x=>x.k===p.status&&(STATUS[p.status_set||"civil"]||[]).includes(x))||find([...STATUS.military,...STATUS.civil],p.status)||null};
// Emotion map, like How We Feel: energy (up/down) × pleasantness (left/right).
// Each quadrant lists 9 feelings in 3 tiers, from mild (near the centre) to intense (outer edge).
const EMO_Q={
  red:{t:"Багато енергії, неприємно",tip:"Зараз багато напруги. Спокійний голос, без суперечок і порад. Можна спитати, чи хоче виговоритись."},
  yellow:{t:"Багато енергії, приємно",tip:"Добрий момент: порадій разом і спитай, що саме тішить."},
  blue:{t:"Мало енергії, неприємно",tip:"Сил і радості мало. Не треба підбадьорювати чи виправляти: «я поряд, можеш не відповідати» вже допомагає."},
  green:{t:"Мало енергії, приємно",tip:"Спокійний момент. Можна просто побути поряд, без планів."},
};
// i = intensity: 1 трохи, 2 помітно, 3 сильно. Keys are stored in days.data.emo, so never rename them.
const E=(q,i,k,t,d)=>({q,i,k,t,d});
const EMO=[
  E("red",1,"uneasy","Неспокій","Щось муляє, але не зовсім зрозуміло що."),
  E("red",1,"irritated","Роздратування","Дрібниці чіпляють сильніше, ніж зазвичай."),
  E("red",1,"impatient","Нетерплячість","Хочеться, щоб усе сталося швидше, чекати важко."),
  E("red",1,"awkward","Ніяковість","Незручно, хочеться сховатися від чужих поглядів."),
  E("red",1,"restless","Метушливість","Не всидиш на місці, тіло шукає, куди себе подіти."),
  E("red",2,"tense","Напруга","Тіло і голова в режимі «насторожі», важко розслабитись."),
  E("red",2,"anxious","Тривога","Думки біжать наперед і малюють погані варіанти."),
  E("red",2,"stressed","Стрес","Вимог більше, ніж сил, і це тисне."),
  E("red",2,"frustrated","Фрустрація","Хочеш, але не виходить, і від цього злість."),
  E("red",2,"guarded","Насторожі","Чекаєш критики чи нападу, готовність захищатися."),
  E("red",2,"overstimulated","Сенсорне перевантаження","Звуки, світло, дотики, запахи стали занадто гучними. Потрібна тиша і менше подразників."),
  E("red",2,"resentful","Образа","Несправедливо повелися, і це не відпускає."),
  E("red",2,"jealous","Ревнощі","Страх втратити близьку людину чи її увагу."),
  E("red",2,"envious","Заздрість","Хочеться того, що є в інших, і від цього гірко."),
  E("red",3,"overwhelmed","Перевантаження","Забагато всього одночасно: справ, людей, думок."),
  E("red",3,"angry","Злість","Щось перетнуло межу або здається несправедливим."),
  E("red",3,"scared","Страх","Відчуття загрози, за себе чи за когось."),
  E("red",3,"disgust","Огида","Хочеться відштовхнути щось чи когось від себе."),
  E("red",3,"shock","Шок","Щось сталося раптово, і думки ніби зупинились."),
  E("red",3,"panic","Паніка","Страх накриває хвилею, важко дихати і думати."),
  E("red",3,"panic_attack","Панічна атака","Раптовий напад: серце калатає, бракує повітря, тремтить тіло, здається, що зараз станеться щось страшне. Минає, хоч у моменті так не здається."),
  E("red",3,"meltdown","Мелтдаун","Перевантаження проривається назовні: сльози, крик, неможливість себе зупинити. Це не вибір і не маніпуляція, а нервова система, якій забагато."),
  E("red",3,"rage","Лють","Злість настільки сильна, що важко її втримати."),

  E("yellow",1,"curious","Цікавість","Хочеться дізнатися, спробувати, розібратись."),
  E("yellow",1,"cheerful","Бадьорість","Є сили і легкість рухатися."),
  E("yellow",1,"amused","Веселощі","Щось смішить, хочеться сміятися."),
  E("yellow",1,"focused","Зосередженість","Голова ясна, справа йде."),
  E("yellow",1,"hopeful","Надія","Віриться, що буде краще."),
  E("yellow",2,"playful","Грайливість","Хочеться жартувати, дуріти, бавитись."),
  E("yellow",2,"glad","Радість","Тепло й добре від того, що відбувається."),
  E("yellow",2,"proud","Гордість","Щось вийшло, і це приємно визнати."),
  E("yellow",2,"confident","Впевненість","Відчуття, що впораєшся."),
  E("yellow",2,"motivated","Вмотивованість","Хочеться братися і робити."),
  E("yellow",2,"uplifted","Піднесення","Настрій злітає вгору, все дається легше."),
  E("yellow",2,"infatuated","Закоханість","Метелики всередині, тягне до людини."),
  E("yellow",3,"anticipation","Передчуття","Чекаєш чогось доброго, аж не терпиться."),
  E("yellow",3,"inspired","Натхнення","Зʼявились ідеї і бажання їх робити."),
  E("yellow",3,"hyperfocus","Гіперфокус","Неможливо відірватися, світ навколо зник. Приємно, але легко забути про їжу, воду й сон."),
  E("yellow",3,"excited","Захват","Дуже радісно, аж переповнює."),
  E("yellow",3,"euphoric","Ейфорія","Пік радості, все здається можливим."),

  E("blue",1,"bored","Нудьга","Нічого не чіпляє, час тягнеться."),
  E("blue",1,"confused","Розгубленість","Незрозуміло, що робити і що відчуваєш."),
  E("blue",1,"tired","Втома","Хочеться відпочити, але ще тримаєшся."),
  E("blue",1,"disappointed","Розчарування","Чекалось інакше, і від цього прикро."),
  E("blue",1,"insecure","Невпевненість","Здається, що робиш недостатньо добре або недостатньо вмієш."),
  E("blue",1,"detached","Відстороненість","Ніби дивишся на життя крізь скло."),
  E("blue",2,"sad","Сум","Чогось шкода або когось бракує."),
  E("blue",2,"longing","Туга","Сумуєш за кимось чи чимось далеким. Хочеться, щоб людина була поруч."),
  E("blue",2,"lonely","Самотність","Бракує близькості й відчуття, що поруч хтось є."),
  E("blue",2,"hurt","Скривдженість","Хтось зачепив, і болить."),
  E("blue",2,"guilty","Провина","Відчуття, що зробили щось не так і винні."),
  E("blue",2,"ashamed","Сором","Відчуття, що з тобою самим(ою) щось не так. Хочеться сховатися."),
  E("blue",2,"vulnerable","Вразливість","Ніби без шкаралупи: будь-що може поранити."),
  E("blue",2,"helpless","Безсилля","Хочеться щось змінити, але нічого не можеш."),
  E("blue",2,"drained","Виснаження","Сили закінчились, навіть прості речі даються важко."),
  E("blue",3,"numb","Заціпеніння","Ніби вимкнулись почуття й тіло, щоб не боліло."),
  E("blue",3,"shutdown","Шатдаун","Мозок вимикається від перевантаження: важко говорити, думати й рухатись. Потрібні тиша і час."),
  E("blue",3,"burnout","Вигорання","Довго тягнеш більше, ніж можна. Відпочинок уже не відновлює, як раніше."),
  E("blue",3,"apathy","Апатія","Нічого не хочеться і нічого не важливо. Це не лінь, це спосіб психіки зберегти сили."),
  E("blue",3,"empty","Порожнеча","Ніби всередині вимкнули звук: ні радості, ні суму."),
  E("blue",3,"betrayed","Зрада","Довіру порушили, і дуже боляче."),
  E("blue",3,"grief","Горе","Втрата, яка болить усім тілом."),
  E("blue",3,"hopeless","Безнадія","Не видно виходу і сенсу намагатися."),
  E("blue",3,"depressed","Пригніченість","Важко, темно, ніби так буде завжди. Якщо триває тижнями, варто поговорити з фахівцем."),
  E("blue",3,"despair","Відчай","Нестерпно, і здається, що нічого не допоможе."),

  E("green",1,"calm","Спокій","Нічого не тисне, можна просто бути."),
  E("green",1,"relaxed","Розслабленість","Тіло відпускає напругу."),
  E("green",1,"content","Задоволення","Все достатньо добре, нічого не бракує."),
  E("green",1,"balanced","Рівновага","Нічого не хитає, стоїш рівно."),
  E("green",1,"sleepy","Приємна сонливість","Тіло мʼяко хоче спати."),
  E("green",2,"cozy","Затишок","Тепло, мʼяко, безпечно."),
  E("green",2,"grateful","Вдячність","Хочеться подякувати за те, що є."),
  E("green",2,"relieved","Полегшення","Щось важке скінчилось або вирішилось."),
  E("green",2,"tender","Ніжність","Хочеться піклуватися й обіймати."),
  E("green",2,"safe","Безпека","Відчуття, що зараз нічого не загрожує."),
  E("green",2,"trust","Довіра","Можна спертися і не перевіряти."),
  E("green",2,"accepted","Прийнятість","Тебе приймають таким(ою), який(а) ти є."),
  E("green",2,"close","Близькість","Відчуваєш звʼязок з людиною, навіть на відстані."),
  E("green",2,"loved","Любов","Тепле відчуття, що тебе люблять і ти любиш."),
  E("green",2,"nostalgic","Ностальгія","Тепло-сумні спогади про добре минуле."),
  E("green",3,"fulfilled","Наповненість","Ніби всього досить, усередині повно."),
  E("green",3,"serene","Умиротворення","Глибокий тихий спокій."),
  E("green",3,"blissful","Блаженство","Дуже добре, тихо і повно водночас."),
];
// "Нервова система": long states stay until removed; episodes are moments with a recovery tail ("післясмак").
const NS_LONG=[
  {k:"burnout",t:"Емоційне вигорання",tip:"Ресурсу мало вже давно. Менше прохань і рішень, більше простої турботи без очікувань."},
  {k:"aut_burnout",t:"Аутистичне вигорання",tip:"Сил на звуки, людей, розмови й маскування дуже мало. Може гірше говорити й переносити шум. Тиша не про тебе: допомагай знімати навантаження."},
  {k:"depressive",t:"Депресивний період",tip:"Навіть прості речі даються важко. Не «збирайся», а маленька турбота: нагадати поїсти, побути поряд. Якщо довго, мʼяко про фахівця."},
  {k:"anxious",t:"Тривожний період",tip:"Тривога тримається фоном. Допомагає передбачуваність: кажи, коли зможеш вийти на звʼязок."},
  {k:"overload",t:"Хронічне перевантаження",tip:"Подразників і справ давно забагато. Менше нового й несподіваного, більше тиші."},
];
const NS_EP=[
  {k:"shutdown",t:"Шатдаун",h:24,now:"Може не говорити й не відповідати. Не тисни: одне тепле повідомлення, яке не потребує відповіді.",
    after:"Після шатдауну нервова система ще виснажена: тихо, без рішень і розборів."},
  {k:"meltdown",t:"Мелтдаун",h:24,now:"Це не про тебе і не вибір. Не сперечайся, не пояснюй, менше слів.",
    after:"Після мелтдауну буває соромно й порожньо. Без розборів «що це було», просто тепло."},
  {k:"panic_attack",t:"Панічна атака",h:12,now:"Якщо на звʼязку: повільно дихати разом і коротко «я тут, це мине».",
    after:"Тіло ще втомлене й насторожі. Спокійний тон, без тривожних новин і тем."},
  {k:"sensory",t:"Сенсорне перевантаження",h:6,now:"Текст замість дзвінка, мінімум слів.",
    after:"Чутливість ще підвищена: тихіше, простіше, менше нового."},
  {k:"flashback",t:"Флешбек",h:24,now:"Коротко нагадай, що зараз інший час і ти поряд. Без розпитувань.",
    after:"Може ще довго бути насторожі. Без різких тем і несподіванок."},
  {k:"freeze",t:"Параліч дій",h:3,now:"Не виходить почати навіть просте. Допомагає назвати один крихітний крок або побути на звʼязку, поки робиться.",
    after:"Сил після ступору мало, не завалюй справами."},
];
const nsOf=id=>{const n=(profiles.get(id)||{}).ns;return {long:arr(n&&n.long),episodes:arr(n&&n.episodes)}};
const epInfo=k=>find(NS_EP,k);
// Episodes still "in effect": happening (< 1 h) or recovering (< its h hours), not marked as better.
function activeEpisodes(id){
  return nsOf(id).episodes.filter(e=>!e.end&&epInfo(e.k)&&Date.now()-e.ts<epInfo(e.k).h*3600e3).sort((a,b)=>b.ts-a.ts);
}
const epPhase=e=>Date.now()-e.ts<3600e3?"now":"after";
const longLabel=l=>l.k==="own"?l.text:(find(NS_LONG,l.k)||{}).t;
const EMO_MAX=5,EMO_LVL={1:"Трохи",2:"Помітно",3:"Сильно"};
const emoOf=k=>EMO.find(e=>e.k===k);
const PLAN_KIND={game:{i:"🎮",t:"Гра"},watch:{i:"🎬",t:"Перегляд"},call:{i:"📞",t:"Розмова"},other:{i:"✨",t:"Інше"}};
// State history within a day: what each field reads like, for the log on the cards and in pushes.
const FNAME={energy:"сили",need:"треба",sleep:"сон",head:"голова",mood:"настрій",emo:"відчуття",why:"причина"};
const POS_MOOD=["calm","happy","joy","cope"],NEG_MOOD=["tired","anx","scared","sad","hurt","cry","irr","empty"];
const HEAD_SEV={ok:0,pain:1,prodrome:2,migraine:3};

/* ---------- helpers ---------- */
const arr=v=>Array.isArray(v)?v:(v?[v]:[]);
const has=(v,k)=>arr(v).includes(k);
const labels=(list,v)=>arr(v).map(k=>(list.find(x=>x.k===k)||{}).t).filter(Boolean);
const find=(list,k)=>list.find(x=>x.k===k);
const dkey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>dkey(new Date());
const hm=ts=>new Date(ts).toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
const dshort=ts=>new Date(ts).toLocaleDateString("uk-UA",{day:"numeric",month:"short"});
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const btn=(cls,text,onClick,label)=>{const b=el("button",cls,text);b.type="button";if(label)b.setAttribute("aria-label",label);b.addEventListener("click",onClick);return b};
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function show(id){["loading","auth","pair","app"].forEach(x=>$(x).hidden=x!==id)}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function flash(b,text){if(!b)return;const old=b.dataset.label||b.textContent;b.dataset.label=old;b.textContent=text||"✓";b.classList.add("flash");setTimeout(()=>{b.textContent=old;b.classList.remove("flash")},1100)}

/* ---------- state ---------- */
let uid=null,showAll=false,channel=null,tab="us",statWho=null,statRange=7;
let profiles=new Map();   // id -> profile (me + partner)
let me={};                // my shared data for today
let people=new Map();     // user_id -> today's data
let days=new Map();       // user_id -> Map(day -> data), last 31 days
let priv=new Map();       // id -> private data (tasks, care)
let box=[],inbox=[],thanks=[],sentLast={},editTime=null;
let plans=[],planEdit=null,seenBase={};
let shows=[],showLimit=6,urlCache=new Map(),pendingFile=null,pendingUrl=null;

const myProfile=()=>profiles.get(uid)||{};
const partnerId=()=>[...profiles.keys()].find(id=>id!==uid)||null;
const nm=id=>id===uid?"Ти":((profiles.get(id)||{}).name||"Твоя людина");
const colorOf=id=>(profiles.get(id)||{}).color||(id===uid?"red":"yellow");
const whysOf=d=>[...arr(d.whys),...(d.why&&!arr(d.whys).length?[{text:d.why,ts:d.updated}]:[])];

/* ---------- theme ---------- */
function themeLayer(t,dim){const o=dim||t.o;return "linear-gradient(rgba(8,9,10,"+o+"),rgba(8,9,10,"+o+")),url(\""+t.img+"\")"}
function applyTheme(k){
  const t=THEMES[k]||THEMES.apothecary,r=document.documentElement.style;
  const useHd=t.hd&&wide.matches;
  r.setProperty("--bg-img",'url("'+(useHd?t.hd:t.img)+'")');r.setProperty("--dim",t.o);
  document.documentElement.dataset.bgmode=t.pattern?"pattern":useHd?"hd":"photo";
  r.setProperty("--bg",t.bg);r.setProperty("--surface",t.surface);
  r.setProperty("--accent",t.accent);r.setProperty("--on-accent",t.onAccent);
  r.setProperty("--accent-soft",t.accent+"33");
  document.querySelector('meta[name="theme-color"]').content=t.bg;
}
const themeKey=()=>myProfile().theme||ls("theme")||"apothecary";
wide.addEventListener("change",()=>applyTheme(themeKey()));
applyTheme(ls("theme")||"apothecary");

/* ---------- data ---------- */
function myToday(){return me&&me.date===today()?me:{date:today()}}
const NOTABLE=["need","sleep","head","energy","mood","whys","emo","unsure"];
function fieldText(k,d){
  if(k==="energy")return ELBL[d.energy]||"";
  if(k==="need")return d.need==="own"?(d.needText||""):((find(NEED,d.need)||{}).t||"").toLowerCase();
  if(k==="sleep")return labels(SLEEP,d.sleep).join(", ").toLowerCase();
  if(k==="head"){const h=find(HEAD,d.head);return h?h.t.toLowerCase()+((d.head==="pain"||d.head==="migraine")&&d.pain?" "+d.pain+"/10":""):""}
  if(k==="mood")return labels(MOOD,d.mood).join(", ").toLowerCase();
  if(k==="emo")return [...(d.unsure?["не розумію свій стан"]:[]),...arr(d.emo).map(x=>(emoOf(x)||{}).t).filter(Boolean).map(t=>t.toLowerCase())].join(", ");
  return "";
}
const logLine=e=>e.k==="why"?"причина: «"+e.to+"»":FNAME[e.k]+": "+(e.from&&e.to?e.from+" → "+e.to:e.to||"прибрано");
// Append to today's change log. Quick taps on the same thing within 3 minutes count as one change.
function withLog(before,after){
  const log=[...arr(before.log)],now=Date.now();
  ["energy","need","sleep","head","mood","emo"].forEach(k=>{
    const from=fieldText(k,before),to=fieldText(k,after);if(from===to)return;
    const last=log[log.length-1];
    if(last&&last.k===k&&now-last.ts<180000){if(last.from===to)log.pop();else{last.to=to;last.ts=now}}
    else log.push({ts:now,k,from,to});
  });
  const wb=whysOf(before),wa=whysOf(after);
  if(wa.length>wb.length)log.push({ts:now,k:"why",to:wa[wa.length-1].text});
  return log.slice(-40);
}
// Better or worse, comparing what the partner last heard about with now.
function dirOf(a,b){
  let up=0,down=0;const cmp=(x,y)=>{if(x==null||y==null||x===y)return;if(y>x)up++;else down++};
  cmp(a.energy||null,b.energy||null);
  const sev=d=>d.head in HEAD_SEV?HEAD_SEV[d.head]*10+((d.head==="pain"||d.head==="migraine")?(d.pain||0):0):null;
  const sb2=sev(b),sa=sev(a)??(sb2!=null?0:null);if(sa!=null&&sb2!=null)cmp(-sa,-sb2); // no head marked before = was ok
  const pos=d=>arr(d.mood).filter(x=>POS_MOOD.includes(x)).length+arr(d.emo).filter(x=>/yellow|green/.test((emoOf(x)||{}).q)).length;
  const neg=d=>arr(d.mood).filter(x=>NEG_MOOD.includes(x)).length+arr(d.emo).filter(x=>/red|blue/.test((emoOf(x)||{}).q)).length+(d.unsure?1:0);
  const hasMood=d=>arr(d.mood).length||arr(d.emo).length||d.unsure;
  if(hasMood(a)&&hasMood(b))cmp(pos(a)-neg(a),pos(b)-neg(b));
  return up&&!down?"better":down&&!up?"worse":null;
}
const snap=d=>({energy:d.energy||0,head:d.head||null,pain:d.pain||0,mood:arr(d.mood),emo:arr(d.emo),unsure:!!d.unsure});
// A hard moment: show "Обійняти" on the partner's card.
function hardNow(d){
  return d.energy===1||d.head==="migraine"||d.head==="prodrome"||(d.pain||0)>=6||has(d.sleep,"nightmares")||d.unsure
    ||arr(d.mood).some(x=>NEG_MOOD.includes(x)&&x!=="tired")||arr(d.emo).some(x=>/red|blue/.test((emoOf(x)||{}).q));
}
const notifyState=debounce(async()=>{
  const cur=myToday();let base=ls("pushBase");if(!base||base.date!==today())base=null;
  const dir=base?dirOf(base.d,cur):null;
  const changes=base?arr(cur.log).filter(e=>e.ts>base.ts).map(logLine):[];
  let res={};try{res=await sb.functions.invoke("notify",{body:{type:"state",dir,changes}})}catch(e){}
  if(res&&res.data&&res.data.note==="too soon"){setTimeout(notifyState,180000);return}
  ls("pushBase",{date:today(),ts:Date.now(),d:snap(cur)});
},15000);
async function saveMe(patch){
  const before=myToday();
  me=Object.assign({},before,patch,{date:today(),updated:Date.now()});
  delete me.why;
  me.log=withLog(before,me);
  people.set(uid,me);dayMap(uid).set(today(),me);render();
  const {error}=await sb.from("days").upsert({user_id:uid,day:today(),data:me,updated_at:new Date().toISOString()});
  if(error)return syncErr(error);
  saved();
  if(Object.keys(patch).some(k=>NOTABLE.includes(k)))notifyState();
}
function dayMap(id){if(!days.has(id))days.set(id,new Map());return days.get(id)}
async function putPriv(id,data){
  priv.set(id,data);render();
  const {error}=await sb.from("private_items").upsert({user_id:uid,id,data,updated_at:new Date().toISOString()});
  if(error)syncErr(error);else saved();
}
async function delPriv(id){priv.delete(id);render();const {error}=await sb.from("private_items").delete().eq("user_id",uid).eq("id",id);if(error)syncErr(error)}
function careToday(){const d=priv.get("d_"+today());return (d&&d.care)||{}}
function setCare(k,v){const d=priv.get("d_"+today())||{kind:"day"};putPriv("d_"+today(),Object.assign({},d,{care:Object.assign({},d.care||{},{[k]:v})}))}
function tasks(){return [...priv.entries()].filter(([,d])=>d.kind==="task").map(([id,d])=>({id,...d}))}
function syncErr(e){console.error(e);$("sync").textContent="Не вдалося зберегти. Перевір інтернет і спробуй ще раз."}
function saved(){$("sync").textContent="Збережено о "+hm(Date.now())}

async function loadProfiles(){const {data}=await sb.from("profiles").select("*");profiles=new Map((data||[]).map(p=>[p.id,p]));applyTheme(themeKey())}
async function loadDays(){
  const since=new Date();since.setDate(since.getDate()-31);
  const {data}=await sb.from("days").select("*").gte("day",dkey(since));
  people=new Map();days=new Map();
  (data||[]).forEach(r=>{dayMap(r.user_id).set(r.day,r.data);if(r.day===today())people.set(r.user_id,r.data)});
  const mine=people.get(uid);
  if(mine&&(!me.updated||me.date!==today()||mine.updated>=me.updated))me=mine;
}
async function loadPriv(){const {data}=await sb.from("private_items").select("id,data");priv=new Map((data||[]).map(r=>[r.id,r.data]))}
async function loadBox(){const {data}=await sb.from("box").select("*").order("created_at",{ascending:false}).limit(300);box=data||[]}
// Nudges of the last 3 days: ones I received (inbox), thank-yous for ones I sent, and when I last sent each kind.
async function loadInbox(){
  const since=new Date(Date.now()-3*864e5).toISOString();
  const {data}=await sb.from("nudges").select("*").gte("created_at",since).order("created_at",{ascending:false});
  const all=data||[];
  inbox=all.filter(n=>n.to_user===uid&&!n.dismissed_at);
  thanks=all.filter(n=>n.from_user===uid&&n.answered_at&&!n.thanks_seen_at);
  sentLast={};
  all.filter(n=>n.from_user===uid).forEach(n=>{const t=+new Date(n.created_at);if(!sentLast[n.kind]||t>sentLast[n.kind])sentLast[n.kind]=t});
}
async function loadShows(){
  const {data,error}=await sb.from("shows").select("*").order("created_at",{ascending:false}).limit(60);
  if(error){shows=[];return}
  shows=data||[];await signShows();
}
// Photos live in a private bucket, so each one needs a temporary signed link.
async function signShows(){
  const need=shows.slice(0,showLimit).map(x=>x.path).filter(p=>{const c=urlCache.get(p);return !c||c.exp<Date.now()+60000});
  if(!need.length)return;
  const {data}=await sb.storage.from("shows").createSignedUrls(need,6*3600);
  (data||[]).forEach(r=>{if(r.signedUrl)urlCache.set(r.path,{url:r.signedUrl,exp:Date.now()+6*3600e3})});
}
async function loadPlans(){const {data,error}=await sb.from("plans").select("*").order("created_at",{ascending:false}).limit(200);plans=error?[]:(data||[])}
async function loadAll(){await Promise.all([loadProfiles(),loadDays(),loadPriv(),loadBox(),loadInbox(),loadShows(),loadPlans()]);render()}

function subscribe(){
  if(channel)sb.removeChannel(channel);
  const re=(fn)=>debounce(async()=>{await fn();render()},300);
  channel=sb.channel("our-connection")
    .on("postgres_changes",{event:"*",schema:"public",table:"days"},re(loadDays))
    .on("postgres_changes",{event:"*",schema:"public",table:"box"},re(loadBox))
    .on("postgres_changes",{event:"*",schema:"public",table:"nudges"},re(loadInbox))
    .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},re(loadProfiles))
    .on("postgres_changes",{event:"*",schema:"public",table:"shows"},re(loadShows))
    .on("postgres_changes",{event:"*",schema:"public",table:"plans"},re(loadPlans))
    .subscribe(s=>{if(s==="SUBSCRIBED")$("sync").textContent="Синхронізується між вами";else if(s!=="CLOSED")$("sync").textContent="Підключаюсь…"});
}

/* ---------- tabs ---------- */
function setTab(t){
  if(!TITLES[t])t="us";if(t==="us")markSeen();tab=t;ls("tab",t);
  document.querySelectorAll(".tabpane").forEach(p=>p.hidden=p.dataset.pane!==t);
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-current",String(b.dataset.tab===t)));
  $("tabTitle").textContent=TITLES[t];
  if(location.hash!=="#"+t)history.replaceState(null,"","#"+t);
  window.scrollTo({top:0});render();
}
document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.goto)));
window.addEventListener("hashchange",()=>setTab(location.hash.slice(1)));

// What on the partner's card is new since I last looked at "Ми".
function markSeen(){const s=ls("seenLog")||{};seenBase=s;const pid=partnerId();if(pid)ls("seenLog",Object.assign({},s,{[pid]:Date.now()}))}

/* ---------- UI pieces ---------- */
function checkEl(id,text,checked,onChange,tag,onDel){
  const li=el("li","item"+(checked?" done":""));const lab=el("label");
  const cb=el("input");cb.type="checkbox";cb.id="cb_"+id;cb.checked=checked;cb.addEventListener("change",()=>onChange(cb.checked));
  lab.append(cb,el("span",null,text));li.append(lab);
  if(tag)li.append(el("span","tag w"+tag,WLABEL[tag]));
  if(onDel)li.append(btn("del","×",onDel,"Прибрати"));
  return li;
}
function essDue(e,d){const a=(d&&d[e.k])||[];const h=new Date().getHours();if(h<8||h>=23)return false;if(!a.length)return true;return (Date.now()-Math.max(...a))/36e5>=e.gap}
function essNote(e,d){const a=(d&&d[e.k])||[];return a.length?("сьогодні "+a.length+" · востаннє о "+hm(Math.max(...a))):"сьогодні ще не було"}
let lastAdd={};
function addEss(k){lastAdd[k]=Date.now();saveMe({[k]:[...(myToday()[k]||[]),Date.now()].sort((x,y)=>x-y)});setTimeout(render,1600);answerPending(k,3*3600e3)}
function setEssTime(k,i,val){
  const a=[...(myToday()[k]||[])];if(!val)return;
  const [H,M]=val.split(":").map(Number);const d=new Date();d.setHours(H,M,0,0);
  a[i]=d.getTime();a.sort((x,y)=>x-y);editTime=null;saveMe({[k]:a});
}
function delEss(k,i){const a=[...(myToday()[k]||[])];a.splice(i,1);editTime=null;saveMe({[k]:a})}
function essEl(e,d,full){
  const li=el("li","item ess");const tx=el("div","txt");const inner=el("div",null,e.k==="water"?"Попити води":"Поїсти");inner.append(el("small",null,essNote(e,d)));tx.append(inner);
  const just=Date.now()-(lastAdd[e.k]||0)<1500;const b=btn("plus"+(just?" flash":""),just?"✓ Записано":e.did,()=>addEss(e.k));
  const top=el("div","esstop");top.append(tx,b);li.append(top);
  const a=(d[e.k]||[]);
  if(full&&a.length){
    const times=el("div","times");
    a.forEach((ts,i)=>{
      const key=e.k+i;
      if(editTime===key){
        const inp=el("input","timein");inp.type="time";inp.value=hm(ts);inp.setAttribute("aria-label","Новий час");
        inp.addEventListener("change",()=>setEssTime(e.k,i,inp.value));
        inp.addEventListener("keydown",ev=>{if(ev.key==="Escape"){editTime=null;render()}});
        const wrap=el("span","timechip editing");wrap.append(inp,btn("del","×",()=>delEss(e.k,i),"Видалити цю відмітку"));times.append(wrap);
        setTimeout(()=>inp.focus(),0);
      }else{
        times.append(btn("timechip",hm(ts),()=>{editTime=key;render()},"Змінити час "+hm(ts)));
      }
    });
    li.append(times);
  }
  return li;
}
function multiRow(box,opts,field,exclusive){
  box.replaceChildren();const cur=arr(myToday()[field]);
  opts.forEach(o=>{const on=cur.includes(o.k);const b=btn("chip"+(o.warn?" warn":""),o.t,()=>{let next=on?cur.filter(x=>x!==o.k):[...cur,o.k];
      if(!on&&exclusive){if(exclusive.includes(o.k))next=[o.k];else next=next.filter(x=>!exclusive.includes(x))}
      saveMe({[field]:next})});b.setAttribute("aria-pressed",String(on));box.append(b)});
}
function scaleRow(box,field){
  box.replaceChildren();const cur=myToday()[field]||0;
  for(let i=1;i<=10;i++){const b=btn("chip num",String(i),()=>saveMe({[field]:cur===i?0:i}),"Біль "+i+" з 10");b.setAttribute("aria-pressed",String(cur===i));box.append(b)}
}
function chipRow(box,opts,field,extra){
  box.replaceChildren();const cur=myToday()[field]||null;
  opts.forEach(o=>{const b=btn("chip"+(o.warn?" warn":"")+(extra||""),o.t,()=>saveMe({[field]:cur===o.k?null:o.k}));b.setAttribute("aria-pressed",String(cur===o.k));box.append(b)});
}
function colorRow(box,cur,onPick){
  box.replaceChildren();
  COLORS.forEach(c=>{const b=btn("swatch","",()=>onPick(c.k),c.t);b.style.background=c.c;b.setAttribute("aria-pressed",String(cur===c.k));box.append(b)});
}
function themeRow(box,cur,onPick){
  box.replaceChildren();
  Object.entries(THEMES).forEach(([k,t])=>{const b=btn("themecard","",()=>onPick(k),t.t);b.setAttribute("aria-pressed",String(cur===k));
    const im=el("span","themeimg");im.style.backgroundImage='url("'+t.sm+'")';b.append(im,el("span",null,t.t));box.append(b)});
}
const toggleTask=t=>v=>putPriv(t.id,{kind:"task",text:t.text,w:t.w,created:t.created,done:v,doneDay:v?today():null});

/* ---------- person card ---------- */
// Each state row carries its own advice, shown right under it on the partner's card.
function stateRows(d){
  const rows=[];
  if(d.energy)rows.push({f:"energy",label:"Сили: "+ELBL[d.energy],alert:d.energy===1,tips:d.energy===1?["Сил майже немає. Не чекай розгорнутих відповідей."]:[]});
  const sl=labels(SLEEP,d.sleep);
  if(sl.length)rows.push({f:"sleep",label:"Сон: "+sl.join(", ").toLowerCase(),alert:has(d.sleep,"nightmares")||has(d.sleep,"dreams"),
    tips:has(d.sleep,"nightmares")?["Не розпитуй про кошмари, просто будь поруч у повідомленнях."]:has(d.sleep,"dreams")?["Сни виснажують навіть без кошмарів. Будь мʼякшим сьогодні."]:[]});
  const h=find(HEAD,d.head);
  if(h){const t=[];
    if(d.head==="prodrome")t.push("Можна нагадати про воду, їжу й ліки, краще текстом.");
    if(d.head==="migraine")t.push("Краще текст, ніж дзвінок, і без поспіху з відповіддю.");
    if(d.head==="pain"&&(d.pain||0)>=6)t.push("Коротко й тихо, без дзвінків, якщо не просить.");
    rows.push({f:"head",label:"Голова: "+h.t.toLowerCase()+((d.head==="pain"||d.head==="migraine")&&d.pain?" "+d.pain+"/10":""),alert:!!h.warn||(d.pain||0)>=6,tips:t});
    const sg=labels(SIGNS,d.signs);if(sg.length&&(d.head==="prodrome"||d.head==="migraine"))rows.push({f:"head",label:sg.join(", ").toLowerCase(),alert:true,tips:[]});
  }
  const ml=labels(MOOD,d.mood);
  if(ml.length){const t=[];
    if(has(d.mood,"anx")||has(d.mood,"scared"))t.push("Тривожно чи страшно: спокійний голос або коротке «я тут» важливіші за поради.");
    if(has(d.mood,"hurt")||has(d.mood,"sad"))t.push("Боляче чи сумно: не треба виправляти, достатньо побути поруч.");
    if(has(d.mood,"cry"))t.push("Хочеться плакати: просто побудь поруч, без «не плач» і без порад.");
    if(has(d.mood,"cope"))t.push("Тримається: можна сказати, що пишаєшся.");
    if(has(d.mood,"happy")||has(d.mood,"joy"))t.push("Добрий момент: запитай, що сьогодні порадувало.");
    rows.push({f:"mood",label:"Настрій: "+ml.join(", ").toLowerCase(),alert:false,tips:t});
  }
  const em=arr(d.emo).map(emoOf).filter(Boolean);
  if(em.length||d.unsure){
    const qs=[...new Set(em.map(e=>e.q))];
    const t=qs.map(q=>EMO_Q[q].tip);
    if(d.unsure)t.unshift("Сам(а) не розуміє, що відчуває. Не питай «що сталося», краще запропонуй побути поряд або обійми.");
    if(em.some(e=>["shutdown","overstimulated","overwhelmed"].includes(e.k)))t.push("Перевантаження: менше слів і звуків, текст замість дзвінка, не чекай відповіді.");
    if(em.some(e=>e.k==="longing"||e.k==="lonely"))t.push("Бракує тебе. Голосове, фото чи «я тут» зараз важать більше, ніж здається.");
    if(em.some(e=>["depressed","empty","hopeless","despair","burnout"].includes(e.k)))t.push("Якщо так уже кілька днів, мʼяко запропонуй поговорити з фахівцем. Без тиску.");
    rows.push({f:"emo",label:"Відчуття: "+fieldText("emo",d),alert:qs.some(q=>q==="red"||q==="blue")||!!d.unsure,tips:t,emo:em});
  }
  ESS.forEach(e=>{const a=d[e.k]||[];rows.push({label:e.t+": "+(a.length?a.length+", востаннє о "+hm(Math.max(...a)):"ще не було"),alert:essDue(e,d),tips:[],ess:e.k})});
  return rows;
}
function nsBlock(id,isMe){
  const out=[],ns=nsOf(id),eps=activeEpisodes(id);
  if(!ns.long.length&&!eps.length)return out;
  const box=el("div","nsblock");
  ns.long.forEach(l=>{const info=find(NS_LONG,l.k);const r=el("div","nsrow");
    r.append(el("span","fact alert",longLabel(l)+(l.since?" · з "+dshort(l.since):"")));
    if(!isMe&&info)r.append(el("p","tip",info.tip));box.append(r)});
  eps.forEach(e=>{const info=epInfo(e.k),ph=epPhase(e);const r=el("div","nsrow");
    const until=new Date(e.ts+info.h*3600e3);
    r.append(el("span","fact alert ep","⚡ "+info.t+" о "+hm(e.ts)+(ph==="after"?" · відновлення до ~"+(until.toDateString()===new Date().toDateString()?hm(until):"завтра "+hm(until)):"")));
    if(!isMe)r.append(el("p","tip",ph==="now"?info.now:info.after));box.append(r)});
  out.push(box);return out;
}
function personCard(id,d,isMe){
  const c=el("article","card c-"+colorOf(id));
  const pt=THEMES[(profiles.get(id)||{}).theme];
  if(pt){c.classList.add("themed");c.style.backgroundImage=themeLayer(pt,".55");c.style.setProperty("--accent",pt.accent);c.style.setProperty("--on-accent",pt.onAccent);c.style.setProperty("--accent-soft",pt.accent+"33")}
  const who=el("div","who");who.append(el("h3",null,nm(id)));
  const isToday=d&&d.date===today();
  const seen=isMe?Infinity:(seenBase[id]||0);
  const fresh=new Set(isToday?arr(d.log).filter(e=>e.ts>seen&&e.to).map(e=>e.k):[]);
  const sm=el("small",null,d&&d.updated?(isToday?"оновлено о "+hm(d.updated):"востаннє "+dshort(d.updated)):"");
  if(fresh.size)sm.prepend(el("span","newbadge","є нове"));
  who.append(sm);c.append(who);
  const st=statusInfo(profiles.get(id));
  if(st){const p=profiles.get(id);const sl=el("div","status");sl.append(el("span",null,st.i+" "+st.t));
    if(p.status_at)sl.append(el("small",null," з "+(new Date(p.status_at).toDateString()===new Date().toDateString()?hm(p.status_at):dshort(p.status_at)+" "+hm(p.status_at))));
    c.append(sl);if(!isMe&&st.tip)c.append(el("p","tip",st.tip))}
  c.append(...nsBlock(id,isMe));
  if((!d||!isToday)&&!statusInfo(profiles.get(id)))c.append(...nsBlock(id,isMe));
  if((!d||!isToday)&&statusInfo(profiles.get(id))){const st=statusInfo(profiles.get(id));c.append(el("div","status",st.i+" "+st.t),...nsBlock(id,isMe))}
  if(!d||!isToday){c.append(el("p","empty",isMe?"Відміть свій стан у вкладці «Стан», і він зʼявиться тут для вас обох.":"Сьогодні стан ще не відмічено."));if(!isMe)c.append(nudgeRow(id));return c}
  const n=d.need==="own"&&d.needText?{t:d.needText,o:d.needText}:find(NEED,d.need);
  if(n){const nb=el("div","need"+(fresh.has("need")?" fresh":""),isMe?n.t:n.o);c.append(nb);if(!isMe&&n.tip)c.append(el("p","tip",n.tip))}
  const ws=whysOf(d);
  if(ws.length){const q=el("ul","whys");ws.forEach(w=>{const li=el("li","why"+(w.ts>seen?" fresh":""),"«"+w.text+"»");if(w.ts)li.append(el("small",null," "+hm(w.ts)));q.append(li)});c.append(q)}
  let chips=null;
  stateRows(d).forEach(r=>{
    const tips=isMe?[]:r.tips;
    const cls="fact"+(r.alert?" alert":"")+(r.f&&fresh.has(r.f)?" fresh":"");
    if(tips.length||r.emo){chips=null;const s=el("div","staterow");s.append(el("span",cls,r.label));tips.forEach(t=>s.append(el("p","tip",t)));
      if(r.emo&&r.emo.length){const det=el("details","emodef");det.append(el("summary",null,"Що це означає"));
        r.emo.forEach(e=>{const p=el("p");p.append(el("b","q-"+e.q,e.t+". "),document.createTextNode(e.d));det.append(p)});s.append(det)}
      c.append(s)}
    else{if(!chips){chips=el("div","facts");c.append(chips)}chips.append(el("span",cls,r.label))}
  });
  const log=arr(d.log);
  if(log.length){
    const det=el("details","daylog");det.append(el("summary",null,"Як змінювалось сьогодні ("+log.length+")"));
    const ul=el("ul");[...log].reverse().forEach(e=>{const li=el("li",e.ts>seen?"fresh":null);li.append(el("time",null,hm(e.ts)),el("span",null,logLine(e)));ul.append(li)});
    det.append(ul);c.append(det);
  }
  if(!isMe)c.append(nudgeRow(id,d));
  return c;
}
function nudgeRow(id,d){
  const r=el("div","nudges");
  Object.keys(NUDGE).forEach(k=>{
    const e=find(ESS,k);
    if(d&&e&&!essDue(e,d))return;
    if(k==="embrace"&&!((d&&d.date===today()&&hardNow(d))||activeEpisodes(id).length||nsOf(id).long.length))return;
    const last=sentLast[k]||0,ago=Date.now()-last;
    if(last&&ago<60000){r.append(btn("nbtn sent","Надіслано ✓",()=>{}));return}
    if(last&&ago<NUDGE_GAP){
      const b=btn("nbtn wait",NUDGE[k]+" · з "+hm(last+NUDGE_GAP),()=>{});b.disabled=true;
      b.title="Нагадано о "+hm(last)+". Наступне можна через 2 години після попереднього.";r.append(b);return;
    }
    r.append(btn("nbtn",NUDGE[k],async()=>{
      sentLast[k]=Date.now();render();setTimeout(render,61000);
      const {error}=await sb.from("nudges").insert({couple_id:myProfile().couple_id,from_user:uid,to_user:id,kind:k});
      if(error){await loadInbox();render();$("sync").textContent="Це нагадування вже було недавно. Наступне можна через 2 години.";return}
      sb.functions.invoke("notify",{body:{type:"nudge",kind:k}}).catch(()=>{});
    }));
  });
  return r;
}
// I answer my partner's nudge: the latest one of this kind gets "answered" (they get a thank-you),
// older ones of the same kind are just closed. maxAge limits auto-answers when I log water/food myself.
async function answerPending(kind,maxAge){
  const list=inbox.filter(n=>n.kind===kind&&(!maxAge||Date.now()-new Date(n.created_at)<maxAge));
  if(!list.length)return;
  const now=new Date().toISOString(),[last,...older]=list;
  inbox=inbox.filter(n=>!list.includes(n));render();
  const {error}=await sb.from("nudges").update({answered_at:now,dismissed_at:now}).eq("id",last.id);
  if(error)return syncErr(error);
  if(older.length)await sb.from("nudges").update({dismissed_at:now}).in("id",older.map(n=>n.id));
  sb.functions.invoke("notify",{body:{type:"thanks",id:last.id}}).catch(()=>{});
  $("sync").textContent=nm(last.from_user)+" отримає твою відповідь";
}
function replyNudge(n){if(find(ESS,n.kind))addEss(n.kind);else answerPending(n.kind)}
async function dismissNudge(n){
  inbox=inbox.filter(x=>x.id!==n.id);render();
  const {error}=await sb.from("nudges").update({dismissed_at:new Date().toISOString()}).eq("id",n.id);if(error)syncErr(error);
}
async function seenThanks(n){
  thanks=thanks.filter(x=>x.id!==n.id);render();
  const {error}=await sb.from("nudges").update({thanks_seen_at:new Date().toISOString()}).eq("id",n.id);if(error)syncErr(error);
}

/* ---------- render ---------- */
function render(){
  if($("app").hidden)return;
  const d=myToday();
  $("date").textContent=new Date().toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"});
  const ib=$("inbox");ib.replaceChildren();
  inbox.forEach(n=>{const t=el("div","toast");t.append(el("span",null,nm(n.from_user)+" "+NUDGE_IN[n.kind]+" · "+hm(n.created_at)));
    if(REPLY[n.kind])t.append(btn("plus sm",REPLY[n.kind],()=>replyNudge(n)));
    t.append(btn("del","×",()=>dismissNudge(n),"Прибрати"));ib.append(t)});
  thanks.forEach(n=>{const t=el("div","toast thanks");t.append(el("span",null,nm(n.to_user)+": «"+(REPLY_THANKS[n.kind]||"Дякую!")+"» · "+hm(n.answered_at)));
    t.append(btn("del","×",()=>seenThanks(n),"Прибрати"));ib.append(t)});
  if(tab==="us")renderUs();
  if(tab==="state")renderState(d);
  if(tab==="care")renderCare(d);
  if(tab==="box")renderBox();
  if(tab==="time")renderTime();
  if(tab==="stats")renderStats();
}
function renderUs(){
  const us=$("us");us.replaceChildren();
  us.append(personCard(uid,people.get(uid)||me,true));
  const pid=partnerId();
  if(pid)us.append(personCard(pid,people.get(pid),false));
  else{const c=el("article","card c-"+(colorOf(uid)==="yellow"?"red":"yellow"));c.append(el("h3",null,"Твоя людина"));
    c.append(el("p","empty",myProfile().couple_id?"Картка зʼявиться, щойно твоя людина введе код пари.":"Створи пару в налаштуваннях, щоб бачити одне одного."));us.append(c)}
  renderPushBanner();
  renderNextPlan();
  renderShows();
}

/* ---------- Наш час ---------- */
function whenLocal(iso){
  const d=new Date(iso),t=hm(iso),td=new Date(),tm=new Date();tm.setDate(tm.getDate()+1);
  if(d.toDateString()===td.toDateString())return "сьогодні о "+t;
  if(d.toDateString()===tm.toDateString())return "завтра о "+t;
  return d.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"})+" о "+t;
}
const planTitle=p=>(PLAN_KIND[p.kind]||PLAN_KIND.other).i+" "+p.title;
const needsMyYes=p=>!p.done_at&&!p.agreed_at&&(p.proposed_by||p.author)!==uid;
const upcoming=()=>plans.filter(p=>p.at&&!p.done_at).sort((a,b)=>new Date(a.at)-new Date(b.at));
function renderNextPlan(){
  const b=$("nextPlan");b.replaceChildren();
  const waiting=plans.filter(needsMyYes);
  const next=upcoming().find(p=>new Date(p.at)>Date.now()-3600e3);
  if(!next&&!waiting.length){b.hidden=true;return}
  b.hidden=false;
  if(next){const r=el("div","nprow");r.append(el("span",null,"Наступне разом: "+planTitle(next)+" · "+whenLocal(next.at)+(next.agreed_at?" ✓":"")));b.append(r)}
  if(waiting.length){const r=el("div","nprow");r.append(el("span","hint",nm(waiting[0].proposed_by||waiting[0].author)+" чекає на твоє «я за»: "+planTitle(waiting[0])+(waiting.length>1?" і ще "+(waiting.length-1):"")));b.append(r)}
  b.append(btn("link","Відкрити «Наш час»",()=>setTab("time")));
}
const toLocalInput=iso=>{const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
async function updPlan(p,patch,event){
  Object.assign(p,patch);render();
  const {error}=await sb.from("plans").update(patch).eq("id",p.id);
  if(error){syncErr(error);await loadPlans();render();return}
  saved();if(event)sb.functions.invoke("notify",{body:{type:"plan",id:p.id,event}}).catch(()=>{});
}
function planItem(p){
  const li=el("li","item plan"+(p.done_at?" isdone":""));
  const tx=el("div","txt");const inner=el("div",null,planTitle(p));
  const past=p.at&&new Date(p.at)<Date.now();
  const meta=[];
  if(p.at)meta.push((past&&!p.done_at?"минуло · ":"")+whenLocal(p.at));
  meta.push((p.author===uid?"ти":nm(p.author))+" · "+dshort(p.created_at));
  if(p.done_at)meta.push("було "+dshort(p.done_at));
  else if(p.agreed_at)meta.push("ви обоє за ✓");
  else meta.push((p.proposed_by||p.author)===uid?"чекає відповіді":"чекає твого «я за»");
  inner.append(el("small",null,meta.join(" · ")));tx.append(inner);li.append(tx);
  const acts=el("div","planacts");
  if(p.done_at){
    acts.append(btn("ghost sm","Повернути",()=>updPlan(p,{done_at:null})));
  }else if(planEdit===p.id){
    const inp=el("input","timein");inp.type="datetime-local";inp.value=p.at?toLocalInput(p.at):"";inp.setAttribute("aria-label","Коли");
    acts.append(inp,btn("btn sm","Зберегти",()=>{if(!inp.value)return;planEdit=null;
      updPlan(p,{at:new Date(inp.value).toISOString(),proposed_by:uid,agreed_at:null,agreed_by:null},"time")}),
      btn("link","Скасувати",()=>{planEdit=null;render()}));
    setTimeout(()=>inp.focus(),0);
  }else{
    if(needsMyYes(p))acts.append(btn("donebtn sm","✓ Я за",()=>updPlan(p,{agreed_at:new Date().toISOString(),agreed_by:uid},"agree")));
    acts.append(btn("ghost sm",p.at?"Інший час":"Запланувати",()=>{planEdit=p.id;render()}));
    acts.append(btn("ghost sm","Було ✓",()=>updPlan(p,{done_at:new Date().toISOString()})));
  }
  li.append(acts);
  li.append(btn("del","×",async()=>{if(!confirm("Прибрати «"+p.title+"»?"))return;plans=plans.filter(x=>x.id!==p.id);render();
    const {error}=await sb.from("plans").delete().eq("id",p.id);if(error)syncErr(error)},"Прибрати"));
  return li;
}
function renderTime(){
  const has=!!myProfile().couple_id;
  const up=$("plansUp"),id=$("plansIdea"),hx=$("plansDone");[up,id,hx].forEach(x=>x.replaceChildren());
  if(!has){up.append(el("p","empty","«Наш час» зʼявиться, коли ви зʼєднаєте пару."));return}
  const u=upcoming(),ideas=plans.filter(p=>!p.at&&!p.done_at),done=plans.filter(p=>p.done_at).sort((a,b)=>new Date(b.done_at)-new Date(a.done_at));
  u.forEach(p=>up.append(planItem(p)));
  if(!u.length)up.append(el("p","empty","Поки нічого не заплановано. Додай ідею з часом або без."));
  ideas.forEach(p=>id.append(planItem(p)));
  if(!ideas.length)id.append(el("p","empty","Сюди падає те, що хочеться колись: фільм, гра, довга розмова."));
  done.forEach(p=>hx.append(planItem(p)));
  $("planHistCount").textContent=done.length?"("+done.length+")":"";
  if(!done.length)hx.append(el("p","empty","Тут збиратиметься все, що ви вже робили разом."));
}
const when=ts=>new Date(ts).toDateString()===new Date().toDateString()?"сьогодні о "+hm(ts):dshort(ts)+" о "+hm(ts);
function renderShows(){
  const box=$("showsBox");box.hidden=!myProfile().couple_id;if(box.hidden)return;
  const g=$("shows");g.replaceChildren();
  if(!shows.length)g.append(el("p","empty","Фото з дня: що на тарілці, вид з вікна, щось смішне чи гарне. Просто щоб бачити одне одного."));
  shows.slice(0,showLimit).forEach(s=>{
    const f=el("figure","shot c-"+colorOf(s.author));
    const im=el("img");im.alt=s.caption||"Фото від "+nm(s.author);im.loading="lazy";
    const c=urlCache.get(s.path);if(c)im.src=c.url;
    const open=btn("shotimg","",()=>openPhoto(s),"Відкрити фото");open.append(im);f.append(open);
    const cap=el("figcaption");const tx=el("div","txt");
    if(s.caption)tx.append(el("div",null,s.caption));
    tx.append(el("small",null,nm(s.author)+" · "+when(s.created_at)));cap.append(tx);
    if(s.author===uid)cap.append(btn("del","×",()=>delShow(s),"Видалити фото"));
    f.append(cap);g.append(f);
  });
  $("showMore").hidden=shows.length<=showLimit;
}
function openPhoto(s){
  const c=urlCache.get(s.path);if(!c)return;
  $("photoBig").src=c.url;$("photoBig").alt=s.caption||"Фото";
  $("photoCap").textContent=s.caption||"";$("photoMeta").textContent=nm(s.author)+" · "+when(s.created_at);
  $("photoView").showModal();
}
async function delShow(s){
  if(!confirm("Видалити це фото?"))return;
  shows=shows.filter(x=>x.id!==s.id);render();
  const {error}=await sb.from("shows").delete().eq("id",s.id);if(error)return syncErr(error);
  await sb.storage.from("shows").remove([s.path]);
}
// Phone photos are large: shrink to 1600px JPEG before uploading.
async function shrink(file){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    const k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const cv=document.createElement("canvas");cv.width=Math.round(img.naturalWidth*k);cv.height=Math.round(img.naturalHeight*k);
    cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
    return await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("toBlob")),"image/jpeg",.82));
  }finally{URL.revokeObjectURL(url)}
}
function closeShowForm(){if(pendingUrl)URL.revokeObjectURL(pendingUrl);$("showForm").hidden=true;$("showCaption").value="";$("showPreview").removeAttribute("src");pendingFile=null;pendingUrl=null}
function renderState(d){
  const lvl=d.energy||0;
  document.querySelectorAll(".lvl").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.l===lvl)));
  statusRow();emoMap(d);nsRow();
  needRow(d);multiRow($("sleepChips"),SLEEP,"sleep",["good"]);chipRow($("headChips"),HEAD,"head");multiRow($("moodChips"),MOOD,"mood");
  const showPain=d.head==="pain"||d.head==="migraine",showSigns=d.head==="prodrome"||d.head==="migraine";
  $("painBox").hidden=!showPain;if(showPain)scaleRow($("painChips"),"pain");
  $("signBox").hidden=!showSigns;if(showSigns)multiRow($("signChips"),SIGNS,"signs");
  const wl=$("whyList");wl.replaceChildren();
  whysOf(d).forEach((w,i)=>{const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,w.text);if(w.ts)inner.append(el("small",null,hm(w.ts)));tx.append(inner);li.append(tx);
    li.append(btn("del","×",()=>{const all=whysOf(myToday());all.splice(i,1);saveMe({whys:all})},"Прибрати причину"));wl.append(li)});
}
// "Що я зараз роблю" — saved on the profile, partner gets a push for military statuses.
async function setStatus(status,text){
  const patch={status:status||null,status_text:status==="own"?text:null,status_at:status?new Date().toISOString():null};
  Object.assign(myProfile(),patch);render();
  const {error}=await sb.from("profiles").update(patch).eq("id",uid);
  if(error)return syncErr(error);saved();
  if(status)sb.functions.invoke("notify",{body:{type:"status"}}).catch(()=>{});
}
async function setNs(next){
  const p=myProfile();p.ns=next;render();
  const {error}=await sb.from("profiles").update({ns:next}).eq("id",uid);
  if(error)return syncErr(error);saved();
}
function toggleLong(k,text){
  const ns=nsOf(uid),on=ns.long.some(l=>l.k===k&&(k!=="own"||l.text===text));
  const long=on?ns.long.filter(l=>!(l.k===k&&(k!=="own"||l.text===text))):[...ns.long,{k,text:k==="own"?text:undefined,since:Date.now()}];
  setNs({...ns,long});
  if(!on)sb.functions.invoke("notify",{body:{type:"ns",what:"long",k}}).catch(()=>{});
}
function addEpisode(k){
  const ns=nsOf(uid),cut=Date.now()-60*864e5;
  const episodes=[...ns.episodes.filter(e=>e.ts>cut),{id:Date.now().toString(36),k,ts:Date.now()}].slice(-100);
  setNs({...ns,episodes});
  sb.functions.invoke("notify",{body:{type:"ns",what:"episode",k}}).catch(()=>{});
}
function patchEpisode(id,patch){const ns=nsOf(uid);setNs({...ns,episodes:ns.episodes.map(e=>e.id===id?Object.assign({},e,patch):e).filter(e=>!e.del)})}
let epEdit=null;
function nsRow(){
  const ns=nsOf(uid),lb=$("nsLong");lb.replaceChildren();
  NS_LONG.forEach(o=>{const on=ns.long.some(l=>l.k===o.k);const b=btn("chip warn",o.t,()=>toggleLong(o.k));b.setAttribute("aria-pressed",String(on));lb.append(b)});
  ns.long.filter(l=>l.k==="own").forEach(l=>{const b=btn("chip warn",l.text,()=>toggleLong("own",l.text));b.setAttribute("aria-pressed","true");lb.append(b)});
  if($("nsForm").hidden)lb.append(btn("chip add","+ Своє",()=>{$("nsForm").hidden=false;render();$("nsText").focus()}));
  const eb=$("nsEp");eb.replaceChildren();
  NS_EP.forEach(o=>eb.append(btn("chip","⚡ "+o.t,()=>addEpisode(o.k))));
  const al=$("nsActive");al.replaceChildren();
  activeEpisodes(uid).forEach(e=>{const info=epInfo(e.k);const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,info.t);
    const until=new Date(e.ts+info.h*3600e3);
    inner.append(el("small",null,(epPhase(e)==="now"?"зараз":"відновлення")+" · до ~"+(until.toDateString()===new Date().toDateString()?hm(until):"завтра "+hm(until))));
    tx.append(inner);li.append(tx);
    if(epEdit===e.id){const inp=el("input","timein");inp.type="time";inp.value=hm(e.ts);inp.setAttribute("aria-label","Коли почалось");
      inp.addEventListener("change",()=>{if(!inp.value)return;const [H,M]=inp.value.split(":").map(Number);const dt=new Date(e.ts);dt.setHours(H,M,0,0);if(dt>Date.now())dt.setDate(dt.getDate()-1);epEdit=null;patchEpisode(e.id,{ts:dt.getTime()})});
      li.append(inp);setTimeout(()=>inp.focus(),0)}
    else li.append(btn("timechip",hm(e.ts),()=>{epEdit=e.id;render()},"Змінити час"));
    li.append(btn("ghost sm","Вже легше",()=>patchEpisode(e.id,{end:Date.now()})));
    li.append(btn("del","×",()=>patchEpisode(e.id,{del:1}),"Прибрати, якщо випадково"));
    al.append(li)});
}
function statusRow(){
  const p=myProfile(),box=$("statusChips");box.replaceChildren();
  (STATUS[p.status_set||"civil"]||STATUS.civil).forEach(o=>{const on=p.status===o.k;
    const b=btn("chip",o.i+" "+o.t,()=>setStatus(on?null:o.k));b.setAttribute("aria-pressed",String(on));box.append(b)});
  if(p.status==="own"&&p.status_text){const b=btn("chip","📍 "+p.status_text,()=>setStatus(null));b.setAttribute("aria-pressed","true");box.append(b)}
  if($("statusForm").hidden)box.append(btn("chip add","+ Своє",()=>{$("statusForm").hidden=false;render();$("statusText").focus()}));
}
// How We Feel style: pick a colour (energy × pleasantness) first, then the word.
function emoMap(d){
  const open=!!d.unsure||emoOpen;
  $("unsureBtn").setAttribute("aria-pressed",String(!!d.unsure));
  $("emoBox").hidden=!open;
  if(!open)return;
  const sel=arr(d.emo).filter(emoOf);
  const pick=e=>{emoInfo=e.k;const on=sel.includes(e.k);
    if(!on&&sel.length>=EMO_MAX){emoInfo="__max";render();return}
    saveMe({emo:on?sel.filter(x=>x!==e.k):[...sel,e.k]})};
  const word=e=>{const b=btn("emo-w t"+e.i+" q-"+e.q,e.t,()=>pick(e));b.setAttribute("aria-pressed",String(sel.includes(e.k)));return b};
  // chosen
  const ch=$("emoChosen");ch.replaceChildren();
  sel.forEach(k=>{const e=emoOf(k);ch.append(btn("emo-w t2 q-"+e.q+" chosen",e.t+" ×",()=>pick(e),"Прибрати «"+e.t+"»"))});
  // quadrants
  const grid=$("emoGrid");grid.replaceChildren();
  ["red","yellow","blue","green"].forEach(q=>{
    const n=sel.filter(k=>emoOf(k).q===q).length;
    const b=btn("emoq q-"+q,"",()=>{emoQ=emoQ===q?null:q;$("emoSearch").value="";render()});
    b.setAttribute("aria-pressed",String(emoQ===q));
    b.append(el("b",null,EMO_Q[q].t),el("small",null,EMO.filter(e=>e.q===q&&e.i===2).slice(0,3).map(e=>e.t.toLowerCase()).join(", ")+"…"));
    if(n)b.append(el("span","emocount",String(n)));
    grid.append(b);
  });
  // words: search across all, or the open quadrant by intensity
  const words=$("emoWords");words.replaceChildren();
  const qtxt=$("emoSearch").value.trim().toLowerCase();
  if(qtxt){
    const found=EMO.filter(e=>e.t.toLowerCase().includes(qtxt)||e.d.toLowerCase().includes(qtxt));
    const r=el("div","emorow");found.forEach(e=>r.append(word(e)));words.append(r);
    if(!found.length)words.append(el("p","empty","Такого слова немає. Можна описати своїми словами в «Через що»."));
  }else if(emoQ){
    [1,2,3].forEach(i=>{const list=EMO.filter(e=>e.q===emoQ&&e.i===i);if(!list.length)return;
      const g=el("div","emotier");g.append(el("span","sub",EMO_LVL[i]));const r=el("div","emorow");list.forEach(e=>r.append(word(e)));g.append(r);words.append(g)});
  }
  const inf=$("emoInfo");inf.replaceChildren();
  const e=emoInfo==="__max"?null:emoOf(emoInfo)||emoOf(sel[sel.length-1]);
  if(emoInfo==="__max")inf.textContent="Вже вибрано "+EMO_MAX+". Прибери одне, щоб додати інше.";
  else if(e)inf.append(el("b","q-"+e.q,e.t),document.createTextNode(" — "+e.d));
  else inf.textContent=emoQ||qtxt?"Торкнись слова, яке хоч трохи схоже. Тут зʼявиться, що воно означає.":"Обери колір: скільки зараз енергії і наскільки приємно. Потім слово.";
}
let emoQ=null;
let emoOpen=false,emoInfo=null;
// "Що мені зараз треба": built-in options, my own saved ones (synced, private) and "+ Своє".
const ownNeeds=()=>((priv.get("needs_own")||{}).list)||[];
function saveOwnNeed(text){putPriv("needs_own",{kind:"needs_own",list:[text,...ownNeeds().filter(x=>x!==text)].slice(0,6)})}
function needRow(d){
  const box=$("needChips");chipRow(box,NEED,"need"," needc");
  const cur=d.need==="own"?d.needText:null;
  [...new Set([...(cur?[cur]:[]),...ownNeeds()])].forEach(t=>{
    const on=cur===t,w=el("span","chipwrap");
    const b=btn("chip needc",t,()=>saveMe(on?{need:null,needText:null}:{need:"own",needText:t}));b.setAttribute("aria-pressed",String(on));
    w.append(b);
    if(ownNeeds().includes(t))w.append(btn("del","×",()=>putPriv("needs_own",{kind:"needs_own",list:ownNeeds().filter(x=>x!==t)}),"Прибрати «"+t+"» зі списку"));
    box.append(w);
  });
  if($("needForm").hidden)box.append(btn("chip add","+ Своє",()=>{$("needForm").hidden=false;render();$("needText").focus()}));
}
function renderCare(d){
  const lvl=d.energy||0,care=careToday(),mig=d.head==="migraine";
  const open=tasks().filter(t=>!t.done).sort((a,b)=>a.w-b.w||a.created-b.created);
  const careList=careFor(lvl),careLeft=careList.filter(c=>!care[c.k]);
  const now=$("now");now.replaceChildren();const ul=el("ul","list");
  ESS.filter(e=>essDue(e,d)).forEach(e=>ul.append(essEl(e,d,false)));
  let msg="";
  if(d.head==="prodrome")msg="Схоже, наближається мігрень. Зараз саме час: вода, щось поїсти, менше світла й екранів, ліки за планом лікаря, якщо він є. Важкі задачі сховані.";
  else if(mig)msg="Мігрень. Темно, тихо, вода, ліки, якщо маєш план від лікаря. Задачі сьогодні сховані.";
  else if(lvl){
    msg=MSG[lvl];let picks=[];
    if(lvl===1)picks=careLeft.slice(0,2).map(c=>({care:c}));
    if(lvl===2)picks=[...careLeft.slice(0,1).map(c=>({care:c})),...open.filter(t=>t.w===1).slice(0,2).map(t=>({task:t}))];
    if(lvl===3)picks=[...open.filter(t=>t.w===3).slice(0,1),...open.filter(t=>t.w<3).slice(0,2)].slice(0,3).map(t=>({task:t}));
    if(lvl===4)picks=open.filter(t=>t.w===3).slice(0,2).map(t=>({task:t}));
    if(lvl>=3&&!picks.length)picks=careLeft.slice(0,2).map(c=>({care:c}));
    picks.forEach(p=>{if(p.care)ul.append(checkEl("now_"+p.care.k,p.care.t,false,v=>setCare(p.care.k,v)));else ul.append(checkEl("now_"+p.task.id,p.task.text,false,toggleTask(p.task),p.task.w))});
  }
  if(msg)now.append(el("p","msg",msg));else if(!lvl){const p=el("p",null,"Відміть сили у вкладці «Стан», і тут зʼявиться 1–3 речі, які зараз підійдуть. ");now.append(p)}
  if(ul.children.length)now.append(ul);else if(lvl||mig)now.append(el("p",null,"Зараз нічого не горить. Можна просто відпочити."));

  const es=$("ess");es.replaceChildren();ESS.forEach(e=>es.append(essEl(e,d,true)));
  const cu=$("care");cu.replaceChildren();
  $("careHint").textContent=lvl?"Під рівень «"+ELBL[lvl]+"». Тільки твоє, скидається щодня":"Відміть сили у «Стані», і список підлаштується. Зараз показую рівень «трохи є»";
  careList.forEach(c=>cu.append(checkEl("care_"+c.k,c.t,!!care[c.k],v=>setCare(c.k,v),null,c.own?()=>delPriv(c.k):null)));

  const maxW=mig&&!showAll?0:d.head==="prodrome"&&!showAll?1:(!lvl||showAll)?3:lvl<=2?1:3;
  const visible=open.filter(t=>t.w<=maxW),hidden=open.length-visible.length;
  const tu=$("tasks");tu.replaceChildren();
  visible.forEach(t=>tu.append(checkEl("t_"+t.id,t.text,false,toggleTask(t),t.w,()=>delPriv(t.id))));
  if(!open.length)tu.append(el("p","empty","Задач немає. Додай одним рядком, коли щось спаде на думку."));
  else if(!visible.length)tu.append(el("p","empty","Під твій стан зараз нічого немає, і це окей."));
  const tg=$("toggleAll");tg.hidden=!(hidden>0||showAll);tg.textContent=showAll?"Показати лише те, що під силу":"Показати всі ("+hidden+" сховано)";
  const doneToday=tasks().filter(t=>t.done&&t.doneDay===today());
  const n=Object.values(care).filter(Boolean).length+doneToday.length+(d.water||[]).length+(d.food||[]).length;
  $("tally").textContent=n?("Сьогодні вже відмічено: "+n+". Все це зараховується."):"Сьогодні ще нічого не відмічено. Нічого страшного.";
  const du=$("doneList");du.replaceChildren();doneToday.forEach(t=>du.append(checkEl("d_"+t.id,t.text,true,toggleTask(t),t.w,()=>delPriv(t.id))));
}
async function setBoxDone(b,done){
  b.done_at=done?new Date().toISOString():null;b.done_by=done?uid:null;render();
  const {error}=await sb.from("box").update({done_at:b.done_at,done_by:b.done_by}).eq("id",b.id);
  if(error){syncErr(error);await loadBox();render()}else saved();
}
function boxItem(b,isDone){
  const li=el("li","item boxitem"+(isDone?" isdone":""));const tx=el("div","txt");const inner=el("div",null,b.text);
  let meta=nm(b.author)+" · "+dshort(b.created_at);
  if(isDone)meta+=" · "+DONE[b.kind].toLowerCase()+" "+dshort(b.done_at);
  inner.append(el("small",null,meta));tx.append(inner);li.append(tx,el("span","kind "+(b.kind||""),KIND[b.kind]||""));
  if(isDone)li.append(btn("ghost sm","Повернути",()=>setBoxDone(b,false)));
  else li.append(btn("donebtn sm","✓ "+DONE[b.kind],()=>setBoxDone(b,true)));
  li.append(btn("del","×",async()=>{box=box.filter(y=>y.id!==b.id);render();await sb.from("box").delete().eq("id",b.id)},"Видалити запис"));
  return li;
}
function renderBox(){
  const bx=$("box");bx.replaceChildren();const hx=$("boxDone");hx.replaceChildren();
  const active=box.filter(b=>!b.done_at),done=box.filter(b=>b.done_at).sort((a,b)=>new Date(b.done_at)-new Date(a.done_at));
  if(!myProfile().couple_id)bx.append(el("p","empty","Скринька зʼявиться, коли ви зʼєднаєте пару."));
  else if(!active.length)bx.append(el("p","empty","Поки порожньо. Кинь сюди щось, про що хочеться поговорити при наступному дзвінку."));
  active.forEach(b=>bx.append(boxItem(b,false)));
  done.forEach(b=>hx.append(boxItem(b,true)));
  $("histCount").textContent=done.length?"("+done.length+")":"";
  if(!done.length)hx.append(el("p","empty","Тут зʼявиться все, що ви вже розказали, обговорили чи здійснили."));
}
function renderStats(){
  const ids=[uid,partnerId()].filter(Boolean);if(!statWho||!ids.includes(statWho))statWho=uid;
  const w=$("statWho");w.replaceChildren();
  ids.forEach(id=>{const b=btn("chip",id===uid?"Я":nm(id),()=>{statWho=id;render()});b.setAttribute("aria-pressed",String(statWho===id));w.append(b)});
  const r=$("statRange");r.replaceChildren();
  [7,14,30].forEach(n=>{const b=btn("chip",n+" днів",()=>{statRange=n;render()});b.setAttribute("aria-pressed",String(statRange===n));r.append(b)});
  const map=dayMap(statWho),list=[];
  for(let i=0;i<statRange;i++){const dt=new Date();dt.setDate(dt.getDate()-i);const k=dkey(dt);list.push({dt,k,h:(statWho===uid&&k===today()?myToday():map.get(k))||{}})}
  const filled=list.filter(x=>x.h.energy||x.h.mood||x.h.sleep||x.h.head);
  const en=list.filter(x=>x.h.energy).map(x=>x.h.energy);
  const cnt=f=>list.filter(x=>f(x.h)).length;
  const avg=(k)=>{const v=list.map(x=>(x.h[k]||[]).length).filter(n=>n>0);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):"—"};
  const moods={};list.forEach(x=>arr(x.h.mood).forEach(m=>moods[m]=(moods[m]||0)+1));
  const top=Object.entries(moods).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>(find(MOOD,k)||{}).t+" ("+n+")");
  const tiles=[
    ["Днів з відмітками",filled.length+" з "+statRange],
    ["Середні сили",en.length?(en.reduce((a,b)=>a+b,0)/en.length).toFixed(1)+" з 4":"—"],
    ["Кошмари",cnt(h=>has(h.sleep,"nightmares"))],
    ["Сни",cnt(h=>has(h.sleep,"dreams"))],
    ["Мігрень або її наближення",cnt(h=>h.head==="migraine"||h.head==="prodrome")],
    ["Епізоди (мелтдаун, шатдаун…)",nsOf(statWho).episodes.filter(e=>Date.now()-e.ts<statRange*864e5).length],
    ["Болить голова",cnt(h=>h.head==="pain")],
    ["Вода на день",avg("water")],
    ["Їжа на день",avg("food")],
  ];
  const s=$("statSummary");s.replaceChildren();
  tiles.forEach(([l,v])=>{const t=el("div","tile");t.append(el("span","tv",String(v)),el("span","tl",l));s.append(t)});
  if(top.length){const t=el("div","tile wide");t.append(el("span","tv small",top.join(", ")),el("span","tl","Найчастіший настрій"));s.append(t)}
  const tb=$("week");tb.replaceChildren();const hr=tb.insertRow();
  ["День","Сили","Сон","Голова","Настрій","Вода","Їжа"].forEach(h=>hr.append(el("th",null,h)));
  list.forEach(({dt,k,h},i)=>{const row=tb.insertRow();
    const c=(t,cls)=>{const td=row.insertCell();td.textContent=t;if(cls)td.className=cls};
    c(i===0?"сьогодні":dt.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric"}));
    c(h.energy?"●".repeat(h.energy)+"○".repeat(4-h.energy):"—","dots");
    const sl=labels(SLEEP,h.sleep);c(sl.length?sl.join(", "):"—",has(h.sleep,"nightmares")||has(h.sleep,"dreams")?"mig":"");
    const hd=find(HEAD,h.head);c(hd?hd.t+(h.pain?" "+h.pain:""):"—",h.head==="migraine"||h.head==="prodrome"?"mig":"");
    const ml=labels(MOOD,h.mood);c(ml.length?ml.join(", "):"—");
    c(String((h.water||[]).length||"—"));c(String((h.food||[]).length||"—"));});
}

/* ---------- push ---------- */
function b64ToBytes(s){const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))}
const pushSupported=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
function withTimeout(p,ms,what){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(what)),ms))])}
async function getReg(){
  let reg=await navigator.serviceWorker.getRegistration();
  if(!reg)reg=await navigator.serviceWorker.register("sw.js");
  return withTimeout(navigator.serviceWorker.ready,10000,"сервіс-воркер не запустився");
}
let pushBusy=false,pushSubscribed=false;
async function enablePush(){
  if(pushBusy)return;pushBusy=true;
  const btns=[$("pushOn"),$("pushOn2")];btns.forEach(b=>{b.disabled=true;b.textContent="Вмикаю…"});
  try{
    if(!pushSupported())throw new Error("цей браузер не підтримує сповіщення. Відкрий у Chrome");
    alertMsg("Чекаю дозволу браузера…");
    const perm=await Notification.requestPermission();
    if(perm!=="granted")throw new Error(perm==="denied"?"сповіщення заблоковані. Дозволь їх у налаштуваннях сайту (значок замка біля адреси)":"дозвіл не надано");
    alertMsg("Підключаю сповіщення…");
    const reg=await getReg();
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await withTimeout(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.vapidPublicKey)}),20000,"сервіс сповіщень браузера не відповів");
    const j=sub.toJSON();
    const {error}=await sb.from("push_subscriptions").upsert({endpoint:j.endpoint,user_id:uid,p256dh:j.keys.p256dh,auth:j.keys.auth});
    if(error)throw new Error("не вдалося зберегти: "+error.message);
    alertMsg("Сповіщення увімкнені");
    sb.functions.invoke("notify",{body:{type:"test"}}).catch(()=>{});
  }catch(e){
    console.error(e);alertMsg("Не вийшло: "+(e&&e.message||e));
  }finally{
    pushBusy=false;btns.forEach(b=>{b.disabled=false;b.textContent="Увімкнути сповіщення"});
    renderPushState();render();
  }
}
function alertMsg(t){$("pushState").textContent=t;$("sync").textContent=t}
async function renderPushState(){
  if($("pushState").textContent.startsWith("Не вийшло"))return;
  if(!pushSupported()){$("pushState").textContent="Сповіщення недоступні в цьому браузері";$("pushOn").hidden=true;return}
  try{const reg=await navigator.serviceWorker.getRegistration();pushSubscribed=!!(reg&&await reg.pushManager.getSubscription())}catch(e){}
  const on=pushSubscribed&&Notification.permission==="granted";
  $("pushState").textContent=on?"Сповіщення увімкнені на цьому пристрої":Notification.permission==="denied"?"Сповіщення заблоковані в браузері":"Сповіщення вимкнені";
  $("pushOn").hidden=on;renderPushBanner();
}
function renderPushBanner(){$("pushBanner").hidden=!pushSupported()||(pushSubscribed&&Notification.permission==="granted")||Notification.permission==="denied"||ls("pushLater")===today()}

/* ---------- auth & pairing ---------- */
let signup=false,pickedColor="red";
function setAuthMode(s){
  signup=s;$("signupFields").hidden=!s;$("authTitle").textContent=s?"Реєстрація":"Вхід";
  $("authLead").textContent=s?"Створи акаунт. Потім зʼєднаєте пару кодом.":"Увійди, щоб бачити одне одного.";
  $("authSubmit").textContent=s?"Створити акаунт":"Увійти";$("authToggle").textContent=s?"У мене вже є акаунт":"Я тут вперше";
  $("password").autocomplete=s?"new-password":"current-password";$("authErr").textContent="";
  colorRow($("colorPick"),pickedColor,k=>{pickedColor=k;setAuthMode(true)});
}
function authError(e){
  const m=(e&&e.message)||"";
  if(/Invalid login/i.test(m))return "Невірна пошта або пароль.";
  if(/already registered/i.test(m))return "Така пошта вже зареєстрована. Спробуй увійти.";
  if(/Email not confirmed/i.test(m))return "Пошта ще не підтверджена. Перевір лист від Supabase.";
  if(/Password should be/i.test(m))return "Пароль має бути щонайменше 6 символів.";
  if(/rate limit/i.test(m))return "Забагато спроб. Зачекай кілька хвилин.";
  return "Не вийшло: "+m;
}
$("authToggle").addEventListener("click",()=>setAuthMode(!signup));
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authErr").textContent="";
  const email=$("email").value.trim(),password=$("password").value;
  if(signup){
    const name=$("name").value.trim();
    if(!name){$("authErr").textContent="Напиши, як тебе називати.";return}
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{name,color:pickedColor},emailRedirectTo:location.origin+location.pathname}});
    if(error){$("authErr").textContent=authError(error);return}
    if(!data.session){$("authErr").textContent="Майже готово: відкрий лист на пошті й підтверди адресу, потім повернись сюди і увійди.";setAuthMode(false)}
  }else{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)$("authErr").textContent=authError(error);
  }
});
$("createCouple").addEventListener("click",async()=>{
  $("pairErr").textContent="";
  const {data,error}=await sb.rpc("create_couple");
  if(error){$("pairErr").textContent="Не вийшло створити пару: "+error.message;return}
  $("codeShow").textContent=data;$("codeBox").hidden=false;$("skipPair").textContent="Далі";
  await loadProfiles();
});
$("joinForm").addEventListener("submit",async e=>{
  e.preventDefault();$("pairErr").textContent="";
  const {data,error}=await sb.rpc("join_couple",{code:$("joinCode").value});
  if(error||!data){$("pairErr").textContent="Код не підійшов. Перевір літери й цифри.";return}
  openApp();
});
$("skipPair").addEventListener("click",()=>{ls("skipPair",true);openApp()});

async function start(session){
  uid=session.user.id;
  await loadProfiles();
  if(!myProfile().couple_id&&!ls("skipPair")){show("pair");return}
  openApp();
}
async function openApp(){show("app");setTab(location.hash.slice(1)||ls("tab")||"us");$("sync").textContent="Підключаюсь…";await loadAll();subscribe();renderPushState()}

/* ---------- settings ---------- */
function renderSettings(){
  const p=myProfile();
  colorRow($("setColor"),p.color,async k=>{
    const {error}=await sb.from("profiles").update({color:k}).eq("id",uid);if(error)return syncErr(error);
    await loadProfiles();renderSettings();render()});
  const ss=$("setStatusSet");ss.replaceChildren();
  [["civil","Цивільні"],["military","Військові"]].forEach(([k,t])=>{const b=btn("chip",t,async()=>{
    const {error}=await sb.from("profiles").update({status_set:k}).eq("id",uid);if(error)return syncErr(error);
    await loadProfiles();renderSettings();render()});b.setAttribute("aria-pressed",String((p.status_set||"civil")===k));ss.append(b)});
  const tb=$("themeBtn"),cur=THEMES[themeKey()]||THEMES.apothecary;tb.replaceChildren();
  const ti=el("span","themeimg");ti.style.backgroundImage='url("'+cur.sm+'")';
  tb.append(ti,el("span",null,cur.t),el("span","caret",$("setTheme").hidden?"▾":"▴"));
  themeRow($("setTheme"),themeKey(),async k=>{
    ls("theme",k);applyTheme(k);$("setTheme").hidden=true;tb.setAttribute("aria-expanded","false");
    const {error}=await sb.from("profiles").update({theme:k}).eq("id",uid);
    if(!error)await loadProfiles();
    renderSettings();
  });
}
$("openSettings").addEventListener("click",async()=>{
  const p=myProfile();$("setName").value=p.name||"";
  $("setTheme").hidden=true;$("themeBtn").setAttribute("aria-expanded","false");
  setPane(ls("setPane")||"me");renderSettings();renderPushState();
  if(p.couple_id){const {data}=await sb.rpc("my_invite_code");$("pairInfo").textContent=partnerId()?"Ви зʼєднані з "+nm(partnerId())+". Код пари: "+data:"Код для твоєї людини: "+data}
  else $("pairInfo").textContent="Пари ще немає. Вийди й увійди знову, щоб створити або приєднатися.";
  $("settings").showModal();
});
$("setName").addEventListener("change",async()=>{await sb.from("profiles").update({name:$("setName").value.trim()}).eq("id",uid);await loadProfiles();render()});
$("closeSettings").addEventListener("click",()=>$("settings").close());
function setPane(k){
  document.querySelectorAll(".setpane").forEach(p=>p.hidden=p.dataset.setpane!==k);
  document.querySelectorAll(".settabs button").forEach(b=>b.setAttribute("aria-current",String(b.dataset.set===k)));
  ls("setPane",k);
}
document.querySelectorAll(".settabs button").forEach(b=>b.addEventListener("click",()=>setPane(b.dataset.set)));
$("themeBtn").addEventListener("click",()=>{const th=$("setTheme");th.hidden=!th.hidden;$("themeBtn").setAttribute("aria-expanded",String(!th.hidden));renderSettings()});
$("pushOn").addEventListener("click",enablePush);
$("pushOn2").addEventListener("click",enablePush);
$("pushLater").addEventListener("click",()=>{ls("pushLater",today());renderPushBanner()});
$("logout").addEventListener("click",async()=>{$("settings").close();ls("skipPair",null);await sb.auth.signOut()});

/* ---------- form events ---------- */
document.querySelectorAll(".lvl").forEach(b=>b.addEventListener("click",()=>{const l=+b.dataset.l;showAll=false;saveMe({energy:myToday().energy===l?0:l})}));
$("whyForm").addEventListener("submit",e=>{
  e.preventDefault();const text=$("why").value.trim();if(!text)return;
  saveMe({whys:[...whysOf(myToday()),{text,ts:Date.now()}]});$("why").value="";flash(e.submitter,"✓ Додано");
});
$("toggleAll").addEventListener("click",()=>{showAll=!showAll;render()});
$("needForm").addEventListener("submit",e=>{e.preventDefault();const text=$("needText").value.trim();if(!text)return;
  $("needText").value="";$("needForm").hidden=true;saveOwnNeed(text);saveMe({need:"own",needText:text})});
$("nsForm").addEventListener("submit",e=>{e.preventDefault();const t=$("nsText").value.trim();if(!t)return;$("nsText").value="";$("nsForm").hidden=true;toggleLong("own",t)});
$("nsCancel").addEventListener("click",()=>{$("nsText").value="";$("nsForm").hidden=true;render()});
$("statusForm").addEventListener("submit",e=>{e.preventDefault();const t=$("statusText").value.trim();if(!t)return;
  $("statusText").value="";$("statusForm").hidden=true;setStatus("own",t)});
$("statusCancel").addEventListener("click",()=>{$("statusText").value="";$("statusForm").hidden=true;render()});
$("unsureBtn").addEventListener("click",()=>{const on=!myToday().unsure;emoOpen=on;saveMe({unsure:on})});
$("emoSearch").addEventListener("input",()=>render());
$("emoToggle").addEventListener("click",()=>{emoOpen=!emoOpen||!!myToday().unsure;render()});
$("planForm").addEventListener("submit",async e=>{
  e.preventDefault();const title=$("planText").value.trim(),cid=myProfile().couple_id;if(!title||!cid)return;
  const when=$("planAt").value;const row={couple_id:cid,author:uid,proposed_by:uid,kind:$("planKind").value,title,at:when?new Date(when).toISOString():null};
  $("planText").value="";$("planAt").value="";flash(e.submitter,"✓ Додано");
  const {data,error}=await sb.from("plans").insert(row).select().single();if(error)return syncErr(error);
  sb.functions.invoke("notify",{body:{type:"plan",id:data.id,event:"new"}}).catch(()=>{});
  await loadPlans();render();
});
$("needCancel").addEventListener("click",()=>{$("needText").value="";$("needForm").hidden=true;render()});
$("showFile").addEventListener("change",async e=>{
  const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;
  try{pendingFile=await shrink(f)}catch(err){console.error(err);$("sync").textContent="Не вдалося відкрити це фото. Спробуй інше або зроби знімок екрана.";return}
  pendingUrl=URL.createObjectURL(pendingFile);$("showPreview").src=pendingUrl;$("showForm").hidden=false;$("showCaption").focus();
});
$("showCancel").addEventListener("click",closeShowForm);
$("showForm").addEventListener("submit",async e=>{
  e.preventDefault();const cid=myProfile().couple_id;if(!pendingFile||!cid)return;
  const b=$("showSubmit");b.disabled=true;b.textContent="Завантажую…";
  const path=cid+"/"+uid+"/"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)+".jpg";
  const caption=$("showCaption").value.trim();
  try{
    const up=await sb.storage.from("shows").upload(path,pendingFile,{contentType:"image/jpeg",cacheControl:"31536000"});
    if(up.error)throw up.error;
    const {error}=await sb.from("shows").insert({couple_id:cid,author:uid,path,caption});
    if(error){await sb.storage.from("shows").remove([path]);throw error}
    urlCache.set(path,{url:pendingUrl,exp:Infinity});pendingUrl=null;
    closeShowForm();saved();
    sb.functions.invoke("notify",{body:{type:"show",caption}}).catch(()=>{});
    await loadShows();render();
  }catch(err){syncErr(err)}
  finally{b.disabled=false;b.textContent="Показати"}
});
$("showMore").addEventListener("click",async()=>{showLimit+=6;await signShows();render()});
$("photoClose").addEventListener("click",()=>$("photoView").close());
$("careForm").addEventListener("submit",e=>{e.preventDefault();const text=$("careText").value.trim();if(!text)return;
  const id="cc"+Date.now().toString(36);putPriv(id,{kind:"care_custom",text,min:+$("careMin").value});$("careText").value="";flash(e.submitter,"✓ Додано")});
$("add").addEventListener("submit",e=>{e.preventDefault();const text=$("newText").value.trim();if(!text)return;
  const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  putPriv(id,{kind:"task",text,w:+$("newW").value,created:Date.now(),done:false,doneDay:null});$("newText").value="";$("newW").value="1";flash(e.submitter,"✓ Додано")});
$("boxForm").addEventListener("submit",async e=>{e.preventDefault();const text=$("boxText").value.trim();const cid=myProfile().couple_id;if(!text||!cid)return;
  $("boxText").value="";flash(e.submitter,"✓ Додано");
  const {error}=await sb.from("box").insert({couple_id:cid,author:uid,text,kind:$("boxKind").value});if(error)return syncErr(error);await loadBox();render()});

/* ---------- emoji ---------- */
const EMOJI="😊 🥰 😘 🤗 🥺 😢 😭 😔 😩 😴 🤒 🤕 😤 😡 😰 😱 🙃 😌 😅 🤍 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 ❤️‍🩹 💕 🫂 🙏 👍 👌 💪 ✨ 🌙 ⭐ ☀️ 🌧️ ⛈️ 🔥 🌸 🌿 🍂 🎃 🍵 ☕ 🍫 🍕 🥪 💧 💊 🛌 🏠 🔨 💼 📞 💬 🎧 📚 🎮 🐈 🐕".split(" ");
let emojiFor=null;
const pop=el("div","emojipop");pop.hidden=true;pop.setAttribute("role","dialog");pop.setAttribute("aria-label","Смайлики");
EMOJI.forEach(e=>pop.append(btn("emo",e,()=>{if(!emojiFor)return;const i=emojiFor,a=i.selectionStart??i.value.length,b=i.selectionEnd??a;i.setRangeText(e,a,b,"end");i.focus();i.dispatchEvent(new Event("input"))},e)));
document.body.append(pop);
function openEmoji(input,anchor){
  if(!pop.hidden&&emojiFor===input){pop.hidden=true;return}
  emojiFor=input;pop.hidden=false;
  const r=anchor.getBoundingClientRect(),w=Math.min(300,window.innerWidth-24);
  pop.style.width=w+"px";pop.style.left=Math.max(12,Math.min(r.right-w,window.innerWidth-w-12))+"px";
  const below=r.bottom+8+pop.offsetHeight<window.innerHeight;
  pop.style.top=(window.scrollY+(below?r.bottom+8:r.top-8-pop.offsetHeight))+"px";
}
document.addEventListener("click",e=>{if(!pop.hidden&&!pop.contains(e.target)&&!e.target.classList.contains("emojibtn"))pop.hidden=true});
["why","newText","boxText","careText","needText","showCaption","planText","statusText","nsText"].forEach(id=>{const i=$(id);if(!i)return;const b=btn("emojibtn","☺",ev=>{ev.preventDefault();openEmoji(i,ev.currentTarget)},"Додати смайлик");i.after(b)});

/* ---------- boot ---------- */
setInterval(render,5*60*1000);
document.addEventListener("visibilitychange",()=>{
  const pid=partnerId();
  if(document.hidden){if(tab==="us"&&pid)ls("seenLog",Object.assign({},ls("seenLog")||{},{[pid]:Date.now()}));return}
  if(uid&&!$("app").hidden){if(tab==="us")markSeen();loadAll()}
});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
setAuthMode(false);
let started=false;
sb.auth.onAuthStateChange((ev,session)=>{
  if(session&&!started){started=true;setTimeout(()=>start(session),0)}
  if(!session){started=false;uid=null;if(channel){sb.removeChannel(channel);channel=null}show("auth")}
});
