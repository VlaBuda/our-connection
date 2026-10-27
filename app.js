/* Наш звʼязок — app logic. Data lives in Supabase; see supabase/schema.sql. */
const CFG = window.APP_CONFIG;
// Opened from a "reset password" email: remember it before supabase-js reads and clears the link.
let recovering = /type=recovery/.test(location.hash + location.search);
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ---------- vocab ---------- */
const ESS=[{k:"water",t:"Вода",did:"+ Відмітити",gap:2.5},{k:"food",t:"Їжа",did:"+ Відмітити",gap:4.5}];
// What kind of eating it was. shift = how much sooner the next reminder comes than after a full meal (hours).
// Stored as days.data.foodK {ts: kind}; no entry = full meal (older records).
const FOOD_K={snack:{t:"Снек",i:"🍎",shift:3},bite:{t:"Перекус",i:"🥪",shift:1.5},meal:{t:"Їжа",i:"🍲",shift:0}};
const foodKind=(d,ts)=>((d&&d.foodK)||{})[ts]||"meal";
function essLast(e,d){const a=(d&&d[e.k])||[];if(!a.length)return 0;
  return e.k==="food"?Math.max(...a.map(ts=>ts-FOOD_K[foodKind(d,ts)].shift*3600e3)):Math.max(...a)}
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
  {k:"together",t:"Хочу побути разом",o:"Хочеться побути разом",tip:"Дзвінок, голосове або спільна справа на відстані."},
  {k:"listen",t:"Вислухай, без порад",o:"Хочеться виговоритись, поради зараз не потрібні",tip:"Слухай і кажи «розумію», «це справді важко». Рішення не шукай, якщо не просить."},
  {k:"distract",t:"Відволічи мене",o:"Хочеться відволіктись",tip:"Розкажи щось зі свого дня, скинь мем чи смішне фото. Про важке зараз не треба."},
  {k:"reassure",t:"Скажи, що все буде добре",o:"Потрібно почути, що все буде добре",tip:"Прості слова: «ми впораємось», «я з тобою». Можна повторити, навіть якщо вже казав(ла)."},
  {k:"help",t:"Мені зараз дуже важко",o:"Зараз дуже важко",tip:"Напиши або подзвони, щойно зможеш. Не треба знаходити ідеальних слів: «я тут, я з тобою» вже багато.",warn:1}];
const SLEEP=[{k:"good",t:"Добре"},{k:"little",t:"Мало"},{k:"much",t:"Забагато"},{k:"bad",t:"Погано"},{k:"cantfall",t:"Важко заснути"},{k:"woke",t:"Часті пробудження"},
  {k:"early",t:"Прокидання зарано"},{k:"insomnia",t:"Майже не спав(ла)",warn:1},{k:"unrefreshed",t:"Сон не відновив сили"},{k:"nap",t:"Спав(ла) вдень"},
  {k:"alarms",t:"Тривоги, вибухи вночі",warn:1},{k:"dreams",t:"Були сни",warn:1},{k:"nightmares",t:"Кошмари",warn:1}];
// Rough hours of sleep, one choice (days.data.sleepH).
const SLEEP_H=[{k:"lt4",t:"менше 4 год"},{k:"4_6",t:"4–6 год"},{k:"6_8",t:"6–8 год"},{k:"8_10",t:"8–10 год"},{k:"gt10",t:"понад 10 год"}];
const SLEEP_BAD=["little","bad","woke","cantfall","early","insomnia","unrefreshed","alarms","nightmares"];
const HEAD=[{k:"ok",t:"Ок"},{k:"pain",t:"Болить"},{k:"prodrome",t:"Наближається мігрень",warn:1},{k:"migraine",t:"Мігрень",warn:1},{k:"postdrome",t:"Після мігрені",warn:1}];
const SIGNS=[{k:"aura",t:"Аура, мерехтіння"},{k:"light",t:"Ріже світло"},{k:"sound",t:"Ріжуть звуки"},{k:"smell",t:"Запахи"},{k:"nausea",t:"Нудить"},{k:"neck",t:"Тягне шию"},{k:"fog",t:"Туман у голові"},{k:"yawn",t:"Позіхання, сонливість"},{k:"crave",t:"Тягне на солодке"},
  {k:"pee",t:"Часто хочеться в туалет"},{k:"thirst",t:"Спрага"},{k:"food",t:"Тягне на певну їжу"},{k:"moody",t:"Перепади настрою, дратівливість"},
  {k:"words",t:"Важко підбирати слова"},{k:"tingle",t:"Поколювання, оніміння"},{k:"skin",t:"Шкіра болить від дотику"},{k:"eyes",t:"Біль чи тиск в очах"},
  {k:"nose",t:"Закладає ніс, сльозяться очі"},{k:"chills",t:"Мерзнуть руки, морозить"},{k:"stomach",t:"Живіт, здуття"},{k:"dizzy",t:"Запаморочення"},
  {k:"heavy",t:"Важкість, ломота в тілі"},{k:"tired",t:"Сильна втома"}];
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
const TITLES={us:"Ми сьогодні",state:"Як ти зараз?",care:"Турбота",cycle:"Цикл",time:"Наш час",box:"Для нас",stats:"Статистика"};
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
  // Складніші, змішані відчуття.
  E("red",1,"mixed","Змішані почуття","Всередині кілька відчуттів одночасно, і вони тягнуть у різні боки. Це нормально, не треба обирати одне «правильне»."),
  E("red",1,"pressured","Тиск очікувань","Здається, що від тебе чекають більше, ніж можеш дати, навіть якщо ніхто прямо не каже."),
  E("red",2,"dread","Тривожне очікування","Чекаєш звістки чи події, і ніщо інше не тримається в голові. Час тягнеться."),
  E("red",2,"worry_close","Страх за близьку людину","Думки весь час повертаються до того, чи все з нею гаразд. Тривога не за себе, а за когось."),
  E("red",2,"self_anger","Злість на себе","Злишся не на когось, а на себе: «знову не встиг(ла)», «що зі мною не так». Ця злість часто про втому, а не про тебе."),
  E("red",2,"inner_conflict","Внутрішній конфлікт","Одна частина хоче одного, інша протилежного. Важко вирішити, бо обидві мають рацію."),
  E("red",2,"cornered","Загнаність у кут","Здається, що виходу немає і всі варіанти погані. Хочеться або тікати, або відбиватися."),
  E("red",3,"humiliated","Приниженість","Ніби тебе зробили меншим(ою) на очах в інших. Дуже пече всередині."),
  E("red",3,"helpless_rage","Безсила злість","Злість на те, що не можеш змінити: війну, обставини, чужі рішення. Нікуди її подіти."),
  E("red",3,"hypervigilant","Постійно насторожі","Тіло весь час чекає небезпеки: здригаєшся від звуків, не можеш розслабитись навіть у безпеці."),

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
  E("yellow",1,"nervous_excite","Хвилююче очікування","І радісно, і трохи страшно водночас: як перед зустріччю чи чимось новим."),
  E("yellow",2,"brave","Сміливість","Страшно, але робиш. Відчуття, що можеш більше, ніж думалось."),
  E("yellow",2,"relief_joy","Радість-полегшення","Людина нарешті вийшла на звʼязок, щось нарешті вирішилось. Тіло видихає, і стає легко."),
  E("yellow",3,"wired","Перезбудження","Енергії забагато, думки скачуть, не заснути. Буває після стресу чи на розгоні, і за ним часто приходить спад."),

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
  E("blue",1,"unseen","Непоміченість","Здається, що твоїх зусиль чи стану ніхто не бачить. Хочеться, щоб помітили без пояснень."),
  E("blue",1,"rest_guilt","Провина за відпочинок","Лежиш, а всередині голос «треба щось робити». Відпочинок не відчувається заслуженим, хоч він потрібен."),
  E("blue",2,"alienated","Відчуження","Навіть серед людей ніби за склом, наче ти не з ними."),
  E("blue",2,"unwanted","Непотрібність","Здається, що без тебе обійдуться, що ти тягар. Це відчуття часто бреше, особливо коли сил мало."),
  E("blue",2,"masking_tired","Втома від маскування","Довго вдаєш, що все ок, підлаштовуєшся під інших. Тепер сил бути «нормальним(ою)» немає."),
  E("blue",2,"compassion_tired","Втома від співчуття","Так довго тримаєш інших, що на співчуття вже не лишилось сил. Це не черствість, це виснаження."),
  E("blue",2,"state_shame","Сором за свій стан","Соромно, що не справляєшся, що «знову» погано. Хоча стан не вибирають."),
  E("blue",2,"missing_self","Туга за собою колишнім(ьою)","Сумуєш за тим, ким був(ла), коли було більше сил, бажань, легкості. Це теж горе."),
  E("blue",3,"rejected","Біль відкидання","Відмова, ігнор чи критика ранять дуже сильно, сильніше, ніж «мало б». У нейровідмінних людей це часта і справжня реакція."),
  E("blue",3,"abandoned","Покинутість","Відчуття, що з усім доводиться бути наодинці. Може зʼявлятись, навіть коли насправді не покинули, просто людини немає поруч."),
  E("blue",3,"unreal","Нереальність","Ніби світ або ти сам(а) несправжні, як уві сні. Так психіка іноді відгороджується від перевантаження. Минає."),
  E("blue",3,"crushed","Розчавленість","Ніби на тебе впало все одразу і не встати. Сил немає навіть на сльози."),

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
  E("green",1,"bittersweet","Світлий сум","Сумно, але тепло: за чимось хорошим, що було або чого чекаєш."),
  E("green",1,"self_kind","Мʼякість до себе","Вдається не сварити себе, а поставитись як до близької людини."),
  E("green",2,"acceptance","Прийняття","Не все так, як хотілось, але можна з цим бути і не боротися."),
  E("green",2,"letting_go","Відпускання","Перестаєш тримати те, що не залежить від тебе. Стає трохи легше дихати."),
  E("green",2,"supported","Підтримка","Відчуваєш, що є на кого спертися, навіть якщо людина далеко."),
];
// "Нервова система": long states stay until removed; episodes are moments with a recovery tail ("післясмак").
const NS_LONG=[
  {k:"burnout",t:"Емоційне вигорання",tip:"Ресурсу мало вже давно. Менше прохань і рішень, більше простої турботи без очікувань."},
  {k:"aut_burnout",t:"Аутистичне вигорання",tip:"Сил на звуки, людей, розмови й маскування дуже мало. Може гірше говорити й переносити шум. Тиша не про тебе: допомагай знімати навантаження."},
  {k:"depressive",t:"Депресивний період",tip:"Навіть прості речі даються важко. Не «збирайся», а маленька турбота: нагадати поїсти, побути поряд. Якщо довго, мʼяко про фахівця."},
  {k:"anxious",t:"Тривожний період",tip:"Тривога тримається фоном. Допомагає передбачуваність: кажи, коли зможеш вийти на звʼязок."},
  {k:"overload",t:"Хронічне перевантаження",tip:"Подразників і справ давно забагато. Менше нового й несподіваного, більше тиші."},
  {k:"hypervigil",t:"Постійна напруга, насторожі",tip:"Тіло давно в режимі небезпеки. Допомагає передбачуваність: попереджай про зміни, без різких новин і несподіванок."},
  {k:"numb",t:"Емоційне оніміння",tip:"Почуття ніби вимкнені. Це захист психіки від перевантаження, а не байдужість до тебе."},
  {k:"exec",t:"Важко почати будь-які справи",tip:"Це не лінь: мозок не може запустити дію. Допомагає побути на звʼязку, поки робиться, або назвати один крихітний крок."},
  {k:"insomnia",t:"Тривалі проблеми зі сном",tip:"Давно не висипається, тому все дається важче. Бережи сон: без пізніх дзвінків без домовленості."},
  {k:"irritable",t:"Дратівливий період",tip:"Дратує майже все, і це від виснаження. Не сприймай на свій рахунок, менше нових прохань."},
  {k:"load",t:"Все тримається на мені",tip:"Давно все тримається на цій людині: побут, робота, рішення. Візьми на себе хоч одне рішення чи справу, якщо можеш."},
  {k:"uncertainty",t:"Тривала невизначеність",tip:"Невідомість виснажує. Допомагає щось стабільне: дзвінок у той самий час, звичні маленькі ритуали."},
  {k:"grief",t:"Період горя чи втрати",tip:"Горе не має строку. Не треба втішати чи підганяти, достатньо бути поряд і дозволяти сумувати."},
  {k:"pain",t:"Тривалий біль або хвороба",tip:"Тіло давно болить, і це забирає сили на все інше. Менше очікувань, більше практичної допомоги."},
];
// How long a state has lasted, in plain words.
function durText(since){const d=Math.max(0,Math.floor((Date.now()-since)/864e5));
  if(d<1)return "від сьогодні";if(d<14)return d+" дн.";if(d<60)return Math.round(d/7)+" тиж.";const m=Math.round(d/30.4);return m<24?m+" міс.":Math.floor(m/12)+" р."}
