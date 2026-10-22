/* Запас сил — app logic. Data lives in Supabase; see supabase/schema.sql. */
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ---------- vocab ---------- */
const ESS=[{k:"water",t:"Попити води",did:"Випила",gap:2.5},{k:"food",t:"Поїсти",did:"Поїла",gap:4.5}];
const CARE=[{k:"move",t:"Встати й потягнутися"},{k:"wash",t:"Вмитися або душ"},{k:"air",t:"Вийти на повітря чи відкрити вікно"},{k:"sleep",t:"Лягти до опівночі"}];
const NEED=[{k:"call",t:"Подзвони, коли зможеш",o:"Чекає дзвінка, коли буде можливість"},{k:"text",t:"Напиши мені щось",o:"Будь-яке повідомлення зараз допоможе"},{k:"know",t:"Просто знай, без питань",o:"Просто знай. Без питань"},{k:"alone",t:"Хочу побути сам(а)",o:"Потрібен час наодинці"},{k:"together",t:"Хочу побути разом",o:"Хочеться побути разом"}];
const SLEEP=[{k:"good",t:"Добре"},{k:"little",t:"Мало"},{k:"bad",t:"Погано"},{k:"woke",t:"Часті пробудження"},{k:"dreams",t:"Були сни",warn:1},{k:"nightmares",t:"Кошмари",warn:1}];
const HEAD=[{k:"ok",t:"Ок"},{k:"pain",t:"Болить"},{k:"prodrome",t:"Наближається мігрень",warn:1},{k:"migraine",t:"Мігрень",warn:1}];
const SIGNS=[{k:"aura",t:"Аура, мерехтіння"},{k:"light",t:"Ріже світло"},{k:"sound",t:"Ріжуть звуки"},{k:"smell",t:"Запахи"},{k:"nausea",t:"Нудить"},{k:"neck",t:"Тягне шию"},{k:"fog",t:"Туман у голові"},{k:"yawn",t:"Позіхання, сонливість"},{k:"crave",t:"Тягне на солодке"}];
const MOOD=[{k:"calm",t:"Спокійно"},{k:"happy",t:"Щасливо"},{k:"joy",t:"Радісно"},{k:"cope",t:"Я справлюсь"},{k:"tired",t:"Втомлено"},{k:"anx",t:"Тривожно"},{k:"scared",t:"Страшно"},{k:"sad",t:"Сумно"},{k:"hurt",t:"Боляче"},{k:"cry",t:"Хочу плакати"},{k:"irr",t:"Все дратує"},{k:"empty",t:"Пусто"}];
const COLORS=[{k:"red",c:"#d9584a",t:"Червоний"},{k:"yellow",c:"#e8c448",t:"Жовтий"},{k:"blue",c:"#5a96e6",t:"Синій"},{k:"green",c:"#64be78",t:"Зелений"},{k:"violet",c:"#aa78e6",t:"Фіолетовий"}];
const ELBL={1:"майже нуль",2:"трохи є",3:"норм",4:"розгін"};
const WLABEL={1:"легка",2:"середня",3:"важка"};
const KIND={tell:"розповісти",dream:"мрія",talk:"обговорити"};
const NUDGE={water:"Нагадати попити",food:"Нагадати поїсти",hug:"Думаю про тебе"};
const NUDGE_IN={water:"нагадує тобі попити води",food:"нагадує тобі поїсти",hug:"думає про тебе"};
const MSG={1:"Сьогодні режим збереження. Вода, їжа, базова турбота, і все. Задачі почекають, це нормально.",2:"Трохи сил є. Одна-дві легкі речі, і перерва.",3:"Сили є. Можна взятися за щось вагоме, але не за все одразу.",4:"Є розгін. Візьмись за важке, поки воно легко йде. І не пропускай їжу та воду: після підйому часто буває спад."};

/* ---------- helpers ---------- */
const arr=v=>Array.isArray(v)?v:(v?[v]:[]);
const has=(v,k)=>arr(v).includes(k);
const labels=(list,v)=>arr(v).map(k=>(list.find(x=>x.k===k)||{}).t).filter(Boolean);
const find=(list,k)=>list.find(x=>x.k===k);
const dkey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>dkey(new Date());
const hm=ts=>new Date(ts).toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function show(id){["loading","auth","pair","app"].forEach(x=>$(x).hidden=x!==id)}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}

