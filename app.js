/* ================= model (matches spreadsheet V4) ================= */
const PRESENCE = ["No NYC presence","Sells in NYC only (online / retail)","NYC office, store, or branch","NYC headquarters","Brooklyn headquarters or Brooklyn-founded"];
const MISSION = ["No related giving found","General community giving only","Funds youth OR women broadly","Funds one GGE focus area (girls, gender justice, Black & brown youth, wellness)","Funds girls / youth of color directly, or sponsors a peer org"];
const COMMIT = ["No formal giving found","Informal or occasional giving","Corporate foundation (required 5% yearly payout)","Public pledge (% of profit or Pledge 1%)","Foundation + public pledge"];
const ACCESS = ["Invitation-only or closed","Highly competitive national portal","Annual application cycle","Rolling requests or open form","Named contact or warm intro"];
const LENSES = [
  {id:'align',  name:'Alignment & location', q:'Are they in NYC, and do they fund work like ours?', c:'var(--c1)'},
  {id:'commit', name:'Giving commitment',    q:'Do they give on a regular, formal basis?',         c:'var(--c2)'},
  {id:'ask',    name:'Ask fit & access',     q:'Is their usual gift the right size, and can we reach them?', c:'var(--c3)'},
  {id:'prog',   name:'Employee programs',    q:'Can their employees give or volunteer?',           c:'var(--c4)'},
];
const KPIS = [
  {k:'presence',   lens:'align',  label:'NYC presence'},
  {k:'mission',    lens:'align',  label:'Mission fit'},
  {k:'commitment', lens:'commit', label:'Formal giving'},
  {k:'gpe',        lens:'commit', label:'Giving per employee'},
  {k:'giftSize',   lens:'ask',    label:'Typical gift size'},
  {k:'access',     lens:'ask',    label:'How to apply'},
  {k:'matchCap',   lens:'prog',   label:'Employee match'},
  {k:'pathways',   lens:'prog',   label:'Ways to give'},
];
const PATHS = [
  {k:'inKind',long:'In-kind donations',short:'In-kind'},
  {k:'sponsor25',long:'25th celebration sponsorship',short:'25th sponsor'},
  {k:'grants',long:'Grants',short:'Grants'},
  {k:'empGiving',long:'Employee giving',short:'Employee giving'},
  {k:'empVol',long:'Employee volunteering',short:'Volunteering'},
  {k:'yp',long:'Youth program opportunities',short:'Youth programs'},
];
const PEERS = [{k:'gwc',label:'Girls Who Code'},{k:'girlScouts',label:'Girl Scouts'},{k:'brosis',label:'BroSis'},{k:'ywfc',label:"Young Women's Freedom Center"},{k:'sadieNash',label:'Sadie Nash'}];
const CATEGORIES = ["Brooklyn-Based","Small Orgs","Foundations/Funds","Sports Related","Big Orgs","Banks/Insurance Cos","Peer Organizations' Sponsors"];
const STATUSES = ["Not started","Researching","In conversation","Asked","Committed","Declined"];
const DEFAULT_W = {presence:.2,mission:.15,commitment:.1,gpe:.1,giftSize:.15,access:.1,matchCap:.1,pathways:.1,bonus:.25};

/* ================= state ================= */
let db=null, canWrite=false;
let partners=[], leads=[], archetypes=[], matrix=[];
let teamW={...DEFAULT_W}, viewW=null;
const loaded={partners:false,leads:false,archetypes:false,matrix:false};
let showAll=false, openPartner=null, drawerEdit=false;

/* ================= helpers ================= */
const $=id=>document.getElementById(id);
function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function isNA(v){return v===''||v==null||String(v).trim()===''||String(v).trim().toUpperCase()==='N/A';}
function asNum(v){if(isNA(v))return null;const n=Number(v);return isFinite(n)?n:null;}
function money(n){ if(n==null) return 'Unknown'; if(n>=1e6) return '$'+(+(n/1e6).toFixed(1))+'M'; if(n>=1000) return '$'+(+(n/1000).toFixed(1))+'k'; return '$'+Math.round(n); }
function flash(){const b=$('saved');b.classList.add('on');clearTimeout(flash.t);flash.t=setTimeout(()=>b.classList.remove('on'),1300);}
function W(){return viewW||teamW;}
function editingIn(el){const a=document.activeElement;return !!(a&&el.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='range');}
function setHTML(el,html){ if(editingIn(el)){el.dataset.stale='1';return;} el.innerHTML=html; delete el.dataset.stale; }
document.addEventListener('focusout',()=>setTimeout(()=>{ if(document.querySelector('[data-stale]')){ renderAll(); renderMatrix(); } },0));
const plural=(n,a,b)=>n===1?a:(b||a+'s');
function listJoin(a){return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];}
function shortName(n){return n.replace(/ Companies$| USA$| Inc\.$/,'');}