const dlong=ts=>new Date(ts).toLocaleDateString("uk-UA",{day:"numeric",month:"short",year:new Date(ts).getFullYear()===new Date().getFullYear()?undefined:"numeric"});
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
const nsOf=id=>{const n=(profiles.get(id)||{}).ns;return {long:arr(n&&n.long),episodes:arr(n&&n.episodes),defaults:(n&&n.defaults)||{}}};
// Recovery length: set on the episode itself, else the person's usual for this kind, else the built-in.
// -1 = "поки не скажу" (until "Вже легше", at most 14 days).
const RECOVERY=[[3,"3 години"],[6,"6 годин"],[12,"12 годин"],[24,"1 день"],[48,"2 дні"],[72,"3 дні"],[168,"тиждень"],[-1,"поки не стане легше"]];
const recLabel=h=>(RECOVERY.find(r=>r[0]===h)||[0,h+" год"])[1];
function epHours(e,id){const info=find(NS_EP,e.k)||{h:24};const d=nsOf(id).defaults[e.k];return e.h!=null?e.h:d!=null?d:info.h}
function epUntil(e,id){const h=epHours(e,id);return h<0?null:new Date(e.ts+h*3600e3)}
function untilText(e,id){const u=epUntil(e,id);if(!u)return "поки не стане легше";const td=new Date(),tm=new Date();tm.setDate(tm.getDate()+1);
  return "до ~"+(u.toDateString()===td.toDateString()?hm(u):u.toDateString()===tm.toDateString()?"завтра "+hm(u):dshort(u)+" "+hm(u))}
const epInfo=k=>find(NS_EP,k);
// Episodes still "in effect": happening (< 1 h) or recovering (< its h hours), not marked as better.
function activeEpisodes(id){
  return nsOf(id).episodes.filter(e=>{if(e.end||!epInfo(e.k))return false;const u=epUntil(e,id);return u?Date.now()<u:Date.now()-e.ts<14*864e5}).sort((a,b)=>b.ts-a.ts);
}
const epPhase=e=>Date.now()-e.ts<3600e3?"now":"after";
const longLabel=l=>l.k==="own"?l.text:(find(NS_LONG,l.k)||{}).t;
const EMO_MAX=5,EMO_LVL={1:"Трохи",2:"Помітно",3:"Сильно"};
const emoOf=k=>EMO.find(e=>e.k===k);
const PLAN_KIND={game:{i:"🎮",t:"Гра"},watch:{i:"🎬",t:"Перегляд"},call:{i:"📞",t:"Розмова"},other:{i:"✨",t:"Інше"}};
// State history within a day: what each field reads like, for the log on the cards and in pushes.
const FNAME={energy:"сили",need:"треба",sleep:"сон",head:"голова",mood:"настрій",emo:"відчуття",why:"причина"};
const POS_MOOD=["calm","happy","joy","cope"],NEG_MOOD=["tired","anx","scared","sad","hurt","cry","irr","empty"];
const HEAD_SEV={ok:0,pain:1,postdrome:1,prodrome:2,migraine:3};

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
function show(id){["loading","auth","pair","app","newpass"].forEach(x=>$(x).hidden=x!==id)}
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
let plans=[],planEdit=null,seenBase={},watches=[];
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
  if(k==="sleep")return [...labels(SLEEP,d.sleep),...labels(SLEEP_H,d.sleepH)].join(", ").toLowerCase();
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
  return d.energy===1||d.need==="help"||d.head==="migraine"||d.head==="prodrome"||(d.pain||0)>=6||has(d.sleep,"nightmares")||d.unsure
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
  saved();pingUpdate();
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
let privLoaded=false;
async function loadPriv(){const {data}=await sb.from("private_items").select("id,data");priv=new Map((data||[]).map(r=>[r.id,r.data]));privLoaded=true}
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
async function loadWatches(){const {data,error}=await sb.from("watches").select("*");watches=error?[]:(data||[])}
// "Скажи, коли зайде / оновить": I tell the server I'm here; it alerts whoever was waiting, once.
const watchedFor=k=>watches.some(w=>w.target===uid&&(w.kind===k||(k==="update"&&w.kind==="open")));
async function pingSeen(){
  const last=ls("seenPing")||0;
  if(Date.now()-last>5*60000){ls("seenPing",Date.now());sb.from("profiles").update({last_seen_at:new Date().toISOString()}).eq("id",uid).then(()=>{})}
  if(watchedFor("open")){watches=watches.filter(w=>!(w.target===uid&&w.kind==="open"));sb.functions.invoke("notify",{body:{type:"seen",kind:"open"}}).catch(()=>{})}
}
const pingUpdate=debounce(()=>{if(!watchedFor("update"))return;watches=watches.filter(w=>w.target!==uid);sb.functions.invoke("notify",{body:{type:"seen",kind:"update"}}).catch(()=>{})},5000);
async function toggleWatch(target,kind){
  const w=watches.find(x=>x.watcher===uid&&x.target===target&&x.kind===kind);
  if(w){watches=watches.filter(x=>x!==w);render();await sb.from("watches").delete().eq("id",w.id);return}
  const row={couple_id:myProfile().couple_id,watcher:uid,target,kind};
  watches.push(row);render();
  const {error}=await sb.from("watches").insert(row);if(error){syncErr(error);await loadWatches();render()}else saved();
}
async function loadPlans(){const {data,error}=await sb.from("plans").select("*").order("created_at",{ascending:false}).limit(200);plans=error?[]:(data||[])}
async function loadAll(){await Promise.all([loadProfiles(),loadDays(),loadPriv(),loadBox(),loadInbox(),loadShows(),loadPlans(),loadWatches()]);render();if(cycCfg().enabled)syncCycle()}

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
    .on("postgres_changes",{event:"*",schema:"public",table:"watches"},re(loadWatches))
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
function essDue(e,d){const a=(d&&d[e.k])||[];const h=new Date().getHours();if(h<8||h>=23)return false;if(!a.length)return true;return (Date.now()-essLast(e,d))/36e5>=e.gap}
function essNote(e,d){const a=(d&&d[e.k])||[];if(!a.length)return "сьогодні ще не було";const last=Math.max(...a);
  if(e.k!=="food")return "сьогодні "+a.length+" · востаннє о "+hm(last);
  const cnt={};a.forEach(ts=>{const k=foodKind(d,ts);cnt[k]=(cnt[k]||0)+1});
  return "сьогодні "+Object.keys(FOOD_K).filter(k=>cnt[k]).map(k=>FOOD_K[k].t.toLowerCase()+" "+cnt[k]).join(", ")+" · востаннє о "+hm(last)+", "+FOOD_K[foodKind(d,last)].t.toLowerCase()}
let lastAdd={};
function addEss(k,kind){
  const ts=Date.now(),cur=myToday();lastAdd[k+(kind||"")]=ts;
  const patch={[k]:[...(cur[k]||[]),ts].sort((x,y)=>x-y)};
  if(k==="food")patch.foodK=Object.assign({},cur.foodK||{},{[ts]:kind||"meal"});
  saveMe(patch);setTimeout(render,1600);answerPending(k,3*3600e3);
}
function setEssTime(k,i,val){
  const cur=myToday(),a=[...(cur[k]||[])];if(!val)return;
  const [H,M]=val.split(":").map(Number);const d=new Date();d.setHours(H,M,0,0);
  const old=a[i],patch={};a[i]=d.getTime();a.sort((x,y)=>x-y);patch[k]=a;
  if(k==="food"){const fk=Object.assign({},cur.foodK||{});const kind=fk[old];delete fk[old];if(kind)fk[d.getTime()]=kind;patch.foodK=fk}
  editTime=null;saveMe(patch);
}
function setFoodKind(ts,kind){const cur=myToday();saveMe({foodK:Object.assign({},cur.foodK||{},{[ts]:kind})})}
function delEss(k,i){const cur=myToday(),a=[...(cur[k]||[])];const [old]=a.splice(i,1);const patch={[k]:a};
  if(k==="food"&&cur.foodK){const fk=Object.assign({},cur.foodK);delete fk[old];patch.foodK=fk}
  editTime=null;saveMe(patch)}