/* ---------- state ---------- */
let uid=null,showAll=false,channel=null;
let profiles=new Map();   // id -> profile (me + partner)
let me={};                // my shared data for today
let people=new Map();     // user_id -> today's data
let hist=new Map();       // day -> my data
let priv=new Map();       // id -> private data (tasks, care)
let box=[],inbox=[],sentNudge={};

const myProfile=()=>profiles.get(uid)||{};
const partnerId=()=>[...profiles.keys()].find(id=>id!==uid)||null;
const nm=id=>id===uid?"Ти":((profiles.get(id)||{}).name||"Твоя людина");
const colorOf=id=>(profiles.get(id)||{}).color||(id===uid?"red":"yellow");

/* ---------- data ---------- */
function myToday(){return me&&me.date===today()?me:{date:today()}}
const NOTABLE=["need","sleep","head","energy","mood"];
const notifyState=debounce(()=>sb.functions.invoke("notify",{body:{type:"state"}}).catch(()=>{}),15000);
async function saveMe(patch){
  me=Object.assign({},myToday(),patch,{date:today(),updated:Date.now()});
  people.set(uid,me);hist.set(today(),me);render();
  const {error}=await sb.from("days").upsert({user_id:uid,day:today(),data:me,updated_at:new Date().toISOString()});
  if(error)return syncErr(error);
  if(Object.keys(patch).some(k=>NOTABLE.includes(k)))notifyState();
}
async function putPriv(id,data){
  priv.set(id,data);render();
  const {error}=await sb.from("private_items").upsert({user_id:uid,id,data,updated_at:new Date().toISOString()});
  if(error)syncErr(error);
}
async function delPriv(id){priv.delete(id);render();const {error}=await sb.from("private_items").delete().eq("user_id",uid).eq("id",id);if(error)syncErr(error)}
function careToday(){const d=priv.get("d_"+today());return (d&&d.care)||{}}
function setCare(k,v){const d=priv.get("d_"+today())||{kind:"day"};putPriv("d_"+today(),Object.assign({},d,{care:Object.assign({},d.care||{},{[k]:v})}))}
function tasks(){return [...priv.entries()].filter(([,d])=>d.kind==="task").map(([id,d])=>({id,...d}))}
function syncErr(e){console.error(e);$("sync").textContent="Не вдалося зберегти. Перевір інтернет, я спробую ще раз при наступній дії."}

async function loadProfiles(){const {data}=await sb.from("profiles").select("*");profiles=new Map((data||[]).map(p=>[p.id,p]))}
async function loadDays(){
  const since=new Date();since.setDate(since.getDate()-8);
  const {data}=await sb.from("days").select("*").gte("day",dkey(since));
  people=new Map();hist=new Map();
  (data||[]).forEach(r=>{
    if(r.user_id===uid)hist.set(r.day,r.data);
    if(r.day===today())people.set(r.user_id,r.data);
  });
  const mine=people.get(uid);
  if(mine&&(!me.updated||me.date!==today()||mine.updated>=me.updated))me=mine;
}
async function loadPriv(){const {data}=await sb.from("private_items").select("id,data");priv=new Map((data||[]).map(r=>[r.id,r.data]))}
async function loadBox(){const {data}=await sb.from("box").select("*").order("created_at",{ascending:false}).limit(100);box=data||[]}
async function loadInbox(){const {data}=await sb.from("nudges").select("*").eq("to_user",uid).order("created_at",{ascending:false});inbox=data||[]}
async function loadAll(){await Promise.all([loadProfiles(),loadDays(),loadPriv(),loadBox(),loadInbox()]);render()}

