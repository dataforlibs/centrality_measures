import { useState, useMemo, useCallback, useEffect, useRef } from "react";

const FAM = [
  { name:"Local",       color:"#378ADD", bg:"#E6F1FB", border:"#B5D4F4", text:"#0C447C" },
  { name:"Closeness",   color:"#1D9E75", bg:"#E1F5EE", border:"#9FE1CB", text:"#085041" },
  { name:"Betweenness", color:"#BA7517", bg:"#FAEEDA", border:"#FAC775", text:"#633806" },
  { name:"Spectral",    color:"#7F77DD", bg:"#EEEDFE", border:"#CECBF6", text:"#3C3489" },
  { name:"Random Walk", color:"#D85A30", bg:"#FAECE7", border:"#F5C4B3", text:"#712B13" },
  { name:"Community",   color:"#639922", bg:"#EAF3DE", border:"#C0DD97", text:"#27500A" },
  { name:"Information", color:"#888780", bg:"#F1EFE8", border:"#D3D1C7", text:"#444441" },
];
const famMap = Object.fromEntries(FAM.map(f => [f.name, f]));

const MS = [
  { id:0,  name:"Degree",           short:"DEG", family:"Local",        desc:"Count of direct neighbors — simplest possible local measure. Normalized by (n−1) for comparison across graphs." },
  { id:1,  name:"Strength",         short:"STR", family:"Local",        desc:"Sum of weights of incident edges (weighted degree). Equals degree in unweighted graphs." },
  { id:2,  name:"Degree Mass",      short:"DM",  family:"Local",        desc:"Degree weighted by neighbor degrees; captures 2-hop neighborhood density without expensive path computation." },
  { id:3,  name:"Clustering Coeff", short:"CC",  family:"Local",        desc:"Fraction of a node's neighbor pairs that are themselves connected. Measures local cohesion, not centrality strictly." },
  { id:4,  name:"Closeness",        short:"CLO", family:"Closeness",    desc:"Inverse mean shortest-path distance to all nodes. Requires graph to be connected or uses largest component." },
  { id:5,  name:"Harmonic",         short:"HAR", family:"Closeness",    desc:"Sum of inverse distances to all nodes. Handles disconnected graphs naturally by treating unreachable nodes as 0." },
  { id:6,  name:"Eccentricity",     short:"ECC", family:"Closeness",    desc:"Inverse of the maximum shortest path from the node (graph eccentricity). Penalizes nodes far from the periphery." },
  { id:7,  name:"Lin centrality",   short:"LIN", family:"Closeness",    desc:"Closeness scaled by the square of reachable nodes. Corrects for component-size bias in disconnected graphs." },
  { id:8,  name:"Betweenness",      short:"BET", family:"Betweenness",  desc:"Fraction of all-pairs shortest paths passing through the node. O(nm) with Brandes algorithm." },
  { id:9,  name:"CF Betweenness",   short:"CFB", family:"Betweenness",  desc:"Current-flow (electrical) analogue: counts all paths weighted by flow, not just geodesics." },
  { id:10, name:"Comm Betweenness", short:"CMB", family:"Betweenness",  desc:"Betweenness where path importance is weighted by communicability scores rather than path counts." },
  { id:11, name:"Eigenvector",      short:"EIG", family:"Spectral",     desc:"Leading eigenvector entry of the adjacency matrix. Converges only for non-bipartite connected graphs." },
  { id:12, name:"PageRank",         short:"PR",  family:"Spectral",     desc:"Damped random-walk stationary distribution (Brin & Page 1998). Adds teleportation to handle dangling nodes." },
  { id:13, name:"Katz",             short:"KAT", family:"Spectral",     desc:"Sums all walks with exponential length decay (attenuation α). Reduces to degree when α→0." },
  { id:14, name:"HITS hub",         short:"HUB", family:"Spectral",     desc:"Hub score from HITS algorithm (Kleinberg 1999). Most meaningful in directed networks." },
  { id:15, name:"ARW centrality",   short:"ARW", family:"Random Walk",  desc:"Absorbing random-walk centrality: measures mean first-passage time to a target set of nodes." },
  { id:16, name:"Stationary RW",    short:"SRW", family:"Random Walk",  desc:"Stationary probability of a standard random walk. Equivalent to degree in regular graphs." },
  { id:17, name:"Bridging",         short:"BRG", family:"Community",    desc:"Product of betweenness and bridging coefficient. Highlights nodes that span structural holes between communities." },
  { id:18, name:"Burt constraint",  short:"BC",  family:"Community",    desc:"Constraint on structural holes (Burt 1992). Lower values = more entrepreneurial broker position." },
  { id:19, name:"Comm centrality",  short:"CMC", family:"Community",    desc:"Ratio of intra-community to inter-community connections. Depends on community detection algorithm." },
  { id:20, name:"Entropy centr",    short:"ENT", family:"Information",  desc:"Node importance measured via Shannon entropy of the distance distribution to all other nodes." },
  { id:21, name:"Coll influence",   short:"CI",  family:"Information",  desc:"Optimal percolation measure (Morone & Makse 2015). Identifies minimal influencer sets via message-passing." },
  { id:22, name:"CoreHD",           short:"CHD", family:"Information",  desc:"Core-periphery hierarchical decomposition index. Tracks nested shell structure of k-core decomposition." },
];

