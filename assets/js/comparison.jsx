const { useState, useMemo, useEffect, useCallback, useRef } = React;

const DATA_URL = "assets/data/correlation.json";
const DEFAULTS = [0,1,2,3,4,6,8,10,12,20,21,22,32,36,37,38,39,55,56,70,71,74,86,88,13];

const FAM = [
  { name:"Local/Degree",  color:"#378ADD", bg:"#E6F1FB", border:"#B5D4F4", text:"#0C447C" },
  { name:"Closeness",     color:"#1D9E75", bg:"#E1F5EE", border:"#9FE1CB", text:"#085041" },
  { name:"Betweenness",   color:"#BA7517", bg:"#FAEEDA", border:"#FAC775", text:"#633806" },
  { name:"Spectral",      color:"#7F77DD", bg:"#EEEDFE", border:"#CECBF6", text:"#3C3489" },
  { name:"Random Walk",   color:"#D85A30", bg:"#FAECE7", border:"#F5C4B3", text:"#712B13" },
  { name:"Community",     color:"#639922", bg:"#EAF3DE", border:"#C0DD97", text:"#27500A" },
  { name:"Core/Shell",    color:"#64748B", bg:"#F1F5F9", border:"#CBD5E1", text:"#334155" },
  { name:"Information",   color:"#A16207", bg:"#FEFCE8", border:"#FDE047", text:"#713F12" },
  { name:"Gravity",       color:"#BE185D", bg:"#FDF2F8", border:"#F9A8D4", text:"#831843" },
  { name:"Other",         color:"#94A3B8", bg:"#F8FAFC", border:"#E2E8F0", text:"#475569" },
];
const famNames = FAM.map(f => f.name);
const famMap   = Object.fromEntries(FAM.map(f => [f.name, f]));

function guessFamily(label) {
  const l = label.toLowerCase();
  if (l === "entropy" || l.includes("entropy") || l.includes("mutual information") || l.includes("qjsd")) return "Information";
  if (l.includes("betweenness") || l === "load" || l === "stress" || l.includes("routing between")) return "Betweenness";
  if (l.includes("closeness") || l === "harmonic" || l === "eccentricity" || l.includes("lin's") || l === "decay" || l.includes("residual close") || l.includes("electrical close") || l === "centroid" || l === "integration") return "Closeness";
  if (l.includes("pagerank") || l.includes("eigenvector") || l.includes("katz") || l === "subgraph" || l.includes("leaderrank") || l.includes("voterank") || l.includes("articlerank") || l.includes("spectralrank") || l.includes("hubbell") || l.includes("seeley") || l.includes("salsa") || l.includes("dirichletrank") || l.includes("laplacian") || l === "sric" || l.includes("lric")) return "Spectral";
  if (l.includes("random walk") || l.includes("markov") || l.includes("arw") || l.includes("second order") || l.includes("rrwg") || l.includes("rwa") || l.includes("pjrw") || l.includes("physarum")) return "Random Walk";
  if (l.includes("community") || l.includes("burt") || l.includes("bridg") || l.includes("effective size") || l.includes("redundancy") || l.includes("gateway") || l.includes("flow coef") || l.includes("diversity coef") || l.includes("modularity") || l.includes("participation") || l.includes("cc-burt") || l.includes("e-burt")) return "Community";
  if (l.includes("gravity") || l === "effg" || l.includes("gsm") || l.includes("igsm") || l.includes("dkgm") || l === "lgc") return "Gravity";
  if (l.includes("k-shell") || l.includes("k-truss") || l.includes("coreness") || l.includes("collinf") || l.includes("collective inf") || l.includes("shell") || l.includes("core") || l === "k-path" || l === "mnc" || l === "dmnc" || l === "epc" || l === "m-reach") return "Core/Shell";
  return "Local/Degree";
}

const lerp = (a, b, t) => Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
function corrColor(v) {
  v = Math.max(-1, Math.min(1, v));
  if (v >= 0) {
    if (v < 0.5) { const s = v / 0.5; return `rgb(${lerp(248,245,s)},${lerp(248,174,s)},${lerp(248,172,s)})`; }
    const s = (v - 0.5) / 0.5; return `rgb(${lerp(245,192,s)},${lerp(174,57,s)},${lerp(172,44,s)})`;
  }
  const t = -v;
  if (t < 0.5) { const s = t / 0.5; return `rgb(${lerp(248,133,s)},${lerp(248,212,s)},${lerp(248,244,s)})`; }
  const s = (t - 0.5) / 0.5; return `rgb(${lerp(133,8,s)},${lerp(212,95,s)},${lerp(244,189,s)})`;
}
function corrText(v) { return Math.abs(v) > 0.62 ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.7)"; }
function interpLabel(v) {
  if (v >= 0.9) return "Very strong positive"; if (v >= 0.7) return "Strong positive";
  if (v >= 0.5) return "Moderate positive";   if (v >= 0.3) return "Weak positive";
  if (v > -0.1) return "Near zero";           if (v > -0.4) return "Weak negative";
  return "Moderate-strong negative";
}