function subscribe(){
  if(channel)sb.removeChannel(channel);
  const re=(fn)=>debounce(async()=>{await fn();render()},300);
  channel=sb.channel("our-connection")
    .on("postgres_changes",{event:"*",schema:"public",table:"days"},re(loadDays))
    .on("postgres_changes",{event:"*",schema:"public",table:"box"},re(loadBox))
    .on("postgres_changes",{event:"*",schema:"public",table:"nudges"},re(loadInbox))
    .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},re(loadProfiles))
    .subscribe(s=>{$("sync").textContent=s==="SUBSCRIBED"?"Синхронізується між вами":"Підключаюсь…"});
}

/* ---------- UI pieces ---------- */
function checkEl(id,text,checked,onChange,tag,onDel){
  const li=el("li","item"+(checked?" done":""));const lab=el("label");
  const cb=el("input");cb.type="checkbox";cb.id="cb_"+id;cb.checked=checked;cb.addEventListener("change",()=>onChange(cb.checked));
  lab.append(cb,el("span",null,text));li.append(lab);
  if(tag)li.append(el("span","tag w"+tag,WLABEL[tag]));
  if(onDel){const b=el("button","del","×");b.type="button";b.setAttribute("aria-label","Прибрати");b.addEventListener("click",onDel);li.append(b)}
  return li;
}
function essDue(e,d){const a=(d&&d[e.k])||[];const h=new Date().getHours();if(h<8||h>=23)return false;if(!a.length)return true;return (Date.now()-a[a.length-1])/36e5>=e.gap}
function essNote(e,d){const a=(d&&d[e.k])||[];return a.length?("сьогодні "+a.length+" · востаннє о "+hm(a[a.length-1])):"сьогодні ще не було"}
function essEl(e,d,undo){
  const li=el("li","item");const tx=el("div","txt");const inner=el("div",null,e.t);inner.append(el("small",null,essNote(e,d)));tx.append(inner);li.append(tx);
  if(undo&&((d[e.k]||[]).length)){const u=el("button","del","↺");u.type="button";u.setAttribute("aria-label","Скасувати останню відмітку");u.addEventListener("click",()=>{const a=[...(myToday()[e.k]||[])];a.pop();saveMe({[e.k]:a})});li.append(u)}
  const b=el("button","plus",e.did);b.type="button";b.addEventListener("click",()=>saveMe({[e.k]:[...(myToday()[e.k]||[]),Date.now()]}));li.append(b);
  return li;
}
function multiRow(box,opts,field,exclusive){
  box.replaceChildren();const cur=arr(myToday()[field]);
  opts.forEach(o=>{const on=cur.includes(o.k);const b=el("button","chip"+(o.warn?" warn":""),o.t);b.type="button";b.setAttribute("aria-pressed",String(on));
    b.addEventListener("click",()=>{let next=on?cur.filter(x=>x!==o.k):[...cur,o.k];
      if(!on&&exclusive){if(exclusive.includes(o.k))next=[o.k];else next=next.filter(x=>!exclusive.includes(x))}
      saveMe({[field]:next})});box.append(b)});
}
function scaleRow(box,field){
  box.replaceChildren();const cur=myToday()[field]||0;
  for(let i=1;i<=10;i++){const b=el("button","chip num",String(i));b.type="button";b.setAttribute("aria-pressed",String(cur===i));b.setAttribute("aria-label","Біль "+i+" з 10");
    b.addEventListener("click",()=>saveMe({[field]:cur===i?0:i}));box.append(b)}
}
function chipRow(box,opts,field,extra){
  box.replaceChildren();const cur=myToday()[field]||null;
  opts.forEach(o=>{const b=el("button","chip"+(o.warn?" warn":"")+(extra||""),o.t);b.type="button";b.setAttribute("aria-pressed",String(cur===o.k));
    b.addEventListener("click",()=>saveMe({[field]:cur===o.k?null:o.k}));box.append(b)});
}
function colorRow(box,cur,onPick){
  box.replaceChildren();
  COLORS.forEach(c=>{const b=el("button","swatch");b.type="button";b.style.background=c.c;b.setAttribute("aria-label",c.t);b.setAttribute("aria-pressed",String(cur===c.k));
    b.addEventListener("click",()=>onPick(c.k));box.append(b)});
}
const toggleTask=t=>v=>putPriv(t.id,{kind:"task",text:t.text,w:t.w,created:t.created,done:v,doneDay:v?today():null});