function essEl(e,d,full){
  const li=el("li","item ess");const tx=el("div","txt");const inner=el("div",null,e.k==="water"?"Попити води":"Поїсти");inner.append(el("small",null,essNote(e,d)));tx.append(inner);
  const top=el("div","esstop");top.append(tx);
  const addBtn=(kind,label)=>{const just=Date.now()-(lastAdd[e.k+(kind||"")]||0)<1500;return btn("plus"+(just?" flash":"")+(kind?" sm":""),just?"✓ Записано":label,()=>addEss(e.k,kind))};
  if(e.k==="food"){const g=el("div","foodbtns");Object.entries(FOOD_K).forEach(([k,f])=>g.append(addBtn(k,f.i+" "+f.t)));top.append(g)}
  else top.append(addBtn(null,e.did));
  li.append(top);
  const a=(d[e.k]||[]);
  if(full&&a.length){
    const times=el("div","times");
    a.forEach((ts,i)=>{
      const key=e.k+i;
      if(editTime===key){
        const inp=el("input","timein");inp.type="time";inp.value=hm(ts);inp.setAttribute("aria-label","Новий час");
        inp.addEventListener("change",()=>setEssTime(e.k,i,inp.value));
        inp.addEventListener("keydown",ev=>{if(ev.key==="Escape"){editTime=null;render()}});
        const wrap=el("span","timechip editing");wrap.append(inp);
        if(e.k==="food"){const sel=el("select","kindsel");sel.setAttribute("aria-label","Що це було");
          Object.entries(FOOD_K).forEach(([k,f])=>{const o=el("option",null,f.i+" "+f.t);o.value=k;if(foodKind(d,ts)===k)o.selected=true;sel.append(o)});
          sel.addEventListener("change",()=>{editTime=null;setFoodKind(ts,sel.value)});wrap.append(sel)}
        wrap.append(btn("del","×",()=>delEss(e.k,i),"Видалити цю відмітку"));times.append(wrap);
        setTimeout(()=>inp.focus(),0);
      }else{
        const lbl=(e.k==="food"?FOOD_K[foodKind(d,ts)].i+" ":"")+hm(ts);
        times.append(btn("timechip",lbl,()=>{editTime=key;render()},"Змінити "+hm(ts)));
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
  const sl=fieldText("sleep",d);
  if(sl){const t=[];
    if(has(d.sleep,"nightmares"))t.push("Не розпитуй про кошмари, просто будь поруч у повідомленнях.");
    else if(has(d.sleep,"dreams"))t.push("Сни виснажують навіть без кошмарів. Будь мʼякшим сьогодні.");
    if(has(d.sleep,"alarms"))t.push("Ніч з тривогами: тіло не відпочило, навіть якщо спало. Мʼякше й повільніше сьогодні.");
    if(has(d.sleep,"insomnia")||d.sleepH==="lt4")t.push("Майже без сну все дається важче й емоції гостріші. Нічого важкого сьогодні, якщо можна.");
    if(has(d.sleep,"much")||d.sleepH==="gt10")t.push("Багато сну теж буває ознакою виснаження чи спаду. Без жартів про «соню».");
    rows.push({f:"sleep",label:"Сон: "+sl,alert:["nightmares","dreams","alarms","insomnia"].some(x=>has(d.sleep,x)),tips:t})}
  const h=find(HEAD,d.head);
  if(h){const t=[];
    if(d.head==="prodrome")t.push("Можна нагадати про воду, їжу й ліки, краще текстом.");
    if(d.head==="migraine")t.push("Краще текст, ніж дзвінок, і без поспіху з відповіддю.");
    if(d.head==="postdrome")t.push("Мігрень минула, але тягнуть втома й туман у голові. Без поспіху і важких розмов.");
    if(d.head==="pain"&&(d.pain||0)>=6)t.push("Коротко й тихо, без дзвінків, якщо не просить.");
    rows.push({f:"head",label:"Голова: "+h.t.toLowerCase()+((d.head==="pain"||d.head==="migraine")&&d.pain?" "+d.pain+"/10":""),alert:!!h.warn||(d.pain||0)>=6,tips:t});
    const sg=labels(SIGNS,d.signs);if(sg.length&&(d.head==="prodrome"||d.head==="migraine"||d.head==="postdrome"))rows.push({f:"head",label:sg.join(", ").toLowerCase(),alert:true,tips:[]});
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
    if(em.some(e=>["shutdown","overstimulated","overwhelmed","masking_tired"].includes(e.k)))t.push("Перевантаження: менше слів і звуків, текст замість дзвінка, не чекай відповіді.");
    if(em.some(e=>e.k==="longing"||e.k==="lonely"))t.push("Бракує тебе. Голосове, фото чи «я тут» зараз важать більше, ніж здається.");
    if(em.some(e=>e.k==="worry_close"||e.k==="dread"))t.push("Хвилюється, чекає звістки. Навіть коротке «я на звʼязку, все ок» знімає багато напруги.");
    if(em.some(e=>["rejected","unwanted","abandoned","unseen"].includes(e.k)))t.push("Зараз важливо почути прямо, без натяків: «ти мені потрібна(ий), я бачу, як ти стараєшся».");
    if(em.some(e=>e.k==="rest_guilt"||e.k==="state_shame"||e.k==="self_anger"))t.push("Сварить себе. Скажи, що відпочивати й не справлятися можна, і що ти не чекаєш більшого.");
    if(em.some(e=>e.k==="hypervigilant"||e.k==="unreal"))t.push("Нервова система на межі. Спокійно, передбачувано, без різких новин і несподіванок.");
    if(em.some(e=>["depressed","empty","hopeless","despair","burnout","crushed"].includes(e.k)))t.push("Якщо так уже кілька днів, мʼяко запропонуй поговорити з фахівцем. Без тиску.");
    rows.push({f:"emo",label:"Відчуття: "+fieldText("emo",d),alert:qs.some(q=>q==="red"||q==="blue")||!!d.unsure,tips:t,emo:em});
  }
  const cr=cycleRow(d.cycle);if(cr)rows.push(cr);
  ESS.forEach(e=>{const a=d[e.k]||[];const last=a.length?Math.max(...a):0;
    rows.push({label:e.t+": "+(a.length?a.length+", востаннє о "+hm(last)+(e.k==="food"&&foodKind(d,last)!=="meal"?" ("+FOOD_K[foodKind(d,last)].t.toLowerCase()+")":""):"ще не було"),alert:essDue(e,d),tips:[],ess:e.k})});
  return rows;
}
function nsBlock(id,isMe){
  const out=[],ns=nsOf(id),eps=activeEpisodes(id);
  if(!ns.long.length&&!eps.length)return out;
  const box=el("div","nsblock");
  ns.long.forEach(l=>{const info=find(NS_LONG,l.k);const r=el("div","nsrow");
    r.append(el("span","fact alert",longLabel(l)+(l.since?" · з "+dlong(l.since)+" ("+durText(l.since)+")":"")));
    if(!isMe&&info)r.append(el("p","tip",info.tip));box.append(r)});
  eps.forEach(e=>{const info=epInfo(e.k),ph=epPhase(e);const r=el("div","nsrow");
    r.append(el("span","fact alert ep","⚡ "+info.t+" о "+(new Date(e.ts).toDateString()===new Date().toDateString()?"":dshort(e.ts)+" ")+hm(e.ts)+(ph==="after"?" · відновлення "+untilText(e,id):"")));
    if(e.note)r.append(el("p","why","«"+e.note+"»"));
    if(!isMe)r.append(el("p","tip",ph==="now"?info.now:info.after));
    if(!isMe){const help=topOf(retrosOf(id,180).filter(x=>x.e.k===e.k),"help",4);
      if(help.length)r.append(el("p","tip","Зазвичай допомагає: "+help.map(x=>x.t.toLowerCase()).join(", ")+"."))}
    box.append(r)});
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
  const ls_=(profiles.get(id)||{}).last_seen_at;
  if(!isMe&&ls_)c.append(el("small","lastseen","в застосунку: "+(new Date(ls_).toDateString()===new Date().toDateString()?"сьогодні о "+hm(ls_):dshort(ls_)+" о "+hm(ls_))));
  const st=statusInfo(profiles.get(id));
  if(st){const p=profiles.get(id);const sl=el("div","status");sl.append(el("span",null,st.i+" "+st.t));
    if(p.status_at)sl.append(el("small",null," з "+(new Date(p.status_at).toDateString()===new Date().toDateString()?hm(p.status_at):dshort(p.status_at)+" "+hm(p.status_at))));
    c.append(sl);if(!isMe&&st.tip)c.append(el("p","tip",st.tip))}
  c.append(...nsBlock(id,isMe));
  if(!d||!isToday){c.append(el("p","empty",isMe?"Відміть свій стан у вкладці «Стан», і він зʼявиться тут для вас обох.":"Сьогодні стан ще не відмічено."));if(!isMe)c.append(nudgeRow(id),watchRow(id));return c}
  const n=d.need==="own"&&d.needText?{t:d.needText,o:d.needText}:find(NEED,d.need);
  if(n){const nb=el("div","need"+(n.warn?" urgent":"")+(fresh.has("need")?" fresh":""),isMe?n.t:n.o);c.append(nb);if(!isMe&&n.tip)c.append(el("p","tip",n.tip))}
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
  if(!isMe)c.append(nudgeRow(id,d),watchRow(id));
  return c;
}
function watchRow(id){
  const r=el("div","watchrow");r.append(el("span","hint","Сповістити мене:"));
  [["open","коли зайде"],["update","коли оновить стан"]].forEach(([k,t])=>{
    const on=watches.some(w=>w.watcher===uid&&w.target===id&&w.kind===k);
    const b=btn("nbtn"+(on?" sent":""),(on?"🔔 Чекаю, ":"🔕 ")+t,()=>toggleWatch(id,k));b.setAttribute("aria-pressed",String(on));
    if(on)b.title="Прийде одне сповіщення. Натисни ще раз, щоб скасувати.";r.append(b)});
  return r;
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
  const cyOn=cycCfg().enabled;$("cycTab").hidden=!cyOn;
  if(tab==="cycle"){if(cyOn)renderCycle();else if(privLoaded){setTab("us");return}}
  renderSums(d);
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
  statusRow();emoMap(d);nsRow();retroRow();
  needRow(d);helpRow(d);multiRow($("sleepChips"),SLEEP,"sleep",["good"]);chipRow($("sleepHChips"),SLEEP_H,"sleepH");chipRow($("headChips"),HEAD,"head");multiRow($("moodChips"),MOOD,"mood");
  $("feelHint").textContent=FEEL_HINT[Math.floor(Date.now()/864e5)%FEEL_HINT.length];
  const showPain=d.head==="pain"||d.head==="migraine",showSigns=d.head==="prodrome"||d.head==="migraine"||d.head==="postdrome";
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
  if(error)return syncErr(error);saved();pingUpdate();
  if(status)sb.functions.invoke("notify",{body:{type:"status"}}).catch(()=>{});
}
async function setNs(next){
  const p=myProfile();p.ns=next;render();
  const {error}=await sb.from("profiles").update({ns:next}).eq("id",uid);
  if(error)return syncErr(error);saved();pingUpdate();
}
function toggleLong(k,text,since){
  const ns=nsOf(uid),on=ns.long.some(l=>l.k===k&&(k!=="own"||l.text===text));
  const long=on?ns.long.filter(l=>!(l.k===k&&(k!=="own"||l.text===text))):[...ns.long,{k,text:k==="own"?text:undefined,since:since||Date.now()}];
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
  // Active long states with "since" date: often you notice a state only months after it began.
  const ll=$("nsLongList");ll.replaceChildren();
  ns.long.forEach((l,i)=>{const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,longLabel(l));
    inner.append(el("small",null,l.since?"триває "+durText(l.since)+". Якщо почалось раніше, зміни дату":"коли почалось?"));tx.append(inner);li.append(tx);
    const inp=el("input");inp.type="date";inp.max=today();if(l.since)inp.value=dkey(new Date(l.since));inp.setAttribute("aria-label","З якого часу: "+longLabel(l));
    inp.addEventListener("change",()=>{if(!inp.value)return;const t=dparse(inp.value).getTime();const cur=nsOf(uid);
      setNs({...cur,long:cur.long.map((x,j)=>j===i?Object.assign({},x,{since:Math.min(t,Date.now())}):x)})});
    li.append(inp,btn("del","×",()=>toggleLong(l.k,l.text),"Зняти «"+longLabel(l)+"»"));ll.append(li)});
  const eb=$("nsEp");eb.replaceChildren();
  NS_EP.forEach(o=>eb.append(btn("chip","⚡ "+o.t,()=>addEpisode(o.k))));
  const al=$("nsActive");al.replaceChildren();
  activeEpisodes(uid).forEach(e=>{const info=epInfo(e.k);const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,info.t);
    inner.append(el("small",null,(epPhase(e)==="now"?"зараз":"відновлення")+" · "+untilText(e,uid)));
    tx.append(inner);li.append(tx);
    // How long recovery takes depends on the day: pick it per episode, optionally keep as usual.
    const set=el("div","epset");
    const sel=el("select");sel.setAttribute("aria-label","Скільки триває відновлення");
    const cur=epHours(e,uid);
    RECOVERY.forEach(([h,t])=>{const o=el("option",null,"Відновлення: "+t);o.value=String(h);if(h===cur)o.selected=true;sel.append(o)});
    if(!RECOVERY.some(r=>r[0]===cur)){const o=el("option",null,"Відновлення: "+cur+" год");o.value=String(cur);o.selected=true;sel.prepend(o)}
    sel.addEventListener("change",()=>patchEpisode(e.id,{h:+sel.value}));
    set.append(sel);
    const usual=nsOf(uid).defaults[e.k];
    if(cur!==(usual!=null?usual:info.h))set.append(btn("link","Зробити звичним для «"+info.t.toLowerCase()+"»",()=>{const ns=nsOf(uid);setNs({...ns,defaults:{...ns.defaults,[e.k]:cur}});$("sync").textContent="Наступного разу відновлення після «"+info.t.toLowerCase()+"» буде "+recLabel(cur)}));
    const note=el("input");note.type="text";note.maxLength=200;note.value=e.note||"";note.placeholder="Що вплинуло, скільки тривало (бачите обоє)";note.setAttribute("aria-label","Що вплинуло");
    note.addEventListener("change",()=>patchEpisode(e.id,{note:note.value.trim()||undefined}));
    set.append(note);li.append(set);
    if(epEdit===e.id){const inp=el("input","timein");inp.type="time";inp.value=hm(e.ts);inp.setAttribute("aria-label","Коли почалось");
      inp.addEventListener("change",()=>{if(!inp.value)return;const [H,M]=inp.value.split(":").map(Number);const dt=new Date(e.ts);dt.setHours(H,M,0,0);if(dt>Date.now())dt.setDate(dt.getDate()-1);epEdit=null;patchEpisode(e.id,{ts:dt.getTime()})});
      li.append(inp);setTimeout(()=>inp.focus(),0)}
    else li.append(btn("timechip",hm(e.ts),()=>{epEdit=e.id;render()},"Змінити час"));
    li.append(btn("ghost sm","Вже легше",()=>patchEpisode(e.id,{end:Date.now()})));
    li.append(btn("del","×",()=>patchEpisode(e.id,{del:1}),"Прибрати, якщо випадково"));
    al.append(li)});
}
/* ---------- самоперевірка тривалих станів ---------- */
// Not a diagnosis: plain statements for the last few weeks, each tied to the long states it hints at.
// Result suggests states to mark (with "since" from the duration answer). Kept privately in private_items "ns_check".
const CHECK=[
  {k:"rest",t:"Відпочинок майже не відновлює: після сну чи вихідних сил не більше",s:["burnout","aut_burnout"]},
  {k:"cynic",t:"Робота чи обовʼязки, які раніше давались, тепер викликають відразу, цинізм або «мені все одно»",s:["burnout"]},
  {k:"senses",t:"Звуки, світло, дотики, люди переносяться гірше, ніж раніше",s:["aut_burnout","overload"]},
  {k:"mask",t:"Важче говорити, підбирати слова, «тримати обличчя» з людьми",s:["aut_burnout"]},
  {k:"skills",t:"Губляться навички, які раніше були на автоматі: готувати, планувати, дбати про себе",s:["aut_burnout","exec"]},
  {k:"low",t:"Більшість днів пригнічений настрій, важкість або порожнеча",s:["depressive"]},
  {k:"joy",t:"Мало що тішить, навіть те, що раніше подобалось",s:["depressive","numb"]},
  {k:"worry",t:"Тривога чи хвилювання майже весь час фоном, і їх важко зупинити",s:["anxious"]},
  {k:"tense",t:"Тіло весь час напружене, здригаєшся від звуків, не розслабляєшся навіть у безпеці",s:["hypervigil","anxious"]},
  {k:"much",t:"Справ, людей і подразників давно більше, ніж можеш перетравити",s:["overload","load"]},
  {k:"numb",t:"Почуття ніби приглушені або вимкнені",s:["numb","depressive"]},
  {k:"start",t:"Важко почати навіть прості справи, хоч дуже хочеш",s:["exec","depressive"]},
  {k:"sleep",t:"Сон давно поганий: важко заснути, прокидаєшся, не висипаєшся",s:["insomnia","anxious"]},
  {k:"irr",t:"Дратує майже все і всі, терпіння дуже мало",s:["irritable","burnout"]},
  {k:"loss",t:"Сумуєш за кимось чи чимось втраченим, і це не відпускає",s:["grief"]},
  {k:"unknown",t:"Невідомість щодо майбутнього чи близьких тисне щодня",s:["uncertainty","anxious"]},
  {k:"alone",t:"Все тримається на тобі: побут, робота, рішення, і нікому передати",s:["load"]},
  {k:"pain",t:"Тривалий біль чи хвороба забирають сили",s:["pain"]},
  {k:"safe",t:"Бувають думки, що краще б тебе не було, або що не хочеться жити",s:[],safety:1},
];
const CHECK_ANS=[[0,"Ні"],[1,"Іноді"],[2,"Часто"]];
const CHECK_SINCE=[[3,"кілька тижнів"],[6,"1–2 місяці"],[17,"3–6 місяців"],[30,"понад пів року"]]; // weeks back
let chk=null;
function openCheck(){chk={ans:{},since:null,done:false};renderCheck();$("nsCheckDlg").showModal();$("nsCheckDlg").scrollTop=0}
function checkResult(){
  const sc={};
  CHECK.forEach(q=>q.s.forEach(k=>{sc[k]=sc[k]||{sum:0,max:0,often:0};sc[k].sum+=chk.ans[q.k]||0;sc[k].max+=2;if(chk.ans[q.k]===2)sc[k].often++}));
  return Object.entries(sc).filter(([,v])=>v.often&&v.sum/v.max>=.5).sort((a,b)=>b[1].sum/b[1].max-a[1].sum/a[1].max).map(([k])=>k);
}
function renderCheck(){
  const b=$("nsCheckBody");b.replaceChildren();
  $("nsCheckNext").textContent=chk.done?"Пройти ще раз":"Подивитись результат";
  if(!chk.done){
    b.append(el("p","hint","Як було останні кілька тижнів? Це не діагноз, а підказка, як назвати те, що з тобою відбувається. Результат бачиш тільки ти."));
    const last=priv.get("ns_check");
    if(last&&last.ts)b.append(el("p","hint","Попередня перевірка: "+dlong(last.ts)+(arr(last.res).length?", тоді вийшло: "+arr(last.res).map(k=>(find(NS_LONG,k)||{t:k}).t.toLowerCase()).join(", "):"")+"."));
    CHECK.forEach(q=>{const r=el("div","chk");r.append(el("p",null,q.t));const ch=el("div","chips");
      CHECK_ANS.forEach(([v,t])=>{const on=chk.ans[q.k]===v;const c=btn("chip"+(q.safety&&v?" warn":""),t,()=>{chk.ans[q.k]=on?undefined:v;renderCheck()});c.setAttribute("aria-pressed",String(on));ch.append(c)});
      r.append(ch);b.append(r)});
    const r=el("div","chk");r.append(el("p",null,"Як давно приблизно так?"));const ch=el("div","chips");
    CHECK_SINCE.forEach(([w,t])=>{const on=chk.since===w;const c=btn("chip",t,()=>{chk.since=on?null:w;renderCheck()});c.setAttribute("aria-pressed",String(on));ch.append(c)});
    r.append(ch);b.append(r);
    return;
  }
  const res=checkResult(),ns=nsOf(uid);
  if(chk.ans.safe){const p=el("p","crisis");
    p.append(document.createTextNode("Дякую, що чесно відповів(ла). Такі думки бувають від дуже великого виснаження, і з ними не треба бути наодинці. Поговорити можна з Lifeline Ukraine: "));
    const a=el("a",null,"7333");a.href="tel:7333";p.append(a,document.createTextNode(", цілодобово й безкоштовно. А ще з психологом, лікарем чи близькою людиною. Якщо є пряма небезпека: "));
    const e=el("a",null,"112");e.href="tel:112";p.append(e,document.createTextNode("."));b.append(p)}
  if(!res.length)b.append(el("p",null,"Жоден тривалий стан явно не вимальовується. Якщо все одно щось не так, можна додати своїми словами через «+ Своє»."));
  else b.append(el("p",null,"Схоже, що зараз може бути:"));
  const weeks=chk.since,since=weeks?Date.now()-weeks*7*864e5:null;
  res.forEach(k=>{const info=find(NS_LONG,k);const on=ns.long.some(l=>l.k===k);
    const c=el("div","chkres");c.append(el("h3",null,info.t));
    c.append(btn(on?"ghost sm":"btn sm",on?"✓ Вже відмічено":"Відмітити"+(since?" з "+dlong(since):""),()=>{if(!nsOf(uid).long.some(l=>l.k===k))toggleLong(k,null,since);setTimeout(renderCheck,50)}));
    b.append(c)});
  if(res.some(k=>k==="depressive"||k==="anxious"||k==="numb"||k==="insomnia")||(chk.since&&chk.since>=6&&res.length))
    b.append(el("p","hint","Якщо так триває довше кількох тижнів, варто поговорити з психологом, психотерапевтом чи сімейним лікарем. Це не слабкість: з депресією, тривогою і безсонням реально працюють, і стає легше."));
  b.append(el("p","hint","Дату початку завжди можна змінити в блоці «Нервова система»."));
}
function finishCheck(){
  if(chk.done){chk={ans:{},since:null,done:false};renderCheck();$("nsCheckDlg").scrollTop=0;return}
  chk.done=true;putPriv("ns_check",{kind:"ns_check",ts:Date.now(),ans:chk.ans,since:chk.since,res:checkResult()});renderCheck();$("nsCheckDlg").scrollTop=0;
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
  // In "look" mode a tap only shows what the word means; choosing is a separate button under it.
  const word=e=>{const b=btn("emo-w t"+e.i+" q-"+e.q+(emoLook&&emoInfo===e.k?" peek":""),e.t,()=>{if(emoLook){emoInfo=emoInfo===e.k?null:e.k;render()}else pick(e)});
    b.setAttribute("aria-pressed",String(sel.includes(e.k)));return b};
  $("emoLook").setAttribute("aria-pressed",String(emoLook));
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
  else if(e){inf.append(el("b","q-"+e.q,e.t),document.createTextNode(" — "+e.d));
    if(emoLook){const on=sel.includes(e.k);const r=el("span","emoact");r.append(btn("btn sm",on?"Прибрати з мого стану":"Так, це про мене",()=>pick(e)));inf.append(r)}}
  else inf.textContent=emoLook?"Торкайся слів, щоб прочитати, що вони означають. Нічого не обереться, доки не натиснеш «Так, це про мене».":
    emoQ||qtxt?"Торкнись слова, яке хоч трохи схоже. Тут зʼявиться, що воно означає.":"Обери колір: скільки зараз енергії і наскільки приємно. Потім слово.";
}
let emoQ=null;
let emoOpen=false,emoInfo=null,emoLook=false;
// A small rotating reminder that any feeling is allowed. Changes once a day, not on every render.
const FEEL_HINT=["Будь-які почуття важливі й нормальні. Вони не «правильні» чи «неправильні», а підказують, що тобі зараз треба.",
  "Не обовʼязково розуміти, звідки почуття. Достатньо його помітити.",
  "Сум, злість чи порожнеча не роблять тебе гіршою людиною. Це сигнали, а не вади.",
  "Можна відчувати кілька протилежних речей одночасно. Так буває.",
  "Почуття минають, навіть ті, що зараз здаються назавжди.",
  "Назвати почуття вже трохи його полегшує."];
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
// "Що може трохи допомогти": small things to try on my own, picked by what I marked.
// Opens by itself when the state looks hard; otherwise it's one tap away.
const HELP=[
  {k:"breathe",t:"Видих довший за вдих: вдих на 4, видих на 6. Кнопка нижче подихає разом з тобою.",tags:["anx","all"]},
  {k:"ground",t:"Заземлитись: назви 5 речей, які бачиш, 4 які чуєш, 3 яких можеш торкнутись.",tags:["anx","unreal"]},
  {k:"quiet",t:"Менше подразників: навушники чи беруші, приглушене світло, телефон екраном донизу.",tags:["sensory"]},
  {k:"weight",t:"Загорнутися в плед, покласти щось важке на коліна чи груди. Тиск заспокоює нервову систему.",tags:["sensory","anx","low"]},
  {k:"stim",t:"Стимінг: гойдатися, мʼяти щось у руках, повторювати рух. Усе, що заспокоює саме тебе, можна.",tags:["sensory","anx"]},
  {k:"lie",t:"Полежати 10 хвилин без телефону. Не треба нічого вирішувати.",tags:["low","sensory"]},
  {k:"water",t:"Кілька ковтків води і щось маленьке поїсти. Голодне тіло підсилює будь-які почуття.",tags:["low","all"]},
  {k:"warm",t:"Щось тепле: чай, душ, грілка. Тепло тілу допомагає і голові.",tags:["low","sad"]},
  {k:"hand",t:"Покласти руку на груди і сказати собі: «мені зараз важко, і це нормально». Як сказала б близькій людині.",tags:["sad","shame"]},
  {k:"cut",t:"Зменшити план на сьогодні до одного пункту. Решту можна перенести без провини.",tags:["over","low"]},
  {k:"write",t:"Написати комусь одне слово чи стікер. Не обовʼязково пояснювати.",tags:["sad","lonely"]},
  {k:"cry",t:"Якщо хочеться плакати, можна. Сльози знімають напругу, це не слабкість.",tags:["sad"]},
  {k:"move",t:"Струсити руки, потупотіти ногами, пройтися кімнатою. Злість і тривога живуть у тілі, їм треба вихід.",tags:["anger","anx"]},
];
const BLUE_HARD=["hopeless","despair","crushed","depressed"];
function helpLevel(d){
  const em=arr(d.emo),eps=activeEpisodes(uid);
  if(d.need==="help"||em.some(k=>BLUE_HARD.includes(k))||eps.some(e=>epPhase(e)==="now"))return 2;
  if(hardNow(d)||eps.length||nsOf(uid).long.length&&d.energy&&d.energy<=2)return 1;
  return 0;
}
function helpTags(d){
  const em=arr(d.emo).map(emoOf).filter(Boolean),m=arr(d.mood),t=new Set(["all"]);
  const any=(...ks)=>ks.some(k=>em.some(e=>e.k===k)||m.includes(k));
  if(any("anx","scared","anxious","panic","panic_attack","dread","worry_close","tense","hypervigilant","stressed"))t.add("anx");
  if(any("overstimulated","overwhelmed","meltdown","shutdown","masking_tired")||activeEpisodes(uid).some(e=>["sensory","meltdown","shutdown"].includes(e.k)))t.add("sensory");
  if(any("sad","hurt","cry","grief","longing","lonely","empty","hopeless","despair","depressed","rejected","abandoned","unwanted"))t.add("sad");
  if(any("lonely","longing","abandoned","alienated"))t.add("lonely");
  if(any("ashamed","guilty","state_shame","rest_guilt","self_anger"))t.add("shame");
  if(any("irr","angry","rage","frustrated","helpless_rage","cornered"))t.add("anger");
  if(any("unreal","numb","detached")||d.unsure)t.add("unreal");
  if(any("overwhelmed","stressed","pressured"))t.add("over");
  if(d.energy===1||any("tired","drained","burnout","apathy","crushed"))t.add("low");
  return t;
}
let helpOpen=false,breathT=null,breathT0=0;
function stopBreath(){clearInterval(breathT);breathT=null;breathT0=0;render()}
function breathStep(){const s=(Date.now()-breathT0)/1000;if(s>=60)return stopBreath();
  const ph=s%10,l=document.querySelector(".breathl"),b=document.querySelector(".breath");if(!l||!b)return;
  b.classList.toggle("in",ph<4);l.textContent=ph<4?"Вдих… "+Math.ceil(4-ph):"Видих… "+Math.ceil(10-ph)}
function helpRow(d){
  const box=$("helpBox"),lvl=helpLevel(d);box.replaceChildren();
  const open=lvl>0||helpOpen;
  if(!open){box.append(btn("link","🌿 Що може трохи допомогти зараз?",()=>{helpOpen=true;render()}));return}
  const c=el("div","helpcard"+(lvl===2?" hard":""));
  c.append(el("p","sub small",lvl?"Що може трохи допомогти зараз":"Що може допомогти"));
  if(lvl)c.append(el("p","hint","Не все одразу і не обовʼязково. Обери одне, що зараз здається посильним."));
  const tags=helpTags(d);
  const score=h=>h.tags.filter(x=>tags.has(x)).length*2+(h.tags.includes("all")?1:0);
  const picks=HELP.map((h,i)=>({h,s:score(h),i})).filter(x=>x.s>0||!lvl).sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,4).map(x=>x.h);
  const ul=el("ul","helplist");picks.forEach(h=>ul.append(el("li",null,h.t)));c.append(ul);
  // Breathing together: the circle grows for 4 s on the inhale and shrinks for 6 s on the exhale, for about a minute.
  // State lives outside the render, so realtime re-renders don't stop it.
  const br=el("div","breath"+(breathT0?" on":""));const circle=el("div","breathc");circle.append(el("span","breathl",""));
  const go=btn("ghost sm breathbtn",breathT0?"Зупинити":"🌬 Подихати хвилину",()=>{if(breathT0)stopBreath();else{breathT0=Date.now();breathT=setInterval(breathStep,250);render()}});
  br.append(circle);c.append(go,br);
  if(lvl===2){const p=el("p","crisis");
    p.append(document.createTextNode("Якщо стає зовсім нестерпно або зʼявляються думки, що краще б тебе не було, ти не мусиш бути з цим сам(а). Lifeline Ukraine: "));
    const a=el("a",null,"7333");a.href="tel:7333";p.append(a,document.createTextNode(", цілодобово й безкоштовно, можна просто поговорити. Якщо є пряма небезпека: "));
    const e=el("a",null,"112");e.href="tel:112";p.append(e,document.createTextNode("."));
    c.append(p);
    if(d.need!=="help")c.append(btn("chip warn","Дати знати: «Мені зараз дуже важко»",()=>saveMe({need:"help",needText:null})));
  }
  if(!lvl)c.append(btn("link","Сховати",()=>{helpOpen=false;render()}));
  box.append(c);
}
function renderCare(d){
  const lvl=d.energy||0,care=careToday(),mig=d.head==="migraine";
  const open=tasks().filter(t=>!t.done).sort((a,b)=>a.w-b.w||a.created-b.created);
  const careList=careFor(lvl),careLeft=careList.filter(c=>!care[c.k]);
  const now=$("now");now.replaceChildren();const ul=el("ul","list");
  ESS.filter(e=>essDue(e,d)).forEach(e=>ul.append(essEl(e,d,false)));
  let msg="";
  if(d.head==="prodrome")msg="Схоже, наближається мігрень. Зараз саме час: вода, щось поїсти, менше світла й екранів, ліки за планом лікаря, якщо він є. Важкі задачі сховані.";
  else if(d.head==="postdrome")msg="Після мігрені ще тягнуть втома й туман: це нормальне «мігренозне похмілля». Вода, їжа, повільно. Важкі задачі почекають.";
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
  renderMeds();
  careList.forEach(c=>cu.append(checkEl("care_"+c.k,c.t,!!care[c.k],v=>setCare(c.k,v),null,c.own?()=>delPriv(c.k):null)));

  const maxW=mig&&!showAll?0:(d.head==="prodrome"||d.head==="postdrome")&&!showAll?1:(!lvl||showAll)?3:lvl<=2?1:3;
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
    ["З них нормальної їжі",(()=>{const v=list.map(x=>(x.h.food||[]).filter(ts=>foodKind(x.h,ts)==="meal").length).filter((n,i)=>(list[i].h.food||[]).length);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):"—"})()],
  ];
  renderPatterns();
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