// Average-linkage hierarchical clustering — returns reordered indices into measures[]
function clusterLeafOrder(measures, getCorr) {
  const n = measures.length;
  if (n <= 2) return measures.map((_, i) => i);
  const D = Array.from({length:n}, (_, i) =>
    Array.from({length:n}, (_, j) => i === j ? 0 : 1 - getCorr(measures[i].i, measures[j].i))
  );
  const sizes    = new Array(n).fill(1);
  const children = Array.from({length:n}, (_, i) => [i]);
  const active   = new Set(Array.from({length:n}, (_, i) => i));
  while (active.size > 1) {
    let minD = Infinity, minA = -1, minB = -1;
    const arr = [...active];
    for (let p = 0; p < arr.length; p++)
      for (let q = p + 1; q < arr.length; q++)
        if (D[arr[p]][arr[q]] < minD) { minD = D[arr[p]][arr[q]]; minA = arr[p]; minB = arr[q]; }
    const sa = sizes[minA], sb = sizes[minB];
    children[minA] = [...children[minA], ...children[minB]];
    sizes[minA] = sa + sb;
    active.delete(minB);
    for (const c of active) {
      if (c === minA) continue;
      D[minA][c] = D[c][minA] = (sa * D[minA][c] + sb * D[minB][c]) / (sa + sb);
    }
  }
  return children[[...active][0]];
}

// Classical MDS — returns {x,y} per measure
function computeMDS(measures, getCorr) {
  const n = measures.length;
  if (n < 3) return measures.map((_, i) => ({ x: i * 60, y: 0 }));
  const D2 = Array.from({length:n}, (_, i) =>
    Array.from({length:n}, (_, j) => { const r = Math.max(-1, Math.min(1, getCorr(measures[i].i, measures[j].i))); return (1 - r) ** 2; })
  );
  const rowMean = D2.map(row => row.reduce((s, x) => s + x, 0) / n);
  const totMean = rowMean.reduce((s, x) => s + x, 0) / n;
  const B = Array.from({length:n}, (_, i) =>
    Array.from({length:n}, (_, j) => -0.5 * (D2[i][j] - rowMean[i] - rowMean[j] + totMean))
  );
  const mv  = (M, v) => M.map(row => row.reduce((s, m, k) => s + m * v[k], 0));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const nrm = v => { const d = Math.sqrt(dot(v, v)) || 1; return v.map(x => x / d); };
  let v1 = nrm(Array.from({length:n}, (_, i) => Math.sin(i * 1.7 + 0.5)));
  let v2 = nrm(Array.from({length:n}, (_, i) => Math.cos(i * 2.3 + 1.2)));
  for (let iter = 0; iter < 150; iter++) {
    v1 = nrm(mv(B, v1));
    let Bv2 = mv(B, v2);
    Bv2 = Bv2.map((x, i) => x - dot(Bv2, v1) * v1[i]);
    v2 = nrm(Bv2);
  }
  const e1 = Math.sqrt(Math.max(0, dot(v1, mv(B, v1))));
  const e2 = Math.sqrt(Math.max(0, dot(v2, mv(B, v2))));
  return measures.map((_, i) => ({ x: v1[i] * e1, y: v2[i] * e2 }));
}