function tipsFor(d){
  const t=[];
  if(d.need==="know")t.push("Питання зараз забирають сили. Можна просто написати «я поряд».");
  if(d.need==="alone")t.push("Це не про тебе. Дай трохи простору і напиши пізніше.");
  if(d.need==="together")t.push("Дзвінок, голосове або спільна справа на відстані.");
  if(d.need==="call")t.push("Подзвони, щойно буде можливість. Навіть на кілька хвилин.");
  if(d.need==="text")t.push("Фото, стікер чи дрібниця з дня, неважливо що.");
  if(has(d.sleep,"nightmares"))t.push("Були кошмари. Не розпитуй, просто будь поруч у повідомленнях.");
  else if(has(d.sleep,"dreams"))t.push("Були сни, а це виснажує навіть без кошмарів. Будь мʼякшим сьогодні.");
  if(d.head==="prodrome")t.push("Наближається мігрень. Можна нагадати про воду, їжу й ліки, краще текстом.");
  if(d.head==="pain"&&(d.pain||0)>=6)t.push("Сильно болить голова. Коротко й тихо, без дзвінків, якщо не просить.");
  if(d.energy===1)t.push("Сил майже немає. Не чекай розгорнутих відповідей.");
  if(d.head==="migraine")t.push("Мігрень. Краще текст, ніж дзвінок, і без поспіху з відповіддю.");
  if(has(d.mood,"anx")||has(d.mood,"scared"))t.push("Тривожно чи страшно. Спокійний голос або коротке «я тут» важливіші за поради.");
  if(has(d.mood,"hurt")||has(d.mood,"sad"))t.push("Боляче чи сумно. Не треба виправляти, достатньо побути поруч.");
  if(has(d.mood,"cry"))t.push("Хочеться плакати. Можна просто побути поруч, без «не плач» і без порад.");
  if(has(d.mood,"cope"))t.push("Тримається. Можна сказати, що пишаєшся.");
  if(has(d.mood,"happy")||has(d.mood,"joy"))t.push("Добрий момент. Запитай, що сьогодні порадувало.");
  return t;
}
function personCard(id,d,isMe){
  const c=el("article","card c-"+colorOf(id));
  const who=el("div","who");who.append(el("h3",null,nm(id)));
  const isToday=d&&d.date===today();
  who.append(el("small",null,d&&d.updated?(isToday?"оновлено о "+hm(d.updated):"востаннє "+new Date(d.updated).toLocaleDateString("uk-UA",{day:"numeric",month:"short"})):""));
  c.append(who);
  if(!d||!isToday){c.append(el("p","empty",isMe?"Відміть свій стан нижче, і він зʼявиться тут для вас обох.":"Сьогодні стан ще не відмічено."));if(!isMe)c.append(nudgeRow(id));return c}
  const n=find(NEED,d.need);if(n)c.append(el("div","need",isMe?n.t:n.o));
  const f=el("div","facts");
  if(d.energy)f.append(el("span","fact"+(d.energy===1?" alert":""),"Сили: "+ELBL[d.energy]));
  const sl=labels(SLEEP,d.sleep);if(sl.length)f.append(el("span","fact"+(has(d.sleep,"nightmares")||has(d.sleep,"dreams")?" alert":""),"Сон: "+sl.join(", ").toLowerCase()));
  const h=find(HEAD,d.head);if(h)f.append(el("span","fact"+(h.warn||(d.pain||0)>=6?" alert":""),"Голова: "+h.t.toLowerCase()+((d.head==="pain"||d.head==="migraine")&&d.pain?" "+d.pain+"/10":"")));
  const sg=labels(SIGNS,d.signs);if(sg.length&&(d.head==="prodrome"||d.head==="migraine"))f.append(el("span","fact alert",sg.join(", ").toLowerCase()));
  const ml=labels(MOOD,d.mood);if(ml.length)f.append(el("span","fact","Настрій: "+ml.join(", ").toLowerCase()));
  ESS.forEach(e=>{const a=d[e.k]||[];f.append(el("span","fact"+(essDue(e,d)?" alert":""),(e.k==="water"?"Вода":"Їжа")+": "+(a.length?a.length+", о "+hm(a[a.length-1]):"ще не було")))});
  c.append(f);
  if(d.why)c.append(el("p","why","«"+d.why+"»"));
  if(!isMe){
    const t=tipsFor(d);if(t.length){const ul=el("ul","tips");t.forEach(x=>ul.append(el("li",null,x)));c.append(ul)}
    c.append(nudgeRow(id,d));
  }
  return c;
}
function nudgeRow(id,d){
  const r=el("div","nudges");
  Object.keys(NUDGE).forEach(k=>{
    if(d&&k!=="hug"&&!essDue(find(ESS,k),d))return;
    const sent=sentNudge[id+k]&&Date.now()-sentNudge[id+k]<60000;
    const b=el("button","nbtn"+(sent?" sent":""),sent?"Надіслано":NUDGE[k]);b.type="button";
    b.addEventListener("click",async()=>{
      sentNudge[id+k]=Date.now();render();
      const {error}=await sb.from("nudges").insert({couple_id:myProfile().couple_id,from_user:uid,to_user:id,kind:k});
      if(error)return syncErr(error);
      sb.functions.invoke("notify",{body:{type:"nudge",kind:k}}).catch(()=>{});
    });
    r.append(b);
  });
  return r;
}