/* ---------- ретроспектива епізодів ---------- */
// Gentle look back at an acute episode: what came before, first signals, what helped.
// Shared retros live on the episode (profiles.ns, partner can read); private ones in private_items "retro_<episode id>".
const RETRO={
  tr:{t:"Що було перед цим",hint:"За добу-дві до епізоду. Можна кілька. Це не про провину, а про те, щоб помітити наперед.",groups:[
    ["Тіло",[["sleep","Мало або поганий сон"],["hunger","Голод, пропущена їжа"],["water","Мало води"],["pain","Біль, мігрень"],["cycle","Цикл, ПМС"],["ill","Хвороба"],["caffeine","Кофеїн, алкоголь"],["meds","Пропущені ліки"]]],
    ["Відчуття",[["noise","Шум"],["light","Яскраве світло"],["crowd","Натовп, багато людей"],["touch","Дотики, незручний одяг"],["smell","Запахи"]]],
    ["Люди",[["conflict","Конфлікт, сварка"],["critique","Критика"],["talk","Забагато спілкування"],["masking","Довге маскування"],["rejected","Відмова, ігнор"],["lonely","Самотність"],["worry","Хвилювання за близьких"]]],
    ["Навантаження",[["deadline","Дедлайн, тиск"],["toomuch","Забагато справ"],["change","Зміна планів"],["unknown","Невизначеність"],["decisions","Багато рішень"],["norest","Без відпочинку"],["road","Дорога, переїзд"]]],
    ["Світ",[["news","Новини"],["alarms","Обстріли, тривоги"],["nolink","Немає звʼязку з близьким"],["memory","Спогади, нагадування"]]],
  ]},
  signs:{t:"Перші сигнали",hint:"Що зʼявилось раніше, ніж накрило. По цьому наступного разу можна впізнати наперед.",groups:[
    ["",[["irritable","Дратівливість"],["fog","Туман у голові"],["tension","Напруга в тілі"],["hide","Хочеться сховатися"],["mute","Важко говорити"],["loud","Звуки стали гучнішими"],["tears","Ком у горлі, сльози"],["stuck","Не можу почати справи"],["insomnia","Безсоння"],["sweet","Тягне на солодке"],["zoneout","Відключаюсь від розмов"],["noeat","Забуваю їсти й пити"]]],
  ]},
  help:{t:"Що допомогло",hint:"Навіть трошки. Партнер бачитиме це як підказку наступного разу.",groups:[
    ["",[["quiet","Тиша"],["dark","Темрява"],["sleep","Сон"],["food","Вода, їжа"],["alone","Побути наодинці"],["partner","Голос або обійми партнера"],["msg","Повідомлення без питань"],["stim","Стимінг"],["weight","Плед, вага, тиск"],["shower","Душ"],["move","Рух, прогулянка"],["cry","Поплакати"],["familiar","Знайомий серіал чи гра"],["cancel","Скасувати плани"]]],
  ]},
};
const retroLabel=(sec,k)=>{for(const [,items] of RETRO[sec].groups){const f=items.find(x=>x[0]===k);if(f)return f[1]}return k.startsWith("own:")?k.slice(4):k};
const retroOf=(e,id)=>e.retro||(id===uid?(priv.get("retro_"+e.id)||null):null);
const ownRetro=()=>priv.get("retro_own")||{kind:"retro_own",tr:[],signs:[],help:[]};
// All retros of a person I can read (partner: shared only), newest first.
function retrosOf(id,days){
  const cut=Date.now()-(days||90)*864e5;
  return nsOf(id).episodes.filter(e=>e.ts>cut).map(e=>({e,r:retroOf(e,id)})).filter(x=>x.r).sort((a,b)=>b.e.ts-a.e.ts);
}
function topOf(list,sec,n){const c={};list.forEach(({r})=>arr(r[sec]).forEach(k=>c[k]=(c[k]||0)+1));
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n||6).map(([k,v])=>({k,v,t:retroLabel(sec,k)}))}
// What the app's own marks show for the day before the episode. Suggestions only, never auto-checked.
function autoFactors(e,id){
  const out=new Set(),notes=[],dm=dayMap(id);
  const d0=new Date(e.ts),d1=new Date(e.ts-864e5);
  [dkey(d0),dkey(d1)].forEach(k=>{
    const h=(id===uid&&k===today())?myToday():dm.get(k);if(!h)return;
    if(SLEEP_BAD.some(x=>has(h.sleep,x))||h.sleepH==="lt4")out.add("sleep");
    if(has(h.sleep,"alarms"))out.add("alarms");
    if(h.head==="migraine"||h.head==="prodrome"||(h.pain||0)>=5)out.add("pain");
    if(arr(h.emo).some(x=>x==="overstimulated"))out.add("noise");
    if(arr(h.emo).some(x=>x==="lonely"||x==="longing"))out.add("lonely");
    whysOf(h).forEach(w=>{if(!w.ts||w.ts<e.ts)notes.push(w.text)});
  });
  const same=id===uid&&dkey(d0)===today()?myToday():dm.get(dkey(d0))||{};
  const before=a=>arr(a).filter(ts=>ts<e.ts&&ts>e.ts-12*3600e3);
  if(new Date(e.ts).getHours()>=12){
    if(before(same.water).length<2)out.add("water");
    if(!before(same.food).some(ts=>foodKind(same,ts)!=="snack"))out.add("hunger");
  }
  return {keys:[...out],notes:notes.slice(-4)};
}
let retroDraft=null;
function openRetro(e){
  const r=retroOf(e,uid);
  retroDraft={ep:e.id,tr:[...arr(r&&r.tr)],signs:[...arr(r&&r.signs)],help:[...arr(r&&r.help)],next:(r&&r.next)||"",power:(r&&r.power)||0,
    private:r?(!e.retro):false};
  renderRetro();$("retroDlg").showModal();$("retroDlg").scrollTop=0;
}
function renderRetro(){
  const d=retroDraft,e=nsOf(uid).episodes.find(x=>x.id===d.ep);if(!e)return;
  const info=epInfo(e.k),body=$("retroBody");body.replaceChildren();
  body.append(el("p","hint",info.t+" · "+dshort(e.ts)+" о "+hm(e.ts)+(e.note?" · «"+e.note+"»":"")));
  const auto=autoFactors(e,uid);
  const own=ownRetro();
  ["tr","signs","help"].forEach(sec=>{
    const box=el("div","retrosec");box.append(el("h3",null,RETRO[sec].t),el("p","hint",RETRO[sec].hint));
    if(sec==="tr"&&(auto.keys.length||auto.notes.length)){
      const a=el("p","retroauto");
      a.textContent="За відмітками застосунку"+(auto.keys.length?": "+auto.keys.map(k=>retroLabel("tr",k).toLowerCase()).join(", ")+" (обведені пунктиром)":"")+
        (auto.notes.length?". Ти писав(ла): "+auto.notes.map(n=>"«"+n+"»").join(", "):"")+".";
      box.append(a);
    }
    RETRO[sec].groups.forEach(([g,items])=>{
      if(g)box.append(el("p","sub small",g));
      const row=el("div","chips");
      items.forEach(([k,t])=>row.append(retroChip(sec,k,t,sec==="tr"&&auto.keys.includes(k))));
      if(!g||g===RETRO[sec].groups[RETRO[sec].groups.length-1][0]){
        arr(own[sec]).forEach(t=>row.append(retroChip(sec,"own:"+t,t,false)));
        d[sec].filter(k=>k.startsWith("own:")&&!arr(own[sec]).includes(k.slice(4))).forEach(k=>row.append(retroChip(sec,k,k.slice(4),false)));
      }
      box.append(row);
    });
    const f=el("form","inline");const inp=el("input");inp.type="text";inp.maxLength=60;inp.placeholder="+ своє";inp.setAttribute("aria-label","Своє: "+RETRO[sec].t);
    f.append(inp,el("button","btn sm","Додати"));
    f.addEventListener("submit",ev=>{ev.preventDefault();const t=inp.value.trim();if(!t)return;
      const k="own:"+t;if(!d[sec].includes(k))d[sec].push(k);
      const o=ownRetro();if(!arr(o[sec]).includes(t))putPriv("retro_own",Object.assign({},o,{[sec]:[...arr(o[sec]),t].slice(-20)}));
      renderRetro()});
    box.append(f);body.append(box);
  });
  const pw=el("div","retrosec");pw.append(el("h3",null,"Наскільки сильно було"));
  const pr=el("div","chips");["ледь","помітно","сильно","дуже","нестерпно"].forEach((t,i)=>{const b=btn("chip",(i+1)+" · "+t,()=>{d.power=d.power===i+1?0:i+1;renderRetro()});b.setAttribute("aria-pressed",String(d.power===i+1));pr.append(b)});
  pw.append(pr);body.append(pw);
  const nx=el("div","retrosec");nx.append(el("h3",null,"Що спробувати наступного разу"),el("p","hint","Маленьке і реальне. Наприклад: «коли почне дратувати шум, одразу навушники» або «попросити написати мені без питань»."));
  const ta=el("textarea");ta.maxLength=500;ta.rows=3;ta.value=d.next;ta.setAttribute("aria-label","Що спробувати наступного разу");ta.addEventListener("input",()=>d.next=ta.value);
  nx.append(ta);body.append(nx);
  const pv=el("label","retropriv");const cb=el("input");cb.type="checkbox";cb.checked=!d.private;cb.addEventListener("change",()=>d.private=!cb.checked);
  pv.append(cb,el("span",null,"Бачить і "+(partnerId()?nm(partnerId()):"партнер")+": так зможе помітити сигнали раніше й знатиме, що допомагає"));
  body.append(pv);
}
function retroChip(sec,k,t,suggested){
  const on=retroDraft[sec].includes(k);
  const b=btn("chip"+(suggested?" suggested":""),t,()=>{const a=retroDraft[sec];retroDraft[sec]=on?a.filter(x=>x!==k):[...a,k];renderRetro()});
  b.setAttribute("aria-pressed",String(on));return b;
}
async function saveRetro(){
  const d=retroDraft,ns=nsOf(uid);
  const r={tr:d.tr,signs:d.signs,help:d.help,next:d.next.trim()||undefined,power:d.power||undefined,at:Date.now()};
  if(d.private){
    await putPriv("retro_"+d.ep,Object.assign({kind:"retro",ep:d.ep},r));
    setNs({...ns,episodes:ns.episodes.map(e=>e.id===d.ep?Object.assign({},e,{retro:undefined,retroDone:true}):e)});
  }else{
    if(priv.has("retro_"+d.ep))delPriv("retro_"+d.ep);
    setNs({...ns,episodes:ns.episodes.map(e=>e.id===d.ep?Object.assign({},e,{retro:r,retroDone:true}):e)});
  }
  $("retroDlg").close();retroDraft=null;$("sync").textContent="Розбір збережено. Дякую, що подбав(ла) про себе й так";
}
// Past episodes waiting for a look back: over (recovered or "Вже легше"), within a week, not done or skipped.
function retroDue(){
  const act=new Set(activeEpisodes(uid).map(e=>e.id));
  return nsOf(uid).episodes.filter(e=>!act.has(e.id)&&!e.retroDone&&!e.retroSkip&&Date.now()-e.ts<7*864e5).sort((a,b)=>b.ts-a.ts);
}
function retroRow(){
  const box=$("retroDue");box.replaceChildren();
  const due=retroDue();
  if(due.length){const e=due[0],info=epInfo(e.k);
    const c=el("div","retrocard");
    c.append(el("p",null,"Коли буде сили: розібрати "+info.t.toLowerCase()+" "+dshort(e.ts)+"? Кілька дотиків, щоб помітити, що до нього привело і що допомогло."));
    const r=el("div","row");r.append(btn("btn sm","Розібрати",()=>openRetro(e)),btn("ghost sm","Не зараз",()=>{ls("retroLater",Date.now());render()}),
      btn("link","Не хочу розбирати цей",()=>patchEpisode(e.id,{retroSkip:true})));
    c.append(r);
    if(Date.now()-(ls("retroLater")||0)>6*3600e3)box.append(c);
  }
  const hist=$("epHist"),list=nsOf(uid).episodes.filter(e=>epInfo(e.k)).sort((a,b)=>b.ts-a.ts).slice(0,30);
  hist.replaceChildren();$("epHistCount").textContent=list.length?"("+list.length+")":"";
  list.forEach(e=>{const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,epInfo(e.k).t);
    const r=retroOf(e,uid);
    inner.append(el("small",null,dshort(e.ts)+" о "+hm(e.ts)+(r?" · розібрано"+(e.retro?"":" (лише для тебе)"):"")));tx.append(inner);li.append(tx);
    li.append(btn("ghost sm",r?"Переглянути":"Розібрати",()=>openRetro(e)));hist.append(li)});
  if(!list.length)hist.append(el("p","empty","Тут збиратимуться епізоди, щоб їх можна було розібрати пізніше."));
}
// Patterns for the stats tab.
function renderPatterns(){
  const box=$("patterns");box.replaceChildren();
  const rs=retrosOf(statWho,90),eps=nsOf(statWho).episodes.filter(e=>Date.now()-e.ts<90*864e5&&epInfo(e.k));
  box.append(el("h2",null,"Патерни епізодів"));
  if(!eps.length){box.append(el("p","empty","За 90 днів епізодів не відмічено."));return}
  const byK={};eps.forEach(e=>byK[e.k]=(byK[e.k]||0)+1);
  box.append(el("p","hint","За 90 днів: "+Object.entries(byK).map(([k,n])=>epInfo(k).t.toLowerCase()+" "+n).join(", ")+". Розібрано: "+rs.length+"."));
  if(!rs.length){box.append(el("p","empty",statWho===uid?"Після кількох розборів тут зʼявиться, що найчастіше передує епізодам і що допомагає.":"Розборів, якими поділились, поки немає."));return}
  [["tr","Найчастіше перед епізодом"],["signs","Ранні сигнали"],["help","Що допомагає"]].forEach(([sec,t])=>{
    const top=topOf(rs,sec,6);if(!top.length)return;
    const g=el("div","pattern");g.append(el("p","sub",t));
    const row=el("div","facts");top.forEach(x=>row.append(el("span","fact"+(sec==="tr"?" alert":""),x.t+(x.v>1?" · "+x.v:""))));g.append(row);box.append(g);
  });
  const nexts=rs.filter(x=>x.r.next).slice(0,3);
  if(nexts.length){const g=el("div","pattern");g.append(el("p","sub","Наступного разу спробувати"));nexts.forEach(x=>g.append(el("p","why","«"+x.r.next+"» · "+dshort(x.e.ts))));box.append(g)}
}