/* ================= scoring (same formulas as the Partner Scoring tab) ================= */
const tier=(list,v)=>{ const i=list.indexOf(String(v||'').trim()); return i<0?null:i+1; };
function gpeOf(p){ const e=asNum(p.employees), g=asNum(p.givingM); if(e==null||g==null||e===0) return null; return g*1e6/e; }
function kpiScores(p){
  const s={};
  s.presence=tier(PRESENCE,p.presence);
  s.mission=tier(MISSION,p.mission);
  s.commitment=tier(COMMIT,p.commitment);
  const g=gpeOf(p); s.gpe = g==null?null: g===0?1:g<100?2:g<500?3:g<1000?4:5;
  const t=asNum(p.typicalGift); s.giftSize = t==null?null: t===0?1:t<1000?2:t<5000?3:t<25000?4:t<=100000?5:t<=250000?4:2;
  s.access=tier(ACCESS,p.access);
  const m=asNum(p.matchCap); s.matchCap = m==null?null: m===0?1:m<1000?2:m<3000?3:m<5000?4:5;
  const pw=PATHS.filter(x=>p.pathways&&p.pathways[x.k]).length; s.pathways=Math.min(pw+1,5);
  return {s, pathwayCount:pw, gpe:g};
}
const isWarm=p=>(Number(p.lifetimeGiving)||0)>0;
function scoreOf(p,w){
  const {s}=kpiScores(p); let num=0, den=0; const lens={align:0,commit:0,ask:0,prog:0};
  KPIS.forEach(k=>{ if(s[k.k]!=null){ num+=w[k.k]*s[k.k]; den+=w[k.k]; } });
  if(!den) return {score:null,lens,s,bonus:0};
  KPIS.forEach(k=>{ if(s[k.k]!=null) lens[k.lens]+=w[k.k]*s[k.k]/den; });
  const base=num/den, bonus=isWarm(p)?(w.bonus??.25):0;
  const score=Math.min(5,base+bonus);
  return {score, lens, s, bonus:score-base};
}
function ranked(w){
  const rows=partners.map(p=>({p,...scoreOf(p,w)}));
  const scored=rows.filter(r=>r.score!=null);
  rows.forEach(r=>{ r.rank = r.score==null?null: 1+scored.filter(o=>o.score>r.score+1e-9).length; });
  return rows.sort((a,b)=>(b.score??-1)-(a.score??-1) || a.p.name.localeCompare(b.p.name));
}
const lensTotal=(w,id)=>KPIS.filter(k=>k.lens===id).reduce((a,k)=>a+w[k.k],0);

/* ================= init ================= */
async function init(){
  wireStatic();
  try{ db=await claude.use('db'); }catch(e){ db=null; }
  let user=null; try{ user=await claude.use('user'); }catch(e){}
  if(user){ let c=null; try{ c=await user.can('data.write'); }catch(e){} canWrite=c!==false; } else canWrite=!!db;
  applyAccess();
  if(!db){ showOffline(); return; }
  db.doc('settings/weights').onSnapshot(snap=>{ if(snap.exists){ const d=snap.data(); if('mission' in d) teamW={...DEFAULT_W,...d}; } renderAll(); },()=>{});
  db.collection('partners').onSnapshot(snap=>{ partners=snap.docs.map(d=>({id:d.id,...d.data()})); loaded.partners=true; renderAll(); renderMatrix(); },()=>showOffline());
  db.collection('leads').orderBy('order').onSnapshot(snap=>{ leads=snap.docs.map(d=>({id:d.id,...d.data()})); loaded.leads=true; renderAll(); },()=>{});
  db.collection('archetypes').orderBy('order').onSnapshot(snap=>{ archetypes=snap.docs.map(d=>({id:d.id,...d.data()})); loaded.archetypes=true; renderAll(); },()=>{});
  db.collection('matrix').orderBy('order').onSnapshot(snap=>{ matrix=snap.docs.map(d=>({id:d.id,...d.data()})); loaded.matrix=true; renderMatrix(); renderHero(); },()=>{});
}
function showOffline(){
  const msg='<div class="empty">Open this page from its claude.ai link to see and edit the shared data.</div>';
  ['leads','rankList','arch','mxBody'].forEach(id=>$(id).innerHTML=msg);
}
function applyAccess(){
  ['undoBtn','addLeadBtn','newLead','addOrgToggle','addOrgBtn','newOrg','newOrgCat','saveWeights'].forEach(id=>$(id).disabled=!canWrite);
}
function wireStatic(){
  CATEGORIES.forEach(c=>{ $('mxCat').add(new Option(c,c)); $('newOrgCat').add(new Option(c,c)); });
  $('mxSearch').addEventListener('input',renderMatrix); $('mxCat').addEventListener('change',renderMatrix); $('mxArchived').addEventListener('change',renderMatrix);
  $('lensLegend').innerHTML = LENSES.map(l=>`<span style="--c:${l.c}">${l.name}</span>`).join('')+`<span style="--c:var(--rel)">Past donor bonus</span>`;
  $('undoBtn').onclick=undoLast; $('exportBtn').onclick=exportExcel;
  $('addLeadBtn').onclick=addLead; $('addOrgBtn').onclick=addOrg;
  $('addOrgToggle').onclick=()=>{ const r=$('addOrgRow'); r.hidden=!r.hidden; if(!r.hidden) $('newOrg').focus(); };
  $('saveWeights').onclick=saveWeights; $('resetWeights').onclick=()=>{viewW=null;renderAll();};
  $('scrim').onclick=closeDrawer;
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
  const links=[...document.querySelectorAll('#chapters a')];
  const io=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting) links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+en.target.id)); }),{rootMargin:'-45% 0px -50% 0px'});
  document.querySelectorAll('section.ch').forEach(s=>io.observe(s));
}