/* ---------- render ---------- */
function render(){
  if($("app").hidden)return;
  const d=myToday(),lvl=d.energy||0,care=careToday(),mig=d.head==="migraine";
  $("date").textContent=new Date().toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"});

  const ib=$("inbox");ib.replaceChildren();
  inbox.forEach(n=>{const t=el("div","toast");t.append(el("span",null,nm(n.from_user)+" "+NUDGE_IN[n.kind]+" · "+hm(n.created_at)));
    const b=el("button","del","×");b.type="button";b.setAttribute("aria-label","Прибрати");
    b.addEventListener("click",async()=>{inbox=inbox.filter(x=>x.id!==n.id);render();await sb.from("nudges").delete().eq("id",n.id)});t.append(b);ib.append(t)});

  const us=$("us");us.replaceChildren();
  us.append(personCard(uid,people.get(uid)||me,true));
  const pid=partnerId();
  if(pid)us.append(personCard(pid,people.get(pid),false));
  else{const c=el("article","card c-"+(colorOf(uid)==="yellow"?"red":"yellow"));c.append(el("h3",null,"Твоя людина"));
    c.append(el("p","empty",myProfile().couple_id?"Картка зʼявиться, щойно твоя людина введе код пари.":"Створи пару в налаштуваннях, щоб бачити одне одного."));us.append(c)}

  document.querySelectorAll(".lvl").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.l===lvl)));
  chipRow($("needChips"),NEED,"need"," needc");multiRow($("sleepChips"),SLEEP,"sleep",["good"]);chipRow($("headChips"),HEAD,"head");multiRow($("moodChips"),MOOD,"mood");
  const showPain=d.head==="pain"||d.head==="migraine",showSigns=d.head==="prodrome"||d.head==="migraine";
  $("painBox").hidden=!showPain;if(showPain)scaleRow($("painChips"),"pain");
  $("signBox").hidden=!showSigns;if(showSigns)multiRow($("signChips"),SIGNS,"signs");
  if(document.activeElement!==$("why"))$("why").value=d.why||"";

  const open=tasks().filter(t=>!t.done).sort((a,b)=>a.w-b.w||a.created-b.created);
  const careLeft=CARE.filter(c=>!care[c.k]);
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
  if(msg)now.append(el("p","msg",msg));else if(!lvl)now.append(el("p",null,"Відміть сили вище, і тут зʼявиться 1–3 речі, які зараз підійдуть."));
  if(ul.children.length)now.append(ul);else if(lvl||mig)now.append(el("p",null,"Зараз нічого не горить. Можна просто відпочити."));

  const es=$("ess");es.replaceChildren();ESS.forEach(e=>es.append(essEl(e,d,true)));
  const cu=$("care");cu.replaceChildren();CARE.forEach(c=>cu.append(checkEl("care_"+c.k,c.t,!!care[c.k],v=>setCare(c.k,v))));

  const maxW=mig&&!showAll?0:d.head==="prodrome"&&!showAll?1:(!lvl||showAll)?3:lvl<=2?1:3;
  const visible=open.filter(t=>t.w<=maxW),hidden=open.length-visible.length;
  const tu=$("tasks");tu.replaceChildren();
  visible.forEach(t=>tu.append(checkEl("t_"+t.id,t.text,false,toggleTask(t),t.w,()=>delPriv(t.id))));
  if(!open.length)tu.append(el("p","empty","Задач немає. Додай одним рядком, коли щось спаде на думку."));
  else if(!visible.length)tu.append(el("p","empty","Під твій стан зараз нічого немає, і це окей."));
  const tg=$("toggleAll");tg.hidden=!(hidden>0||showAll);tg.textContent=showAll?"Показати лише те, що під силу":"Показати всі ("+hidden+" сховано)";
  const doneToday=tasks().filter(t=>t.done&&t.doneDay===today());
  const n=CARE.filter(c=>care[c.k]).length+doneToday.length+(d.water||[]).length+(d.food||[]).length;
  $("tally").textContent=n?("Сьогодні вже відмічено: "+n+". Все це зараховується."):"Сьогодні ще нічого не відмічено. Нічого страшного.";
  const du=$("doneList");du.replaceChildren();doneToday.forEach(t=>du.append(checkEl("d_"+t.id,t.text,true,toggleTask(t),t.w,()=>delPriv(t.id))));

  const bx=$("box");bx.replaceChildren();
  if(!myProfile().couple_id)bx.append(el("p","empty","Скринька зʼявиться, коли ви зʼєднаєте пару."));
  else if(!box.length)bx.append(el("p","empty","Поки порожньо. Кинь сюди щось, про що хочеться поговорити при наступному дзвінку."));
  box.forEach(b=>{const li=el("li","item boxitem");const tx=el("div","txt");const inner=el("div",null,b.text);
    inner.append(el("small",null,nm(b.author)+" · "+new Date(b.created_at).toLocaleDateString("uk-UA",{day:"numeric",month:"short"})));tx.append(inner);li.append(tx,el("span","kind "+(b.kind||""),KIND[b.kind]||""));
    const x=el("button","del","×");x.type="button";x.setAttribute("aria-label","Прибрати запис");
    x.addEventListener("click",async()=>{box=box.filter(y=>y.id!==b.id);render();await sb.from("box").delete().eq("id",b.id)});li.append(x);bx.append(li)});

  const tb=$("week");tb.replaceChildren();const hr=tb.insertRow();
  ["День","Сили","Сон","Голова","Настрій","Вода","Їжа"].forEach(h=>hr.append(el("th",null,h)));
  for(let i=0;i<7;i++){const dt=new Date();dt.setDate(dt.getDate()-i);const k=dkey(dt);const h=(k===today()?d:hist.get(k))||{};const r=tb.insertRow();
    const c=(t,cls)=>{const td=r.insertCell();td.textContent=t;if(cls)td.className=cls};
    c(i===0?"сьогодні":dt.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric"}));
    c(h.energy?"●".repeat(h.energy)+"○".repeat(4-h.energy):"—","dots");
    const sl=labels(SLEEP,h.sleep);c(sl.length?sl.join(", "):"—",has(h.sleep,"nightmares")||has(h.sleep,"dreams")?"mig":"");
    const hd=find(HEAD,h.head);c(hd?hd.t+(h.pain?" "+h.pain:""):"—",h.head==="migraine"||h.head==="prodrome"?"mig":"");
    const ml=labels(MOOD,h.mood);c(ml.length?ml.join(", "):"—");
    c(String((h.water||[]).length||"—"));c(String((h.food||[]).length||"—"));}
  renderPushBanner();
}