/* ---------- цикл ---------- */
// Built on her own marks, not on "textbook" phases. All raw data is private (private_items "cycle", "cyc_<date>");
// only what she chooses to share is copied into days.data.cycle for the partner.
const FLOW=[{k:"none",t:"Немає"},{k:"spot",t:"Мазня"},{k:"light",t:"Слабкі"},{k:"medium",t:"Середні"},{k:"heavy",t:"Рясні"}];
const CPAIN=[{k:0,t:"Немає"},{k:1,t:"Легкий"},{k:2,t:"Сильний"},{k:3,t:"Дуже сильний"}];
const LIBIDO=[{k:"low",t:"Нижче звичного"},{k:"normal",t:"Як завжди"},{k:"high",t:"Вище"},{k:"sky",t:"До небес 🔥"}];
// ph = when it typically shows up (for grouping only; any symptom can be marked any day). Keys are stored, never rename.
const CPH=[["period","Під час місячних"],["after","Після місячних"],["mid","Середина циклу, овуляція"],["pre","Перед місячними, ПМС"],["any","Будь-коли"]];
const CSYM=[
  {k:"cramps",t:"Спазми внизу живота",ph:"period"},{k:"back",t:"Біль у попереку",ph:"period"},{k:"gut",t:"Розлад травлення",ph:"period"},
  {k:"heavylegs",t:"Важкість у ногах",ph:"period"},{k:"cozy",t:"Хочеться тепла й тиші",ph:"period"},{k:"dizzy",t:"Запаморочення",ph:"period"},
  {k:"energy_up",t:"Більше енергії",ph:"after"},{k:"clear",t:"Ясна голова",ph:"after"},{k:"social",t:"Хочеться спілкуватися",ph:"after"},
  {k:"plans",t:"Хочеться нового, планів",ph:"after"},{k:"skin_ok",t:"Шкіра краща",ph:"after"},
  {k:"ovpain",t:"Біль збоку внизу живота",ph:"mid"},{k:"discharge",t:"Прозорі тягучі виділення",ph:"mid"},{k:"attractive",t:"Відчуваю себе привабливою",ph:"mid"},
  {k:"smells",t:"Гостріше відчуваю запахи",ph:"mid"},
  {k:"sweet",t:"Тяга до солодкого",ph:"pre"},{k:"hungry",t:"Постійно голодна",ph:"pre"},{k:"bloat",t:"Здуття",ph:"pre"},{k:"swelling",t:"Набряки",ph:"pre"},
  {k:"breasts",t:"Чутливі груди",ph:"pre"},{k:"skin",t:"Висипання",ph:"pre"},{k:"headache",t:"Головний біль",ph:"pre"},{k:"migraine",t:"Мігрень",ph:"pre"},
  {k:"lowmood",t:"Спад настрою",ph:"pre"},{k:"tearful",t:"Плаксивість",ph:"pre"},{k:"irritable",t:"Дратівливість",ph:"pre"},{k:"anxious",t:"Тривожність",ph:"pre"},
  {k:"personal",t:"Все сприймаю близько до серця",ph:"pre"},{k:"sensory",t:"Звуки й дотики дратують сильніше",ph:"pre"},{k:"fog",t:"Туман у голові",ph:"pre"},
  {k:"insomnia",t:"Погано спиться",ph:"pre"},{k:"aches",t:"Ломота в тілі",ph:"pre"},
  {k:"fatigue",t:"Втома",ph:"any"},{k:"breath",t:"Задишка",ph:"any"},{k:"cold",t:"Холодні руки й ноги",ph:"any"},{k:"ice",t:"Тяга до льоду чи крейди",ph:"any"}];
