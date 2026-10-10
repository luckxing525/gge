/* Local stand-in for the claude.ai shared database.
   The site was first built as a claude.ai artifact, where edits were shared by everyone.
   On a normal host like Vercel there is no shared database, so this file:
   - loads the starting data from data.js (window.GGE_DATA)
   - saves any edits in this browser only (localStorage)
   To share edits with your team on Vercel you would need a real backend
   (for example Supabase or Firebase) in place of this file. */
(function(){
  const KEY='gge-dashboard-data-v1';
  const clone=o=>JSON.parse(JSON.stringify(o));
  let store;
  try{ store=JSON.parse(localStorage.getItem(KEY)); }catch(e){ store=null; }
  if(!store||typeof store!=='object') store=clone(window.GGE_DATA||{});
  const save=()=>{ try{ localStorage.setItem(KEY,JSON.stringify(store)); }catch(e){} };
  const listeners=[];
  const fire=()=>{ save(); listeners.forEach(l=>{ try{ l(); }catch(e){} }); };
  const coll=n=>(store[n]=store[n]||{});
  const docSnap=(n,id)=>({id,exists:!!coll(n)[id],data:()=>coll(n)[id]});
  function deepMerge(a,b){
    const out={...(a||{})};
    for(const [k,v] of Object.entries(b)){
      out[k]=(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object')?deepMerge(out[k],v):v;
    }
    return out;
  }
  function query(n){
    let field=null, dir='asc', lim=null;
    const run=()=>{
      let docs=Object.keys(coll(n)).map(id=>docSnap(n,id));
      if(field) docs.sort((x,y)=>{ const a=x.data()[field]??0, b=y.data()[field]??0; return (a>b?1:a<b?-1:0)*(dir==='desc'?-1:1); });
      if(lim) docs=docs.slice(0,lim);
      return {docs,size:docs.length,empty:!docs.length};
    };
    const q={
      orderBy(f,d){ field=f; dir=d||'asc'; return q; },
      limit(k){ lim=k; return q; },
      get: async()=>run(),
      onSnapshot(cb){ const l=()=>cb(run()); listeners.push(l); setTimeout(l,0); return ()=>{}; },
      add: async(d)=>{ const id='x'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); coll(n)[id]=clone(d); fire(); return {id}; },
      doc(id){ return docRef(n,id); }
    };
    return q;
  }
  function docRef(n,id){
    return {
      id,
      get: async()=>docSnap(n,id),
      set: async(d)=>{ coll(n)[id]=clone(d); fire(); },
      update: async(u)=>{ if(!coll(n)[id]) throw new Error('missing'); coll(n)[id]=deepMerge(coll(n)[id],clone(u)); fire(); },
      delete: async()=>{ delete coll(n)[id]; fire(); },
      onSnapshot(cb){ const l=()=>cb(docSnap(n,id)); listeners.push(l); setTimeout(l,0); return ()=>{}; }
    };
  }
  const db={ collection:query, doc(path){ const [c,id]=path.split('/'); return docRef(c,id); } };
  const user={ can: async()=>true };
  const downloads={ save: async({filename,data})=>{
    const blob=data instanceof Blob?data:new Blob([data]);
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000); return {status:'saved'};
  }};
  window.claude={ use: async name=> name==='db'?db : name==='user'?user : name==='downloads'?downloads : null };
  window.ggeResetLocal=function(){
    if(!confirm('Clear your edits in this browser and go back to the original data?')) return;
    try{ localStorage.removeItem(KEY); }catch(e){}
    location.reload();
  };
})();