/* ---------- push ---------- */
function b64ToBytes(s){const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))}
const pushSupported=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
async function enablePush(){
  if(!pushSupported()){alertMsg("Цей браузер не підтримує сповіщення. Відкрий додаток у Chrome.");return}
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){alertMsg("Сповіщення заблоковані. Їх можна дозволити в налаштуваннях сайту в Chrome.");renderPushState();return}
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.vapidPublicKey)});
  const j=sub.toJSON();
  const {error}=await sb.from("push_subscriptions").upsert({endpoint:j.endpoint,user_id:uid,p256dh:j.keys.p256dh,auth:j.keys.auth});
  if(error)return syncErr(error);
  renderPushState();render();
}
function alertMsg(t){$("pushState").textContent=t;$("sync").textContent=t}
function renderPushState(){
  const s=!pushSupported()?"Сповіщення недоступні в цьому браузері":Notification.permission==="granted"?"Сповіщення увімкнені":Notification.permission==="denied"?"Сповіщення заблоковані в браузері":"Сповіщення вимкнені";
  $("pushState").textContent=s;$("pushOn").hidden=!pushSupported()||Notification.permission==="granted";
}
function renderPushBanner(){$("pushBanner").hidden=!pushSupported()||Notification.permission!=="default"||ls("pushLater")===today()}

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
async function openApp(){show("app");$("sync").textContent="Підключаюсь…";await loadAll();subscribe();renderPushState()}