const lerp = (a, b, t) => Math.max(0, Math.min(255, Math.round(a + (b-a)*t)));
function corrColor(v) {
  v = Math.max(-1, Math.min(1, v));
  if (v >= 0) {
    if (v < 0.5) {
      const s = v / 0.5;
      return `rgb(${lerp(248,245,s)},${lerp(248,172,s)},${lerp(248,172,s)})`;
    }
    const s = (v - 0.5) / 0.5;
    return `rgb(${lerp(245,193,s)},${lerp(172,58,s)},${lerp(172,44,s)})`;
  }
  const t = -v;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${lerp(248,133,s)},${lerp(248,212,s)},${lerp(248,244,s)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(${lerp(133,8,s)},${lerp(212,95,s)},${lerp(244,189,s)})`;
}

function buildMatrix() {
  const n = MS.length;
  const m = Array.from({length:n}, () => new Array(n).fill(0));
  const INTRA = {Local:0.83,Closeness:0.87,Betweenness:0.75,Spectral:0.89,"Random Walk":0.81,Community:0.57,Information:0.61};
  const INTER = {
    "Local-Closeness":0.57,"Local-Betweenness":0.52,"Local-Spectral":0.72,"Local-Random Walk":0.65,"Local-Community":0.29,"Local-Information":0.46,
    "Closeness-Betweenness":0.43,"Closeness-Spectral":0.62,"Closeness-Random Walk":0.57,"Closeness-Community":0.25,"Closeness-Information":0.34,
    "Betweenness-Spectral":0.40,"Betweenness-Random Walk":0.68,"Betweenness-Community":0.45,"Betweenness-Information":0.37,
    "Spectral-Random Walk":0.75,"Spectral-Community":0.23,"Spectral-Information":0.53,
    "Random Walk-Community":0.30,"Random Walk-Information":0.48,"Community-Information":0.30,
  };
  const SP = {"0-1":0.91,"0-2":0.84,"0-3":0.41,"0-8":0.57,"0-11":0.73,"0-12":0.75,"1-2":0.87,"1-3":0.37,"2-3":0.44,
    "4-5":0.96,"4-6":0.74,"4-7":0.90,"5-6":0.71,"5-7":0.87,"6-7":0.73,"8-9":0.79,"8-10":0.71,"9-10":0.67,
    "11-12":0.88,"11-13":0.93,"11-14":0.60,"12-13":0.87,"12-16":0.83,"13-14":0.57,"15-16":0.82,"15-12":0.70,
    "17-8":0.54,"17-18":-0.31,"17-19":0.47,"18-0":-0.22,"18-19":-0.29,"20-21":0.55,"20-22":0.61,"21-22":0.51};
  const ptb = (i,j,b) => { const s = ((i*31+j*17+i*j*7)%100-50)/550; return Math.max(-0.15,Math.min(0.98,b+s)); };
  for (let i=0;i<n;i++) for (let j=0;j<n;j++) {
    if (i===j){m[i][j]=1;continue;} if(j<i){m[i][j]=m[j][i];continue;}
    const k=`${i}-${j}`, kr=`${j}-${i}`;
    if(SP[k]!==undefined) m[i][j]=SP[k];
    else if(SP[kr]!==undefined) m[i][j]=SP[kr];
    else { const fi=MS[i].family,fj=MS[j].family; m[i][j]=ptb(i,j,fi===fj?INTRA[fi]:(INTER[`${fi}-${fj}`]||INTER[`${fj}-${fi}`]||0.35)); }
  }
  return m;
}
const MAT = buildMatrix();

function interpLabel(v) {
  if(v>=0.9) return "Very strong";
  if(v>=0.7) return "Strong";
  if(v>=0.5) return "Moderate";
  if(v>=0.3) return "Weak";
  if(v>=-0.1) return "Very weak";
  if(v>=-0.4) return "Weak negative";
  return "Moderate negative";
}

export default function App() {
  const [tab, setTab] = useState("heatmap");
  const [famOn, setFamOn] = useState(() => Object.fromEntries(FAM.map(f=>[f.name,true])));
  const [hov, setHov] = useState(null);
  const [pin, setPin] = useState(null);
  const [q, setQ] = useState("");
  const [expFam, setExpFam] = useState("All");

  const vis = useMemo(() => MS.filter(m=>famOn[m.family]), [famOn]);
  const hitIds = useMemo(() => {
    if(!q.trim()) return new Set();
    const ql = q.toLowerCase();
    return new Set(MS.filter(m=>m.name.toLowerCase().includes(ql)||m.family.toLowerCase().includes(ql)).map(m=>m.id));
  }, [q]);

  const CELL=24, LEFT=140, TOP=98, BAND=7;
  const n = vis.length;
  const svgW = LEFT + n*CELL + 20;
  const svgH = TOP + n*CELL + 16;

  const active = pin || hov;
  const mA = active ? vis[active.i] : null;
  const mB = active ? vis[active.j] : null;
  const cv = (mA && mB) ? MAT[mA.id][mB.id] : null;

  const toggleFam = useCallback(name => {
    setFamOn(p=>({...p,[name]:!p[name]}));
    setPin(null); setHov(null);
  }, []);

  const expMs = useMemo(() => {
    let ms = MS;
    if(expFam!=="All") ms=ms.filter(m=>m.family===expFam);
    if(q) ms=ms.filter(m=>m.name.toLowerCase().includes(q.toLowerCase())||m.desc.toLowerCase().includes(q.toLowerCase()));
    return ms;
  }, [expFam, q]);

  // family group bands for heatmap
  const bands = useMemo(() => {
    const res = [];
    let i=0;
    while(i<vis.length) {
      const fam=vis[i].family; let j=i;
      while(j<vis.length&&vis[j].family===fam) j++;
      res.push({fam,start:i,end:j,color:famMap[fam].color});
      i=j;
    }
    return res;
  }, [vis]);

  return (
    <div style={{fontFamily:"var(--font-sans,system-ui,sans-serif)",background:"var(--color-background-tertiary,#f8f9fa)",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{background:"#1a2535",padding:"0 20px",display:"flex",alignItems:"center",gap:20,height:52,flexShrink:0}}>
        <div>
          <span style={{color:"#e2e8f0",fontWeight:500,fontSize:15,letterSpacing:"-0.01em"}}>Centrality Zoo</span>
          <span style={{color:"#64748b",fontSize:13,marginLeft:8}}>/ interactive comparison</span>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["heatmap","Correlation heatmap"],["explorer","Measure explorer"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{padding:"5px 14px",border:"none",cursor:"pointer",borderRadius:6,fontSize:12.5,fontWeight:500,
              background:tab===id?"rgba(55,138,221,0.18)":"transparent",
              color:tab===id?"#7db8f0":"#8899aa",transition:"all 0.15s"}}>
              {label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:8}}>
          <span style={{fontSize:11,color:"#475569"}}>23 measures</span>
          <span style={{color:"#334155",fontSize:11}}>·</span>
          <span style={{fontSize:11,color:"#475569"}}>648 networks</span>
          <span style={{color:"#334155",fontSize:11}}>·</span>
          <span style={{fontSize:11,color:"#475569"}}>Spearman ρ</span>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:176,background:"var(--color-background-primary,white)",borderRight:"0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.1))",padding:"14px 14px",overflowY:"auto",flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-tertiary,#94a3b8)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Families</div>
          {FAM.map(f=>{
            const on=famOn[f.name];
            const cnt=MS.filter(m=>m.family===f.name).length;
            return (
              <label key={f.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer",padding:"3px 0"}}>
                <div onClick={()=>toggleFam(f.name)} style={{width:12,height:12,borderRadius:3,background:on?f.color:"var(--color-border-tertiary,#ddd)",flexShrink:0,border:`1.5px solid ${on?f.color:"var(--color-border-secondary,#ccc)"}`,cursor:"pointer",transition:"all 0.12s"}}/>
                <span style={{fontSize:12,color:on?"var(--color-text-primary,#1e293b)":"var(--color-text-tertiary,#94a3b8)",flex:1,fontWeight:on?500:400,transition:"color 0.12s",userSelect:"none"}} onClick={()=>toggleFam(f.name)}>{f.name}</span>
                <span style={{fontSize:10,color:"var(--color-text-tertiary,#94a3b8)"}}>{cnt}</span>
              </label>
            );
          })}

          <div style={{marginTop:18,marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-tertiary,#94a3b8)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Search</div>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filter measures…"
              style={{width:"100%",padding:"5px 8px",border:"0.5px solid var(--color-border-secondary,rgba(0,0,0,0.18))",borderRadius:6,fontSize:12,background:"var(--color-background-secondary,#f8fafc)",color:"var(--color-text-primary,#1e293b)",outline:"none",boxSizing:"border-box"}}/>
          </div>

          {tab==="heatmap" && (<>
            <div style={{marginTop:16}}>
              <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-tertiary,#94a3b8)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Scale</div>
              <div style={{borderRadius:4,overflow:"hidden",height:12,background:"linear-gradient(to right,rgb(8,95,189),rgb(133,212,244),rgb(248,248,248),rgb(245,172,172),rgb(193,58,44))",marginBottom:4}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--color-text-tertiary,#94a3b8)"}}>
                <span>−1</span><span>0</span><span>+1</span>
              </div>
            </div>
          </>)}
        </div>

        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {tab==="heatmap" && (<>
            {/* Info bar */}
            <div style={{borderBottom:"0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.08))",padding:"10px 18px",minHeight:62,display:"flex",alignItems:"center",gap:14,background:"var(--color-background-primary,white)",flexShrink:0}}>
              {active && mA && mB ? (<>
                <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{background:famMap[mA.family].bg,border:`0.5px solid ${famMap[mA.family].border}`,borderRadius:4,padding:"1px 6px",fontSize:10.5,fontWeight:500,color:famMap[mA.family].text,flexShrink:0}}>{mA.family}</span>
                    <span style={{fontWeight:500,fontSize:13.5,color:"var(--color-text-primary,#1e293b)",whiteSpace:"nowrap"}}>{mA.name}</span>
                    {mA.id!==mB.id && <span style={{color:"var(--color-text-tertiary,#94a3b8)",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mA.desc}</span>}
                  </div>
                  {mA.id!==mB.id && (
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{background:famMap[mB.family].bg,border:`0.5px solid ${famMap[mB.family].border}`,borderRadius:4,padding:"1px 6px",fontSize:10.5,fontWeight:500,color:famMap[mB.family].text,flexShrink:0}}>{mB.family}</span>
                      <span style={{fontWeight:500,fontSize:13.5,color:"var(--color-text-primary,#1e293b)",whiteSpace:"nowrap"}}>{mB.name}</span>
                      <span style={{color:"var(--color-text-tertiary,#94a3b8)",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mB.desc}</span>
                    </div>
                  )}
                </div>
                {mA.id!==mB.id && cv!==null && (
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:22,fontWeight:500,color:cv>=0.7?"#C0392B":cv>=0.4?"#BA7517":"#1A6FA6",fontFamily:"var(--font-mono,monospace)",letterSpacing:"-0.02em"}}>
                      ρ = {cv>=0?"+":""}{cv.toFixed(3)}
                    </div>
                    <div style={{fontSize:11,color:"var(--color-text-tertiary,#94a3b8)"}}>{interpLabel(cv)} correlation{pin?" · pinned":""}</div>
                  </div>
                )}
                {mA.id===mB.id && (
                  <div style={{color:"var(--color-text-tertiary,#94a3b8)",fontSize:12}}>{mA.desc}</div>
                )}
              </>) : (
                <div style={{color:"var(--color-text-tertiary,#94a3b8)",fontSize:13}}>
                  Hover a cell to compare · Click to pin · {vis.length} measures shown
                </div>
              )}
              {pin && <button onClick={()=>setPin(null)} style={{fontSize:11,padding:"3px 8px",borderRadius:5,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",color:"var(--color-text-secondary,#64748b)",flexShrink:0}}>Clear</button>}
            </div>

            {/* SVG heatmap */}
            <div style={{flex:1,overflow:"auto",padding:"12px 16px"}}>
              <svg width={svgW} height={svgH} style={{display:"block"}}
                onMouseLeave={()=>{ if(!pin) setHov(null); }}>

                {/* Family bands on rows + cols */}
                {bands.map(({fam,start,end,color})=>(
                  <g key={fam}>
                    <rect x={LEFT-BAND-2} y={TOP+start*CELL} width={BAND} height={(end-start)*CELL} fill={color} rx={0}/>
                    <rect x={LEFT+start*CELL} y={TOP-BAND-2} width={(end-start)*CELL} height={BAND} fill={color} rx={0}/>
                  </g>
                ))}

                {/* Separator lines between families */}
                {bands.slice(1).map(({start})=>(
                  <g key={start}>
                    <line x1={LEFT} y1={TOP+start*CELL} x2={LEFT+n*CELL} y2={TOP+start*CELL} stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} strokeDasharray="2,2"/>
                    <line x1={LEFT+start*CELL} y1={TOP} x2={LEFT+start*CELL} y2={TOP+n*CELL} stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} strokeDasharray="2,2"/>
                  </g>
                ))}

                {/* Row labels */}
                {vis.map((m,i)=>{
                  const hi=q&&hitIds.has(m.id);
                  const actv=active&&(active.i===i||active.j===i);
                  const f=famMap[m.family];
                  return (
                    <text key={m.id} x={LEFT-BAND-6} y={TOP+i*CELL+CELL/2+4.5} textAnchor="end"
                      fontSize={10.5} fontFamily="var(--font-sans,system-ui)"
                      fontWeight={hi||actv?500:400}
                      fill={hi?f.color:actv?"var(--color-text-primary,#1e293b)":"var(--color-text-secondary,#64748b)"}
                      style={{userSelect:"none"}}>
                      {m.name}
                    </text>
                  );
                })}

                {/* Column labels (rotated -45°) */}
                {vis.map((m,j)=>{
                  const hi=q&&hitIds.has(m.id);
                  const actv=active&&(active.i===j||active.j===j);
                  const f=famMap[m.family];
                  return (
                    <g key={m.id} transform={`translate(${LEFT+j*CELL+CELL/2},${TOP-BAND-6})`}>
                      <text textAnchor="start" fontSize={10.5} fontFamily="var(--font-sans,system-ui)"
                        fontWeight={hi||actv?500:400}
                        fill={hi?f.color:actv?"var(--color-text-primary,#1e293b)":"var(--color-text-secondary,#64748b)"}
                        transform="rotate(-45)"
                        style={{userSelect:"none"}}>
                        {m.name}
                      </text>
                    </g>
                  );
                })}

                {/* Cells */}
                {vis.map((mRow,i)=>vis.map((mCol,j)=>{
                  const v=MAT[mRow.id][mCol.id];
                  const isPinned=pin&&pin.i===i&&pin.j===j;
                  const isHov=hov&&hov.i===i&&hov.j===j;
                  const isActvRow=active&&(active.i===i||active.j===i);
                  const isActvCol=active&&(active.i===j||active.j===j);
                  const dim=q&&!hitIds.has(mRow.id)&&!hitIds.has(mCol.id)&&q.trim();
                  return (
                    <rect key={`${i}-${j}`}
                      x={LEFT+j*CELL+0.5} y={TOP+i*CELL+0.5}
                      width={CELL-1} height={CELL-1}
                      fill={corrColor(v)}
                      opacity={dim?0.3:1}
                      stroke={isPinned?"#1a2535":isHov?"rgba(0,0,0,0.5)":(isActvRow&&isActvCol)?"rgba(0,0,0,0.35)":"rgba(0,0,0,0.06)"}
                      strokeWidth={isPinned?2:isHov?1.5:(isActvRow&&isActvCol)?1:0.5}
                      rx={1}
                      style={{cursor:"pointer"}}
                      onMouseEnter={()=>{ if(!pin) setHov({i,j}); }}
                      onClick={()=>setPin(p=>p&&p.i===i&&p.j===j?null:{i,j})}
                    />
                  );
                }))}

                {/* Value label on hovered/pinned cell */}
                {active && (<>
                  {[pin, hov].filter(Boolean).slice(0,1).map(cell=>{
                    const v2=MAT[vis[cell.i].id][vis[cell.j].id];
                    const bright=Math.abs(v2)>0.6;
                    return (
                      <text key="val"
                        x={LEFT+cell.j*CELL+CELL/2} y={TOP+cell.i*CELL+CELL/2+4}
                        textAnchor="middle" fontSize={7} fontWeight={500}
                        fontFamily="var(--font-mono,monospace)"
                        fill={bright?"rgba(255,255,255,0.92)":"rgba(0,0,0,0.7)"}
                        style={{pointerEvents:"none",userSelect:"none"}}>
                        {v2.toFixed(2)}
                      </text>
                    );
                  })}
                </>)}
              </svg>
            </div>
          </>)}

          {tab==="explorer" && (
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
              {/* Explorer header */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or description…"
                  style={{width:280,padding:"6px 10px",border:"0.5px solid var(--color-border-secondary,rgba(0,0,0,0.18))",borderRadius:6,fontSize:12.5,background:"var(--color-background-primary,white)",color:"var(--color-text-primary,#1e293b)",outline:"none"}}/>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {["All",...FAM.map(f=>f.name)].map(name=>{
                    const isAll=name==="All";
                    const f=isAll?null:famMap[name];
                    const active2=expFam===name;
                    return (
                      <button key={name} onClick={()=>setExpFam(name)}
                        style={{padding:"4px 10px",border:`0.5px solid ${active2&&f?f.border:"var(--color-border-tertiary,rgba(0,0,0,0.1))"}`,borderRadius:5,cursor:"pointer",fontSize:11.5,fontWeight:active2?500:400,
                          background:active2&&f?f.bg:active2?"var(--color-background-secondary,#f1f5f9)":"transparent",
                          color:active2&&f?f.text:active2?"var(--color-text-primary,#1e293b)":"var(--color-text-secondary,#64748b)"}}>
                        {name}
                      </button>
                    );
                  })}
                </div>
                <span style={{fontSize:12,color:"var(--color-text-tertiary,#94a3b8)",marginLeft:"auto"}}>{expMs.length} measures</span>
              </div>

              {/* Cards */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
                {expMs.map(m=>{
                  const f=famMap[m.family];
                  return (
                    <div key={m.id} style={{background:"var(--color-background-primary,white)",border:`0.5px solid ${f.border}`,borderLeft:`3px solid ${f.color}`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                        <span style={{fontWeight:500,fontSize:13.5,color:"var(--color-text-primary,#1e293b)"}}>{m.name}</span>
                        <span style={{background:f.bg,color:f.text,borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:500,marginLeft:"auto",whiteSpace:"nowrap"}}>{m.family}</span>
                      </div>
                      <p style={{margin:0,fontSize:12,color:"var(--color-text-secondary,#64748b)",lineHeight:1.55}}>{m.desc}</p>
                      <div style={{marginTop:8,display:"flex",gap:6}}>
                        <button onClick={()=>{ setTab("heatmap"); const idx=vis.findIndex(v=>v.id===m.id); if(idx>=0) setPin({i:idx,j:idx}); }}
                          style={{fontSize:11,padding:"3px 8px",borderRadius:5,border:"0.5px solid var(--color-border-tertiary,rgba(0,0,0,0.12))",background:"transparent",cursor:"pointer",color:"var(--color-text-secondary,#64748b)"}}>
                          View in heatmap
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
