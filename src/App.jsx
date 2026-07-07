import { useState, useEffect, useCallback, useRef } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SB_URL = "https://bhuicxxirvgjtuvpmalq.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodWljeHhpcnZnanR1dnBtYWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNTY3MzEsImV4cCI6MjA5ODkzMjczMX0.p_Pz1ujsKxJQ0DIPrPVWrZf5m1Ia01u9rEi0wM-r5dc";
const HG = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` };
const HP = { ...HG, "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates" };

const SB = {
  async ping() {
    try { const r = await fetch(`${SB_URL}/rest/v1/propiel_goals?limit=1&select=branch_id`, {headers:HG}); return r.ok; }
    catch { return false; }
  },
  // Transactions
  async getTxns(bid, y, m) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/propiel_transactions?branch_id=eq.${bid}&year=eq.${y}&month=eq.${m}&select=id,day,amount&order=created_at.asc`, {headers:HG});
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },
  async getAllTxns(y, m) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/propiel_transactions?year=eq.${y}&month=eq.${m}&select=id,branch_id,day,amount&order=created_at.asc`, {headers:HG});
      return r.ok ? await r.json() : [];
    } catch { return []; }
  },
  async insertTxn(txn) {
    try { const r = await fetch(`${SB_URL}/rest/v1/propiel_transactions`, {method:"POST",headers:HP,body:JSON.stringify(txn)}); return r.ok; }
    catch { return false; }
  },
  async deleteTxn(id) {
    try { const r = await fetch(`${SB_URL}/rest/v1/propiel_transactions?id=eq.${encodeURIComponent(id)}`, {method:"DELETE",headers:HG}); return r.ok; }
    catch { return false; }
  },
  // Goals
  async getAllGoals(y, m) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/propiel_goals?year=eq.${y}&month=eq.${m}&select=branch_id,goal,offset_amount`, {headers:HG});
      return r.ok ? await r.json() : [];
    } catch { return []; }
  },
  async upsertGoal(bid, y, m, goal, offset) {
    try { const r = await fetch(`${SB_URL}/rest/v1/propiel_goals`, {method:"POST",headers:HP,body:JSON.stringify({branch_id:bid,year:y,month:m,goal,offset_amount:offset})}); return r.ok; }
    catch { return false; }
  },
  // Year-level for historial
  async getYearData(y) {
    try {
      const [tr, gr] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/propiel_transactions?year=eq.${y}&select=branch_id,month,amount`, {headers:HG}),
        fetch(`${SB_URL}/rest/v1/propiel_goals?year=eq.${y}&select=branch_id,month,goal,offset_amount`, {headers:HG}),
      ]);
      return { txns: tr.ok ? await tr.json() : [], goals: gr.ok ? await gr.json() : [] };
    } catch { return {txns:[],goals:[]}; }
  },
};

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────
let _q = [];
let _ql = new Set();
let _qs = false;
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

function qAdd(action, data) { _q.push({qid:genId(),action,data}); _ql.forEach(fn=>fn(_q.length)); }

async function qFlush() {
  if (_qs||_q.length===0) return 0;
  _qs=true; let n=0;
  for (const item of [..._q]) {
    let ok=false;
    try {
      if (item.action==="insert") ok=await SB.insertTxn(item.data);
      else if (item.action==="delete") ok=await SB.deleteTxn(item.data.id);
    } catch {}
    if (ok) { _q=_q.filter(q=>q.qid!==item.qid); n++; }
  }
  _qs=false;
  if (n>0) _ql.forEach(fn=>fn(_q.length));
  return n;
}

function useQCount() {
  const [c,setC]=useState(_q.length);
  useEffect(()=>{ _ql.add(setC); return ()=>_ql.delete(setC); },[]);
  return c;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const BRANCHES = [
  {id:"fresno",      name:"Fresno",          city:"Torreón",   color:"#10B981"},
  {id:"santabarbara",name:"505 Sta. Bárbara", city:"Torreón",   color:"#8B5CF6"},
  {id:"italia",      name:"Italia",           city:"Torreón",   color:"#F59E0B"},
  {id:"gomez",       name:"Gómez",            city:"Torreón",   color:"#EF4444"},
  {id:"tec",         name:"TEC",              city:"Torreón",   color:"#6366F1"},
  {id:"tabachines",  name:"Tabachines",       city:"Torreón",   color:"#14B8A6"},
  {id:"vasconcelos", name:"Vasconcelos",      city:"Monterrey", color:"#F97316"},
  {id:"chipinque",   name:"Chipinque",        city:"Monterrey", color:"#EC4899"},
];
const MES   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIES  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const DIEF  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const PIN   = "propiel2026";
const QUICK = [200,500,800,1000,1500,2000];

// ─── UTILS ───────────────────────────────────────────────────────────────────
const now     = () => { const d=new Date(); return {y:d.getFullYear(),m:d.getMonth(),day:d.getDate(),dow:d.getDay()}; };
const daysInM = (y,m) => new Date(y,m+1,0).getDate();
const fmt$    = n => `$${Math.round(n).toLocaleString("es-MX")}`;
const pctOf   = (a,b) => b>0?Math.min(200,(a/b)*100):0;
const isSun   = (y,m,d) => new Date(y,m,d).getDay()===0;
const amt     = v => parseFloat(v)||0;

function workDaysLeft(y,m,from) {
  const tot=daysInM(y,m); let n=0;
  for (let d=from;d<=tot;d++) if(!isSun(y,m,d)) n++;
  return Math.max(1,n);
}

// txns = array of {id, day, amount}
function computeStats(txns=[], goal=0, dayNum, y, m, offset=0) {
  if (!goal) return {goal:0,todayTotal:0,accumulated:0,dailyGoal:0,pctMonth:0,pctDay:0,todayTxns:[],monthTotal:0,isSunday:false};
  const sunday=isSun(y,m,dayNum);
  let accumulated=offset;
  for (const t of txns) if (t.day<dayNum) accumulated+=amt(t.amount);
  const todayTxns=txns.filter(t=>t.day===dayNum);
  const todayTotal=todayTxns.reduce((s,t)=>s+amt(t.amount),0);
  const dLeft=sunday?workDaysLeft(y,m,dayNum+1):workDaysLeft(y,m,dayNum);
  const rem=Math.max(0,goal-accumulated);
  const dailyGoal=sunday?0:rem/dLeft;
  const monthTotal=accumulated+todayTotal;
  return {goal,todayTotal,accumulated,dailyGoal,todayTxns,monthTotal,isSunday:sunday,
    pctMonth:pctOf(monthTotal,goal), pctDay:sunday?0:pctOf(todayTotal,dailyGoal)};
}

function statusFor(p) {
  if (p>=100) return {emoji:"🏆",msg:"¡Meta del día lograda!"};
  if (p>=80)  return {emoji:"🔥",msg:"¡Casi llegas!"};
  if (p>=50)  return {emoji:"💪",msg:"¡Vas muy bien!"};
  if (p>=25)  return {emoji:"⚡",msg:"Hay que acelerar."};
  return        {emoji:"🎯",msg:"¡Arranca!"};
}
const arcColor = p => p>=100?"#10B981":p>=75?"#22C55E":p>=45?"#F59E0B":"#EF4444";

// ─── RING ─────────────────────────────────────────────────────────────────────
function Ring({pct,size=220,sw=18,color,children}) {
  const r=(size-sw)/2,circ=2*Math.PI*r,dash=circ*Math.min(pct,100)/100;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)",display:"block"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw}/>
        {pct>0&&<circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)"}}/>}
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
        {children}
      </div>
    </div>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function Landing({onSelect,onManager}) {
  const t=now();
  const [conn,setConn]=useState(null);
  const qc=useQCount();
  useEffect(()=>{SB.ping().then(setConn);},[]);

  const connColor=conn===null?"#555":conn?"#10B981":"#EF4444";
  const connText=conn===null?"Conectando...":conn?"Base de datos OK":"⚠️ Sin conexión — modo offline";

  return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 20px",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.bc{transition:all .18s}.bc:hover{transform:translateY(-2px)}`}</style>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:44}}>
        <div style={{fontSize:11,letterSpacing:5,color:"#444",textTransform:"uppercase",marginBottom:8}}>Propiel</div>
        <div style={{fontSize:30,fontWeight:800,color:"#fff",letterSpacing:-1}}>Tablero de Metas</div>
        <div style={{fontSize:13,color:"#444",marginTop:6}}>{MES[t.m]} {t.y}</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:connColor}}/>
          <span style={{fontSize:11,color:connColor}}>{connText}</span>
        </div>
        {qc>0&&<div style={{marginTop:6,fontSize:11,color:"#F59E0B"}}>⏳ {qc} venta(s) pendiente(s) de sincronizar</div>}
      </div>
      <div style={{width:"100%",maxWidth:460}}>
        {[{label:"Torreón",list:BRANCHES.filter(b=>b.city==="Torreón")},{label:"Monterrey",list:BRANCHES.filter(b=>b.city==="Monterrey")}].map(({label,list})=>(
          <div key={label} style={{marginBottom:24}}>
            <div style={{fontSize:10,letterSpacing:3,color:"#3a3a3a",textTransform:"uppercase",marginBottom:10}}>{label}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {list.map(b=>(
                <button key={b.id} className="bc" onClick={()=>onSelect(b)}
                  style={{background:"#111",border:`1px solid ${b.color}22`,borderRadius:14,padding:"18px 16px",cursor:"pointer",textAlign:"left"}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:b.color,marginBottom:12,boxShadow:`0 0 8px ${b.color}66`}}/>
                  <div style={{color:"#fff",fontWeight:600,fontSize:15,lineHeight:1.2}}>{b.name}</div>
                  <div style={{color:"#444",fontSize:11,marginTop:4}}>{b.city}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={onManager}
          style={{width:"100%",background:"transparent",border:"1px solid #222",borderRadius:12,padding:"13px",color:"#444",fontSize:13,cursor:"pointer",transition:"all .15s",marginTop:8}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#444";e.currentTarget.style.color="#888";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#222";e.currentTarget.style.color="#444";}}>
          Vista Gerente →
        </button>
      </div>
    </div>
  );
}

// ─── BRANCH VIEW ──────────────────────────────────────────────────────────────
function BranchView({branch,onBack}) {
  const t=now();
  const [txns,setTxns]=useState([]);
  const [goal,setGoal]=useState(0);
  const [offset,setOffset]=useState(0);
  const [loading,setLoading]=useState(true);
  const [online,setOnline]=useState(true);
  const [input,setInput]=useState("");
  const [party,setParty]=useState(false);
  const [flash,setFlash]=useState(false);
  const inputRef=useRef(null);
  const qc=useQCount();

  const load=useCallback(async()=>{
    const [txnData,goals]=await Promise.all([
      SB.getTxns(branch.id,t.y,t.m),
      SB.getAllGoals(t.y,t.m),
    ]);
    const ok=txnData!==null;
    setOnline(ok);
    if (ok) setTxns(txnData);
    const g=goals.find(g=>g.branch_id===branch.id);
    setGoal(amt(g?.goal)||0);
    setOffset(amt(g?.offset_amount)||0);
    setLoading(false);
  },[branch.id]);

  useEffect(()=>{
    load();
    const iv=setInterval(load,60000); // refresh every 60s
    return ()=>clearInterval(iv);
  },[load]);

  const stats=computeStats(txns,goal,t.day,t.y,t.m,offset);
  const {todayTotal,dailyGoal,pctMonth,pctDay,todayTxns,monthTotal,isSunday}=stats;
  const arc=arcColor(pctDay),stat=statusFor(pctDay);
  const dateStr=`${DIEF[new Date(t.y,t.m,t.day).getDay()]}, ${t.day} de ${MES[t.m]}`;

  const addSale=async()=>{
    const val=parseFloat(input.replace(/,/g,"").replace(/\$/g,""));
    if (!val||val<=0) return;
    const wasHit=pctDay>=100;
    const txn={id:genId(),branch_id:branch.id,year:t.y,month:t.m,day:t.day,amount:val};
    // Optimistic update
    setTxns(prev=>[...prev,{...txn}]);
    setInput(""); setFlash(true); setTimeout(()=>setFlash(false),500);
    // Try Supabase
    const ok=await SB.insertTxn(txn);
    if (!ok) { qAdd("insert",txn); setOnline(false); } else setOnline(true);
    // Celebration
    const newPct=dailyGoal>0?((todayTotal+val)/dailyGoal)*100:100;
    if (!wasHit&&newPct>=100){setParty(true);setTimeout(()=>setParty(false),3500);}
    inputRef.current?.focus();
  };

  const deleteLast=async()=>{
    if (todayTxns.length===0) return;
    const last=todayTxns[todayTxns.length-1];
    setTxns(prev=>prev.filter(t=>t.id!==last.id));
    const ok=await SB.deleteTxn(last.id);
    if (!ok) qAdd("delete",{id:last.id});
  };

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    @keyframes pp{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
    @keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}
    @keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
    input[type=number]{-moz-appearance:textfield}
    .qa:hover{opacity:.8;transform:scale(1.03)}.qa{transition:all .12s}
  `;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,fontFamily:"Inter,sans-serif"}}>
      <div style={{color:"#333",fontSize:13}}>Cargando...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080808",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{CSS}</style>

      {party&&(
        <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.92)"}}>
          <div style={{fontSize:90,animation:"pp .6s ease infinite"}}>🏆</div>
          <div style={{color:"#10B981",fontSize:32,fontWeight:800,marginTop:16,textAlign:"center",letterSpacing:-1}}>¡META DEL DÍA!</div>
          <div style={{color:"#fff",fontSize:16,marginTop:10,opacity:.6}}>¡Excelente trabajo hoy!</div>
          <button onClick={()=>setParty(false)} style={{marginTop:32,background:"none",border:"1px solid #333",borderRadius:10,color:"#555",padding:"10px 24px",cursor:"pointer",fontSize:13}}>Continuar</button>
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 20px 0"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:13,padding:0}}>← Inicio</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:9,height:9,borderRadius:"50%",background:branch.color,boxShadow:`0 0 8px ${branch.color}`}}/>
          <span style={{color:"#ddd",fontWeight:700,fontSize:15}}>{branch.name}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:online&&qc===0?"#10B981":qc>0?"#F59E0B":"#EF4444"}}/>
          {qc>0&&<span style={{fontSize:10,color:"#F59E0B"}}>{qc} pend.</span>}
        </div>
      </div>
      <div style={{textAlign:"center",color:"#3a3a3a",fontSize:12,marginTop:10}}>{dateStr}</div>

      {!goal ? (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"60px 20px"}}>
          <div style={{fontSize:48}}>🎯</div>
          <div style={{color:"#555",fontSize:15,textAlign:"center",lineHeight:1.6,marginTop:16}}>Sin meta configurada para este mes.<br/><span style={{color:"#333"}}>Pídele a tu gerente que la active.</span></div>
        </div>
      ) : isSunday ? (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"48px 20px"}}>
          <div style={{fontSize:64}}>😴</div>
          <div style={{color:"#fff",fontWeight:800,fontSize:22,marginTop:16}}>Día de descanso</div>
          <div style={{color:"#444",fontSize:14,marginTop:8}}>Nos vemos el lunes 💪</div>
          <div style={{width:"100%",maxWidth:400,marginTop:40,background:"#111",borderRadius:16,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div style={{color:"#555",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>Meta del mes</div>
              <div style={{color:"#888",fontSize:12,fontWeight:600}}>{Math.round(pctMonth)}%</div>
            </div>
            <div style={{background:"#1a1a1a",borderRadius:8,height:10,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${Math.min(100,pctMonth)}%`,background:`linear-gradient(90deg,${branch.color}88,${branch.color})`,borderRadius:8}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#333",fontSize:11}}>{fmt$(monthTotal)} vendido</span>
              <span style={{color:"#333",fontSize:11}}>Faltan {fmt$(Math.max(0,goal-monthTotal))}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 20px 60px"}}>
          <div style={{animation:flash?"pop .3s ease":"none",marginBottom:20}}>
            <Ring pct={pctDay} size={220} sw={20} color={arc}>
              <div style={{fontSize:13,color:arc,fontWeight:600}}>{stat.emoji}</div>
              <div style={{fontSize:38,fontWeight:900,color:"#fff",lineHeight:1.05,letterSpacing:-1.5}}>{fmt$(todayTotal)}</div>
              <div style={{fontSize:12,color:"#555",marginTop:2}}>meta de hoy: {fmt$(dailyGoal)}</div>
              <div style={{fontSize:12,color:arc,fontWeight:700,marginTop:4}}>{Math.round(Math.min(pctDay,999))}%</div>
            </Ring>
          </div>

          <div style={{color:arc,fontSize:15,fontWeight:600,marginBottom:28,textAlign:"center"}}>{stat.msg}</div>

          <div style={{width:"100%",maxWidth:400,marginBottom:32,background:"#111",borderRadius:16,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{color:"#555",fontSize:11,letterSpacing:1,textTransform:"uppercase"}}>Meta del mes</div>
              <div style={{color:"#888",fontSize:12,fontWeight:600}}>{Math.round(pctMonth)}%</div>
            </div>
            <div style={{background:"#1a1a1a",borderRadius:8,height:10,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${Math.min(100,pctMonth)}%`,background:`linear-gradient(90deg,${branch.color}88,${branch.color})`,borderRadius:8,transition:"width .6s"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"#333",fontSize:11}}>{fmt$(monthTotal)} vendido</span>
              <span style={{color:"#333",fontSize:11}}>Faltan {fmt$(Math.max(0,goal-monthTotal))}</span>
            </div>
          </div>

          <div style={{width:"100%",maxWidth:400}}>
            <div style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Agregar venta</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
              {QUICK.map(a=>(
                <button key={a} className="qa" onClick={()=>setInput(String(a))}
                  style={{background:"#111",border:`1px solid ${branch.color}33`,borderRadius:9,color:branch.color,fontSize:12,fontWeight:700,padding:"9px 14px",cursor:"pointer"}}>
                  ${a.toLocaleString("es-MX")}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              <input ref={inputRef} type="number" value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addSale()} placeholder="Monto..."
                style={{flex:1,background:"#111",border:`1px solid ${input?branch.color+"55":"#1e1e1e"}`,borderRadius:12,color:"#fff",fontSize:20,fontWeight:700,padding:"14px 16px",outline:"none"}}
              />
              <button onClick={addSale}
                style={{background:branch.color,border:"none",borderRadius:12,color:"#000",fontWeight:800,fontSize:16,padding:"0 22px",cursor:"pointer",flexShrink:0}}>
                + Add
              </button>
            </div>
            {todayTxns.length>0&&(
              <div style={{animation:"fu .25s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{color:"#333",fontSize:10,letterSpacing:1.5,textTransform:"uppercase"}}>Ventas de hoy ({todayTxns.length})</div>
                  <button onClick={deleteLast} style={{background:"none",border:"none",color:"#333",fontSize:11,cursor:"pointer",padding:0}}>✕ Borrar última</button>
                </div>
                <div style={{background:"#0f0f0f",borderRadius:12,border:"1px solid #1a1a1a",overflow:"hidden"}}>
                  {[...todayTxns].reverse().map((v,i)=>(
                    <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",borderBottom:i<todayTxns.length-1?"1px solid #141414":"none"}}>
                      <div style={{color:"#333",fontSize:12}}>#{todayTxns.length-i}</div>
                      <div style={{color:"#ccc",fontWeight:700,fontSize:15}}>{fmt$(amt(v.amount))}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB HOY ──────────────────────────────────────────────────────────────────
function TabHoy({stats,txnsByBranch,y,m,day,onRefresh}) {
  const [editId,setEditId]=useState(null);
  const [editDay,setEditDay]=useState(day);
  const [addInput,setAddInput]=useState("");
  const [busy,setBusy]=useState(false);

  const toggleEdit=id=>{ if(editId===id)setEditId(null); else{setEditId(id);setEditDay(day);setAddInput("");} };

  const deleteTxn=async(txnId)=>{
    setBusy(true);
    const ok=await SB.deleteTxn(txnId);
    if (!ok) qAdd("delete",{id:txnId});
    setBusy(false); onRefresh();
  };

  const addTxn=async(bid)=>{
    const val=parseFloat(addInput.replace(/,/g,"").replace(/\$/g,""));
    if (!val||val<=0) return;
    setBusy(true);
    const txn={id:genId(),branch_id:bid,year:y,month:m,day:editDay,amount:val};
    const ok=await SB.insertTxn(txn);
    if (!ok) qAdd("insert",txn);
    setAddInput(""); setBusy(false); onRefresh();
  };

  return (
    <div>
      <div style={{color:"#aaa",fontSize:12,marginBottom:18}}>{DIEF[new Date(y,m,day).getDay()]}, {day} de {MES[m]}</div>
      {isSun(y,m,day)&&<div style={{background:"#f5f5f5",borderRadius:12,padding:"14px",marginBottom:18,textAlign:"center",color:"#888",fontSize:14}}>😴 Hoy es domingo — día de descanso</div>}
      <div style={{display:"grid",gap:10}}>
        {BRANCHES.map(b=>{
          const s=stats[b.id]||{}, isEd=editId===b.id;
          const edTxns=(txnsByBranch[b.id]||[]).filter(t=>t.day===editDay);
          return (
            <div key={b.id} style={{background:"#fafafa",borderRadius:14,border:"1px solid #f0f0f0",overflow:"hidden"}}>
              <div style={{padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:b.color}}/>
                    <span style={{fontWeight:700,fontSize:14,color:"#111"}}>{b.name}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"#ccc"}}>{b.city}</span>
                    <button onClick={()=>toggleEdit(b.id)}
                      style={{background:isEd?"#111":"#f0f0f0",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,color:isEd?"#fff":"#666",fontWeight:isEd?700:400,transition:"all .15s"}}>
                      {isEd?"Cerrar":"✏️ Editar"}
                    </button>
                  </div>
                </div>
                {s.goal?(
                  <>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
                      <div style={{fontSize:24,fontWeight:800,color:"#111",letterSpacing:-.5}}>{fmt$(s.todayTotal)}</div>
                      <div style={{fontSize:12,color:"#999"}}>/ {fmt$(s.dailyGoal)} hoy</div>
                    </div>
                    <div style={{background:"#ebebeb",borderRadius:6,height:7,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(100,s.pctDay)}%`,background:arcColor(s.pctDay),borderRadius:6,transition:"width .4s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                      <div style={{fontSize:11,color:"#aaa"}}>{Math.round(s.pctDay)}% de hoy</div>
                      <div style={{fontSize:11,color:s.pctDay>=100?"#10B981":"#aaa"}}>{statusFor(s.pctDay).emoji} {statusFor(s.pctDay).msg}</div>
                    </div>
                  </>
                ):<div style={{color:"#ccc",fontSize:13}}>Sin meta este mes</div>}
              </div>

              {isEd&&(
                <div style={{borderTop:"1px solid #eee",background:"#fff",padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <button onClick={()=>setEditDay(d=>Math.max(1,d-1))}
                      style={{background:"#f0f0f0",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:14,color:"#555"}}>‹</button>
                    <div style={{fontSize:13,fontWeight:600,color:"#333",textAlign:"center"}}>
                      {DIEF[new Date(y,m,editDay).getDay()]} {editDay}
                      {editDay===day&&<span style={{color:"#aaa",fontWeight:400,fontSize:11}}> · hoy</span>}
                    </div>
                    <button onClick={()=>setEditDay(d=>Math.min(day,d+1))} disabled={editDay>=day}
                      style={{background:editDay>=day?"#f8f8f8":"#f0f0f0",border:"none",borderRadius:7,padding:"6px 12px",cursor:editDay>=day?"default":"pointer",fontSize:14,color:editDay>=day?"#ddd":"#555"}}>›</button>
                  </div>
                  {edTxns.length===0?(
                    <div style={{color:"#ccc",fontSize:13,textAlign:"center",padding:"10px 0",marginBottom:12}}>Sin ventas este día</div>
                  ):(
                    <div style={{background:"#fafafa",borderRadius:10,overflow:"hidden",border:"1px solid #f0f0f0",marginBottom:12}}>
                      {edTxns.map((v,i)=>(
                        <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:i<edTxns.length-1?"1px solid #f0f0f0":"none"}}>
                          <span style={{fontSize:12,color:"#aaa"}}>#{i+1}</span>
                          <span style={{fontSize:14,fontWeight:700,color:"#333"}}>{fmt$(amt(v.amount))}</span>
                          <button onClick={()=>!busy&&deleteTxn(v.id)}
                            style={{background:"#FEE2E2",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",color:"#EF4444",fontSize:12,fontWeight:600,opacity:busy?.5:1}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:8}}>
                    <input type="number" value={addInput} onChange={e=>setAddInput(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addTxn(b.id)}
                      placeholder="Agregar corrección..."
                      style={{flex:1,background:"#f5f5f5",border:"1px solid #e5e5e5",borderRadius:9,padding:"9px 12px",fontSize:14,color:"#111",outline:"none"}}
                    />
                    <button onClick={()=>addTxn(b.id)}
                      style={{background:b.color,border:"none",borderRadius:9,color:"#000",fontWeight:800,fontSize:13,padding:"0 16px",cursor:"pointer",opacity:busy?.6:1}}>
                      + Add
                    </button>
                  </div>
                  {busy&&<div style={{color:"#aaa",fontSize:11,textAlign:"center",marginTop:8}}>Guardando...</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB MES ──────────────────────────────────────────────────────────────────
function TabMes({stats,y,m}) {
  const totalGoal = BRANCHES.reduce((s,b)=>s+(stats[b.id]?.goal||0),0);
  const totalSold = BRANCHES.reduce((s,b)=>s+(stats[b.id]?.monthTotal||0),0);
  const totalPct  = totalGoal>0?Math.min(100,(totalSold/totalGoal)*100):0;
  return (
    <div>
      <div style={{color:"#aaa",fontSize:12,marginBottom:14}}>{MES[m]} {y}</div>
      {/* Consolidado */}
      {totalGoal>0&&(
        <div style={{background:"#111",borderRadius:14,padding:"16px 18px",marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>Consolidado total</div>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:totalPct>=100?"#10B981":"#888"}}>{Math.round(totalPct)}%</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-.5}}>{fmt$(totalSold)}</span>
            <span style={{fontSize:13,color:"#555",alignSelf:"flex-end"}}>/ {fmt$(totalGoal)}</span>
          </div>
          <div style={{background:"#2a2a2a",borderRadius:8,height:10,overflow:"hidden",marginBottom:6}}>
            <div style={{height:"100%",width:`${totalPct}%`,background:totalPct>=100?"#10B981":"#22C55E",borderRadius:8,transition:"width .5s"}}/>
          </div>
          <div style={{fontSize:11,color:"#555"}}>Faltan {fmt$(Math.max(0,totalGoal-totalSold))} para meta total del mes</div>
        </div>
      )}
      <div style={{display:"grid",gap:10}}>
        {BRANCHES.map(b=>{
          const s=stats[b.id]||{};
          return (
            <div key={b.id} style={{background:"#fafafa",borderRadius:14,padding:"14px 16px",border:"1px solid #f0f0f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:b.color}}/>
                  <span style={{fontWeight:700,fontSize:14,color:"#111"}}>{b.name}</span>
                </div>
                {s.goal&&<span style={{fontWeight:700,fontSize:13,color:s.pctMonth>=100?"#10B981":"#888"}}>{Math.round(s.pctMonth)}%</span>}
              </div>
              {s.goal?(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:20,fontWeight:800,color:"#111",letterSpacing:-.3}}>{fmt$(s.monthTotal)}</span>
                    <span style={{fontSize:13,color:"#bbb",alignSelf:"flex-end"}}>/ {fmt$(s.goal)}</span>
                  </div>
                  <div style={{background:"#ebebeb",borderRadius:8,height:9,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(100,s.pctMonth)}%`,background:b.color,borderRadius:8,transition:"width .5s"}}/>
                  </div>
                  <div style={{fontSize:11,color:"#bbb",marginTop:6}}>Faltan {fmt$(Math.max(0,s.goal-s.monthTotal))}</div>
                </>
              ):<div style={{color:"#ccc",fontSize:13}}>Sin meta configurada</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB SEMANA ───────────────────────────────────────────────────────────────
function TabSemana({txnsByBranch,stats,y,m}) {
  const t=now();
  const [offset,setOffset]=useState(0);
  const monday=(()=>{
    const d=new Date(t.y,t.m,t.day);
    const dow=(d.getDay()+6)%7;
    d.setDate(d.getDate()-dow+offset*7);
    return d;
  })();
  const week=Array.from({length:6},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return d;});
  const isToday=d=>d.getDate()===t.day&&d.getMonth()===t.m&&d.getFullYear()===t.y;
  const isFuture=d=>d>new Date(t.y,t.m,t.day);
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <button onClick={()=>setOffset(o=>o-1)} style={{background:"#f3f3f3",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:16,color:"#555"}}>‹</button>
        <div style={{fontSize:13,color:"#666",fontWeight:500}}>Lun {week[0].getDate()} – Sáb {week[5].getDate()} {MES[week[0].getMonth()]}</div>
        <button onClick={()=>setOffset(o=>Math.min(0,o+1))} style={{background:"#f3f3f3",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:16,color:"#555"}}>›</button>
      </div>
      <div style={{display:"grid",gap:10}}>
        {BRANCHES.map(b=>{
          const btxns=txnsByBranch[b.id]||[], dg=stats[b.id]?.dailyGoal||0;
          const sums=week.map(d=>{
            if(d.getFullYear()!==y||d.getMonth()!==m) return 0;
            return btxns.filter(t=>t.day===d.getDate()).reduce((s,t)=>s+amt(t.amount),0);
          });
          const maxVal=Math.max(...sums,dg,1);
          return (
            <div key={b.id} style={{background:"#fafafa",borderRadius:14,padding:"14px 16px",border:"1px solid #f0f0f0"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:b.color}}/>
                <span style={{fontWeight:600,fontSize:13,color:"#333"}}>{b.name}</span>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"flex-end",height:56}}>
                {week.map((d,i)=>{
                  const v=sums[i],barH=Math.max(3,(v/maxVal)*48);
                  const fut=isFuture(d),tod=isToday(d);
                  const col=fut?"#e8e8e8":v>0?(dg>0&&v>=dg?b.color:b.color+"88"):"#e0e0e0";
                  return (
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                      <div style={{fontSize:10,color:v>0&&!fut?"#888":"#ccc",fontWeight:600}}>{v>0&&!fut?`$${Math.round(v/1000)}k`:""}</div>
                      <div style={{width:"100%",borderRadius:"4px 4px 2px 2px",height:barH,background:col,alignSelf:"flex-end",transition:"height .3s"}}/>
                      <div style={{fontSize:10,color:tod?b.color:"#ccc",fontWeight:tod?700:400}}>{DIES[d.getDay()]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB HISTORIAL ────────────────────────────────────────────────────────────
function TabHistorial({y}) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const {txns,goals}=await SB.getYearData(y);
      const res={};
      BRANCHES.forEach(b=>{
        res[b.id]={};
        for (let mi=0;mi<12;mi++){
          const g=goals.find(g=>g.branch_id===b.id&&g.month===mi);
          if (!g||!g.goal){res[b.id][mi]=null;continue;}
          const total=amt(g.offset_amount)+txns.filter(t=>t.branch_id===b.id&&t.month===mi).reduce((s,t)=>s+amt(t.amount),0);
          res[b.id][mi]={hit:total>=amt(g.goal),total,goal:amt(g.goal)};
        }
      });
      setData(res); setLoading(false);
    })();
  },[y]);
  if (loading) return <div style={{textAlign:"center",padding:50,color:"#bbb",fontSize:13}}>Cargando historial...</div>;
  return (
    <div>
      <div style={{color:"#aaa",fontSize:12,marginBottom:20}}>Historial {y}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}>
          <thead>
            <tr>
              <th style={{textAlign:"left",padding:"6px 8px",color:"#aaa",fontWeight:500,fontSize:11}}>Sucursal</th>
              {MES.map((mo,i)=><th key={i} style={{textAlign:"center",padding:"6px 4px",color:"#aaa",fontWeight:400,fontSize:10}}>{mo.slice(0,3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {BRANCHES.map(b=>(
              <tr key={b.id} style={{borderTop:"1px solid #f5f5f5"}}>
                <td style={{padding:"10px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                    <span style={{color:"#333",fontWeight:500,whiteSpace:"nowrap",fontSize:12}}>{b.name}</span>
                  </div>
                </td>
                {Array.from({length:12},(_,mi)=>{
                  const d=data?.[b.id]?.[mi];
                  return (
                    <td key={mi} style={{textAlign:"center",padding:"10px 4px"}}>
                      {d===null||d===undefined?<span style={{color:"#ddd"}}>—</span>
                        :d.hit?<span title={`${fmt$(d.total)}/${fmt$(d.goal)}`} style={{color:"#10B981",fontWeight:700}}>✓</span>
                        :<span title={`${fmt$(d.total)}/${fmt$(d.goal)}`} style={{color:"#EF4444"}}>✗</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Fila consolidado */}
      <div style={{marginTop:16,background:"#f8f8f8",borderRadius:10,overflow:"hidden",border:"1px solid #eee"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}>
          <tbody>
            <tr style={{borderTop:"2px solid #e5e5e5"}}>
              <td style={{padding:"10px 8px"}}>
                <span style={{color:"#111",fontWeight:700,fontSize:12}}>Total general</span>
              </td>
              {Array.from({length:12},(_,mi)=>{
                const monthGoal=BRANCHES.reduce((s,b)=>s+amt(data?.[b.id]?.[mi]?.goal||0),0);
                const monthTotal=BRANCHES.reduce((s,b)=>s+amt(data?.[b.id]?.[mi]?.total||0),0);
                const hasData=BRANCHES.some(b=>data?.[b.id]?.[mi]!==null&&data?.[b.id]?.[mi]!==undefined);
                return (
                  <td key={mi} style={{textAlign:"center",padding:"10px 4px"}}>
                    {!hasData
                      ?<span style={{color:"#ddd"}}>—</span>
                      :monthTotal>=monthGoal
                        ?<span title={`${fmt$(monthTotal)}/${fmt$(monthGoal)}`} style={{color:"#10B981",fontWeight:800,fontSize:15}}>✓</span>
                        :<span title={`${fmt$(monthTotal)}/${fmt$(monthGoal)}`} style={{color:"#EF4444",fontSize:15}}>✗</span>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",gap:20,marginTop:14,fontSize:12,color:"#aaa"}}>
        <span><span style={{color:"#10B981",fontWeight:700}}>✓</span> Lograda</span>
        <span><span style={{color:"#EF4444"}}>✗</span> No lograda</span>
        <span><span style={{color:"#ddd"}}>—</span> Sin meta</span>
      </div>
    </div>
  );
}

// ─── TAB METAS ────────────────────────────────────────────────────────────────
function TabMetas({y}) {
  const t=now();
  const [vm,setVm]=useState(t.m);
  const [inputs,setInputs]=useState({});
  const [offsets,setOffsets]=useState({});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    (async()=>{
      const goals=await SB.getAllGoals(y,vm);
      const inp={},off={};
      BRANCHES.forEach(b=>{
        const g=goals.find(g=>g.branch_id===b.id);
        inp[b.id]=g?.goal?String(g.goal):"";
        off[b.id]=g?.offset_amount?String(g.offset_amount):"";
      });
      setInputs(inp); setOffsets(off);
    })();
  },[y,vm]);

  const save=async()=>{
    setSaving(true);
    await Promise.all(BRANCHES.map(b=>{
      const goal=parseFloat(inputs[b.id])||0;
      const offset=parseFloat(offsets[b.id])||0;
      if (goal>0) return SB.upsertGoal(b.id,y,vm,goal,offset);
    }).filter(Boolean));
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2200);
  };

  const isCurrent=vm===t.m&&y===t.y;
  const prevDay=t.day-1;

  return (
    <div>
      <div style={{marginBottom:20}}>
        <div style={{color:"#aaa",fontSize:11,marginBottom:10}}>Mes</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {MES.map((mo,i)=>(
            <button key={i} onClick={()=>setVm(i)}
              style={{padding:"6px 13px",borderRadius:8,border:"1px solid",borderColor:i===vm?"#111":"#e5e5e5",background:i===vm?"#111":"#fff",color:i===vm?"#fff":"#777",fontSize:12,cursor:"pointer",fontWeight:i===vm?600:400}}>
              {mo.slice(0,3)}
            </button>
          ))}
        </div>
      </div>
      <div style={{fontWeight:700,fontSize:14,color:"#222",marginBottom:12}}>Metas — {MES[vm]} {y}</div>
      {isCurrent&&prevDay>0&&(
        <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#92400E",lineHeight:1.5}}>
          💡 Captura lo vendido del 1 al {prevDay} de {MES[vm]} según Microsip en la columna amarilla.
        </div>
      )}
      <div style={{display:"grid",gap:10,marginBottom:20}}>
        {BRANCHES.map(b=>(
          <div key={b.id} style={{background:"#fafafa",borderRadius:12,padding:"14px",border:"1px solid #f0f0f0"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:b.color,flexShrink:0}}/>
              <span style={{fontWeight:600,fontSize:14,color:"#222"}}>{b.name}</span>
              <span style={{fontSize:11,color:"#ccc",marginLeft:"auto"}}>{b.city}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:10,color:"#bbb",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meta mensual</div>
                <input type="number" value={inputs[b.id]||""} onChange={e=>setInputs(p=>({...p,[b.id]:e.target.value}))}
                  placeholder="$0"
                  style={{width:"100%",background:"#fff",border:"1px solid #e5e5e5",borderRadius:9,padding:"9px 10px",fontSize:14,textAlign:"right",color:"#111",outline:"none",boxSizing:"border-box"}}
                />
              </div>
              <div>
                <div style={{fontSize:10,color:isCurrent?"#F59E0B":"#bbb",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
                  {isCurrent&&prevDay>0?`Vendido 1–${prevDay}`:"Acumulado"}
                </div>
                <input type="number" value={offsets[b.id]||""} onChange={e=>setOffsets(p=>({...p,[b.id]:e.target.value}))}
                  placeholder="$0"
                  style={{width:"100%",background:"#fff",border:`1px solid ${isCurrent?"#FDE68A":"#e5e5e5"}`,borderRadius:9,padding:"9px 10px",fontSize:14,textAlign:"right",color:"#111",outline:"none",boxSizing:"border-box"}}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={save}
        style={{width:"100%",background:saved?"#10B981":"#111",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,padding:"15px",cursor:"pointer",transition:"background .3s"}}>
        {saving?"Guardando...":saved?"✓ Guardado":"Guardar metas"}
      </button>
    </div>
  );
}

// ─── MANAGER ──────────────────────────────────────────────────────────────────
function Manager({onBack}) {
  const t=now();
  const [tab,setTab]=useState("hoy");
  const [vm,setVm]=useState(t.m);
  const [vy]=useState(t.y);
  const [stats,setStats]=useState({});
  const [txnsByBranch,setTxnsByBranch]=useState({});
  const [loading,setLoading]=useState(true);
  const qc=useQCount();

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const dayNum=vm===t.m&&vy===t.y?t.day:daysInM(vy,vm);
    const [allTxns,allGoals]=await Promise.all([SB.getAllTxns(vy,vm),SB.getAllGoals(vy,vm)]);
    const tbb={}, st={};
    BRANCHES.forEach(b=>{ tbb[b.id]=[]; });
    allTxns.forEach(t=>{ if(tbb[t.branch_id]) tbb[t.branch_id].push(t); });
    const goalMap={};
    allGoals.forEach(g=>{ goalMap[g.branch_id]=g; });
    BRANCHES.forEach(b=>{
      const g=goalMap[b.id];
      st[b.id]=computeStats(tbb[b.id],amt(g?.goal)||0,dayNum,vy,vm,amt(g?.offset_amount)||0);
    });
    setTxnsByBranch(tbb); setStats(st); setLoading(false);
  },[vm,vy]);

  useEffect(()=>{
    if (tab!=="historial"&&tab!=="metas") loadAll();
    else setLoading(false);
  },[loadAll,tab]);

  // Auto-refresh every 30s in manager
  useEffect(()=>{
    if (tab==="historial"||tab==="metas") return;
    const iv=setInterval(loadAll,30000);
    return ()=>clearInterval(iv);
  },[loadAll,tab]);

  const TABS=[{id:"hoy",label:"Hoy"},{id:"mes",label:"Mes"},{id:"semana",label:"Semana"},{id:"historial",label:"Historial"},{id:"metas",label:"Metas"}];
  const viewDay=vm===t.m&&vy===t.y?t.day:daysInM(vy,vm);
  const showNav=tab==="hoy"||tab==="mes"||tab==="semana";

  return (
    <div style={{minHeight:"100vh",background:"#fff",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderBottom:"1px solid #f0f0f0",padding:"15px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:13,padding:0}}>← Inicio</button>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <div style={{fontWeight:800,fontSize:15,color:"#111"}}>Vista Gerente</div>
          {qc>0&&<div style={{fontSize:10,color:"#F59E0B"}}>⏳ {qc} pendiente(s)</div>}
        </div>
        <button onClick={loadAll} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:18}}>↻</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 14px",borderBottom:"1px solid #f5f5f5",overflowX:"auto"}}>
        {TABS.map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)}
            style={{padding:"8px 16px",borderRadius:9,border:"none",background:tab===tb.id?"#111":"transparent",color:tab===tb.id?"#fff":"#aaa",fontWeight:tab===tb.id?700:400,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>
            {tb.label}
          </button>
        ))}
      </div>
      {showNav&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 18px",borderBottom:"1px solid #f8f8f8"}}>
          <button onClick={()=>setVm(m=>Math.max(0,m-1))} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:20,padding:0}}>‹</button>
          <div style={{fontSize:13,fontWeight:600,color:"#555"}}>{MES[vm]} {vy}</div>
          <button onClick={()=>setVm(m=>Math.min(t.m,m+1))} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:20,padding:0}}>›</button>
        </div>
      )}
      <div style={{padding:"16px 16px 80px"}}>
        {loading?<div style={{textAlign:"center",padding:60,color:"#ccc",fontSize:13}}>Cargando...</div>:(
          <>
            {tab==="hoy"       &&<TabHoy      stats={stats} txnsByBranch={txnsByBranch} y={vy} m={vm} day={viewDay} onRefresh={loadAll}/>}
            {tab==="mes"       &&<TabMes      stats={stats} y={vy} m={vm}/>}
            {tab==="semana"    &&<TabSemana   txnsByBranch={txnsByBranch} stats={stats} y={vy} m={vm}/>}
            {tab==="historial" &&<TabHistorial y={vy}/>}
            {tab==="metas"     &&<TabMetas    y={vy}/>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── PIN ──────────────────────────────────────────────────────────────────────
function PinModal({onSuccess,onCancel}) {
  const [pin,setPin]=useState(""), [error,setError]=useState("");
  const submit=()=>{if(pin===PIN)onSuccess();else{setError("PIN incorrecto.");setPin("");}};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{background:"#fff",borderRadius:20,padding:"30px 26px",width:310,boxShadow:"0 24px 64px rgba(0,0,0,.2)",fontFamily:"Inter,sans-serif"}}>
        <div style={{fontWeight:800,fontSize:18,color:"#111",marginBottom:5}}>Acceso Gerente</div>
        <div style={{color:"#aaa",fontSize:13,marginBottom:22}}>Ingresa tu PIN de acceso</div>
        <input type="password" value={pin} autoFocus onChange={e=>{setPin(e.target.value);setError("");}}
          onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••••"
          style={{width:"100%",border:`1.5px solid ${error?"#EF4444":"#e5e5e5"}`,borderRadius:12,padding:"13px 15px",fontSize:16,outline:"none",marginBottom:error?8:16,boxSizing:"border-box",letterSpacing:2}}
        />
        {error&&<div style={{color:"#EF4444",fontSize:12,marginBottom:14}}>{error}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:"#f5f5f5",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",color:"#666",fontSize:14}}>Cancelar</button>
          <button onClick={submit} style={{flex:2,background:"#111",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:700}}>Entrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view,setView]=useState("landing");
  const [branch,setBranch]=useState(null);
  const [showPin,setShowPin]=useState(false);

  // Sync loop — intenta cada 20s vaciar la cola offline
  useEffect(()=>{
    const iv=setInterval(async()=>{
      if (_q.length>0) await qFlush();
    },20000);
    return ()=>clearInterval(iv);
  },[]);

  // Warn before closing with pending transactions
  useEffect(()=>{
    const handler=(e)=>{
      if (_q.length>0){
        e.preventDefault();
        e.returnValue=`Hay ${_q.length} venta(s) pendiente(s) de sincronizar. Espera unos segundos antes de cerrar.`;
      }
    };
    window.addEventListener("beforeunload",handler);
    return ()=>window.removeEventListener("beforeunload",handler);
  },[]);

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
      {showPin&&<PinModal onSuccess={()=>{setShowPin(false);setView("manager");}} onCancel={()=>setShowPin(false)}/>}
      {view==="landing"&&<Landing onSelect={b=>{setBranch(b);setView("branch");}} onManager={()=>setShowPin(true)}/>}
      {view==="branch"&&branch&&<BranchView branch={branch} onBack={()=>setView("landing")}/>}
      {view==="manager"&&<Manager onBack={()=>setView("landing")}/>}
    </div>
  );
}