/* ---------- settings ---------- */
$("openSettings").addEventListener("click",async()=>{
  const p=myProfile();$("setName").value=p.name||"";
  colorRow($("setColor"),p.color,async k=>{await sb.from("profiles").update({color:k}).eq("id",uid);await loadProfiles();colorRow($("setColor"),k,()=>{});render()});
  renderPushState();
  if(p.couple_id){const {data}=await sb.rpc("my_invite_code");$("pairInfo").textContent=partnerId()?"Ви зʼєднані з "+nm(partnerId())+". Код пари: "+data:"Код для твоєї людини: "+data}
  else $("pairInfo").textContent="Пари ще немає. Вийди й увійди знову, щоб створити або приєднатися.";
  $("settings").showModal();
});
$("setName").addEventListener("change",async()=>{await sb.from("profiles").update({name:$("setName").value.trim()}).eq("id",uid);await loadProfiles();render()});
$("closeSettings").addEventListener("click",()=>$("settings").close());
$("pushOn").addEventListener("click",enablePush);
$("pushOn2").addEventListener("click",enablePush);
$("pushLater").addEventListener("click",()=>{ls("pushLater",today());renderPushBanner()});
$("logout").addEventListener("click",async()=>{$("settings").close();ls("skipPair",null);await sb.auth.signOut()});

/* ---------- check-in events ---------- */
document.querySelectorAll(".lvl").forEach(b=>b.addEventListener("click",()=>{const l=+b.dataset.l;showAll=false;saveMe({energy:myToday().energy===l?0:l})}));
$("whyForm").addEventListener("submit",e=>{e.preventDefault();saveMe({why:$("why").value.trim()});$("why").blur()});
$("toggleAll").addEventListener("click",()=>{showAll=!showAll;render()});
$("add").addEventListener("submit",e=>{e.preventDefault();const text=$("newText").value.trim();if(!text)return;
  const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  putPriv(id,{kind:"task",text,w:+$("newW").value,created:Date.now(),done:false,doneDay:null});$("newText").value="";$("newW").value="1"});
$("boxForm").addEventListener("submit",async e=>{e.preventDefault();const text=$("boxText").value.trim();const cid=myProfile().couple_id;if(!text||!cid)return;
  $("boxText").value="";const {error}=await sb.from("box").insert({couple_id:cid,author:uid,text,kind:$("boxKind").value});if(error)return syncErr(error);await loadBox();render()});

/* ---------- boot ---------- */
setInterval(render,5*60*1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&uid&&!$("app").hidden)loadAll()});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
setAuthMode(false);
let started=false;
sb.auth.onAuthStateChange((ev,session)=>{
  if(session&&!started){started=true;setTimeout(()=>start(session),0)}
  if(!session){started=false;uid=null;if(channel){sb.removeChannel(channel);channel=null}show("auth")}
});