/* ================= writes ================= */
async function logChange(coll,id,field,oldVal){ try{ await db.collection('history').add({coll,docId:id,field,oldVal:oldVal===undefined?null:oldVal,ts:Date.now()}); }catch(e){} }
async function upd(coll,id,field,val,list){
  if(!db||!canWrite) return;
  const prev=(list||[]).find(x=>x.id===id); const old=prev?prev[field]:undefined;
  try{ await db.collection(coll).doc(id).update({[field]:val}); logChange(coll,id,field,old); flash(); }
  catch(e){ alert("That change didn't save. You may only have view access."); }
}
async function undoLast(){
  if(!db||!canWrite) return;
  try{
    const snap=await db.collection('history').orderBy('ts','desc').limit(1).get();
    if(snap.empty) return;
    const h=snap.docs[0], d=h.data();
    if(d.field==='__all') await db.doc(`${d.coll}/${d.docId}`).set(d.oldVal);
    else await db.collection(d.coll).doc(d.docId).update({[d.field]:d.oldVal});
    await db.collection('history').doc(h.id).delete(); flash();
  }catch(e){}
}

/* ================= render ================= */
function renderAll(){ renderHero(); renderLeads(); renderLenses(); renderShortlist(); renderArch(); if(openPartner) renderDrawer(); }

function renderHero(){
  if(!loaded.partners&&!loaded.matrix) return;
  const R=ranked(W());
  const longN=matrix.filter(m=>!m.archived).length;
  const top10=R.filter(r=>r.score!=null).slice(0,10);
  const warmTop=top10.filter(r=>isWarm(r.p)&&r.rank<=3);
  const rows=[
    {n:longN,lab:'companies on our list'},
    {n:partners.length,lab:'researched and scored'},
    {n:top10.length,lab:'in the top 10'},
    {n:leads.length,lab:'have given to GGE before',warm:true},
  ];
  let k=0; const sv=$('sieve');
  sv.innerHTML=rows.map(r=>`<div class="sv-row${r.warm?' warm':''}"><div class="sv-lab"><b class="num">${r.n}</b><span>${r.lab}</span></div><div class="sv-dots" aria-hidden="true">${Array.from({length:r.n},(_,i)=>`<i style="animation-delay:${(k++)*9}ms" class="${r.warm&&i<warmTop.length?'top':''}"></i>`).join('')}</div></div>`).join('');
  if(!sv.dataset.timer){ sv.dataset.timer='1'; setTimeout(()=>sv.classList.add('done'),2200); }
  if(warmTop.length){
    const names=warmTop.map(r=>shortName(r.p.name)), ranks=warmTop.map(r=>'#'+r.rank);
    $('heroNote').innerHTML = warmTop.length>1
      ? `<b>${esc(listJoin(names))}</b> have both given to GGE before, and they rank ${listJoin(ranks)} in our scoring. We'd contact them first.`
      : `<b>${esc(names[0])}</b> has given to GGE before and ranks ${ranks[0]} in our scoring. We'd contact them first.`;
  } else $('heroNote').textContent='';
}