// Rough phase for today, only to put the likely group first. Ovulation ~14 days before the next period.
function cycPhase(now){if(!now)return null;if(now.period)return "period";const ov=now.len-14;
  return Math.abs(now.day-ov)<=2?"mid":now.day<ov?"after":"pre"}
const CSHARE=[["day","День циклу і місячні"],["forecast","Сповіщення, що місячні скоро"],["flow","Рясність і згустки"],["pain","Біль"],["libido","Лібідо"],["sym","Самопочуття: втома, запаморочення та інше"]];
const BLEED=["light","medium","heavy"];
const cycCfg=()=>Object.assign({kind:"cycle",enabled:false,starts:[],share:{day:true,forecast:true,flow:true,pain:true,libido:true,sym:true}},priv.get("cycle")||{});
const cycDay=date=>priv.get("cyc_"+date)||{};
const dparse=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const ddiff=(a,b)=>Math.round((dparse(a)-dparse(b))/864e5);
const dadd=(s,n)=>{const d=dparse(s);d.setDate(d.getDate()+n);return dkey(d)};
// Period starts: the ones she entered by hand (e.g. from Flo) plus days with real bleeding after 10+ dry days.
function cycStarts(){
  const marks=[...priv.entries()].filter(([id,d])=>d.kind==="cyc"&&BLEED.includes(d.flow)).map(([id])=>id.slice(4)).sort();
  const auto=marks.filter((d,i)=>!marks.slice(0,i).some(p=>ddiff(d,p)>0&&ddiff(d,p)<=10));
  const all=[...new Set([...arr(cycCfg().starts),...auto])].sort();
  return all.filter((d,i)=>!all.slice(0,i).some(p=>ddiff(d,p)<=10));
}
function cycStats(){
  const st=cycStarts(),gaps=[];
  for(let i=1;i<st.length;i++){const g=ddiff(st[i],st[i-1]);if(g>=15&&g<=60)gaps.push(g)}
  const last6=gaps.slice(-6);
  const len=last6.length?Math.round(last6.reduce((a,b)=>a+b,0)/last6.length):28;
  const plen=[];st.slice(-6).forEach(s=>{let n=0;while(n<12&&(BLEED.includes(cycDay(dadd(s,n)).flow)||cycDay(dadd(s,n)).flow==="spot"))n++;if(n)plen.push(n)});
  const periodLen=plen.length?Math.round(plen.reduce((a,b)=>a+b,0)/plen.length):5;
  return {starts:st,len,periodLen,known:last6.length};
}
function cycNow(date){
  const s=cycStats(),d=date||today(),last=s.starts.filter(x=>x<=d).pop();if(!last)return null;
  const day=ddiff(d,last)+1,next=dadd(last,s.len),toNext=ddiff(next,d);
  const mark=cycDay(d).flow;
  const period=BLEED.includes(mark)||mark==="spot"||(!mark&&day<=s.periodLen&&d===today());
  return {...s,last,day,next,toNext,period};
}
// What usually happens around this cycle day, from her past cycles (needs at least two cycles).
function cycPatterns(day){
  const st=cycStarts();if(st.length<2)return [];
  const cnt={},seen=new Set();
  [...priv.entries()].filter(([,d])=>d.kind==="cyc").forEach(([id,d])=>{
    const date=id.slice(4),last=st.filter(x=>x<=date).pop();if(!last||last===st[st.length-1]&&date>=last)return;
    const cd=ddiff(date,last)+1;if(Math.abs(cd-day)>1)return;seen.add(last);
    const add=k=>{cnt[k]=cnt[k]||new Set();cnt[k].add(last)};
    if(d.flow==="heavy")add("рясно");if(d.clots)add("згустки");if((d.pain||0)>=2)add("сильний біль");
    if(d.libido==="high"||d.libido==="sky")add("лібідо вгору");if(d.libido==="low")add("лібідо нижче");
    arr(d.sym).forEach(k=>add((find(CSYM,k)||{t:k}).t.toLowerCase()));
  });
  const n=seen.size;if(n<2)return [];
  return Object.entries(cnt).map(([k,s])=>[k,s.size]).filter(([,c])=>c>=2&&c/n>=.5).sort((a,b)=>b[1]-a[1]).map(([k])=>k).slice(0,6);
}
function putCycDay(patch){const date=today();putPriv("cyc_"+date,Object.assign({kind:"cyc"},cycDay(date),patch));setTimeout(syncCycle,50)}
// Copy the shared part into today's days.data.cycle so the partner can see it.
function syncCycle(){
  const cfg=cycCfg(),cur=myToday();
  if(!cfg.enabled){if(cur.cycle)saveMe({cycle:null});return}
  const now=cycNow(),sh=cfg.share,d=cycDay(today()),p={};
  if(now&&sh.day){p.day=now.day;p.period=now.period}
  if(now&&sh.forecast&&now.toNext>=0&&now.toNext<=3&&!now.period)p.soon=now.toNext;
  if(sh.flow){if(d.flow&&d.flow!=="none")p.flow=d.flow;if(d.clots)p.clots=true}
  if(sh.pain&&d.pain)p.pain=d.pain;
  if(sh.libido&&d.libido)p.libido=d.libido;
  if(sh.sym&&arr(d.sym).length)p.sym=arr(d.sym);
  const next=Object.keys(p).length?p:null;
  if(JSON.stringify(next)!==JSON.stringify(cur.cycle||null))saveMe({cycle:next});
}
// Partner-card row for the shared cycle info.
function cycleRow(c){
  if(!c)return null;
  const bits=[];
  if(c.day)bits.push("день "+c.day+(c.period?" · місячні":""));
  if(c.soon!=null)bits.push(c.soon===0?"місячні очікуються сьогодні":"місячні ~ через "+c.soon+" дн.");
  if(c.flow)bits.push((find(FLOW,c.flow)||{}).t.toLowerCase());
  if(c.clots)bits.push("згустки");
  if(c.pain)bits.push("біль: "+(find(CPAIN,c.pain)||{}).t.toLowerCase());
  if(c.libido&&c.libido!=="normal")bits.push("лібідо: "+(find(LIBIDO,c.libido)||{}).t.toLowerCase());
  if(arr(c.sym).length)bits.push(arr(c.sym).map(k=>(find(CSYM,k)||{t:k}).t.toLowerCase()).join(", "));
  if(!bits.length)return null;
  const tips=[];
  if(c.soon!=null)tips.push("Скоро місячні. Можна підготуватися: спитати, що принести чи як підтримати, і бути мʼякшим наперед.");
  if(c.period||c.flow==="heavy"||c.clots)tips.push("Ці дні фізично важкі: крововтрата і анемія забирають сили. Тепло, вода, без очікувань активності.");
  if((c.pain||0)>=2)tips.push("Сильний біль: менше питань, більше турботи. Грілка, тиша, спитай, чи потрібні ліки.");
  if(arr(c.sym).some(k=>k==="dizzy"||k==="breath"))tips.push("Паморочиться чи бракує повітря: це може бути анемія. Нагадай присісти, попити води й поїсти.");
  if(arr(c.sym).some(k=>["lowmood","tearful","irritable","personal","anxious","sensory"].includes(k)))tips.push("Перед місячними настрій і чутливість хитаються: це гормони, а не ти і не стосунки. Більше тепла, менше важких розмов.");
  if(arr(c.sym).some(k=>k==="cramps"||k==="back"))tips.push("Спазми чи біль у попереку: грілка, тиша, спитай, чи щось принести.");
  if(c.libido==="high"||c.libido==="sky")tips.push("Хочеться близькості 🔥 Навіть на відстані: голосове, дзвінок, теплі слова.");
  return {f:"cycle",label:"🩸 "+bits.join(", "),alert:!!(c.period||c.soon!=null||(c.pain||0)>=2),tips};
}
function renderCycle(){
  const cfg=cycCfg(),box=$("cycBox");box.hidden=!cfg.enabled;if(!cfg.enabled)return;
  const now=cycNow(),d=cycDay(today());
  const head=$("cycHead");head.replaceChildren();
  if(!now)head.append(el("p",null,"Відміть сьогоднішні виділення або внеси дати минулих місячних нижче, і зʼявиться день циклу та прогноз."));
  else{
    head.append(el("p","cycday","День "+now.day+(now.period?" · місячні":"")));
    const nx=dparse(now.next).toLocaleDateString("uk-UA",{day:"numeric",month:"long"});
    head.append(el("small",null,now.toNext>0?"Наступні ~ "+nx+" (через "+now.toNext+" дн.)"+(now.known?" · твій цикл ~"+now.len+" дн.":" · поки рахую за 28 днів"):now.toNext===0?"Місячні очікуються сьогодні":"Затримка "+(-now.toNext)+" дн. відносно прогнозу"));
    const pt=cycPatterns(now.day);
    if(pt.length)head.append(el("p","cycpat","Зазвичай у ці дні в тебе: "+pt.join(", ")));
    if(now.period||d.flow==="heavy")head.append(el("p","hint","Більше води, щось з залізом поїсти, без важкого фізичного. Це не лінь, це крововтрата."));
  }
  const one=(boxId,list,field)=>{const b=$(boxId);b.replaceChildren();list.forEach(o=>{const on=d[field]===o.k;const c=btn("chip",o.t,()=>putCycDay({[field]:on?undefined:o.k}));c.setAttribute("aria-pressed",String(on));b.append(c)})};
  one("cycFlow",FLOW,"flow");
  const cl=btn("chip warn","Згустки",()=>putCycDay({clots:!d.clots}));cl.setAttribute("aria-pressed",String(!!d.clots));$("cycFlow").append(cl);
  one("cycPain",CPAIN,"pain");one("cycLibido",LIBIDO,"libido");
  const sb_=$("cycSym");sb_.replaceChildren();
  const ph=cycPhase(now),order=[...CPH].sort((a,b)=>(b[0]===ph)-(a[0]===ph));
  order.forEach(([pk,pt])=>{const g=el("div","cycgroup"+(pk===ph?" now":""));g.append(el("p","sub small",pt));const row=el("div","chips");
    CSYM.filter(o=>o.ph===pk).forEach(o=>{const on=arr(d.sym).includes(o.k);const c=btn("chip",o.t,()=>putCycDay({sym:on?arr(d.sym).filter(x=>x!==o.k):[...arr(d.sym),o.k]}));c.setAttribute("aria-pressed",String(on));row.append(c)});
    g.append(row);sb_.append(g)});
  const hist=$("cycStarts");hist.replaceChildren();
  const st=cycStarts().slice().reverse();
  st.forEach((s,i)=>{const li=el("li","item");const prev=st[i+1];
    const tx=el("div","txt");const inner=el("div",null,dparse(s).toLocaleDateString("uk-UA",{day:"numeric",month:"long",year:"numeric"}));
    if(prev)inner.append(el("small",null,"цикл "+ddiff(s,prev)+" дн."));tx.append(inner);li.append(tx);
    if(arr(cfg.starts).includes(s))li.append(btn("del","×",()=>putPriv("cycle",Object.assign(cycCfg(),{starts:arr(cfg.starts).filter(x=>x!==s)})),"Прибрати дату"));
    hist.append(li)});
  if(!st.length)hist.append(el("p","empty","Поки порожньо. З Flo: відкрий там календар і внеси сюди дати початку кількох останніх місячних."));
  $("cycCount").textContent=st.length?"("+st.length+")":"";
}
/* ---------- ліки й вітаміни ---------- */
// private_items "meds" {list:[{id,name,time}]}, ticks in d_<date>.meds {id: ts}. Reminders come from the cron tick.
const medsList=()=>arr((priv.get("meds")||{}).list).slice().sort((a,b)=>a.time.localeCompare(b.time));
const medTicks=()=>((priv.get("d_"+today())||{}).meds)||{};
function tickMed(id,v){const d=priv.get("d_"+today())||{kind:"day"};const m=Object.assign({},d.meds||{});if(v)m[id]=Date.now();else delete m[id];putPriv("d_"+today(),Object.assign({},d,{meds:m}))}
function renderMeds(){
  const ul=$("meds");ul.replaceChildren();const t=medTicks(),nowHM=hm(Date.now());
  medsList().forEach(m=>{
    const done=!!t[m.id],due=!done&&m.time<=nowHM;
    const li=checkEl("med_"+m.id,m.time+" · "+m.name+(done?" ✓ о "+hm(t[m.id]):""),done,v=>tickMed(m.id,v),null,()=>{if(confirm("Прибрати «"+m.name+" "+m.time+"»?"))putPriv("meds",{kind:"meds",list:medsList().filter(x=>x.id!==m.id)})});
    if(due)li.classList.add("due");ul.append(li);
  });
  if(!medsList().length)ul.append(el("p","empty","Додай назву й час, і в цей час прийде нагадування. Кожен час окремо: залізо 9:00, залізо 21:00."));
  $("medsSec").classList.toggle("top",medsList().length>0); // when there are meds, they go first in «Турбота»
  $("medHint").hidden=!medsList().some(m=>/залізо|желез|iron|fer/i.test(m.name));
}