// Greedy maximin — picks k measures that maximally cover the behavioural space.
// Step 1: start with the most "central" measure (highest avg correlation to all others).
// Step 2: repeatedly pick the measure farthest from the current selected set.
function greedyMaximin(measures, getCorr, k) {
  const n = measures.length;
  if (n === 0 || k === 0) return [];
  k = Math.min(k, n);

  // Seed: measure with highest average correlation = most representative of the main blob
  let bestAvg = -1, seed = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += i === j ? 0 : getCorr(measures[i].i, measures[j].i);
    const avg = sum / (n - 1);
    if (avg > bestAvg) { bestAvg = avg; seed = i; }
  }

  const selected = [seed];
  // minDistToSet[i] = distance from measure i to the nearest selected measure
  const minDist = Array.from({length: n}, (_, i) =>
    i === seed ? 0 : 1 - getCorr(measures[i].i, measures[seed].i)
  );

  while (selected.length < k) {
    // Pick unselected measure with largest min-distance to selected set
    let farthestDist = -1, farthest = -1;
    for (let i = 0; i < n; i++) {
      if (minDist[i] === 0 && selected.includes(i)) continue;
      if (selected.includes(i)) continue;
      if (minDist[i] > farthestDist) { farthestDist = minDist[i]; farthest = i; }
    }
    if (farthest === -1 || farthestDist < 0.005) break;
    selected.push(farthest);
    // Update minDist for remaining measures
    for (let i = 0; i < n; i++) {
      if (selected.includes(i)) continue;
      const d = 1 - getCorr(measures[i].i, measures[farthest].i);
      if (d < minDist[i]) minDist[i] = d;
    }
  }
  return selected;
}
  const f = famMap[fam] || famMap["Other"];
  return <span style={{background:f.bg,border:`0.5px solid ${f.border}`,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:500,color:f.text,flexShrink:0}}>{fam}</span>;
}
function SideSection({ label, children, mt }) {
  return (
    <div style={{marginBottom:14,marginTop:mt||0}}>
      <div style={{fontSize:10,fontWeight:500,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>{label}</div>
      {children}
    </div>
  );
}

function App() {
  const [rawData, setRawData]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [tab, setTab]                 = useState("heatmap");
  const [selectedIdx, setSelectedIdx] = useState(new Set(DEFAULTS));
  const [famOn, setFamOn]             = useState(() => Object.fromEntries(famNames.map(n => [n, true])));
  const [hov, setHov]                 = useState(null);
  const [pin, setPin]                 = useState(null);
  const [searchQ, setSearchQ]         = useState("");
  const [addQ, setAddQ]               = useState("");
  const [showAdd, setShowAdd]         = useState(false);
  const [sortMode, setSortMode]       = useState("family");
  const [edgeThresh, setEdgeThresh]   = useState(0.88);
  const [hovNode, setHovNode]         = useState(null);
  const [mdsCoords, setMdsCoords]     = useState([]);
  const [mdsComputing, setMdsComputing] = useState(false);
  const [coveringK, setCoveringK]     = useState(6);
  const [showCovering, setShowCovering] = useState(false);
  const addRef = useRef(null);

  const showAll = useCallback(() => {
    if (!rawData) return;
    setSelectedIdx(new Set(Array.from({length: rawData.labels.length}, (_, i) => i)));
    setEdgeThresh(0.95);
  }, [rawData]);
  const resetView = useCallback(() => {
    setSelectedIdx(new Set(DEFAULTS));
    setEdgeThresh(0.88);
  }, []);

  useEffect(() => {
    fetch(DATA_URL).then(r => r.json()).then(d => {
      setRawData({ labels: d.labels, matrix: d.matrix, families: d.labels.map(guessFamily) });
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    const h = e => { if (addRef.current && !addRef.current.contains(e.target)) setShowAdd(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const getCorr = useCallback((ia, ib) => rawData?.matrix[ia][ib] ?? 0, [rawData]);

  const visMeasures = useMemo(() => {
    if (!rawData) return [];
    return Array.from(selectedIdx)
      .map(i => ({ i, label: rawData.labels[i], family: rawData.families[i] }))
      .filter(m => famOn[m.family])
      .sort((a, b) => famNames.indexOf(a.family) - famNames.indexOf(b.family));
  }, [rawData, selectedIdx, famOn]);

  const clusterOrder = useMemo(() => {
    if (!rawData || visMeasures.length < 3) return visMeasures.map((_, i) => i);
    return clusterLeafOrder(visMeasures, getCorr);
  }, [visMeasures, getCorr, rawData]);

  const orderedMeasures = useMemo(() =>
    sortMode === "clustered" ? clusterOrder.map(i => visMeasures[i]) : visMeasures,
    [sortMode, clusterOrder, visMeasures]
  );

  // Greedy maximin covering set (indices into visMeasures)
  const coveringSet = useMemo(() => {
    if (!showCovering || !rawData || visMeasures.length < 2) return [];
    return greedyMaximin(visMeasures, getCorr, coveringK);
  }, [showCovering, visMeasures, getCorr, coveringK, rawData]);
  useEffect(() => {
    if (!rawData || visMeasures.length < 3) { setMdsCoords([]); return; }
    setMdsComputing(true);
    const t = setTimeout(() => {
      setMdsCoords(computeMDS(visMeasures, getCorr));
      setMdsComputing(false);
    }, 20);
    return () => clearTimeout(t);
  }, [visMeasures, getCorr, rawData]);

  const active = pin || hov;
  const mA = active ? orderedMeasures[active.i] : null;
  const mB = active ? orderedMeasures[active.j] : null;
  const cv = (mA && mB) ? getCorr(mA.i, mB.i) : null;

  const bands = useMemo(() => {
    if (sortMode !== "family") return [];
    const res = []; let i = 0;
    while (i < orderedMeasures.length) {
      const fam = orderedMeasures[i].family; let j = i;
      while (j < orderedMeasures.length && orderedMeasures[j].family === fam) j++;
      res.push({ fam, start: i, end: j }); i = j;
    }
    return res;
  }, [orderedMeasures, sortMode]);

  const suggestions = useMemo(() => {
    if (!rawData || !addQ.trim()) return [];
    const q = addQ.toLowerCase();
    return rawData.labels
      .map((lbl, i) => ({ i, label: lbl, family: rawData.families[i] }))
      .filter(m => !selectedIdx.has(m.i) && m.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [rawData, addQ, selectedIdx]);

  const hitIds = useMemo(() => {
    if (!searchQ.trim() || !rawData) return new Set();
    const q = searchQ.toLowerCase();
    return new Set(rawData.labels.map((l,i)=>({l,i})).filter(({l})=>l.toLowerCase().includes(q)).map(({i})=>i));
  }, [searchQ, rawData]);

  const stats = useMemo(() => {
    if (!rawData || visMeasures.length < 2) return null;
    let min = 1, max = -1, minPair = null, maxPair = null;
    for (let i = 0; i < visMeasures.length; i++)
      for (let j = i + 1; j < visMeasures.length; j++) {
        const v = getCorr(visMeasures[i].i, visMeasures[j].i);
        if (v < min) { min = v; minPair = [visMeasures[i].label, visMeasures[j].label]; }
        if (v > max) { max = v; maxPair = [visMeasures[i].label, visMeasures[j].label]; }
      }
    return { min: min.toFixed(3), max: max.toFixed(3), minPair, maxPair };
  }, [visMeasures, getCorr, rawData]);

  const MDS_W = visMeasures.length > 100 ? 800 : 560;
  const MDS_H = visMeasures.length > 100 ? 620 : 430;
  const PAD   = visMeasures.length > 100 ? 18  : 52;
  const mdsLayout = useMemo(() => {
    if (!mdsCoords.length) return { coords: [], edges: [] };
    const xs = mdsCoords.map(c => c.x), ys = mdsCoords.map(c => c.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1;
    const coords = mdsCoords.map(c => ({
      x: PAD + ((c.x - xMin) / xR) * (MDS_W - PAD * 2),
      y: PAD + ((c.y - yMin) / yR) * (MDS_H - PAD * 2)
    }));
    // Collect all qualifying edges — sorted strongest first
    const allEdges = [];
    for (let i = 0; i < visMeasures.length; i++)
      for (let j = i + 1; j < visMeasures.length; j++) {
        const v = getCorr(visMeasures[i].i, visMeasures[j].i);
        if (v >= edgeThresh) allEdges.push({ i, j, v });
      }
    allEdges.sort((a, b) => b.v - a.v);
    return { coords, edges: allEdges };
  }, [mdsCoords, visMeasures, getCorr, edgeThresh, MDS_W, MDS_H, PAD]);

  const CELL = 24, LEFT = 155, TOP = 105, BAND = 6;
  const n = orderedMeasures.length;

  const removeMeasure = useCallback((mi) => {
    setSelectedIdx(s => { const nx = new Set(s); nx.delete(mi); return nx; });
    setPin(null); setHov(null);
  }, []);

  const AddBlock = () => (
    <SideSection label="Add measures">
      <div ref={addRef} style={{position:"relative"}}>
        <input value={addQ} onChange={e=>{setAddQ(e.target.value);setShowAdd(true);}} onFocus={()=>setShowAdd(true)}
          placeholder="Search 330 measures..."
          style={{width:"100%",padding:"5px 8px",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:6,fontSize:11.5,background:"#f8fafc",color:"#1e293b",outline:"none",boxSizing:"border-box"}}/>
        {showAdd && suggestions.length > 0 && (
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"white",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:6,marginTop:3,zIndex:100,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",maxHeight:220,overflowY:"auto"}}>
            {suggestions.map(m => {
              const f = famMap[m.family]||famMap["Other"];
              return (
                <div key={m.i} onClick={()=>{setSelectedIdx(s=>new Set([...s,m.i]));setAddQ("");setShowAdd(false);}}
                  style={{padding:"6px 9px",cursor:"pointer",borderBottom:"0.5px solid rgba(0,0,0,0.06)",display:"flex",alignItems:"center",gap:6}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{width:7,height:7,borderRadius:2,background:f.color,flexShrink:0}}/>
                  <span style={{fontSize:11.5,color:"#1e293b",flex:1,lineHeight:1.3}}>{m.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>{selectedIdx.size} in view</div>
    </SideSection>
  );

  const FamilyToggles = () => (
    <SideSection label="Show families">
      {FAM.map(f => {
        const cnt = Array.from(selectedIdx).filter(i => rawData.families[i] === f.name).length;
        if (cnt === 0) return null;
        const on = famOn[f.name];
        return (
          <label key={f.name} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,cursor:"pointer"}}>
            <div onClick={()=>setFamOn(p=>({...p,[f.name]:!p[f.name]}))}
              style={{width:11,height:11,borderRadius:3,background:on?f.color:"#ddd",flexShrink:0,border:`1.5px solid ${on?f.color:"#ccc"}`,cursor:"pointer"}}/>
            <span onClick={()=>setFamOn(p=>({...p,[f.name]:!p[f.name]}))}
              style={{fontSize:11.5,color:on?"#1e293b":"#94a3b8",flex:1,userSelect:"none"}}>{f.name}</span>
            <span style={{fontSize:10,color:"#94a3b8"}}>{cnt}</span>
          </label>
        );
      })}
    </SideSection>
  );

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:400,flexDirection:"column",gap:12,color:"#64748b"}}>
      <div style={{width:28,height:28,border:"2px solid #e2e8f0",borderTop:"2px solid #378ADD",borderRadius:"50%",animation:"czSpin 0.8s linear infinite"}}/>
      <span style={{fontSize:13}}>Loading 330 centrality measures...</span>
    </div>
  );
  if (error) return <div style={{padding:20,color:"#dc2626",fontSize:13}}>Failed to load correlation data: {error}</div>;

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:"#f8fafc",height:"92vh",minHeight:560,display:"flex",flexDirection:"column",overflow:"hidden",border:"0.5px solid #e2e8f0",borderRadius:8}}>
      <style>{`@keyframes czSpin{to{transform:rotate(360deg)}}`}</style>

      <div style={{background:"#1a2535",padding:"0 18px",display:"flex",alignItems:"center",gap:16,height:50,flexShrink:0,borderRadius:"8px 8px 0 0"}}>
        <div>
          <span style={{color:"#e2e8f0",fontWeight:500,fontSize:15}}>Centrality Zoo</span>
          <span style={{color:"#64748b",fontSize:12,marginLeft:8}}>/ interactive comparison</span>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:3}}>
          {[["heatmap","Correlation heatmap"],["similarity","Similarity map"],["explorer","Measure explorer"]].map(([id,label]) => (
            <button key={id} onClick={()=>setTab(id)} style={{padding:"5px 12px",border:"none",cursor:"pointer",borderRadius:5,fontSize:12,fontWeight:500,
              background:tab===id?"rgba(55,138,221,0.2)":"transparent",color:tab===id?"#7db8f0":"#8899aa"}}>
              {label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,marginLeft:6}}>
          <span style={{fontSize:11,color:"#475569"}}>{rawData.labels.length} measures</span>
          <span style={{color:"#334155",fontSize:11}}>·</span>
          <span style={{fontSize:11,color:"#475569"}}>648 networks</span>
          <span style={{color:"#334155",fontSize:11}}>·</span>
          <span style={{fontSize:11,color:"#475569"}}>Spearman rho avg</span>
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══ HEATMAP ══════════════════════════════════════════════════════════ */}
        {tab === "heatmap" && (<>
          <div style={{width:182,background:"white",borderRight:"0.5px solid rgba(0,0,0,0.08)",padding:"12px",overflowY:"auto",flexShrink:0}}>
            <AddBlock/>
            <FamilyToggles/>
            <SideSection label="Row/column order">
              {[["family","By family"],["clustered","By correlation"]].map(([mode,label]) => (
                <label key={mode} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,cursor:"pointer"}}>
                  <div onClick={()=>{setSortMode(mode);setPin(null);setHov(null);}}
                    style={{width:11,height:11,borderRadius:"50%",background:sortMode===mode?"#378ADD":"transparent",border:`2px solid ${sortMode===mode?"#378ADD":"#cbd5e1"}`,flexShrink:0,cursor:"pointer"}}/>
                  <span onClick={()=>{setSortMode(mode);setPin(null);setHov(null);}}
                    style={{fontSize:11.5,color:sortMode===mode?"#1e293b":"#64748b",userSelect:"none"}}>{label}</span>
                </label>
              ))}
              {sortMode==="clustered" && <div style={{fontSize:10,color:"#94a3b8",marginTop:2,lineHeight:1.4}}>Average-linkage on rho distance.</div>}
            </SideSection>
            <SideSection label="Highlight">
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Name to highlight..."
                style={{width:"100%",padding:"5px 8px",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:6,fontSize:11.5,background:"#f8fafc",color:"#1e293b",outline:"none",boxSizing:"border-box"}}/>
            </SideSection>
            <SideSection label="Spearman rho">
              <div style={{borderRadius:3,overflow:"hidden",height:10,background:"linear-gradient(to right,rgb(8,95,189),rgb(133,212,244),rgb(248,248,248),rgb(245,174,172),rgb(192,57,44))",marginBottom:4}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:9.5,color:"#94a3b8"}}><span>-1</span><span>0</span><span>+1</span></div>
            </SideSection>
            {stats && (
              <div style={{marginTop:4,paddingTop:12,borderTop:"0.5px solid rgba(0,0,0,0.08)"}}>
                <div style={{fontSize:10,fontWeight:500,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>In current view</div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#94a3b8"}}>Highest</div>
                  <div style={{fontSize:11.5,fontWeight:500,color:"#C0392B",fontFamily:"monospace"}}>{stats.max}</div>
                  <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.4}}>{stats.maxPair?.join(" x ")}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#94a3b8"}}>Lowest</div>
                  <div style={{fontSize:11.5,fontWeight:500,color:"#1A6FA6",fontFamily:"monospace"}}>{stats.min}</div>
                  <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.4}}>{stats.minPair?.join(" x ")}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{background:"white",borderBottom:"0.5px solid rgba(0,0,0,0.08)",padding:"8px 16px",minHeight:58,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              {active && mA && mB ? (<>
                <div style={{flex:1,minWidth:0}}>
                  {mA.i===mB.i ? (
                    <div style={{display:"flex",alignItems:"center",gap:8}}><Pill fam={mA.family}/><span style={{fontWeight:500,fontSize:14,color:"#1e293b"}}>{mA.label}</span></div>
                  ) : (<>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3,flexWrap:"wrap"}}>
                      <Pill fam={mA.family}/><span style={{fontWeight:500,fontSize:13,color:"#1e293b"}}>{mA.label}</span>
                      <span style={{color:"#94a3b8",fontSize:12}}>x</span>
                      <Pill fam={mB.family}/><span style={{fontWeight:500,fontSize:13,color:"#1e293b"}}>{mB.label}</span>
                    </div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{interpLabel(cv)}{pin?" (pinned)":""}</div>
                  </>)}
                </div>
                {mA.i!==mB.i && cv!==null && (
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:24,fontWeight:500,letterSpacing:"-0.02em",fontFamily:"monospace",
                      color:cv>=0.7?"#C0392B":cv>=0.3?"#BA7517":cv>=-0.1?"#666":"#1A6FA6"}}>
                      {cv>=0?"+":""}{cv.toFixed(3)}
                    </div>
                  </div>
                )}
                {pin && <button onClick={()=>setPin(null)} style={{fontSize:11,padding:"3px 9px",borderRadius:5,border:"0.5px solid rgba(0,0,0,0.15)",background:"transparent",cursor:"pointer",color:"#64748b",flexShrink:0}}>Clear</button>}
              </>) : (
                <div style={{color:"#94a3b8",fontSize:13}}>Hover a cell to compare · click to pin · click label to remove · {n} shown</div>
              )}
            </div>

            <div style={{flex:1,overflow:"auto",padding:"10px 14px"}}>
              {n===0 ? <div style={{color:"#94a3b8",fontSize:13,padding:24}}>No measures visible.</div> : (
                <svg width={LEFT+n*CELL+20} height={TOP+n*CELL+16} style={{display:"block"}} onMouseLeave={()=>{if(!pin)setHov(null);}}>
                  {bands.map(({fam,start,end}) => { const f=famMap[fam]||famMap["Other"]; return (
                    <g key={fam+start}>
                      <rect x={LEFT-BAND-3} y={TOP+start*CELL} width={BAND} height={(end-start)*CELL} fill={f.color} opacity={0.85}/>
                      <rect x={LEFT+start*CELL} y={TOP-BAND-3} width={(end-start)*CELL} height={BAND} fill={f.color} opacity={0.85}/>
                    </g>
                  );})}
                  {bands.slice(1).map(({start}) => (
                    <g key={`sp${start}`}>
                      <line x1={LEFT} y1={TOP+start*CELL} x2={LEFT+n*CELL} y2={TOP+start*CELL} stroke="rgba(0,0,0,0.18)" strokeWidth={0.8}/>
                      <line x1={LEFT+start*CELL} y1={TOP} x2={LEFT+start*CELL} y2={TOP+n*CELL} stroke="rgba(0,0,0,0.18)" strokeWidth={0.8}/>
                    </g>
                  ))}
                  {orderedMeasures.map((m,i) => { const hi=searchQ&&hitIds.has(m.i); const actv=active&&(active.i===i||active.j===i); const f=famMap[m.family]||famMap["Other"]; return (
                    <text key={m.i} x={LEFT-BAND-7} y={TOP+i*CELL+CELL/2+4.5} textAnchor="end" fontSize={10.5} fontWeight={hi||actv?"500":"400"} fill={hi?f.color:actv?"#1e293b":"#64748b"} style={{cursor:"pointer",userSelect:"none"}} onClick={()=>removeMeasure(m.i)}>{m.label}</text>
                  );})}
                  {orderedMeasures.map((m,j) => { const hi=searchQ&&hitIds.has(m.i); const actv=active&&(active.i===j||active.j===j); const f=famMap[m.family]||famMap["Other"]; return (
                    <g key={m.i} transform={`translate(${LEFT+j*CELL+CELL/2},${TOP-BAND-7})`}>
                      <text textAnchor="start" fontSize={10.5} fontWeight={hi||actv?"500":"400"} fill={hi?f.color:actv?"#1e293b":"#64748b"} transform="rotate(-45)" style={{cursor:"pointer",userSelect:"none"}} onClick={()=>removeMeasure(m.i)}>{m.label}</text>
                    </g>
                  );})}
                  {orderedMeasures.map((mRow,i) => orderedMeasures.map((mCol,j) => {
                    const v=getCorr(mRow.i,mCol.i); const isPinned=pin&&pin.i===i&&pin.j===j; const isHov2=hov&&hov.i===i&&hov.j===j;
                    const actRow=active&&(active.i===i||active.j===i); const actCol=active&&(active.i===j||active.j===j);
                    const dimmed=searchQ.trim()&&!hitIds.has(mRow.i)&&!hitIds.has(mCol.i);
                    return (
                      <rect key={`${i}-${j}`} x={LEFT+j*CELL+0.5} y={TOP+i*CELL+0.5} width={CELL-1} height={CELL-1}
                        fill={corrColor(v)} opacity={dimmed?0.22:1}
                        stroke={isPinned?"#1a2535":isHov2?"rgba(0,0,0,0.6)":(actRow&&actCol)?"rgba(0,0,0,0.4)":"rgba(0,0,0,0.05)"}
                        strokeWidth={isPinned?2:isHov2?1.5:(actRow&&actCol)?1:0.5} rx={1} style={{cursor:"pointer"}}
                        onMouseEnter={()=>{if(!pin)setHov({i,j});}} onClick={()=>setPin(p=>p&&p.i===i&&p.j===j?null:{i,j})}/>
                    );
                  }))}
                  {active&&(()=>{ const cell=pin||hov; if(!cell) return null; const v=getCorr(orderedMeasures[cell.i].i,orderedMeasures[cell.j].i);
                    return <text x={LEFT+cell.j*CELL+CELL/2} y={TOP+cell.i*CELL+CELL/2+4} textAnchor="middle" fontSize={7} fontWeight={500} fontFamily="monospace" fill={corrText(v)} style={{pointerEvents:"none",userSelect:"none"}}>{v.toFixed(2)}</text>;
                  })()}
                </svg>
              )}
            </div>
          </div>
        </>)}

        {/* ══ SIMILARITY MAP ═══════════════════════════════════════════════════ */}
        {tab === "similarity" && (<>
          <div style={{width:182,background:"white",borderRight:"0.5px solid rgba(0,0,0,0.08)",padding:"12px",overflowY:"auto",flexShrink:0}}>
            <AddBlock/>
            <div style={{display:"flex",gap:5,marginBottom:14}}>
              <button onClick={showAll} style={{flex:1,padding:"5px 0",fontSize:11,fontWeight:500,border:"0.5px solid #B5D4F4",borderRadius:5,cursor:"pointer",background:"#E6F1FB",color:"#0C447C"}}>
                All {rawData.labels.length}
              </button>
              <button onClick={resetView} style={{flex:1,padding:"5px 0",fontSize:11,fontWeight:500,border:"0.5px solid rgba(0,0,0,0.15)",borderRadius:5,cursor:"pointer",background:"transparent",color:"#64748b"}}>
                Reset
              </button>
            </div>
            <FamilyToggles/>
            <SideSection label={"Show edges when rho >= " + edgeThresh.toFixed(2)} mt={4}>
              <input type="range" min={0.5} max={0.99} step={0.01} value={edgeThresh}
                onChange={e=>setEdgeThresh(+e.target.value)}
                style={{width:"100%",accentColor:"#378ADD"}}/>
              <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>
                {mdsComputing ? "computing..." : `${mdsLayout.edges.length} edges — raise threshold if slow`}
              </div>
            </SideSection>
            <SideSection label="Highlight">
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Name to highlight..."
                style={{width:"100%",padding:"5px 8px",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:6,fontSize:11.5,background:"#f8fafc",color:"#1e293b",outline:"none",boxSizing:"border-box"}}/>
            </SideSection>
            <SideSection label="Minimal covering set" mt={4}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <span style={{fontSize:11,color:"#64748b"}}>k =</span>
                <input type="number" min={2} max={20} value={coveringK}
                  onChange={e=>setCoveringK(Math.max(2,Math.min(20,+e.target.value)))}
                  style={{width:44,padding:"3px 5px",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:5,fontSize:12,textAlign:"center",outline:"none"}}/>
                <button onClick={()=>setShowCovering(s=>!s)}
                  style={{flex:1,padding:"4px 0",fontSize:11,fontWeight:500,borderRadius:5,cursor:"pointer",border:"0.5px solid #B5D4F4",
                    background:showCovering?"#378ADD":"#E6F1FB",color:showCovering?"white":"#0C447C"}}>
                  {showCovering?"Hide":"Run"}
                </button>
              </div>
              {showCovering && coveringSet.length > 0 && (
                <div>
                  {coveringSet.map((idx, rank) => {
                    const m = visMeasures[idx];
                    const f = famMap[m.family]||famMap["Other"];
                    return (
                      <div key={idx} style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,padding:"3px 6px",background:f.bg,border:`0.5px solid ${f.border}`,borderRadius:5}}>
                        <span style={{fontSize:10,fontWeight:700,color:f.text,minWidth:14}}>{rank+1}</span>
                        <span style={{fontSize:11,color:f.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.label}</span>
                      </div>
                    );
                  })}
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:6,lineHeight:1.4}}>
                    Starred on map. Greedy maximin — each pick is farthest from the current set.
                  </div>
                </div>
              )}
            </SideSection>
              {FAM.map(f => { const cnt=visMeasures.filter(m=>m.family===f.name).length; if(!cnt) return null; return (
                <div key={f.name} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:f.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#64748b"}}>{f.name}</span>
                  <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{cnt}</span>
                </div>
              );})}
            </SideSection>
            <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.5,marginTop:4}}>
              Classical MDS on Spearman rho distance matrix. Proximity = similarity in ranking behaviour across 648 networks.
            </div>
          </div>

          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{background:"white",borderBottom:"0.5px solid rgba(0,0,0,0.08)",padding:"8px 16px",minHeight:48,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              {hovNode!==null && visMeasures[hovNode] ? (<>
                <Pill fam={visMeasures[hovNode].family}/>
                <span style={{fontWeight:500,fontSize:14,color:"#1e293b"}}>{visMeasures[hovNode].label}</span>
                <span style={{fontSize:12,color:"#94a3b8",marginLeft:4}}>
                  · {mdsLayout.edges.filter(e=>e.i===hovNode||e.j===hovNode).length} strong connections (rho >= {edgeThresh.toFixed(2)})
                </span>
              </>) : (
                <div style={{color:"#94a3b8",fontSize:13}}>
                  {mdsComputing
                    ? `Computing layout for ${visMeasures.length} measures…`
                    : `Hover a node · adjust edge threshold · ${visMeasures.length} measures shown`}
                </div>
              )}
            </div>

            <div style={{flex:1,overflow:"hidden",padding:8,display:"flex",flexDirection:"column"}}>
              {visMeasures.length < 3 ? (
                <div style={{color:"#94a3b8",fontSize:13,padding:16}}>Add at least 3 measures to see the similarity map.</div>
              ) : mdsComputing ? (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:12,color:"#94a3b8"}}>
                  <div style={{width:28,height:28,border:"2px solid #e2e8f0",borderTop:"2px solid #378ADD",borderRadius:"50%",animation:"czSpin 0.8s linear infinite"}}/>
                  <span style={{fontSize:13}}>Computing MDS for {visMeasures.length} measures…</span>
                </div>
              ) : (
                <svg viewBox={`0 0 ${MDS_W} ${MDS_H}`} preserveAspectRatio="xMidYMid meet"
                  style={{display:"block",width:"100%",height:"100%",background:"white",border:"0.5px solid rgba(0,0,0,0.08)",borderRadius:8}}>
                  {mdsLayout.edges.map(({i,j,v}) => {
                    const a=mdsLayout.coords[i], b=mdsLayout.coords[j]; if(!a||!b) return null;
                    const dim=hovNode!==null&&hovNode!==i&&hovNode!==j;
                    return <line key={`e${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={corrColor(v)} strokeWidth={Math.max(0.4,(v-edgeThresh+0.02)*10)} opacity={dim?0.06:0.45}/>;
                  })}
                  {visMeasures.map((m,idx) => {
                    const c=mdsLayout.coords[idx]; if(!c) return null;
                    const f=famMap[m.family]||famMap["Other"];
                    const hi=searchQ&&hitIds.has(m.i);
                    const isHov3=hovNode===idx;
                    const coverRank = showCovering ? coveringSet.indexOf(idx) : -1;
                    const isCover = coverRank >= 0;
                    const r = visMeasures.length > 100 ? (isCover?9:isHov3?7:hi?6:4) : (isCover?11:isHov3?9:hi?8:6);
                    const connectedSet = isHov3 ? new Set(mdsLayout.edges.filter(e=>e.i===idx||e.j===idx).map(e=>e.i===idx?e.j:e.i)) : new Set();
                    const dim=hovNode!==null&&!isHov3&&!connectedSet.has(idx)&&!isCover;
                    return (
                      <g key={m.i} style={{cursor:"pointer"}} onMouseEnter={()=>setHovNode(idx)} onMouseLeave={()=>setHovNode(null)}>
                        {isCover && <circle cx={c.x} cy={c.y} r={r+4} fill="none" stroke={f.color} strokeWidth={2} opacity={0.7}/>}
                        <circle cx={c.x} cy={c.y} r={r} fill={f.color} opacity={dim?0.15:1}
                          stroke={isCover?"white":isHov3||hi?"white":"rgba(255,255,255,0.5)"}
                          strokeWidth={isCover?2:isHov3?2:1}/>
                        {isCover && (
                          <text x={c.x} y={c.y+4} textAnchor="middle" fontSize={8} fontWeight="700"
                            fill="white" style={{userSelect:"none",pointerEvents:"none"}}>{coverRank+1}</text>
                        )}
                        {(isHov3||hi||isCover||(visMeasures.length<=20)) && (
                          <text x={c.x} y={c.y-(r+5)} textAnchor="middle" fontSize={isCover?11:isHov3?11:9}
                            fontWeight={isCover||isHov3||hi?"500":"400"} fill={dim?"#cbd5e1":f.color}
                            style={{userSelect:"none",pointerEvents:"none"}}>
                            {m.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
        </>)}

        {/* ══ EXPLORER ═════════════════════════════════════════════════════════ */}
        {tab === "explorer" && (<>
          <div style={{width:182,background:"white",borderRight:"0.5px solid rgba(0,0,0,0.08)",padding:"12px",overflowY:"auto",flexShrink:0}}>
            <SideSection label="Filter by family">
              {["All",...famNames].map(name => {
                const f=famMap[name]; const cnt=name==="All"?rawData.labels.length:rawData.labels.filter((_,i)=>rawData.families[i]===name).length;
                if(name!=="All"&&cnt===0) return null;
                return (
                  <button key={name} onClick={()=>setSearchQ(name==="All"?"":name)}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"5px 9px",borderRadius:5,border:`0.5px solid ${searchQ===name?(f?.border||"#ccc"):"transparent"}`,cursor:"pointer",marginBottom:3,background:searchQ===name?(f?.bg||"#f0f0f0"):"transparent",color:searchQ===name?(f?.text||"#333"):"#64748b",fontSize:12,fontWeight:searchQ===name?500:400}}>
                    <span style={{float:"right",fontSize:10,color:"#94a3b8"}}>{cnt}</span>{name}
                  </button>
                );
              })}
            </SideSection>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder={`Search all ${rawData.labels.length} measures...`}
                style={{width:300,padding:"6px 10px",border:"0.5px solid rgba(0,0,0,0.18)",borderRadius:6,fontSize:12.5,background:"white",color:"#1e293b",outline:"none"}}/>
              <span style={{fontSize:12,color:"#94a3b8"}}>{rawData.labels.filter((l,i)=>!searchQ||l.toLowerCase().includes(searchQ.toLowerCase())||rawData.families[i].toLowerCase().includes(searchQ.toLowerCase())).length} results</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:9}}>
              {rawData.labels.map((lbl,i) => {
                const fam=rawData.families[i];
                if(searchQ&&!lbl.toLowerCase().includes(searchQ.toLowerCase())&&!fam.toLowerCase().includes(searchQ.toLowerCase())) return null;
                const f=famMap[fam]||famMap["Other"]; const inView=selectedIdx.has(i);
                return (
                  <div key={i} style={{background:"white",border:`0.5px solid ${f.border}`,borderLeft:`3px solid ${f.color}`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500,fontSize:12.5,color:"#1e293b",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lbl}</div>
                      <span style={{background:f.bg,color:f.text,borderRadius:3,padding:"1px 5px",fontSize:10,fontWeight:500}}>{fam}</span>
                    </div>
                    <button onClick={()=>{ if(inView){setSelectedIdx(s=>{const nx=new Set(s);nx.delete(i);return nx;});} else{setSelectedIdx(s=>new Set([...s,i]));setTab("heatmap");} }}
                      style={{padding:"4px 9px",border:`0.5px solid ${f.border}`,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:500,background:inView?f.bg:"#f8fafc",color:inView?f.text:"#64748b",flexShrink:0}}>
                      {inView?"In view":"+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("comparison-root")).render(<App/>);