/* ---------- 1. past donors ---------- */
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ym(s){const m=/^(\d{4})-(\d{2})$/.exec(s||'');return m?(+m[1])*12+(+m[2]-1):null;}
function ymStr(i){return `${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;}
function renderLeads(){
  if(!loaded.leads) return;
  const R=ranked(W());
  const rankOf=name=>{ const r=R.find(x=>x.p.name===name); return r?r.rank:null; };
  $('warmLede').textContent=`These ${leads.length} ${plural(leads.length,'company has','companies have')} given to GGE before, so they're the easiest place to start.`;
  if(!leads.length){ $('leads').innerHTML='<div class="empty">No past donors yet. Add one below.</div>'; return; }
  const dis=canWrite?'':'disabled';
  setHTML($('leads'),leads.map(l=>{
    const rk=l.linkedPartner?rankOf(l.linkedPartner):null;
    return `<article class="lead card${rk&&rk<=3?' feature':''}">
      ${rk&&rk<=3?`<div class="rk1">#${rk} in our scoring</div>`:''}
      <h3>${esc(l.company)}</h3>
      <div class="hist">${esc(l.history)}</div>
      <div class="ask"><b>Ask for:</b> ${esc(l.bestNextAsk)}<br><b>Next step:</b> ${esc(l.nextStep)}</div>
      <div class="row">
        <select ${dis} aria-label="Status" onchange="upd('leads','${l.id}','status',this.value,leads)">${STATUSES.map(s=>`<option ${s===l.status?'selected':''}>${s}</option>`).join('')}</select>
        <input ${dis} aria-label="Owner" value="${esc(l.owner)}" placeholder="Owner" onchange="upd('leads','${l.id}','owner',this.value,leads)">
      </div>
      <details class="more"><summary>More</summary><div class="grid2">
        <div><label class="l">Priority</label><select ${dis} onchange="upd('leads','${l.id}','priority',this.value,leads)">${['High','Medium','Low'].map(s=>`<option ${s===l.priority?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="l">Gift amount</label><div style="padding:7px 0">${esc(l.amountStatus)}</div></div>
        <div class="full"><label class="l">Notes</label><textarea ${dis} onchange="upd('leads','${l.id}','notes',this.value,leads)">${esc(l.notes)}</textarea></div>
      </div></details>
    </article>`;
  }).join(''));
}
async function addLead(){
  const name=$('newLead').value.trim(); if(!name||!db) return;
  const now=new Date(), i=now.getFullYear()*12+now.getMonth();
  try{ await db.collection('leads').add({company:name,history:'Past donor, details to confirm',bestNextAsk:'To decide',nextStep:'Confirm history and contact',priority:'Medium',timing:'',amountStatus:'Amount unknown',start:ymStr(i),end:ymStr(i+3),linkedPartner:'',status:'Not started',owner:'',notes:'',order:Date.now()}); $('newLead').value=''; flash(); }catch(err){}
}

/* ---------- 2. scoring sliders ---------- */
function setLens(id,pct){
  const w={...W()}; const ks=KPIS.filter(k=>k.lens===id);
  const cur=lensTotal(w,id), target=pct/100;
  const base=cur>0?w:DEFAULT_W, baseT=cur>0?cur:lensTotal(DEFAULT_W,id);
  ks.forEach(k=>w[k.k]=base[k.k]/baseT*target);
  viewW=w;
}
function renderLenses(){
  const w=W(); const tot=KPIS.reduce((a,k)=>a+w[k.k],0)||1;
  const list=$('lensList');
  if(!list.dataset.built){
    list.innerHTML=LENSES.map(l=>`<div class="lens card" style="--c:${l.c}"><div><h3>${l.name}</h3><p class="q">${l.q}</p></div><span class="share num" id="share-${l.id}"></span><input type="range" min="0" max="60" step="1" id="lw-${l.id}" aria-label="How much ${l.name} counts"><div class="muted" style="grid-column:1/-1;font-size:13px">Based on: ${KPIS.filter(k=>k.lens===l.id).map(k=>(/^[A-Z][a-z]/.test(k.label)?k.label[0].toLowerCase()+k.label.slice(1):k.label)).join(' and ')}</div></div>`).join('');
    LENSES.forEach(l=>$('lw-'+l.id).addEventListener('input',e=>{ setLens(l.id,+e.target.value); renderLenses(); renderShortlist(); renderHero(); renderLeads(); renderArch(); if(openPartner) renderDrawer(); }));
    list.dataset.built='1';
  }
  LENSES.forEach(l=>{ const t=lensTotal(w,l.id); const el=$('lw-'+l.id); if(document.activeElement!==el) el.value=Math.round(t*100); el.style.setProperty('--p',(el.value/60*100)+'%'); $('share-'+l.id).textContent=Math.round(t/tot*100)+'%'; });
  $('bonusVal').textContent='+'+(+(w.bonus??.25)).toFixed(2);
  $('weightsBar').classList.toggle('on',!!viewW&&KPIS.some(k=>Math.abs(viewW[k.k]-teamW[k.k])>1e-9));
  if(!loaded.partners) return;
  const R=ranked(w).filter(r=>r.score!=null).slice(0,5);
  const ol=$('watchList'); const before={};
  ol.querySelectorAll('li').forEach(li=>before[li.dataset.id]=li.getBoundingClientRect().top);
  ol.innerHTML=R.length?R.map(r=>`<li data-id="${r.p.id}" class="${isWarm(r.p)?'warm':''}"><b class="num">${r.rank}</b><span class="nm">${esc(r.p.name)}</span><span class="num">${r.score.toFixed(2)}</span></li>`).join(''):'<li><span></span><span class="muted">No scored companies yet.</span></li>';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    ol.querySelectorAll('li').forEach(li=>{ const b=before[li.dataset.id]; if(b==null) return; const d=b-li.getBoundingClientRect().top; if(!d) return;
      li.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'}); });
  }
}
function sbar(r){
  const pct=v=>(v/5*100).toFixed(2)+'%';
  return `<div class="sbar" role="img" aria-label="Score ${r.score.toFixed(2)} out of 5">${LENSES.map(l=>`<i style="width:${pct(r.lens[l.id])};background:${l.c}"></i>`).join('')}${r.bonus>0?`<i style="width:${pct(r.bonus)};background:var(--rel)"></i>`:''}</div>`;
}
async function saveWeights(){
  if(!db||!canWrite||!viewW) return;
  const old={...teamW};
  try{ await db.doc('settings/weights').set({...viewW}); viewW=null; flash(); logChange('settings','weights','__all',old); }
  catch(e){ alert("That didn't save. You may only have view access."); }
}

/* ---------- 3. top 10 ---------- */
function renderShortlist(){
  if(!loaded.partners) return;
  const R=ranked(W()), scored=R.filter(r=>r.score!=null), top10=scored.slice(0,10);
  const stats=[];
  if(top10.length){
    const counts={}; top10.forEach(r=>{ const a=r.p.archetype||'Not sorted yet'; counts[a]=(counts[a]||0)+1; });
    const [arch,cn]=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    stats.push({c:'var(--c1)',n:cn,t:`are ${arch.toLowerCase()}`});
    const local=top10.filter(r=>(kpiScores(r.p).s.presence||0)>=4).length;
    stats.push({c:'var(--c3)',n:local,t:'have their headquarters in NYC or Brooklyn'});
    const open=top10.filter(r=>(kpiScores(r.p).s.access||0)>=4).length;
    stats.push({c:'var(--rel)',n:open,t:'take requests any time or have a contact we already know'});
  }
  $('insights').innerHTML=stats.map(s=>`<div class="insight card" style="--c:${s.c}"><b class="num">${s.n} of ${top10.length}</b>${esc(s.t)}</div>`).join('');
  const list=showAll?R:top10;
  if(!list.length){ $('rankList').innerHTML='<div class="empty" style="border:0">No companies scored yet.</div>'; $('rankFoot').innerHTML=''; return; }
  $('rankList').innerHTML=list.map(r=>`<button class="rk" onclick="openDrawer('${r.p.id}')">
      <span class="r num">${r.rank??'–'}</span>
      <span class="nm">${esc(r.p.name)}${isWarm(r.p)?'<span class="pd">Past donor</span>':''}<small>${esc(r.p.archetype||'Type not set')}</small></span>
      ${r.score!=null?sbar(r):'<span class="muted" style="font-size:13px">Needs more info</span>'}
      <span class="sc num">${r.score!=null?r.score.toFixed(2):''}</span></button>`).join('');
  const dis=canWrite?'':'disabled';
  $('rankFoot').innerHTML=`<button class="link" onclick="showAll=!showAll;renderShortlist()">${showAll?'Show top 10 only':`See all ${R.length}`}</button>${showAll?` <span class="muted">or</span> <button class="link" ${dis} onclick="addPartner()">add a company</button>`:''}`;
}
function blankPartner(name,extra){ return {name,archetype:'',why:'',order:Date.now(),employees:'',revenueM:'',givingM:'',matchCap:'',presence:'',lifetimeGiving:0,lastGiftYear:'',mission:'',commitment:'',typicalGift:'',access:'',notes:'',pathways:Object.fromEntries(PATHS.map(p=>[p.k,false])),peers:Object.fromEntries(PEERS.map(p=>[p.k,false])),...extra}; }
async function addPartner(){
  const name=(prompt('Company name')||'').trim(); if(!name||!db) return;
  try{ const ref=await db.collection('partners').add(blankPartner(name)); flash(); openDrawer(ref.id,true); }catch(e){}
}

/* ---------- company detail ---------- */
function openDrawer(id,edit){ openPartner=id; drawerEdit=!!edit; renderDrawer(true); $('drawer').classList.add('on'); $('scrim').classList.add('on'); document.body.style.overflow='hidden'; setTimeout(()=>$('dClose')?.focus(),60); }
function closeDrawer(){ if(!openPartner) return; openPartner=null; $('drawer').classList.remove('on'); $('scrim').classList.remove('on'); document.body.style.overflow=''; }
const SHORT = {
  presence:["No NYC presence","Sells in NYC only","NYC office or store","NYC headquarters","Brooklyn headquarters"],
  mission:["No related giving","General community giving","Funds youth or women","Funds one GGE focus area","Funds girls / youth of color, or a peer org"],
  commitment:["None found","Informal or occasional","Corporate foundation","Public pledge","Foundation and pledge"],
  access:["Invite only","Very competitive national portal","Yearly application","Rolling or open form","Named contact or warm intro"],
};
function factText(p,k,c){
  const t=(list,key)=>{ const i=tier(list,p[key]); return i?SHORT[key][i-1]:'Unknown'; };
  switch(k.k){
    case 'presence': return t(PRESENCE,'presence');
    case 'mission': return t(MISSION,'mission');
    case 'commitment': return t(COMMIT,'commitment');
    case 'access': return t(ACCESS,'access');
    case 'gpe': return c.gpe==null?'Unknown':money(c.gpe)+' a year';
    case 'giftSize': return asNum(p.typicalGift)==null?'Unknown':money(asNum(p.typicalGift));
    case 'matchCap': { const m=asNum(p.matchCap); return m==null?'Unknown':m===0?'No match':'Up to '+money(m)+' a year'; }
    case 'pathways': return c.pathwayCount+' of 6';
  }
}
function renderDrawer(force){
  const p=partners.find(x=>x.id===openPartner); const el=$('drawer');
  if(!p){ if(loaded.partners&&!force) closeDrawer(); return; }
  if(!force&&editingIn(el)){ el.dataset.stale='1'; return; }
  const w=W(), r=ranked(w).find(x=>x.p.id===p.id), c=kpiScores(p);
  const dis=canWrite?'':'disabled';
  const pips=(n,col)=>`<span class="pips" style="--c:${col}" title="${n==null?'Skipped, no info':n+' out of 5'}">${[1,2,3,4,5].map(i=>`<i class="${n!=null&&i<=n?'on':''}"></i>`).join('')}</span>`;
  const sel=(field,list,label)=>`<select ${dis} aria-label="${label}" onchange="upd('partners','${p.id}','${field}',this.value,partners)"><option value="">Unknown</option>${list.map((o,i)=>`<option value="${esc(o)}" ${o===String(p[field]||'').trim()?'selected':''}>${esc(SHORT[field][i])}</option>`).join('')}</select>`;
  const inp=(field,label,ph)=>`<input ${dis} aria-label="${label}" value="${esc(isNA(p[field])?'':p[field])}" placeholder="${ph||'Unknown'}" onchange="updPartnerVal('${p.id}','${field}',this.value)">`;
  const editCell=k=>{
    switch(k.k){
      case 'presence': return sel('presence',PRESENCE,'NYC presence');
      case 'mission': return sel('mission',MISSION,'Mission fit');
      case 'commitment': return sel('commitment',COMMIT,'Formal giving');
      case 'access': return sel('access',ACCESS,'How to apply');
      case 'giftSize': return inp('typicalGift','Typical gift in dollars','$ e.g. 25000');
      case 'matchCap': return inp('matchCap','Employee match cap in dollars','$ per year, 0 if none');
      default: return `<span class="v">${esc(factText(p,k,c))}</span>`;
    }
  };
  const archs=[...new Set(partners.map(x=>x.archetype).concat(archetypes.map(a=>a.archetype)).filter(Boolean))].sort();
  el.innerHTML=`<div class="d-top"><button class="btn" ${dis} onclick="drawerEdit=!drawerEdit;renderDrawer(true)">${drawerEdit?'Done':'Edit'}</button><button class="btn" id="dClose" onclick="closeDrawer()">Close</button></div>
    <div class="muted" style="font-size:14px">${esc(p.archetype||'Type not set')}${isWarm(p)?', past GGE donor':''}</div>
    <h3 id="dTitle">${esc(p.name)}</h3>
    ${p.why&&!drawerEdit?`<p>${esc(p.why)}</p>`:''}
    <div class="d-score"><b class="num">${r&&r.score!=null?r.score.toFixed(2):'–'}</b><span class="muted">${r&&r.rank?`out of 5, ranked ${r.rank} of ${partners.length}`:'Add more info to score this company'}</span></div>
    ${r&&r.score!=null?sbar(r):''}
    ${LENSES.map(l=>`<div class="d-lens card" style="--c:${l.c}"><h4><span>${l.name}</span>${r&&r.score!=null?`<span class="num">+${r.lens[l.id].toFixed(2)}</span>`:''}</h4>
      ${KPIS.filter(k=>k.lens===l.id).map(k=>`<div class="d-fact"><span>${k.label}</span>${drawerEdit?editCell(k):`<span class="v">${esc(factText(p,k,c))}</span>`}${pips(r?.s[k.k],l.c)}</div>`).join('')}
      ${drawerEdit&&l.id==='commit'?`<div class="grid2" style="margin-top:6px"><div><label class="l">Employees</label>${inp('employees','Employees')}</div><div><label class="l">Yearly giving ($M)</label>${inp('givingM','Yearly giving in millions')}</div></div>`:''}
      ${drawerEdit&&l.id==='prog'?`<div class="toggles" style="--c:${l.c}">${PATHS.map(x=>`<label><input type="checkbox" ${dis} ${p.pathways&&p.pathways[x.k]?'checked':''} onchange="updNested('${p.id}','pathways','${x.k}',this.checked)">${x.short}</label>`).join('')}</div>`:''}
    </div>`).join('')}
    <div class="d-lens card" style="--c:var(--rel)"><h4><span>Past donor bonus</span>${r&&r.bonus>0?`<span class="num">+${r.bonus.toFixed(2)}</span>`:''}</h4>
      ${drawerEdit?`<div class="grid2"><div><label class="l">Given to GGE ($)</label>${inp('lifetimeGiving','Total given to GGE','0')}</div><div><label class="l">Last gift (year)</label>${inp('lastGiftYear','Last gift year','Never')}</div></div>`
      :`<div class="d-fact"><span>Given to GGE</span><span class="v">${isWarm(p)?money(Number(p.lifetimeGiving))+(asNum(p.lastGiftYear)?', last in '+p.lastGiftYear:''):'Not yet'}</span><span></span></div>`}
    </div>
    ${p.notes&&!drawerEdit?`<div class="fld"><label class="l">Research notes</label><p style="font-size:14.5px">${esc(p.notes)}</p></div>`:''}
    ${drawerEdit?`
    <div class="fld"><label class="l" for="dName">Company name</label><input id="dName" ${dis} value="${esc(p.name)}" onchange="upd('partners','${p.id}','name',this.value,partners)"></div>
    <div class="fld"><label class="l" for="dArch">Type of company</label><input id="dArch" ${dis} list="archList" value="${esc(p.archetype||'')}" onchange="upd('partners','${p.id}','archetype',this.value,partners)"><datalist id="archList">${archs.map(a=>`<option value="${esc(a)}">`).join('')}</datalist></div>
    <div class="fld"><label class="l" for="dWhy">Why they're a fit</label><textarea id="dWhy" ${dis} onchange="upd('partners','${p.id}','why',this.value,partners)">${esc(p.why||'')}</textarea></div>
    <div class="fld"><label class="l" for="dNotes">Research notes</label><textarea id="dNotes" ${dis} onchange="upd('partners','${p.id}','notes',this.value,partners)">${esc(p.notes||'')}</textarea></div>
    <p class="muted" style="font-size:13px;margin-top:10px">If you don't know something, leave it blank. It won't count against the company.</p>
    <div class="fld" style="text-align:right"><button class="btn" ${dis} onclick="removePartner('${p.id}')">Remove from scoring</button></div>`:''}`;
  delete el.dataset.stale;
}
function updPartnerVal(id,field,raw){
  let v=raw.trim();
  if(v===''){ v=field==='lifetimeGiving'?0:''; }
  else if(v.toUpperCase()==='N/A'||v.toLowerCase()==='unknown'){ v='N/A'; }
  else { const n=Number(v.replace(/[$,\s]/g,'')); if(isFinite(n)) v=n; }
  upd('partners',id,field,v,partners);
}
async function updNested(id,group,key,val){
  if(!db||!canWrite) return;
  const p=partners.find(x=>x.id===id);
  const keys=(group==='pathways'?PATHS:PEERS).map(x=>x.k);
  const old=Object.fromEntries(keys.map(k=>[k,!!(p&&p[group]&&p[group][k])]));
  try{ await db.collection('partners').doc(id).update({[group]:{[key]:val}}); logChange('partners',id,group,old); flash(); }catch(e){}
}
async function removePartner(id){
  const p=partners.find(x=>x.id===id); if(!p||!confirm(`Remove ${p.name} from scoring? Undo can't bring it back.`)) return;
  try{ await db.collection('partners').doc(id).delete(); closeDrawer(); flash(); }catch(e){}
}

/* ---------- 4. what to ask for ---------- */
function renderArch(){
  if(!loaded.archetypes||!loaded.partners) return;
  const R=ranked(W()).filter(r=>r.score!=null);
  const dis=canWrite?'':'disabled';
  const items=archetypes.map(a=>({a,m:R.filter(r=>r.p.archetype===a.archetype)}));
  const pos=v=>((v-1)/4*100).toFixed(2)+'%';
  setHTML($('arch'),items.length?items.map(({a,m})=>`<div class="ar card">
      <h3>${esc(a.archetype)}</h3>
      <div class="muted" style="font-size:14.5px">${m.length} ${plural(m.length,'company','companies')} scored</div>
      ${m.length?`<ol class="leaders">${m.slice(0,3).map((r,i)=>`<li class="${i===0?'first':''}"><button onclick="openDrawer('${r.p.id}')"><span class="pos num">${i+1}</span><span class="who">${esc(r.p.name)}${isWarm(r.p)?'<span class="pd">Past donor</span>':''}</span><span class="num muted">#${r.rank} overall</span><b class="num">${r.score.toFixed(2)}</b></button></li>`).join('')}</ol>`:''}
      <div class="strip">${m.slice().reverse().map((r,i,arr)=>`<i class="${i===arr.length-1?'top':''}" style="left:${pos(r.score)}" title="${esc(r.p.name)}: ${r.score.toFixed(2)}"></i>`).join('')}</div>
      <div class="axis"><span>Score 1</span><span>5</span></div>
      <p class="tip"><b>Ask for ${esc((a.bestChannel||'').toLowerCase())} first</b>${a.secondChannel?`, then ${esc(a.secondChannel.toLowerCase())}`:''}. ${esc(a.leadWith)}</p>
      <details class="more"><summary>Edit</summary><div class="grid2">
        <div><label class="l">Ask for first</label><input ${dis} value="${esc(a.bestChannel)}" onchange="upd('archetypes','${a.id}','bestChannel',this.value,archetypes)"></div>
        <div><label class="l">Then</label><input ${dis} value="${esc(a.secondChannel)}" onchange="upd('archetypes','${a.id}','secondChannel',this.value,archetypes)"></div>
        <div class="full"><label class="l">Notes</label><textarea ${dis} onchange="upd('archetypes','${a.id}','leadWith',this.value,archetypes)">${esc(a.leadWith)}</textarea></div>
      </div></details>
    </div>`).join(''):'<div class="empty">No company types yet.</div>');
}

/* ---------- 5. all companies ---------- */
const st=(c,k)=>c[k]||'no';
function renderMatrix(){
  if(!loaded.matrix) return;
  const q=$('mxSearch').value.toLowerCase(), cat=$('mxCat').value, arch=$('mxArchived').checked;
  const list=matrix.filter(c=>{
    if(!!c.archived!==arch) return false;
    if(cat&&c.category!==cat) return false;
    if(q&&![c.name,c.category,c.contactInfo,c.partnershipNotes,c.internalNotes,...Object.values(c.oppNotes||{})].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const open=new Set([...document.querySelectorAll('.mrow.open')].map(r=>r.dataset.id));
  const dis=canWrite?'':'disabled';
  const scored=new Set(partners.map(p=>p.name.toLowerCase()));
  const cats=CATEGORIES.concat([...new Set(list.map(c=>c.category).filter(c=>!CATEGORIES.includes(c)))]);
  let html='';
  cats.forEach(cg=>{
    const items=list.filter(c=>c.category===cg); if(!items.length) return;
    html+=`<div class="cat">${esc(cg||'No category')} <span>${items.length}</span></div>`;
    items.forEach(c=>{
      const offers=PATHS.filter(p=>st(c,p.k)==='yes').map(p=>p.short);
      const maybe=PATHS.filter(p=>st(c,p.k)==='unclear').map(p=>p.short);
      const isOpen=open.has(c.id);
      html+=`<div class="mrow${isOpen?' open':''}" data-id="${c.id}" style="${c.archived?'opacity:.6':''}">
        <button class="mhead" onclick="const r=this.parentElement;r.classList.toggle('open');this.setAttribute('aria-expanded',r.classList.contains('open'))" aria-expanded="${isOpen}">
          <span class="nm">${esc(c.name)}</span>
          <span class="offers">${offers.length?esc(offers.join(', ')):''}${maybe.length?`${offers.length?'; ':''}maybe ${esc(maybe.join(', ').toLowerCase())}`:''}</span>
          ${scored.has(c.name.toLowerCase())?'<span class="tag">Scored</span>':''}
        </button>
        <div class="mbody">
          <div class="mgrid">${PATHS.map(p=>`<div><label class="l">${p.long}</label><select ${dis} onchange="upd('matrix','${c.id}','${p.k}',this.value,matrix)"><option value="no" ${st(c,p.k)==='no'?'selected':''}>No</option><option value="yes" ${st(c,p.k)==='yes'?'selected':''}>Yes</option><option value="unclear" ${st(c,p.k)==='unclear'?'selected':''}>Maybe</option></select>${c.oppNotes&&c.oppNotes[p.k]?`<div class="oppnote">${esc(c.oppNotes[p.k])}</div>`:''}</div>`).join('')}
            <div class="full"><label class="l">Contact</label><input ${dis} value="${esc(c.contactInfo)}" onchange="upd('matrix','${c.id}','contactInfo',this.value,matrix)"></div>
            <div class="full"><label class="l">Notes</label><textarea ${dis} onchange="upd('matrix','${c.id}','partnershipNotes',this.value,matrix)">${esc(c.partnershipNotes)}</textarea></div>
            <div class="full"><label class="l">Still need to check</label><textarea ${dis} onchange="upd('matrix','${c.id}','internalNotes',this.value,matrix)">${esc(c.internalNotes)}</textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn" ${dis} onclick="toModel('${c.id}')">${scored.has(c.name.toLowerCase())?'See score':'Score this company'}</button>
            <button class="btn" ${dis} onclick="upd('matrix','${c.id}','archived',${!c.archived},matrix)">${c.archived?'Restore':'Archive'}</button>
          </div>
        </div></div>`;
    });
  });
  setHTML($('mxBody'),html||`<div class="empty" style="border:0">${matrix.length?'No matches.':'No companies yet. Add one above.'}</div>`);
}
async function addOrg(){
  const name=$('newOrg').value.trim(); if(!name||!db) return;
  try{ await db.collection('matrix').add({name,category:$('newOrgCat').value,order:Date.now()}); $('newOrg').value=''; $('addOrgRow').hidden=true; flash(); }catch(e){}
}
async function toModel(id){
  const c=matrix.find(x=>x.id===id); if(!c||!db) return;
  const ex=partners.find(p=>p.name.toLowerCase()===c.name.toLowerCase());
  if(ex){ openDrawer(ex.id); return; }
  const pw=Object.fromEntries(PATHS.map(p=>[p.k,st(c,p.k)==='yes']));
  try{ const ref=await db.collection('partners').add(blankPartner(c.name,{why:c.partnershipNotes||'',pathways:pw})); flash(); openDrawer(ref.id,true); }catch(e){}
}

/* ================= export ================= */
async function exportExcel(){
  const btn=$('exportBtn'), orig='Export to Excel';
  const fail=t=>{btn.textContent=t;setTimeout(()=>btn.textContent=orig,2200);};
  if(typeof XLSX==='undefined') return fail('Export unavailable');
  let dl=null; try{ dl=await claude.use('downloads'); }catch(e){}
  if(!dl) return fail("Can't export here");
  btn.disabled=true; btn.textContent='Preparing…';
  try{
    const wb=XLSX.utils.book_new(), w=teamW, yn=v=>v?'x':'';
    const R=ranked(w);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(R.map(r=>({
      Rank:r.rank??'N/A', Company:r.p.name, Archetype:r.p.archetype||'',
      ...Object.fromEntries(KPIS.map(k=>[k.label+' (1-5)', r.s[k.k]??'N/A'])),
      'Past GGE Donor Bonus':+r.bonus.toFixed(2), 'Cumulative Weighted Score':r.score!=null?+r.score.toFixed(4):'N/A'
    }))),'Partner Scoring');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(partners.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(p=>{ const kc=kpiScores(p); return {
      Company:p.name, Archetype:p.archetype||'', "Why They're a Fit":p.why||'', 'Employees (#)':p.employees, 'Annual Revenue ($M)':p.revenueM, 'Annual Charitable Giving ($M)':p.givingM,
      ...Object.fromEntries(PATHS.map(x=>[x.long,yn(p.pathways&&p.pathways[x.k])])), 'Total Pathways':kc.pathwayCount,
      'Matching Gift Cap ($/employee/yr)':p.matchCap, ...Object.fromEntries(PEERS.map(x=>[x.label,yn(p.peers&&p.peers[x.k])])), 'Peer Orgs Sponsored':PEERS.filter(x=>p.peers&&p.peers[x.k]).length,
      'NYC / Brooklyn Presence':p.presence||'', 'Lifetime Giving to GGE ($)':p.lifetimeGiving, 'Most Recent Gift Year (blank = never)':p.lastGiftYear,
      'Mission Alignment':p.mission||'', 'Formal Giving Commitment':p.commitment||'', 'Giving per Employee ($)':kc.gpe==null?'N/A':+kc.gpe.toFixed(2),
      'Typical Gift Size ($, median grant)':p.typicalGift, 'Ease of Access':p.access||'', 'Scoring Notes':p.notes||'' }; })),'Prospective Partners');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(KPIS.map(k=>({KPI:k.label, Area:LENSES.find(l=>l.id===k.lens).name, Weight:+w[k.k].toFixed(4)})).concat([{KPI:'Past GGE donor bonus',Area:'Bonus',Weight:w.bonus}])),'Scoring Weights');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(leads.map(l=>({Company:l.company,History:l.history,'Best next ask':l.bestNextAsk,'Next step':l.nextStep,Priority:l.priority,Timing:l.timing,'Window start':l.start,'Window end':l.end,'Amount status':l.amountStatus,Status:l.status,Owner:l.owner,Notes:l.notes}))),'Past Relationships');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(archetypes.map(a=>({Archetype:a.archetype,'Best channel':a.bestChannel,'Second channel':a.secondChannel,'What to lead with':a.leadWith}))),'Archetypes');
    const ox=v=>v==='yes'?'Yes':v==='unclear'?'Possible':'';
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(matrix.map(c=>({Company:c.name,Category:c.category,...Object.fromEntries(PATHS.map(p=>[p.long,ox(c[p.k])+(c.oppNotes&&c.oppNotes[p.k]?` (${c.oppNotes[p.k]})`:'')])),'Flagged in Original PDF':c.flagged?'Yes':'',Archived:c.archived?'Yes':'','Contact Info':c.contactInfo||'','Partnership Notes':c.partnershipNotes||'','Internal Notes / Needs Verification':c.internalNotes||''}))),'Corporate Engagement Matrix');
    const buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    await dl.save({filename:`GGE_Corporate_Engagement_${new Date().toISOString().slice(0,10)}.xlsx`,data:new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});
  }catch(e){}
  btn.disabled=false; btn.textContent=orig;
}

init();