/* ---------- collapsible blocks ---------- */
// Each <details class="fold" data-fold="key"> remembers open/closed per device; the summary shows a short status.
document.querySelectorAll("details.fold").forEach(d=>{
  const f=ls("folds")||{};if(f[d.dataset.fold]===false)d.open=false;else if(f[d.dataset.fold]===true)d.open=true;
  d.addEventListener("toggle",()=>{const x=ls("folds")||{};x[d.dataset.fold]=d.open;ls("folds",x)});
});
function setSum(k,t){const e=document.querySelector('[data-sum="'+k+'"]');if(e)e.textContent=t||""}
function renderSums(d){
  const p=myProfile(),st=statusInfo(p);setSum("status",st?st.i+" "+st.t:"не вказано");
  const ns=nsOf(uid),eps=activeEpisodes(uid);
  setSum("ns",[...ns.long.map(longLabel),...eps.map(e=>"⚡ "+epInfo(e.k).t.toLowerCase())].join(", ")||"нічого не відмічено");
  setSum("why",whysOf(d).length?String(whysOf(d).length):"");
  setSum("ess","вода "+arr(d.water).length+" · їжа "+arr(d.food).length);
  const care=careToday(),cl=careFor(d.energy||0);setSum("care",cl.filter(c=>care[c.k]).length+" з "+cl.length);
  const ml=medsList(),mt=medTicks();setSum("meds",ml.length?ml.filter(m=>mt[m.id]).length+" з "+ml.length:"");
  const open=tasks().filter(t=>!t.done).length;setSum("tasks",open?open+" відкритих":"");
  setSum("shows",shows.length?String(shows.length):"");
  const cd=cycDay(today());
  setSum("cyctoday",[cd.flow&&cd.flow!=="none"?(find(FLOW,cd.flow)||{}).t:"",cd.clots?"згустки":"",cd.pain?"біль":"",cd.libido&&cd.libido!=="normal"?(find(LIBIDO,cd.libido)||{}).t:""].filter(Boolean).join(", ").toLowerCase()||"нічого не відмічено");
  setSum("cycsym",arr(cd.sym).length?String(arr(cd.sym).length):"");
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
let forgot=false;
function setAuthMode(s){
  signup=s;forgot=false;$("passField").hidden=false;$("password").required=true;$("forgotBtn").hidden=s;$("signupFields").hidden=!s;$("authTitle").textContent=s?"Реєстрація":"Вхід";
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
  if(/rate limit|security purposes/i.test(m))return "Забагато спроб. Зачекай трохи і спробуй ще раз.";
  if(/not authorized/i.test(m))return "Supabase поки не може надіслати лист на цю пошту: спершу треба налаштувати відправку листів (SMTP) у Supabase.";
  if(/should be different/i.test(m))return "Новий пароль має відрізнятися від старого.";
  return "Не вийшло: "+m;
}
$("authToggle").addEventListener("click",()=>setAuthMode(forgot?false:!signup));
// Forgot password: only the e-mail field, then Supabase sends a link back here (type=recovery).
$("forgotBtn").addEventListener("click",()=>{setAuthMode(false);forgot=true;$("passField").hidden=true;$("password").required=false;$("forgotBtn").hidden=true;
  $("authTitle").textContent="Відновлення пароля";$("authLead").textContent="Напиши пошту, з якою реєструвався(лась). Прийде лист з посиланням, щоб задати новий пароль.";
  $("authSubmit").textContent="Надіслати лист";$("authToggle").textContent="Згадав(ла), повернутись до входу";$("email").focus()});
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("authErr").textContent="";$("authErr").classList.remove("ok");
  const email=$("email").value.trim(),password=$("password").value;
  if(forgot){
    if(!email){$("authErr").textContent="Напиши пошту.";return}
    const b=$("authSubmit");b.disabled=true;
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    b.disabled=false;
    $("authErr").classList.toggle("ok",!error);
    $("authErr").textContent=error?authError(error):"Лист надіслано на "+email+". Відкрий посилання з нього на цьому пристрої. Якщо листа немає кілька хвилин, глянь у «Спам».";
    return;
  }
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
async function openApp(){show("app");setTab(location.hash.slice(1)||ls("tab")||"us");$("sync").textContent="Підключаюсь…";await loadAll();subscribe();renderPushState();pingSeen()}

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
  const cy=$("setCycle");cy.replaceChildren();const cfg=cycCfg();
  const en=el("label","retropriv");const ecb=el("input");ecb.type="checkbox";ecb.checked=!!cfg.enabled;
  ecb.addEventListener("change",async()=>{await putPriv("cycle",Object.assign(cycCfg(),{enabled:ecb.checked}));syncCycle();renderSettings()});
  en.append(ecb,el("span",null,"Відстежувати цикл (зʼявиться вкладка «Цикл» 🩸)"));cy.append(en);
  if(cfg.enabled){
    cy.append(el("p","sub","Що бачить "+(partnerId()?nm(partnerId()):"партнер")));
    CSHARE.forEach(([k,t])=>{const l=el("label","retropriv");const c=el("input");c.type="checkbox";c.checked=!!cfg.share[k];
      c.addEventListener("change",async()=>{const cur=cycCfg();await putPriv("cycle",Object.assign(cur,{share:Object.assign({},cur.share,{[k]:c.checked})}));syncCycle()});
      l.append(c,el("span",null,t));cy.append(l)});
    cy.append(el("p","hint","Решта бачиш тільки ти. Усі відмітки й дати зберігаються приватно, партнеру йде лише те, що увімкнено тут."));
  }
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
$("emoLook").addEventListener("click",()=>{emoLook=!emoLook;emoInfo=null;render()});
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
$("cycAdd").addEventListener("submit",e=>{e.preventDefault();const v=$("cycDate").value;if(!v)return;
  const cfg=cycCfg();putPriv("cycle",Object.assign(cfg,{starts:[...new Set([...arr(cfg.starts),v])].sort()}));$("cycDate").value="";flash(e.submitter,"✓ Додано");setTimeout(syncCycle,50)});
$("medForm").addEventListener("submit",e=>{e.preventDefault();const name=$("medName").value.trim(),time=$("medTime").value;if(!name||!time)return;
  putPriv("meds",{kind:"meds",list:[...medsList(),{id:"m"+Date.now().toString(36),name,time}]});$("medName").value="";flash(e.submitter,"✓ Додано")});
$("retroSave").addEventListener("click",saveRetro);
$("nsCheckBtn").addEventListener("click",openCheck);
$("nsCheckNext").addEventListener("click",finishCheck);
$("nsCheckClose").addEventListener("click",()=>{$("nsCheckDlg").close();chk=null});
$("retroCancel").addEventListener("click",()=>{$("retroDlg").close();retroDraft=null});
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
["why","newText","boxText","careText","needText","showCaption","planText","statusText","nsText","medName"].forEach(id=>{const i=$(id);if(!i)return;const b=btn("emojibtn","☺",ev=>{ev.preventDefault();openEmoji(i,ev.currentTarget)},"Додати смайлик");i.after(b)});

/* ---------- boot ---------- */
setInterval(render,5*60*1000);
document.addEventListener("visibilitychange",()=>{
  const pid=partnerId();
  if(document.hidden){if(tab==="us"&&pid)ls("seenLog",Object.assign({},ls("seenLog")||{},{[pid]:Date.now()}));return}
  if(uid&&!$("app").hidden){if(tab==="us")markSeen();loadAll().then(pingSeen)}
});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
setAuthMode(false);
let started=false;
function openNewPass(fromSettings){
  show("newpass");$("newPassErr").textContent="";$("newPass1").value="";$("newPass2").value="";
  $("newPassCancel").hidden=!fromSettings;setTimeout(()=>$("newPass1").focus(),0);
}
$("newPassForm").addEventListener("submit",async e=>{
  e.preventDefault();const a=$("newPass1").value,b=$("newPass2").value;
  if(a.length<6){$("newPassErr").textContent="Пароль має бути щонайменше 6 символів.";return}
  if(a!==b){$("newPassErr").textContent="Паролі не збігаються.";return}
  const {error}=await sb.auth.updateUser({password:a});
  if(error){$("newPassErr").textContent=authError(error);return}
  recovering=false;history.replaceState(null,"",location.pathname);
  const {data}=await sb.auth.getSession();
  if(data&&data.session){if(!started){started=true;start(data.session)}else{show("app");$("sync").textContent="Пароль змінено ✓"}}
  else show("auth");
});
$("newPassCancel").addEventListener("click",()=>show("app"));
$("changePass").addEventListener("click",()=>{if($("settings").open)$("settings").close();openNewPass(true)});
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==="PASSWORD_RECOVERY")recovering=true;
  if(session&&recovering){openNewPass(false);return}
  if(session&&!started){started=true;setTimeout(()=>start(session),0)}
  if(!session){started=false;uid=null;if(channel){sb.removeChannel(channel);channel=null}show("auth")}
});
