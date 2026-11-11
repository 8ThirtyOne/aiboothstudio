// AI Booth Design app (split out of index.html). Classic script: functions stay global for the page's inline handlers.
// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
const S = {
  size: '10x10',
  wallH: 8, sideH: 8,
  els: { backwall:true, sidewalls:true, header:true, counter:true, shelf:false, lights:true, floor:true },
  floorMat: 'carpet-solid',
  floorRiser: 'none',
  cornerSide: "left", floorTrim: false, placed: [], boothType: "inline", system: "seg", units: "ft", corner: "sharp", cladding: "single", ceiling: "none", endCap: "none", power: true, measures: [], showDims: false, showElDims: false, edits: {}, added: [], noText: false, drags: {}, knownSize: null, custom: null, lightAdj: { bright: 1, warm: 0, floorColor: null },
  furn: new Set(),
  brand: {
    company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.',
    primary: '#0a84ff', secondary: '#ff9f0a', accent: '#ffffff', bg: '#101820',
    graphicStyle: 'solid', logoScale: 1, lightStyle: 'warm', lightInt: 0.7,
  },
  refImageData: null,   // ImageBitmap of uploaded reference
  refImageUrl: null,    // Object URL
  extractedColors: [],
};

// ═══════════════════════════════════════════════════════
//  THREE SETUP
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#111318');
scene.fog = new THREE.FogExp2('#111318', 0.022);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(14, 10, 14);
camera.lookAt(0, 2, 0);

// Orbit
let isDrag = false, lastM = {x:0,y:0};
let oTarget = new THREE.Vector3(0,2,0);
let oR = 22, oTh = Math.PI/4, oPh = 0.75;
function camUpdate() {
  camera.position.x = oTarget.x + oR * Math.sin(oPh) * Math.sin(oTh);
  camera.position.y = oTarget.y + oR * Math.cos(oPh);
  camera.position.z = oTarget.z + oR * Math.sin(oPh) * Math.cos(oTh);
  camera.lookAt(oTarget);
}
canvas.addEventListener('mousedown', e => { isDrag=true; lastM={x:e.clientX,y:e.clientY}; });
window.addEventListener('mouseup', () => isDrag=false);
window.addEventListener('mousemove', e => {
  if (!isDrag) return;
  oTh -= (e.clientX-lastM.x)*0.008;
  oPh = Math.max(.08, Math.min(1.57, oPh-(e.clientY-lastM.y)*0.006));
  lastM={x:e.clientX,y:e.clientY}; camUpdate();
});
canvas.addEventListener('wheel', e => { oR=Math.max(3,Math.min(65,oR+e.deltaY*0.03)); camUpdate(); e.preventDefault(); },{passive:false});
let lTD=null, lT=null;
canvas.addEventListener('touchstart',e=>{if(e.touches.length===1){isDrag=true;lT={x:e.touches[0].clientX,y:e.touches[0].clientY};}else if(e.touches.length===2){lTD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
canvas.addEventListener('touchmove',e=>{if(e.touches.length===1&&isDrag){const dx=e.touches[0].clientX-lT.x,dy=e.touches[0].clientY-lT.y;oTh-=dx*0.01;oPh=Math.max(.08,Math.min(1.57,oPh-dy*0.008));lT={x:e.touches[0].clientX,y:e.touches[0].clientY};camUpdate();}else if(e.touches.length===2&&lTD){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);oR=Math.max(3,Math.min(65,oR-(d-lTD)*0.05));lTD=d;camUpdate();}},{passive:true});
canvas.addEventListener('touchend',()=>{isDrag=false;lTD=null;},{passive:true});

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
sun.position.set(10,18,10); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
['left','right','top','bottom'].forEach((k,i)=>sun.shadow.camera[k]=[-22,22,22,-22][i]);
sun.shadow.camera.far=100;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa0b8ff, 0.35);
fill.position.set(-8,5,-8); scene.add(fill);
const grid = new THREE.GridHelper(80,80,0x1f2230,0x1f2230);
grid.material.opacity=0.5; grid.material.transparent=true; scene.add(grid);

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function hex2rgb(h) { return { r:parseInt(h.slice(1,3),16)/255, g:parseInt(h.slice(3,5),16)/255, b:parseInt(h.slice(5,7),16)/255 }; }
function hexColor(h) { return new THREE.Color(...Object.values(hex2rgb(h))); }
function mkMat(col, r=0.6, m=0, e=null, ei=0) {
  const o={color:col instanceof THREE.Color?col:hexColor(col),roughness:r,metalness:m};
  if(e){ o.emissive=e instanceof THREE.Color?e:hexColor(e); o.emissiveIntensity=ei; }
  return new THREE.MeshStandardMaterial(o);
}

// ═══════════════════════════════════════════════════════
//  TEXTURE GENERATORS
// ═══════════════════════════════════════════════════════
function wallTex() {
  const c=document.createElement('canvas'); c.width=1024; c.height=512;
  const ctx=c.getContext('2d');
  const style=S.brand.graphicStyle, col1=S.brand.primary, col2=S.brand.secondary, bg=S.brand.bg;

  {
    if(style==='gradient'){const g=ctx.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,bg);g.addColorStop(.5,col1);g.addColorStop(1,bg);ctx.fillStyle=g;}
    else ctx.fillStyle=bg;
    ctx.fillRect(0,0,c.width,c.height);
    if(style==='geometric'){
      ctx.fillStyle=col1+'44';
      for(let i=0;i<8;i++){ctx.beginPath();const x=(i/8)*c.width;ctx.moveTo(x,0);ctx.lineTo(x+180,c.height);ctx.lineTo(x+60,c.height);ctx.lineTo(x-120,0);ctx.fill();}
      ctx.fillStyle=col2+'33';
      for(let i=0;i<4;i++){ctx.beginPath();const x=(i/4+.1)*c.width;ctx.moveTo(x,0);ctx.lineTo(x+90,c.height);ctx.lineTo(x+20,c.height);ctx.lineTo(x-70,0);ctx.fill();}
    } else if(style==='diagonal'){
      for(let i=-4;i<20;i++){ctx.fillStyle=i%2===0?col1+'33':col2+'22';ctx.beginPath();const x=i*60;ctx.moveTo(x,0);ctx.lineTo(x+40,0);ctx.lineTo(x+40+c.height,c.height);ctx.lineTo(x+c.height,c.height);ctx.fill();}
    }
  }

  const sc=S.brand.logoScale, fs=Math.floor(66*sc);
  ctx.font=`700 ${fs}px 'Arial Black',sans-serif`;
  ctx.fillStyle=S.brand.accent; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(S.brand.company||'YOUR BRAND',c.width/2,c.height*.42);
  ctx.font=`400 ${Math.floor(21*sc)}px Arial,sans-serif`;
  ctx.fillStyle=S.brand.accent+'cc';
  ctx.fillText(S.brand.tagline||'',c.width/2,c.height*.42+fs*.72);
  return new THREE.CanvasTexture(c);
}

function headerTex() {
  const c=document.createElement('canvas'); c.width=1024; c.height=200;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,c.width,0);
  g.addColorStop(0,S.brand.bg); g.addColorStop(.3,S.brand.primary); g.addColorStop(.7,S.brand.primary); g.addColorStop(1,S.brand.bg);
  ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
  ctx.font=`700 68px 'Arial Black',sans-serif`; ctx.fillStyle=S.brand.accent; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(S.brand.company||'YOUR BRAND',c.width/2,c.height/2);
  return new THREE.CanvasTexture(c);
}

function screenTex(w=480, h=270) {
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  {
    ctx.fillStyle=S.brand.bg; ctx.fillRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,S.brand.primary+'88'); g.addColorStop(1,S.brand.secondary+'55');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.font=`bold ${Math.floor(h*.16)}px Arial`; ctx.fillStyle=S.brand.accent; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(S.brand.company,w/2,h*.4);
    ctx.font=`${Math.floor(h*.07)}px Arial`; ctx.fillStyle=S.brand.accent+'aa';
    ctx.fillText(S.brand.tagline,w/2,h*.62);
  }
  return new THREE.CanvasTexture(c);
}

function neonTex() {
  const c=document.createElement('canvas'); c.width=512; c.height=100;
  const ctx=c.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,512,100);
  ctx.font='bold 44px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor=S.brand.secondary; ctx.shadowBlur=18;
  ctx.fillStyle=S.brand.secondary; ctx.fillText(S.brand.company||'NEON',256,50);
  ctx.shadowBlur=8; ctx.fillStyle='#fff'; ctx.fillText(S.brand.company||'NEON',256,50);
  return new THREE.CanvasTexture(c);
}

function floorTex() {
  const c=document.createElement('canvas'); c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  const mat=S.floorMat;
  if(mat==='carpet-solid'){
    ctx.fillStyle=S.brand.bg; ctx.fillRect(0,0,512,512);
    for(let i=0;i<5000;i++){const x=Math.random()*512,y=Math.random()*512;ctx.fillStyle=S.brand.primary+'1a';ctx.fillRect(x,y,1,2+Math.random()*3);}
  } else if(mat==='carpet-tile'){
    const tile=64;
    for(let r=0;r<8;r++) for(let col=0;col<8;col++){
      ctx.fillStyle=(r+col)%2===0?S.brand.bg:S.brand.primary+'22';
      ctx.fillRect(col*tile+1,r*tile+1,tile-2,tile-2);
      for(let i=0;i<80;i++){const x=col*tile+Math.random()*tile,y=r*tile+Math.random()*tile;ctx.fillStyle=S.brand.primary+'0d';ctx.fillRect(x,y,1,2);}
    }
  } else if(mat==='vinyl'){
    const pw=128, ph=512/3;
    for(let r=0;r<4;r++) for(let col=0;col<5;col++){
      const off=r%2===0?0:pw/2, x=col*pw-off, y=r*ph;
      const sh=0.82+Math.random()*.18;
      ctx.fillStyle=`rgb(${Math.floor(135*sh)},${Math.floor(95*sh)},${Math.floor(55*sh)})`;
      ctx.fillRect(x+1,y+1,pw-2,ph-2);
    }
  } else if(mat==='laminate'){
    for(let r=0;r<4;r++){const y=r*128,sh=0.84+Math.random()*.16;ctx.fillStyle=`rgb(${Math.floor(195*sh)},${Math.floor(162*sh)},${Math.floor(108*sh)})`;ctx.fillRect(0,y+1,512,126);}
  } else if(mat==='dark-wood'){
    for(let r=0;r<4;r++){const y=r*128,sh=0.78+Math.random()*.22;ctx.fillStyle=`rgb(${Math.floor(72*sh)},${Math.floor(48*sh)},${Math.floor(30*sh)})`;ctx.fillRect(0,y+1,512,126);}
    ctx.fillStyle='rgba(255,200,100,0.04)';
    for(let i=0;i<20;i++){ctx.beginPath();ctx.moveTo(0,Math.random()*512);ctx.bezierCurveTo(128,Math.random()*512,384,Math.random()*512,512,Math.random()*512);ctx.lineWidth=1+Math.random()*2;ctx.strokeStyle='rgba(200,150,80,0.07)';ctx.stroke();}
  } else if(mat==='marble'){
    ctx.fillStyle='#e8e8e8'; ctx.fillRect(0,0,512,512);
    for(let i=0;i<30;i++){ctx.beginPath();ctx.moveTo(Math.random()*512,Math.random()*512);ctx.bezierCurveTo(Math.random()*512,Math.random()*512,Math.random()*512,Math.random()*512,Math.random()*512,Math.random()*512);ctx.lineWidth=.5+Math.random()*2;ctx.strokeStyle=`rgba(130,130,145,${.06+Math.random()*.12})`;ctx.stroke();}
  } else if(mat==='concrete'){
    ctx.fillStyle='#8a8e98'; ctx.fillRect(0,0,512,512);
    for(let i=0;i<300;i++){const x=Math.random()*512,y=Math.random()*512;ctx.fillStyle=`rgba(255,255,255,${Math.random()*.04})`;ctx.fillRect(x,y,Math.random()*50,Math.random()*2);}
    ctx.strokeStyle='rgba(0,0,0,0.08)';
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(i*128,0);ctx.lineTo(i*128,512);ctx.lineWidth=1;ctx.stroke();}
  } else { // rubber
    ctx.fillStyle='#111'; ctx.fillRect(0,0,512,512);
    for(let r=0;r<32;r++) for(let col=0;col<32;col++){
      if((r+col)%2===0){ctx.fillStyle='#1a1a1a';ctx.fillRect(col*16,r*16,16,16);}
    }
  }
  return new THREE.CanvasTexture(c);
}

// ═══════════════════════════════════════════════════════
//  BOOTH GROUP
// ═══════════════════════════════════════════════════════
let boothG = new THREE.Group(); scene.add(boothG);

function getSZ() {
  const m={'10x10':{w:3.05,d:3.05,lbl:'10 × 10 ft',type:'Standard'},'10x20':{w:6.1,d:3.05,lbl:'10 × 20 ft',type:'Double Inline'},'20x20':{w:6.1,d:6.1,lbl:'20 × 20 ft',type:'Corner'},'30x30':{w:9.15,d:9.15,lbl:'30 × 30 ft',type:'Island'}};
  return m[S.size]||m['10x10'];
}

function dispose(obj) {
  obj.traverse(n=>{ if(n.geometry)n.geometry.dispose(); if(n.material)[].concat(n.material).forEach(m=>{if(m.map)m.map.dispose();m.dispose();}); });
}

function addMesh(geo,mat,x,y,z,rx=0,ry=0,rz=0,shadow=true) {
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  if(shadow){m.castShadow=true;m.receiveShadow=true;} boothG.add(m); return m;
}

// Furniture builders
function buildChairTask(x,z,ry=0){
  const g=new THREE.Group(); g.rotation.y=ry;
  const legM=mkMat('#333',0.5,0.7), seatM=mkMat('#2a2a2a',0.7), backM=mkMat('#1a1a1a',0.6);
  [-0.19,-0.19,0.19,0.19].forEach((lx,i)=>{const lz=[-.19,.19,-.19,.19][i];const l=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.45,8),legM);l.position.set(lx,.225,lz);g.add(l);});
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.44,.06,.44),seatM); seat.position.set(0,.47,0); g.add(seat);
  const bk=new THREE.Mesh(new THREE.BoxGeometry(.44,.5,.05),backM); bk.position.set(0,.73,-.19); g.add(bk);
  g.position.set(x,.0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildChairPadded(x,z,ry=0){
  const g=new THREE.Group(); g.rotation.y=ry;
  const legM=mkMat('#888',0.4,0.6), seatM=mkMat(S.brand.primary,0.8), frameM=mkMat('#111',0.5);
  [-0.2,.2].forEach(lx=>[-0.2,.2].forEach(lz=>{const l=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.48,8),legM);l.position.set(lx,.24,lz);g.add(l);}));
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.48,.1,.48),seatM); seat.position.set(0,.53,0); g.add(seat);
  const bk=new THREE.Mesh(new THREE.BoxGeometry(.46,.5,.1),seatM); bk.position.set(0,.82,-.21); g.add(bk);
  const fr=new THREE.Mesh(new THREE.BoxGeometry(.48,.04,.48),frameM); fr.position.set(0,.51,0); g.add(fr);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildLounge(x,z,ry=0){
  const g=new THREE.Group(); g.rotation.y=ry;
  const bodyM=mkMat(S.brand.primary,0.9), legM=mkMat('#888',0.3,0.6);
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.6,.4,.8),bodyM); body.position.set(0,.25,0); g.add(body);
  const back=new THREE.Mesh(new THREE.BoxGeometry(1.6,.5,.12),bodyM); back.position.set(0,.7,-.38); g.add(back);
  const armL=new THREE.Mesh(new THREE.BoxGeometry(.12,.4,.8),bodyM); armL.position.set(-.74,.45,0); g.add(armL);
  const armR=armL.clone(); armR.position.set(.74,.45,0); g.add(armR);
  [-0.72,.72].forEach(lx=>[-0.34,.34].forEach(lz=>{const l=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.22,8),legM);l.position.set(lx,.11,lz);g.add(l);}));
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildBarstool(x,z){
  const g=new THREE.Group();
  const legM=mkMat('#aaa',0.3,0.7), seatM=mkMat(S.brand.primary,0.7);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.72,8),legM); pole.position.set(0,.36,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.03,16),legM); base.position.set(0,.03,0); g.add(base);
  const seat=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.08,16),seatM); seat.position.set(0,.76,0); g.add(seat);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildTableRound(x,z){
  const g=new THREE.Group();
  const topM=mkMat('#e8e0d0',0.4,0.1), legM=mkMat('#888',0.3,0.6);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.05,24),topM); top.position.set(0,.73,0); g.add(top);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.7,8),legM); pole.position.set(0,.36,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.04,16),legM); base.position.set(0,.04,0); g.add(base);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildTableRect(x,z){
  const g=new THREE.Group();
  const topM=mkMat('#d8d0c0',0.5,0.05), legM=mkMat('#666',0.4,0.3);
  const top=new THREE.Mesh(new THREE.BoxGeometry(1.83,.06,.76),topM); top.position.set(0,.74,0); g.add(top);
  [-0.84,.84].forEach(lx=>[-0.33,.33].forEach(lz=>{const l=new THREE.Mesh(new THREE.BoxGeometry(.05,.7,.05),legM);l.position.set(lx,.35,lz);g.add(l);}));
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildCocktailTable(x,z){
  const g=new THREE.Group();
  const topM=mkMat('#1a1a1a',0.3,0.6), legM=mkMat('#aaa',0.3,0.7);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.04,24),topM); top.position.set(0,1.07,0); g.add(top);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.0,8),legM); pole.position.set(0,.54,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.04,16),legM); base.position.set(0,.04,0); g.add(base);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildPodium(x,z){
  const g=new THREE.Group();
  const bodyM=mkMat(S.brand.primary,0.5,0.2), topM=mkMat('#e8e8e8',0.3);
  const body=new THREE.Mesh(new THREE.BoxGeometry(.56,1.1,.46),bodyM); body.position.set(0,.55,0); g.add(body);
  const top=new THREE.Mesh(new THREE.BoxGeometry(.6,.04,.5),topM); top.position.set(0,1.12,0); g.add(top);
  const ledge=new THREE.Mesh(new THREE.BoxGeometry(.56,.12,.08),bodyM); ledge.position.set(0,.92,.2); g.add(ledge);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildTV(x,y,z,w=1.22,h=0.69,wall=false){
  const g=new THREE.Group();
  const fM=mkMat('#111',0.4,0.7), sM=new THREE.MeshStandardMaterial({map:screenTex(640,360),emissive:hexColor(S.brand.primary),emissiveIntensity:.12});
  const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,.06),fM); frame.position.set(0,0,0); g.add(frame);
  const scr=new THREE.Mesh(new THREE.BoxGeometry(w-.06,h-.06,.01),sM); scr.position.set(0,0,.034); g.add(scr);
  if(!wall){
    const standPole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.5,8),mkMat('#666',0.3,0.6)); standPole.position.set(0,-h/2-.25,-.04); g.add(standPole);
    const standBase=new THREE.Mesh(new THREE.BoxGeometry(.6,.04,.4),mkMat('#444',0.4,0.7)); standBase.position.set(0,-h/2-.52,-.04); g.add(standBase);
  }
  g.position.set(x,y,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildVideoWall(x,y,z){
  const {w,d}=getSZ(); const panW=.68, panH=.38;
  const fM=mkMat('#080808',0.5,0.5);
  for(let r=0;r<2;r++) for(let col=0;col<3;col++){
    const sM=new THREE.MeshStandardMaterial({map:screenTex(320,180),emissive:hexColor(S.brand.primary),emissiveIntensity:.15});
    const frame=new THREE.Mesh(new THREE.BoxGeometry(panW-.01,panH-.01,.04),fM);
    const scr=new THREE.Mesh(new THREE.BoxGeometry(panW-.04,panH-.04,.01),sM);
    frame.position.set(x+(col-1)*(panW+.01),y+(1-r)*(panH+.01),z); frame.castShadow=true; boothG.add(frame);
    scr.position.set(x+(col-1)*(panW+.01),y+(1-r)*(panH+.01),z+.025); boothG.add(scr);
  }
}
function buildKiosk(x,z){
  const g=new THREE.Group();
  const baseM=mkMat('#1a1a2e',0.5,0.4), screenM=new THREE.MeshStandardMaterial({map:screenTex(320,480),emissive:hexColor(S.brand.accent),emissiveIntensity:.15});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,1.3,8),baseM); pole.position.set(0,.65,0); g.add(pole);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.04,16),baseM); pad.position.set(0,.03,0); g.add(pad);
  const scrFrame=new THREE.Mesh(new THREE.BoxGeometry(.32,.54,.04),baseM); scrFrame.position.set(0,1.33,0); scrFrame.rotation.x=-.25; g.add(scrFrame);
  const scr=new THREE.Mesh(new THREE.BoxGeometry(.28,.5,.01),screenM); scr.position.set(0,1.33,.025); scr.rotation.x=-.25; g.add(scr);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildUplight(x,z,color){
  const g=new THREE.Group();
  const baseM=mkMat('#222',0.4,0.5);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.06,16),baseM); base.position.set(0,.03,0); g.add(base);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.06,.1,.22,8),baseM); body.position.set(0,.19,0); g.add(body);
  const bulbM=mkMat(color,0.5,0,color,.8);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.05,12,8),bulbM); bulb.position.set(0,.32,0); g.add(bulb);
  const pt=new THREE.PointLight(new THREE.Color(...Object.values(hex2rgb(color))),0.8,3.5);
  pt.position.set(0,.5,0); g.add(pt);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildPendant(x,y,z){
  const g=new THREE.Group();
  const cordM=mkMat('#333',0.8), shadeM=mkMat('#c0a060',0.5,0.1), bulbM=mkMat('#fffde0',0.5,0,S.brand.primary,1.5);
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.6,6),cordM); cord.position.set(0,.3,0); g.add(cord);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.22,.2,16,1,true),shadeM); shade.position.set(0,-.06,0); shade.rotation.x=Math.PI; g.add(shade);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),bulbM); bulb.position.set(0,-.02,0); g.add(bulb);
  const pt=new THREE.PointLight(new THREE.Color(1,.92,.7),0.7,4.5); pt.position.set(0,-.1,0); g.add(pt);
  g.position.set(x,y,z); boothG.add(g);
}
function buildNeon(x,y,z){
  const g=new THREE.Group();
  const neonM=new THREE.MeshStandardMaterial({map:neonTex(),emissive:hexColor(S.brand.secondary),emissiveIntensity:.6,roughness:.5});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(1.4,.28,.04),neonM); g.add(sign);
  const pt=new THREE.PointLight(hexColor(S.brand.secondary),.5,2.5); pt.position.set(0,0,.3); g.add(pt);
  g.position.set(x,y,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildFloorlamp(x,z){
  const g=new THREE.Group();
  const poleM=mkMat('#888',0.3,0.6), shadeM=mkMat('#f0e8d0',0.5);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,1.6,8),poleM); pole.position.set(0,.8,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.04,16),poleM); base.position.set(0,.03,0); g.add(base);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.24,.28,16,1,true),shadeM); shade.position.set(0,1.65,0); shade.rotation.x=Math.PI; g.add(shade);
  const pt=new THREE.PointLight(new THREE.Color(1,.9,.75),.6,4); pt.position.set(0,1.65,0); g.add(pt);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildPlant(x,z){
  const g=new THREE.Group();
  const potM=mkMat('#704030',0.7), soilM=mkMat('#2a1a0a',0.9), leafM=mkMat('#2a7a3a',0.8);
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(.26,.2,.4,12),potM); pot.position.set(0,.2,0); g.add(pot);
  const soil=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.04,12),soilM); soil.position.set(0,.41,0); g.add(soil);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.04,.06,.5,8),mkMat('#5a3a1a',0.8)); trunk.position.set(0,.7,0); g.add(trunk);
  [[0,.18,0],[-.16,.12,-.1],[.14,.1,.12],[-.08,.22,.14],[.1,.15,-.12]].forEach(([lx,ly,lz])=>{
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(.22+Math.random()*.1,8,6),leafM);
    leaf.position.set(lx,1.0+ly,lz); leaf.scale.set(1,.7+Math.random()*.3,1); g.add(leaf);
  });
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildBanner(x,z,ry=0){
  const g=new THREE.Group(); g.rotation.y=ry;
  const poleM=mkMat('#888',0.3,0.6);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,2.1,8),poleM); pole.position.set(0,1.05,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.BoxGeometry(.5,.06,.22),poleM); base.position.set(0,.03,0); g.add(base);
  const banTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');const g2=ctx.createLinearGradient(0,0,0,512);g2.addColorStop(0,S.brand.primary);g2.addColorStop(1,S.brand.bg);ctx.fillStyle=g2;ctx.fillRect(0,0,256,512);ctx.font='bold 32px Arial';ctx.fillStyle=S.brand.accent;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(S.brand.company,128,180);ctx.font='16px Arial';ctx.fillStyle=S.brand.accent+'aa';ctx.fillText(S.brand.tagline,128,240);return new THREE.CanvasTexture(c);})();
  const banM=new THREE.MeshStandardMaterial({map:banTex,roughness:.8,side:THREE.DoubleSide});
  const ban=new THREE.Mesh(new THREE.PlaneGeometry(.8,1.8),banM); ban.position.set(0,1.1,.001); ban.castShadow=true; g.add(ban);
  g.position.set(x,0,z); boothG.add(g);
}
function buildMerch(x,z){
  const g=new THREE.Group();
  const baseM=mkMat('#222',0.5,0.4);
  const ped=new THREE.Mesh(new THREE.BoxGeometry(.6,.8,.6),baseM); ped.position.set(0,.4,0); g.add(ped);
  const top=new THREE.Mesh(new THREE.BoxGeometry(.64,.06,.64),mkMat('#e8e8e8',0.3,0.1)); top.position.set(0,.83,0); g.add(top);
  // abstract product
  const prod=new THREE.Mesh(new THREE.BoxGeometry(.28,.22,.28),mkMat(S.brand.primary,0.4,0.2)); prod.position.set(0,.98,0); g.add(prod);
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}
function buildBrochureStand(x,z){
  const g=new THREE.Group();
  const fM=mkMat('#666',0.4,0.6);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,1.2,8),fM); pole.position.set(0,.6,0); g.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.03,8),fM); base.position.set(0,.02,0); g.add(base);
  [0.3,.6,.9].forEach(y=>{const shelf=new THREE.Mesh(new THREE.BoxGeometry(.32,.26,.06),fM);shelf.position.set(0,y,.02);shelf.rotation.x=.3;g.add(shelf);});
  g.position.set(x,0,z); g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); boothG.add(g);
}

// ═══════════════════════════════════════════════════════
//  MAIN REBUILD
// ═══════════════════════════════════════════════════════
function rebuildBooth(){
  // Sync DOM
  S.els.backwall  = document.getElementById('el-backwall').checked;
  S.els.sidewalls = document.getElementById('el-sidewalls').checked;
  S.els.header    = document.getElementById('el-header').checked;
  S.els.counter   = document.getElementById('el-counter').checked;
  S.els.shelf     = document.getElementById('el-shelf').checked;
  S.els.lights    = document.getElementById('el-lights').checked;
  S.els.floor     = document.getElementById('el-floor').checked;
  S.brand.company = document.getElementById('company-name').value;
  S.brand.tagline = document.getElementById('tagline').value;
  S.brand.graphicStyle = document.getElementById('graphic-style').value;
  S.floorMat      = document.getElementById('floor-mat').value;
  S.floorRiser    = document.getElementById('floor-riser').value;

  // Clear
  while(boothG.children.length){ dispose(boothG.children[0]); boothG.remove(boothG.children[0]); }

  markDirty();
  const E = S.recon ? {} : S.els;
  if(S.recon) buildRecon();
  else { sun.intensity=.95; sky.intensity=.5; sun.color.set(0xfff5e0); sky.color.set(0xf2f5ff); renderer.toneMappingExposure=.72*S.lightAdj.bright; }

  const {w,d}=getSZ();
  const wallH=S.wallH*0.3048, sH=Math.min(S.sideH*0.3048,wallH), wT=S.system==="timber"?.14:.08;
  const bwW=S.boothType==="island"?w*.45:w, bwZ=S.boothType==="island"?0:-d/2+wT/2;
  const riserH=S.floorRiser==='med'?.1:S.floorRiser==='low'?.05:0;

  labelMark = boothG.children.length;
  // FLOOR
  if(E.floor){
    if(riserH>0){
      const riserM=mkMat(S.brand.primary,0.5,0.1);
      const riser=new THREE.Mesh(new THREE.BoxGeometry(w,riserH,d),riserM);
      riser.position.set(0,riserH/2,0); riser.receiveShadow=true; boothG.add(riser);
    }
    const ft=floorTex(); ft.wrapS=ft.wrapT=THREE.RepeatWrapping; ft.repeat.set(w/1.4,d/1.4);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(w,.04,d),new THREE.MeshStandardMaterial({map:ft,roughness:.95,...(S.floorMat.startsWith("carpet")?{normalMap:detailMaps("carpet"),normalScale:new THREE.Vector2(.7,.7)}:{})}));
    floor.position.set(0,riserH+.02,0); floor.receiveShadow=true; boothG.add(floor);
    // Trim
    const trimC=hexColor(S.brand.primary);
    const trimM=mkMat(trimC,0.4,0.4);
    if(S.floorTrim)[[w,.07,.06,0,riserH+.04,-d/2+.03],[w,.07,.06,0,riserH+.04,d/2-.03],[.06,.07,d,-w/2+.03,riserH+.04,0],[.06,.07,d,w/2-.03,riserH+.04,0]].forEach(([bw,bh,bd,bx,by,bz])=>{
      const b=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),trimM);b.position.set(bx,by,bz);boothG.add(b);
    });
  }

  const fy=riserH; // floor y offset

  sectionLabel("Floor");
  // BACK WALL
  if(E.backwall){
    const wt=wallTex();
    const art=new THREE.MeshStandardMaterial({map:wt,roughness:.8}), plainCol=new THREE.Color(S.brand.bg).lerp(new THREE.Color("#8a9099"),.25), plain=()=>new THREE.MeshStandardMaterial({color:plainCol,roughness:.9});
    const wall=new THREE.Mesh(new THREE.BoxGeometry(bwW,wallH,wT),[plain(),plain(),plain(),plain(),art,S.boothType==="island"?art:plain()]);
    wall.position.set(0,fy+wallH/2,bwZ); wall.castShadow=true; boothG.add(wall);
    const fM=mkMat('#1e2230',0.5,0.8);
    [-bwW/2+.04,bwW/2-.04].forEach(x=>{const p=new THREE.Mesh(new THREE.BoxGeometry(.07,wallH+.08,.07),fM);p.position.set(x,fy+wallH/2,bwZ);p.userData.label="Back wall edge post";boothG.add(p);});
  }

  sectionLabel("Back wall");
  // SIDE WALLS
  if(E.sidewalls && sH>0){
    const {r,g,b}=hex2rgb(S.brand.bg);
    const sM=new THREE.MeshStandardMaterial({color:S.system==="slim"?new THREE.Color(.93,.93,.93):new THREE.Color(r*.65,g*.65,b*.65),roughness:.85});
    sideWallXs(w,wT).forEach(x=>{const sw=new THREE.Mesh(new THREE.BoxGeometry(wT,sH,d),sM);sw.position.set(x,fy+sH/2,0);sw.castShadow=true;boothG.add(sw);});
  }

  sectionLabel("Side wall");
  // HEADER
  if(E.header){
    const hW=bwW-.1,hH=.52,hD=.12;
    const hM=new THREE.MeshStandardMaterial({map:headerTex(),roughness:.5,emissive:hexColor(S.brand.primary),emissiveIntensity:.12});
    const h=new THREE.Mesh(new THREE.BoxGeometry(hW,hH,hD),hM);
    h.position.set(0,fy+wallH-hH/2,bwZ+wT/2+hD/2); h.castShadow=true; boothG.add(h);
  }

  sectionLabel("Header sign");
  buildSystem(E,w,d,fy,wallH,sH,wT,bwW,bwZ);
  sectionLabel(S.boothType==="island"&&E.header?"Hanging sign":"Wall frame and trim");

  // COUNTER
  if(E.counter){
    const cW=w*.35,cH=1.0,cD=.6;
    const {r,g,b}=hex2rgb(S.brand.primary);
    const cM=mkMat(new THREE.Color(r*.38,g*.38,b*.38),0.5,0.25);
    const tM=mkMat('#f2f0ee',0.25,0.1);
    const cx=-w/4+cW/2-w*.05, cz=-d/2+cD/2+wT+.4;
    addMesh(rbox(cW,cH,cD,.08),cM,cx,fy+cH/2,cz);
    addMesh(rbox(cW+.05,.04,cD+.05,.1),tM,cx,fy+cH+.02,cz);
    addMesh(rbox(cW-.03,.02,cD-.03,.07),mkMat("#ffffff",.3,0,"#fff2d8",2.4),cx,fy+.06,cz);
  }

  sectionLabel("Reception counter");
  // SHELVING
  if(E.shelf){
    const shM=mkMat('#c8ccd8',0.4,0.4), spM=mkMat('#888',0.4,0.6);
    [1.2,1.9,2.5].forEach(y=>addMesh(new THREE.BoxGeometry(w*.5,.03,.3),shM,w*.18,fy+y,-d/2+.15+wT));
    [-1,1].forEach(sx=>addMesh(new THREE.BoxGeometry(.04,2.6,.04),spM,w*.18+sx*(w*.5/2-.04),fy+1.3,-d/2+.15+wT));
  }

  sectionLabel("Wall shelving");
  // TRUSS
  if(E.lights&&S.boothType!=="island"&&S.system!=="canopy"){
    const tH=wallH+.3, tM=mkMat('#3c4050',0.5,0.85);
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,w-.1,8),tM);
    bar.rotation.z=Math.PI/2; bar.position.set(0,fy+tH,-d/2+.15+wT); boothG.add(bar);
    const ls=S.brand.lightStyle;
    const lc=ls==='warm'?new THREE.Color(1,.92,.75):ls==='cool'?new THREE.Color(.88,.92,1):ls==='daylight'?new THREE.Color(.95,.97,1):ls==='rgb'?new THREE.Color(1,.2,.2):hexColor(S.brand.primary);
    const nL=Math.floor(w/.85), bulbM=new THREE.MeshStandardMaterial({color:lc,emissive:lc,emissiveIntensity:2});
    for(let i=0;i<nL;i++){
      const x=-w/2+.4+i*((w-.4)/(nL));
      const head=new THREE.Mesh(new THREE.CylinderGeometry(.03,.06,.14,8),tM); head.position.set(x,fy+tH-.06,-d/2+.15+wT); boothG.add(head);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.03,8,6),bulbM); bulb.position.set(x,fy+tH-.16,-d/2+.15+wT); boothG.add(bulb);
      const pt=new THREE.PointLight(lc,S.brand.lightInt*.55,3.8); pt.position.set(x,fy+tH-.3,-d/2+.5+wT); boothG.add(pt);
    }
    [-w/2+.1,w/2-.1].forEach(x=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,tH,8),tM);leg.position.set(x,fy+tH/2,-d/2+.15+wT);boothG.add(leg);});
  }

  sectionLabel("Lighting truss");
  // FURNISHINGS
  const fz0=-d/2+wT+.5, fz1=0, fz2=d/2-.4;
  if(S.furn.has('chair-task')){tagFurn('chair-task',()=>{buildChairTask(-w*.28,fz0+.9,Math.PI*.1);buildChairTask(w*.28,fz0+.9,Math.PI*-.1);});}
  if(S.furn.has('chair-padded')){tagFurn('chair-padded',()=>{buildChairPadded(-w*.3,fz1,0);buildChairPadded(w*.3,fz1,Math.PI);});}
  if(S.furn.has('lounge')){tagFurn('lounge',()=>{buildLounge(0,fz2-.4,0);});}
  if(S.furn.has('barstool')){tagFurn('barstool',()=>{buildBarstool(-w*.2,fz0+.4);buildBarstool(w*.2,fz0+.4);});}
  if(S.furn.has('table-round')){tagFurn('table-round',()=>{buildTableRound(0,fz1-.1);});}
  if(S.furn.has('table-rect')){tagFurn('table-rect',()=>{buildTableRect(w*.12,fz0+.6);});}
  if(S.furn.has('cocktail')){tagFurn('cocktail',()=>{buildCocktailTable(-w*.28,fz1-.2);buildCocktailTable(w*.28,fz1-.2);});}
  if(S.furn.has('podium')){tagFurn('podium',()=>{buildPodium(w*.3,fz0+.4);});}
  if(S.furn.has('tv-wall')){tagFurn('tv-wall',()=>{buildTV(w*.28,fy+1.6,-d/2+.1+wT,1.22,.69,true);});}
  if(S.furn.has('tv-stand')){tagFurn('tv-stand',()=>{buildTV(w*.28,fy+1.0,-d/2+.6,1.47,.83,false);});}
  if(S.furn.has('videowall')){tagFurn('videowall',()=>{buildVideoWall(-w*.14,fy+1.65,-d/2+.08+wT);});}
  if(S.furn.has('kiosk')){tagFurn('kiosk',()=>{buildKiosk(w*.35,fz1);});}
  if(S.furn.has('uplight')){tagFurn('uplight',()=>{const uc=S.brand.secondary;[[-w*.44,fz2+.3],[w*.44,fz2+.3],[-w*.44,fz0+.1],[w*.44,fz0+.1]].forEach(([x,z])=>buildUplight(x,z,uc));});}
  if(S.furn.has('pendant')){tagFurn('pendant',()=>{[-.6,0,.6].forEach(x=>buildPendant(x,fy+wallH-.1,-d/2+.4+wT));});}
  if(S.furn.has('neon')){tagFurn('neon',()=>{buildNeon(-w*.05,fy+wallH*.58,-d/2+.1+wT);});}
  if(S.furn.has('floorlamp')){tagFurn('floorlamp',()=>{buildFloorlamp(-w*.44,fz2);buildFloorlamp(w*.44,fz2);});}
  if(S.furn.has('plant')){tagFurn('plant',()=>{buildPlant(-w*.44,fz0+.5);buildPlant(w*.44,fz0+.5);});}
  if(S.furn.has('banner')){tagFurn('banner',()=>{buildBanner(-w*.4,fz0,Math.PI*.05);buildBanner(w*.4,fz0,-Math.PI*.05);});}
  if(S.furn.has('merch')){tagFurn('merch',()=>{buildMerch(0,fz1-.3);});}
  if(S.furn.has('brochure')){tagFurn('brochure',()=>{buildBrochureStand(w*.4,fz1);});}

  finalizeElements();
  applyPower();
  buildBeams();
  if (crowdOn && Math.max(getSZ().w, getSZ().d) / 2 !== crowdHalf) buildCrowd();
  buildArt();
  updateInfo();
  updateSpecs();
}

// ═══════════════════════════════════════════════════════
//  IMAGE UPLOAD & COLOR EXTRACTION
// ═══════════════════════════════════════════════════════
function onFileSelect(e){ const f=e.target.files[0]; if(f) loadRefImage(f); }
function onDragOver(e){ e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function onDragLeave(e){ document.getElementById('upload-zone').classList.remove('drag-over'); }
function onDrop(e){ e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) loadRefImage(f); }

function loadRefImage(file){
  const url=URL.createObjectURL(file);
  S.refImageUrl=url;
  const img=new Image();
  img.onload=()=>{
    S.refImageData=img;
    document.getElementById('ref-preview').src=url;
    document.getElementById('ref-pane-img').src=url;
    document.getElementById('ref-uploaded').hidden=false;
    document.getElementById('upload-zone-wrap').hidden=true;
    document.getElementById('ref-btn').style.display='';
    extractColors(img);
    rebuildBooth();
    reconstructFromImage();
  };
  img.src=url;
}

function clearRefImage(){
  S.refImageData=null; S.refImageUrl=null; S.extractedColors=[]; S.recon=null; stopRecon(); document.getElementById("analysis-results").hidden=true;
  document.getElementById('ref-preview').src='';
  document.getElementById('ref-pane-img').src='';
  document.getElementById('ref-uploaded').hidden=true;
  document.getElementById('upload-zone-wrap').hidden=false;
  document.getElementById('ref-btn').style.display='none';
  document.getElementById('extracted-colors').innerHTML='';
  document.getElementById('img-input').value='';
  const rp=document.getElementById('ref-pane'); if(rp.classList.contains('open')) rp.classList.remove('open');
  rebuildBooth();
}

function extractColors(img){
  const c=document.createElement('canvas'); c.width=80; c.height=80;
  const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,80,80);
  const data=ctx.getImageData(0,0,80,80).data;
  // Bucket sample
  const buckets={}, step=16;
  for(let i=0;i<data.length;i+=4){
    const r=Math.round(data[i]/step)*step, g=Math.round(data[i+1]/step)*step, b=Math.round(data[i+2]/step)*step;
    if(data[i+3]<128) continue;
    const key=`${r},${g},${b}`; buckets[key]=(buckets[key]||0)+1;
  }
  const sorted=Object.entries(buckets).sort((a,b)=>b[1]-a[1]);
  // Pick 6 distinct colors
  const picked=[];
  for(const [key] of sorted){
    const [r,g,b]=key.split(',').map(Number);
    const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    // skip near-whites and near-blacks
    const lum=(r*.299+g*.587+b*.114)/255;
    if(lum>.9||lum<.06) continue;
    // skip too-similar to already picked
    const tooClose=picked.some(([pr,pg,pb])=>Math.abs(pr-r)+Math.abs(pg-g)+Math.abs(pb-b)<90);
    if(!tooClose){ picked.push([r,g,b]); if(picked.length===6) break; }
  }
  S.extractedColors=picked.map(([r,g,b])=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''));
  const wrap=document.getElementById('extracted-colors');
  wrap.innerHTML=S.extractedColors.map(h=>`<div class="ec-chip" style="background:${h}" title="${h}" onclick="applyColorTo('${h}')"></div>`).join('');
}

function applyColorTo(hex){
  S.brand.primary=hex;
  document.getElementById("col-primary").value=hex;
  document.getElementById("hex-primary").value=hex;
  rebuildBooth();
}

function applyExtractedColors(){
  if(!S.extractedColors.length) return;
  const cols=S.extractedColors;
  if(cols[0]){S.brand.primary=cols[0];document.getElementById('col-primary').value=cols[0];document.getElementById('hex-primary').value=cols[0];}
  if(cols[1]){S.brand.secondary=cols[1];document.getElementById('col-secondary').value=cols[1];document.getElementById('hex-secondary').value=cols[1];}
  if(cols[2]){S.brand.bg=cols[2];document.getElementById('col-bg').value=cols[2];document.getElementById('hex-bg').value=cols[2];}
  rebuildBooth();
}

function toggleRefPane(){
  const p=document.getElementById('ref-pane');
  p.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════════════════
function setSize(s,btn){ S.size=s; document.querySelectorAll('.sz-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); rebuildBooth(); }
function onWallH(v){ S.wallH=+v; document.getElementById('wallH-v').textContent=v+' ft'; rebuildBooth(); }
function onSideH(v){ S.sideH=+v; document.getElementById('sideH-v').textContent=v+' ft'; rebuildBooth(); }
function updateColors(){
  ['primary','secondary','accent','bg'].forEach(k=>{const v=document.getElementById('col-'+k).value;S.brand[k]=v;document.getElementById('hex-'+k).value=v;});
  rebuildBooth();
}
function syncHex(k){ const v=document.getElementById('hex-'+k).value; if(/^#[0-9a-fA-F]{6}$/.test(v)){S.brand[k]=v;document.getElementById('col-'+k).value=v;rebuildBooth();} }
function onLogoScale(v){ S.brand.logoScale=+v; document.getElementById('logo-scale-v').textContent=(+v).toFixed(1)+'×'; rebuildBooth(); }
function onLightInt(v){ S.brand.lightInt=v/100; document.getElementById('light-int-v').textContent=v+'%'; rebuildBooth(); }
function toggleFurn(id,btn){
  if(S.furn.has(id)) S.furn.delete(id); else S.furn.add(id);
  btn.classList.toggle('active', S.furn.has(id));
  rebuildBooth();
}
function resetCamera(){ oTh=Math.PI/4; oPh=0.75; oR=22; camUpdate(); }
function setView(v,btn){
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  if(v==='front'){oTh=0;oPh=1.1;oR=16;}
  else if(v==='top'){oTh=0;oPh=0.05;oR=18;}
  else if(v==='side'){oTh=Math.PI/2;oPh=1.0;oR=15;}
  else{oTh=Math.PI/4;oPh=0.75;oR=22;}
  camUpdate();
}

function updateInfo(){
  const f=S.recon&&S.recon.footprint;
  const {lbl,type}=getSZ();
  document.getElementById('info-size').textContent=lbl;
  document.getElementById('booth-info').innerHTML=`<strong id="info-size">${lbl}</strong> ${type}<br><span style="font-size:10px">Click anything to select · Drag empty space or unselected walls to orbit</span>`;
}
// getSZ name fix
function getSZ(){
  const fp=S.recon&&S.recon.footprint;
  if(fp) return {w:num(fp.widthFt,10)*.3048,d:num(fp.depthFt,10)*.3048,lbl:`${fp.widthFt} × ${fp.depthFt} ft`,type:"From photo"};
  if(S.size==="custom"&&S.custom) return {w:S.custom.w*.3048,d:S.custom.d*.3048,lbl:`${S.custom.w} × ${S.custom.d} ft`,type:"Custom"};
  const m={'10x10':{w:3.05,d:3.05,lbl:'10 × 10 ft',type:'Standard'},'10x20':{w:6.1,d:3.05,lbl:'10 × 20 ft',type:'Double Inline'},'20x20':{w:6.1,d:6.1,lbl:'20 × 20 ft',type:'Corner'},'30x30':{w:9.15,d:9.15,lbl:'30 × 30 ft',type:'Island'}};return m[S.size]||m['10x10']; }

// ═══════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════
function switchTab(t){
  ['design','furnish','branding','specs'].forEach((id,i)=>{
    document.querySelectorAll('.htab')[i].classList.toggle('active',id===t);
    const el=document.getElementById('tab-'+id); if(el) el.hidden=id!==t;
  });
  const isSpecs=t==='specs';
  document.getElementById('sidebar').style.display=isSpecs?'none':'';
  document.getElementById('canvas-wrap').style.display=isSpecs?'none':'';
  document.getElementById('specs-panel').classList.toggle('open',isSpecs);
  if(isSpecs) updateSpecs();
}

// ═══════════════════════════════════════════════════════
//  SPECS
// ═══════════════════════════════════════════════════════
function wt(){ let w=0; const m={backwall:120,sidewalls:80,header:35,counter:95,shelf:60,lights:70,floor:50}; Object.entries(m).forEach(([k,v])=>{if(S.els[k])w+=v;}); S.furn.forEach(f=>{const fw={lounge:85,'table-rect':35,'tv-stand':48,'videowall':90,'tv-wall':32,plant:12,podium:28,kiosk:22};w+=fw[f]||10;}); const mult=specKey()==='30x30'?3.4:specKey()==='20x20'?2.1:specKey()==='10x20'?1.55:1; return Math.round(w*mult)+placedWeight(); }
function sh(){ let h=2; const mult=specKey()==='30x30'?3:specKey()==='20x20'?2:specKey()==='10x20'?1.5:1; if(S.els.lights)h+=1.5; if(S.els.counter)h+=0.5; if(S.els.shelf)h+=0.5; if(S.furn.size+placedCount()>4)h+=1; h+=Math.min(4,placedCount()*.15); return +(h*mult).toFixed(1); }
function pw(){ let a=5; if(S.els.lights)a+=15; if(S.furn.has('tv-wall')||S.furn.has('tv-stand'))a+=8; if(S.furn.has('videowall'))a+=20; if(S.furn.has('neon'))a+=6; if(S.furn.has('uplight'))a+=8; if(S.furn.has('pendant'))a+=6; const mult=specKey()==='30x30'?2.4:specKey()==='20x20'?1.9:1; return Math.round(a*mult+placedAmps()); }
function updateSpecs(){
  if(S.recon){ reconSpecs(); return; }
  const {w,d,lbl}=getSZ(), sqft=(w*d/0.0929).toFixed(0), tot=wt(), hrs=sh();
  document.getElementById('spec-cards').innerHTML=[['Footprint',lbl,''],['Floor Area',isM()?(w*d).toFixed(1):sqft,isM()?'m²':'sq ft'],['Wall Height',fmtFt(S.wallH),''],['Est. Weight',isM()?Math.round(tot*.4536):tot,isM()?'kg':'lbs'],['Setup Time',hrs,'hours'],['Furnishings',S.furn.size+placedCount(),'items'],['Power Draw',pw(),'amps'],['Active Systems',Object.values(S.els).filter(Boolean).length,'/ 7']].map(([l,v,u])=>`<div class="sc"><div class="sc-label">${l}</div><div class="sc-val">${v} <span class="sc-unit">${u}</span></div></div>`).join('');
  const {w:bw,d:bd}=getSZ(); const rows=[];
  if(S.els.backwall) rows.push(['Back Wall Graphic',`${(bw/.3048).toFixed(0)}′ W × ${S.wallH}′ H`,'Dye-sub SEG fabric','1','120 lbs',true]);
  if(S.els.sidewalls) rows.push(['Side Walls (pair)',`${(bd/.3048).toFixed(0)}′ D × ${S.sideH}′ H`,'Stretch fabric','2','40 lbs ea',true]);
  if(S.els.header) rows.push(['Header Fascia',`${(bw/.3048).toFixed(0)}′ W × 1.5′ H`,'Backlit SEG fabric','1','35 lbs',true]);
  if(S.els.counter) rows.push(['Reception Counter','48″ W × 39″ H × 24″ D','Laminate / aluminum frame','1','95 lbs',true]);
  if(S.els.shelf) rows.push(['Wall Shelving','36″ W × 12″ D per shelf','Tempered glass / steel','3 shelves','20 lbs ea',false]);
  if(S.els.lights) rows.push(['Lighting Truss + LEDs',`${(bw/.3048).toFixed(0)}′ W truss`,'Aluminum + LED modules','1 bar','70 lbs',true]);
  if(S.els.floor) rows.push(['Flooring System',`${(bw/.3048).toFixed(0)}′ × ${(bd/.3048).toFixed(0)}′`,document.getElementById('floor-mat').options[document.getElementById('floor-mat').selectedIndex].text.split('–')[0].trim(),'1 set','50 lbs',true]);
  if(S.furn.has('lounge')) rows.push(['Lounge Sofa','80″ W × 32″ D × 30″ H','Upholstered frame','1','85 lbs',false]);
  if(S.furn.has('tv-wall')) rows.push(['TV 55″ Wall Mount','55″ diagonal','LCD panel + mount','1','32 lbs',false]);
  if(S.furn.has('tv-stand')) rows.push(['TV 65″ on Stand','65″ diagonal','LCD panel + mobile stand','1','48 lbs',false]);
  if(S.furn.has('videowall')) rows.push(['3×2 Video Wall','3×2 LED panels','LED tile array + controller','6 panels','90 lbs',false]);
  specLines().forEach(r=>rows.push([r.name,r.dims,r.mat,String(r.qty),r.qty>1?r.lbs+" lbs ea":r.lbs+" lbs",true]));
  rows.push(['Booth Frame / Extrusion','Varies by size','6063-T5 aluminum','Per plan','80 lbs',true]);
  rows.push(['Electrical Distribution Kit','15 ft cord reel','UL-listed components','1 kit','8 lbs',true]);
  document.getElementById('specs-tbody').innerHTML=rows.map(([n,dim,mat,qty,w,ok])=>`<tr><td>${n}</td><td>${dim}</td><td>${mat}</td><td>${qty}</td><td>${w}</td><td><span class="badge badge-${ok?'g':'w'}">${ok?'Included':'Optional'}</span></td></tr>`).join('');
  document.getElementById('logistics-cards').innerHTML=[['Shipping Cases',Math.ceil(tot/280)+' cases',''],['Power Required',pw()+' amps',''],['Strike Time',Math.ceil(hrs*.6)+' hrs',''],['Crew Required',hrs>6?'4–6 people':'2–3 people','']].map(([l,v,u])=>`<div class="sc"><div class="sc-label">${l}</div><div class="sc-val">${v} <span class="sc-unit">${u}</span></div></div>`).join('');
}

function exportSpecs(){
  const {lbl}=getSZ(), tot=wt(), hrs=sh();
  const rows=document.getElementById('specs-tbody').innerHTML;
  const html=`<!doctype html><html><head><title>Booth Specs – ${S.brand.company}</title><style>body{font-family:system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#111}h1{font-size:26px}p{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:7px 10px;border-bottom:2px solid #000;color:#666}td{padding:9px 10px;border-bottom:1px solid #eee;font-size:12px}.b-g{background:#e6f7ee;color:#1a7a4a;padding:2px 7px;border-radius:4px;font-weight:600;font-size:10px}.b-w{background:#fff8e0;color:#a07000;padding:2px 7px;border-radius:4px;font-weight:600;font-size:10px}@media print{body{margin:0}}</style></head><body><h1>${S.brand.company} — Booth Specification</h1><p>${lbl} · ${document.querySelector('.sz-btn.active small').textContent} · Generated ${new Date().toLocaleDateString()}</p><table><thead><tr><th>Component</th><th>Dimensions</th><th>Material</th><th>Qty</th><th>Est. Weight</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:20px"><b>Est. total weight:</b> ${tot} lbs &nbsp;·&nbsp; <b>Setup time:</b> ${hrs} hrs &nbsp;·&nbsp; <b>Power:</b> ${pw()} amps &nbsp;·&nbsp; <b>Furnishings:</b> ${S.furn.size} items</p></body></html>`;
  const win=window.open('','_blank');
  if(win){win.document.write(html);win.document.close();}
}

// ═══════════════════════════════════════════════════════
//  ENVIRONMENT SYSTEM
// ═══════════════════════════════════════════════════════
let envGroup = new THREE.Group();
scene.add(envGroup);
let currentEnv = 'none';

function disposeEnv() {
  envGroup.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); }
  });
  while (envGroup.children.length) envGroup.remove(envGroup.children[0]);
}

function setEnv(type, btn) {
  currentEnv = type;
  markDirty();
  document.querySelectorAll('.env-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  buildEnvironment(type);
  ground.visible = type === "none";
  crowdOn = type === "showfloor"; syncCrowdControls(); buildCrowd();
  if (type === "showfloor") scene.fog = new THREE.FogExp2("#1a1c22", .03);
  if (type !== "none" && bgPhoto) clearBg();
  applyBg();
}

function buildEnvironment(type) {
  disposeEnv();
  if (type === 'none') {
    scene.background = new THREE.Color('#111318');
    scene.fog = new THREE.FogExp2('#111318', 0.022);
    return;
  }

  const addE = (geo, mat, x, y, z, rx=0, ry=0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x,y,z); m.rotation.set(rx,ry,0);
    m.receiveShadow = true; envGroup.add(m); return m;
  };

  if (type === "convention" || type === "showfloor") {
    addHallDetailPlus(addE);
    scene.background = new THREE.Color('#1a1c22');
    scene.fog = new THREE.FogExp2('#1a1c22', 0.012);
    // Huge floor
    const floorM = new THREE.MeshStandardMaterial({color:new THREE.Color(.11,.12,.14), roughness:.9});
    addE(new THREE.PlaneGeometry(120,120), floorM, 0,0,0, -Math.PI/2,0);
    // Far walls
    const wallM = new THREE.MeshStandardMaterial({color:new THREE.Color(.12,.13,.17), roughness:.95});
    addE(new THREE.PlaneGeometry(120,16), wallM, 0,8,-60, 0,0);
    addE(new THREE.PlaneGeometry(120,16), wallM, 0,8,60, 0,Math.PI);
    addE(new THREE.PlaneGeometry(120,16), wallM, -60,8,0, 0,Math.PI/2);
    addE(new THREE.PlaneGeometry(120,16), wallM, 60,8,0, 0,-Math.PI/2);
    // Ceiling trusses overhead
    const tM = new THREE.MeshStandardMaterial({color:new THREE.Color(.25,.27,.32),roughness:.7,metalness:.4});
    for (let i = -3; i <= 3; i++) {
      addE(new THREE.BoxGeometry(120,.08,.08), tM, 0,13,i*8);
      addE(new THREE.BoxGeometry(.08,13,.08), tM, -50,6.5,i*8);
      addE(new THREE.BoxGeometry(.08,13,.08), tM, 50,6.5,i*8);
    }
    // Distant booth silhouettes
    const boothM = new THREE.MeshStandardMaterial({color:new THREE.Color(.18,.2,.26),roughness:1});
    [[-30,0,-40],[30,0,-40],[-45,0,-25],[45,0,-25],[-30,0,30],[30,0,30]].forEach(([x,y,z]) => {
      addE(new THREE.BoxGeometry(6,2.5,.3), boothM, x,1.25,z);
    });
    // Overhead fluorescent strips
    for (let i = -3; i <= 3; i++) {
      const lt = new THREE.PointLight(new THREE.Color(1,1,.95), 0.4, 25);
      lt.position.set(i*12, 12, 0); envGroup.add(lt);
    }
    // Aisle carpet strips
    const aisleM = new THREE.MeshStandardMaterial({color:new THREE.Color(.2,.22,.27),roughness:.95});
    for (let i = -2; i <= 2; i++) {
      addE(new THREE.PlaneGeometry(3,120), aisleM, i*15, .01, 0, -Math.PI/2, 0);
    }
  }

  else if (type === 'openfloor') {
    scene.background = new THREE.Color('#1c1f28');
    scene.fog = new THREE.FogExp2('#1c1f28', 0.016);
    const floorM = new THREE.MeshStandardMaterial({color:new THREE.Color(.18,.2,.26), roughness:.9});
    addE(new THREE.PlaneGeometry(100,100), floorM, 0,0,0, -Math.PI/2,0);
    // Low ceiling
    const ceilM = new THREE.MeshStandardMaterial({color:new THREE.Color(.1,.11,.14),roughness:1,side:THREE.BackSide});
    addE(new THREE.BoxGeometry(100,100,100), ceilM, 0,50,0);
    // Aisle markers
    const markerM = new THREE.MeshStandardMaterial({color:new THREE.Color(.4,.4,.5),roughness:.6});
    for (let i = -3; i <= 3; i++) {
      addE(new THREE.BoxGeometry(.08,.08,100), markerM, i*12, .04, 0);
      addE(new THREE.BoxGeometry(100,.08,.08), markerM, 0, .04, i*12);
    }
    // Track lights on ceiling
    for (let i = -2; i <= 2; i++) {
      const lt = new THREE.PointLight(new THREE.Color(.9,.92,1), 0.35, 20);
      lt.position.set(i*10, 9, 0); envGroup.add(lt);
    }
  }

  else if (type === 'drama') {
    scene.background = new THREE.Color('#080810');
    scene.fog = new THREE.FogExp2('#080810', 0.028);
    const floorM = new THREE.MeshStandardMaterial({color:new THREE.Color(.05,.05,.07),roughness:.9,metalness:.1});
    addE(new THREE.PlaneGeometry(80,80), floorM, 0,0,0, -Math.PI/2,0);
    // Dark walls
    const wallM = new THREE.MeshStandardMaterial({color:new THREE.Color(.04,.04,.06),roughness:.98});
    addE(new THREE.PlaneGeometry(80,20), wallM, 0,10,-40, 0,0);
    addE(new THREE.PlaneGeometry(80,20), wallM, 0,10,40, 0,Math.PI);
    addE(new THREE.PlaneGeometry(80,20), wallM, -40,10,0, 0,Math.PI/2);
    addE(new THREE.PlaneGeometry(80,20), wallM, 40,10,0, 0,-Math.PI/2);
    // Dramatic overhead spots
    const spotColors = [new THREE.Color(.6,.4,1), new THREE.Color(1,.35,.2), new THREE.Color(.2,.7,1)];
    [[-8,0],[0,0],[8,0],[-4,-4],[4,-4]].forEach(([x,z],i) => {
      const sp = new THREE.SpotLight(spotColors[i%3], 1.5, 20, Math.PI/8, 0.3);
      sp.position.set(x, 15, z);
      sp.target.position.set(x, 0, z);
      envGroup.add(sp); envGroup.add(sp.target);
    });
  }

  else if (type === 'studio') {
    scene.background = new THREE.Color('#e8eaee');
    scene.fog = new THREE.FogExp2('#e8eaee', 0.01);
    // White floor
    const floorM = new THREE.MeshStandardMaterial({color:new THREE.Color(.92,.93,.96), roughness:.3, metalness:.05});
    addE(new THREE.PlaneGeometry(80,80), floorM, 0,0,0, -Math.PI/2,0);
    // White/grey walls
    const wallM = new THREE.MeshStandardMaterial({color:new THREE.Color(.88,.89,.93),roughness:.4});
    addE(new THREE.PlaneGeometry(80,15), wallM, 0,7.5,-40, 0,0);
    addE(new THREE.PlaneGeometry(80,15), wallM, 0,7.5,40, 0,Math.PI);
    addE(new THREE.PlaneGeometry(80,15), wallM, -40,7.5,0, 0,Math.PI/2);
    addE(new THREE.PlaneGeometry(80,15), wallM, 40,7.5,0, 0,-Math.PI/2);
    // Soft white ceiling lights
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
      const lt = new THREE.PointLight(new THREE.Color(1,1,1), 0.5, 30);
      lt.position.set(i*10, 14, j*10); envGroup.add(lt);
    }
  }

  else if (type === 'tent') {
    scene.background = new THREE.Color('#c8d4b0');
    scene.fog = new THREE.FogExp2('#c8d4b0', 0.015);
    // Grass/ground
    const groundM = new THREE.MeshStandardMaterial({color:new THREE.Color(.4,.5,.3),roughness:.98});
    addE(new THREE.PlaneGeometry(100,100), groundM, 0,0,0, -Math.PI/2,0);
    // Tent canvas ceiling — peaked shape via two slanted boxes
    const canvasM = new THREE.MeshStandardMaterial({color:new THREE.Color(.92,.88,.78),roughness:.9,side:THREE.DoubleSide});
    addE(new THREE.BoxGeometry(50,.12,25), canvasM, 0,9.5,0, .18,0);
    addE(new THREE.BoxGeometry(50,.12,25), canvasM, 0,9.5,0, -.18,0);
    // Tent poles
    const poleM = new THREE.MeshStandardMaterial({color:new THREE.Color(.55,.5,.44),roughness:.7,metalness:.3});
    [[-24,0],[-8,0],[8,0],[24,0]].forEach(([x,z]) => {
      addE(new THREE.CylinderGeometry(.06,.06,9,8), poleM, x,4.5,z);
      addE(new THREE.CylinderGeometry(.06,.06,9,8), poleM, x,4.5,z-10);
      addE(new THREE.CylinderGeometry(.06,.06,9,8), poleM, x,4.5,z+10);
    });
    // Natural light
    const sun = new THREE.DirectionalLight(new THREE.Color(1,.97,.85), 1.0);
    sun.position.set(20,20,10); envGroup.add(sun);
    const fill = new THREE.AmbientLight(new THREE.Color(.7,.8,.65), 0.6);
    envGroup.add(fill);
  }
}

// ═══════════════════════════════════════════════════════
//  IMAGE → 3D RECONSTRUCTION
// ═══════════════════════════════════════════════════════
const FT = 0.3048;
const SCENE_FORMAT = `Reply with only one JSON object, compact, no comments:
{"summary":string,
 "scaleBasis":string (which real-world references set the scale, e.g. "door 80in, person 5ft8, 42in counter"),
 "footprint":{"widthFt":number,"depthFt":number},
 "camera":{"azimuthDeg":number (0=straight on, positive=camera moved to booth's right),"elevationDeg":number,"distanceFt":number,"fovDeg":number},
 "objects":[{"name":string,"shape":"box|cylinder|sphere|cone|torus|arch|curvedWall|prism|text",
   "pos":[x,y,z] (CENTER of the object in feet),
   "size":[w,h,d] (feet; cylinder/cone: w=diameter,h=height; sphere: w=diameter; torus: w=outer diameter,h=tube diameter; prism: d=extrusion depth),
   "rot":[x,y,z] (degrees, optional),
   "color":"#rrggbb","gradientTo":"#rrggbb"(optional, vertical color fade),
   "material":"fabric|carpet|wood|metal|chrome|glass|plastic|paint|acrylic|marble|concrete|leather|foliage|led",
   "emissive":0-1 (optional, for lit surfaces),
   "cornerRadiusFt":number (box: rounded corners seen from the front; add "roundPlan":true when corners are rounded seen from above),
   "radiusFt":number,"arcDeg":number,"thicknessFt":number (curvedWall: pos is the circle center, the arc is centered on +z before rot, size h=height; arch: size w,h,d with thicknessFt band width, rounded top; torus arcDeg optional),
   "bottomDiameterFt":number (cylinder: tapered base),
   "points":[[x,y],...],"smooth":true|false (prism only: outline in feet local to the object; smooth=true for organic curves),
   "group":string,"movable":true|false (freestanding furniture and decor: movable=true, and all parts of one item share one group such as "chair-1"; structure is not movable),
   "text":string,"font":"sans|serif|bold"(text only: flat lettering of size w x h, faces +z before rot),
   "repeat":{"count":int,"step":[x,y,z]} (optional, feet; repeats the object, use it for lights, shelves, chairs)}],
 "floor":{"material":"carpet|vinyl|wood|tile|marble|concrete|rubber|epoxy","color":"#rrggbb","color2":"#rrggbb","pattern":"solid|checker|stripes|tiles|planks","moduleFt":number,"heightFt":number} (actual floor look and raised platform height; size of one pattern repeat in moduleFt),
 "lighting":{"colorTempK":number,"ambient":0-1 (how bright the hall light on the booth is)},
 "lights":[{"type":"spot|point","pos":[x,y,z],"target":[x,y,z],"coneDeg":number,"color":"#rrggbb","intensity":0-1,"repeat":{"count":int,"step":[x,y,z]}}] (at most 12 entries, one per real fixture or row, also model each fixture body as an object),
 "uncertain":[string] (everything hidden or guessed)}
Coordinates: origin at floor center of the booth, x to the booth's right, y up, z toward the viewer/aisle. All in feet. Floor top is y=0.
Include at most 150 objects. Never put the floor in objects: describe it only in "floor". Every curved surface must use a curved shape or cornerRadiusFt, never a faceted set of boxes. Do not include people, or neighboring booths.`;

const RECON_PROMPT = `The image shows a trade show booth. Rebuild it as an accurate to-scale 3D model made only of geometry: this data is rendered as real 3D meshes, the photo is never shown in the model.
Work as a set modeler:
1. Fix the scale from real references visible (people, doors, chairs, counters, standard 10ft booth modules, carpet tiles).
2. Solve the perspective: estimate the camera, then derive each element's true position and size in feet rather than copying image proportions.
3. Model EVERY visible element as its own object(s), in the real layout, whatever its form: walls, towers, arches, hanging signs, truss, counters, tables, seating, screens, shelving, product, plants, lighting, flooring, trim, seams. Do not assume a standard booth layout. Use several primitives per complex item (a chair is seat, back and legs).
4. Match colors as the true surface color, compensating for lighting. Reproduce visible wording exactly as text objects, placed just in front of their surface. Rebuild logos and graphics from shapes and text.
5. List what you could not see in "uncertain".
${SCENE_FORMAT}`;

const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
const safeHex = (v, d = '#888888') => /^#[0-9a-fA-F]{6}$/.test(v) ? v : d;
const vec3 = (a, d = 0) => [num(a?.[0], d), num(a?.[1], d), num(a?.[2], d)];

function setReconStatus(msg, busy = false) {
  document.getElementById('analysis-results').hidden = false;
  document.getElementById('recon-status').textContent = msg;
  document.getElementById('recon-stop').hidden = !busy;
  document.getElementById('recon-run').disabled = busy;
  document.getElementById('recon-refine').disabled = busy || !S.recon;
}

function imageBlob(source, maxSide = 2000) {
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(source, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', .92));
}

let reconCtl = null;
let rpTimer = null, rpStart = 0, rpCount = 0, rpWriting = false;
function drawProgress() {
  const sec = (performance.now() - rpStart) / 1000;
  const pct = rpWriting ? 45 + 50 * (1 - Math.exp(-rpCount / 50)) : 3 + 42 * (1 - Math.exp(-sec / 60));
  document.getElementById("rp-stage").textContent = rpWriting
    ? `Writing the model: ${rpCount} part${rpCount === 1 ? "" : "s"} so far`
    : "Claude is analyzing the image (allow access if asked)";
  document.getElementById("rp-time").textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  document.getElementById("rp-fill").style.width = pct + "%";
  document.getElementById("rp-track").setAttribute("aria-valuenow", Math.round(pct));
}
function startProgress() {
  rpStart = performance.now(); rpCount = 0; rpWriting = false;
  document.getElementById("recon-progress").hidden = false;
  drawProgress();
  rpTimer = setInterval(drawProgress, 500);
}
function stopProgress() {
  clearInterval(rpTimer);
  document.getElementById("recon-progress").hidden = true;
}
function stopRecon() { reconCtl?.abort(); }

async function askForScene(prompt, images, label) {
  const sample = window.claude ? await window.claude.use('sample') : null;
  if (!sample) { setReconStatus('Reconstruction needs the page opened on claude.ai, signed in, where it can ask Claude to read the image.'); return; }
  reconCtl = new AbortController();
  setReconStatus(label + ' This usually takes 1–3 minutes.', true);
  try {
    startProgress();
    const data = await sample.json(prompt, { images, modelTier: "complex", signal: reconCtl.signal, cache: false,
      onText: ({ text }) => { rpWriting = true; rpCount = (text.match(/"shape"\s*:/g) || []).length; drawProgress(); } });
    if (!Array.isArray(data?.objects) || !data.objects.length) throw { code: 'invalid_json' };
    enforceSize(data);
    S.drags = Object.fromEntries(Object.entries(S.drags).filter(([k]) => !/^(r|p):/.test(k)));
      S.edits = Object.fromEntries(Object.entries(S.edits).filter(([k]) => k.startsWith("a:")));
    applyScene(data);
  } catch (e) {
    const copy = {
      cancelled: 'Stopped.',
      not_granted: 'Claude access was declined for this page, so the image cannot be read.',
      rate_limited: 'Usage limit reached. Try again later.',
      invalid_json: 'The model came back incomplete. Try again.',
      image_rejected: 'That image could not be read. Try a JPG or PNG.',
    };
    setReconStatus(copy[e?.code] || 'Reconstruction failed. Try again.');
  } finally {
    stopProgress();
  }
}

async function reconstructFromImage() {
  if (!S.refImageData) return;
  await askForScene(RECON_PROMPT + knownSizeText(), [await imageBlob(S.refImageData)], 'Reading the photo and solving geometry…');
}

async function refineRecon() {
  if (!S.recon || !S.refImageData) return;
  matchPhotoCamera();
  renderer.render(scene, camera);
  const snap = await imageBlob(canvas, 1400);
  const prompt = `Image 1 is a photo of a real trade show booth. Image 2 is a render of a 3D model of it, from the estimated camera. The model's data is below.
Compare them element by element: missing or extra items, wrong position, proportion, height, color, material, wording. Return the complete corrected model, keeping what is already right.
Current model: ${JSON.stringify(S.recon)}
${knownSizeText()}${SCENE_FORMAT}`;
  await askForScene(prompt, [await imageBlob(S.refImageData), snap], 'Comparing the render with the photo and correcting…');
}

function applyScene(data) {
  S.recon = data;
  rebuildBooth();
  matchPhotoCamera();
  const f = data.footprint || {}, list = Array.isArray(data.uncertain) ? data.uncertain : [];
  setReconStatus(`Built ${data.objects.length} objects, ${num(f.widthFt)} × ${num(f.depthFt)} ft. ${data.summary || ''}`);
  document.getElementById('recon-scale').textContent = data.scaleBasis ? 'Scale from: ' + data.scaleBasis : '';
  document.getElementById('recon-uncertain').textContent = list.length ? 'Estimated, not visible: ' + list.join('; ') : '';
  document.getElementById('recon-clear').hidden = false;
}

function clearRecon() {
  S.recon = null;
  document.getElementById('recon-clear').hidden = true;
  document.getElementById('recon-scale').textContent = '';
  document.getElementById('recon-uncertain').textContent = '';
  setReconStatus('Model cleared. Back to the configurable booth.');
  rebuildBooth();
}

function matchPhotoCamera() {
  const c = S.recon?.camera; if (!c) return;
  const f = S.recon.footprint || {};
  oTarget.set(0, 1.2, 0);
  oTh = num(c.azimuthDeg) * Math.PI / 180;
  oPh = Math.max(.08, Math.min(1.55, Math.PI / 2 - num(c.elevationDeg, 8) * Math.PI / 180));
  oR = Math.max(2, num(c.distanceFt, Math.max(num(f.widthFt, 20), num(f.depthFt, 20)) * 1.6) * FT);
  camera.fov = Math.max(15, Math.min(90, num(c.fovDeg, 50)));
  camera.updateProjectionMatrix();
  camUpdate();
}

// Procedural surface detail, cached and shared between materials
const detailCache = {};
function detailMaps(kind) {
  if (detailCache[kind]) return detailCache[kind];
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), img = x.createImageData(n, n), h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.random();
    let v = r;
    if (kind === 'fabric') v = .5 + .25 * Math.sin(i * 1.6) * Math.sin(j * 1.6) + r * .15;
    else if (kind === 'wood') v = .5 + .3 * Math.sin(j * .35 + 5 * Math.sin(i * .012 + j * .03)) + r * .06;
    else if (kind === 'metal') v = .5 + (Math.sin(j * 2.1) + Math.sin(j * .7)) * .1 + r * .05;
    else if (kind === 'stone') v = .5 + .2 * Math.sin((i + j) * .05 + 4 * Math.sin(j * .03)) + r * .1;
    h[j * n + i] = v;
  }
  const strength = { carpet: 3, fabric: 1.6, wood: .9, metal: .35, stone: .4 }[kind] || 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (h[j * n + (i + 1) % n] - h[j * n + (i + n - 1) % n]) * strength;
    const dy = (h[((j + 1) % n) * n + i] - h[((j + n - 1) % n) * n + i]) * strength;
    const l = Math.hypot(dx, dy, 1), p = (j * n + i) * 4;
    img.data[p] = (-dx / l * .5 + .5) * 255; img.data[p + 1] = (-dy / l * .5 + .5) * 255;
    img.data[p + 2] = (1 / l * .5 + .5) * 255; img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return detailCache[kind] = t;
}

function surfaceMat(o) {
  const presets = {
    fabric: [.92, 0, 'fabric'], carpet: [1, 0, 'carpet'], wood: [.48, 0, 'wood'], metal: [.38, .95, 'metal'],
    chrome: [.08, 1, null], glass: [.04, 0, null], plastic: [.32, 0, null], paint: [.55, 0, null],
    acrylic: [.12, 0, null], marble: [.16, 0, 'stone'], concrete: [.82, 0, 'stone'], leather: [.5, 0, 'fabric'],
    foliage: [.7, 0, 'carpet'], led: [.3, 0, null],
  };
  const [roughness, metalness, detail] = presets[o.material] || presets.paint;
  const color = safeHex(o.color);
  const opt = { color: hexColor(color), roughness, metalness };
  if (detail) { opt.normalMap = detailMaps(detail); opt.normalScale = new THREE.Vector2(.22, .22); }
  if (o.material === 'glass') { opt.transparent = true; opt.opacity = .22; opt.envMapIntensity = 2.2; opt.depthWrite = false; }
  if (o.gradientTo) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, color); g.addColorStop(1, safeHex(o.gradientTo, color));
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    opt.map = new THREE.CanvasTexture(c); opt.map.colorSpace = THREE.SRGBColorSpace; opt.color = new THREE.Color(1, 1, 1);
  }
  const glow = o.material === 'led' ? Math.max(num(o.emissive, .8), .4) : Math.max(0, Math.min(1, num(o.emissive)));
  if (glow) { opt.emissive = hexColor(color); opt.emissiveIntensity = glow * 2.2; if (opt.map) opt.emissiveMap = opt.map; }
  return new THREE.MeshStandardMaterial(opt);
}

function textMesh(o, w, h) {
  const aspect = Math.max(.05, w / Math.max(h, .01)), H = 256, W = Math.min(2048, Math.round(H * aspect));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), str = String(o.text || '');
  const face = o.font === 'serif' ? 'Georgia, serif' : 'Arial, Helvetica, sans-serif';
  const weight = o.font === 'bold' ? 800 : 500;
  let size = H * .84;
  x.font = `${weight} ${size}px ${face}`;
  size *= Math.min(1, (W * .98) / Math.max(1, x.measureText(str).width));
  x.font = `${weight} ${size}px ${face}`;
  x.fillStyle = safeHex(o.color, '#ffffff'); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(str, W / 2, H / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const glow = num(o.emissive);
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .5, alphaTest: .05,
    emissive: glow ? hexColor(safeHex(o.color, '#ffffff')) : 0x000000, emissiveMap: glow ? t : null, emissiveIntensity: glow * 2 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

function reconSpecs() {
  const f = S.recon.footprint || {}, objs = S.recon.objects;
  document.getElementById('spec-cards').innerHTML = [
    ['Footprint', `${num(f.widthFt)} × ${num(f.depthFt)} ft`, ''], ['Floor Area', Math.round(num(f.widthFt) * num(f.depthFt)), 'sq ft'],
    ['Peak Height', Math.max(0, ...objs.map(o => num(o.pos?.[1]) + num(o.size?.[1]) / 2)).toFixed(1), 'ft'], ['Modeled Parts', objs.length, ''],
  ].map(([l, v, u]) => `<div class="sc"><div class="sc-label">${l}</div><div class="sc-val">${v} <span class="sc-unit">${u}</span></div></div>`).join('');
  const tb = document.getElementById('specs-tbody'); tb.textContent = '';
  objs.forEach(o => {
    const tr = document.createElement('tr'), s = vec3(o.size);
    [o.name || o.shape, `${s[0].toFixed(1)}′ × ${s[1].toFixed(1)}′ × ${s[2].toFixed(1)}′`, o.material || '—', num(o.repeat?.count, 1), 'Not estimated', 'Estimated from photo']
      .forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
    tb.append(tr);
  });
  document.getElementById('logistics-cards').innerHTML = '<p style="font-size:12px;color:var(--fg-muted)">Dimensions are estimated from a single photo. Have the fabricator verify them before quoting or building.</p>';
}

// ═══════════════════════════════════════════════════════
//  PHOTOREAL LIGHTING
// ═══════════════════════════════════════════════════════
const pmrem = new THREE.PMREMGenerator(renderer);
(function buildStudioIBL() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(.16, .165, .175), side: THREE.BackSide })));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(.16, .15, .15) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -7.9; s.add(floor);
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9), side: THREE.DoubleSide }));
    p.rotation.x = Math.PI / 2; p.position.set(i * 7.5, 7.8, j * 11); s.add(p);
  }
  scene.environment = pmrem.fromScene(s, .03).texture;
})();

const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .38, metalness: .05, normalMap: detailMaps('stone') }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.012; ground.receiveShadow = true; scene.add(ground);

ambient.intensity = .05;
grid.visible = false;
fill.intensity = .15;
sun.intensity = .95;
renderer.toneMappingExposure = .72;
sun.shadow.bias = -.0004; sun.shadow.normalBias = .015; sun.shadow.radius = 3;
['left', 'right', 'top', 'bottom'].forEach((k, i) => sun.shadow.camera[k] = [-14, 14, 14, -14][i]);
sun.shadow.camera.updateProjectionMatrix();
const sunBase = sun.position.clone();
const sky = new THREE.DirectionalLight(0xf2f5ff, .5);
sky.castShadow = true; sky.shadow.mapSize.set(1024, 1024); sky.shadow.bias = -.0005; sky.shadow.normalBias = .02;
['left', 'right', 'top', 'bottom'].forEach((k, i) => sky.shadow.camera[k] = [-14, 14, 14, -14][i]);
sky.shadow.camera.far = 80; sky.position.set(0, 30, 0); scene.add(sky);

// Progressive refinement: averages jittered frames for soft area shadows, sky occlusion and clean edges
const HQ_SAMPLES = 96;
let hqTarget = HQ_SAMPLES;
const hqCanvas = document.getElementById('hq-canvas'), hqCtx = hqCanvas.getContext('2d');
const hqStatus = document.getElementById('hq-status');
let sceneRev = 0, lastKey = '', lastChange = performance.now(), hqN = 0, hqSum = null, hqPx = null, hqImg = null;
function markDirty() { sceneRev++; }

function resetHQ() {
  hqN = 0; hqCanvas.style.visibility = 'hidden';
  camera.clearViewOffset();
  sun.position.copy(sunBase); sky.position.set(0, 30, 0);
}

function stepHQ() {
  updateCeilingVis();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()), W = size.x, H = size.y;
  if (!hqSum || hqSum.length !== W * H * 3) {
    hqSum = new Float32Array(W * H * 3); hqPx = new Uint8Array(W * H * 4);
    hqCanvas.width = W; hqCanvas.height = H; hqImg = hqCtx.createImageData(W, H);
    hqN = 0;
  }
  if (hqN === 0) hqSum.fill(0);
  camera.setViewOffset(W, H, Math.random() - .5, Math.random() - .5, W, H);
  camUpdate();
  const lensA = Math.random() * 6.283, lensR = Math.sqrt(Math.random()) * .018;
  camera.position.add(new THREE.Vector3(Math.cos(lensA) * lensR, Math.sin(lensA) * lensR, 0).applyQuaternion(camera.quaternion));
  camera.lookAt(oTarget);
  const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 2.4;
  sun.position.set(sunBase.x + Math.cos(a) * r, sunBase.y, sunBase.z + Math.sin(a) * r);
  const u = Math.random(), b = Math.random() * 6.283, sin = Math.sqrt(u);
  sky.position.set(Math.cos(b) * sin * 30, Math.sqrt(1 - u) * 30 + .5, Math.sin(b) * sin * 30);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, hqPx);
  hqN++;
  for (let i = 0, j = 0; i < hqPx.length; i += 4, j += 3) {
    hqSum[j] += hqPx[i] * hqPx[i]; hqSum[j + 1] += hqPx[i + 1] * hqPx[i + 1]; hqSum[j + 2] += hqPx[i + 2] * hqPx[i + 2];
  }
  if (hqN % 4 === 0 || hqN === hqTarget) {
    const d = hqImg.data, inv = 1 / hqN, seed = hqN;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = ((H - 1 - y) * W + x) * 3, p = (y * W + x) * 4;
      const nx = x / W - .5, ny = y / H - .5, vig = 1 - .34 * (nx * nx + ny * ny), grain = (((x * 12.9898 + y * 78.233 + seed) * 43.5453) % 1) * 2.4 - 1.2;
      d[p] = Math.sqrt(hqSum[j] * inv) * vig + grain; d[p + 1] = Math.sqrt(hqSum[j + 1] * inv) * vig + grain; d[p + 2] = Math.sqrt(hqSum[j + 2] * inv) * vig + grain; d[p + 3] = 255;
    }
    hqCtx.putImageData(hqImg, 0, 0);
    applyBloom();
    hqCanvas.style.visibility = 'visible';
  }
  hqStatus.textContent = hqN < hqTarget ? `Refining ${hqN}/${hqTarget}` : 'Final quality';
}

function renderFrame() {
  if (exporting) return;
  updateCeilingVis();
  if (crowdLiveFrame()) return;
  const key = [sceneRev, canvas.width, camera.fov, oTh, oPh, oR, oTarget.x, oTarget.y, oTarget.z].join();
  const now = performance.now();
  if (key !== lastKey) { lastKey = key; lastChange = now; resetHQ(); hqStatus.textContent = 'Live preview'; }
  if (now - lastChange < 350) { renderer.render(scene, camera); return; }
  if (hqN < hqTarget) { stepHQ(); if (hqN === hqTarget) camUpdate(); }
}

function smoothNormals(geo, deg = 38) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map(), cos = Math.cos(deg * Math.PI / 180);
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
    (map.get(k) || map.set(k, []).get(k)).push(i);
  }
  const src = n.array.slice(), out = n.array;
  map.forEach(list => list.forEach(i => {
    let x = 0, y = 0, z = 0;
    list.forEach(j => {
      if (src[i * 3] * src[j * 3] + src[i * 3 + 1] * src[j * 3 + 1] + src[i * 3 + 2] * src[j * 3 + 2] >= cos) { x += src[j * 3]; y += src[j * 3 + 1]; z += src[j * 3 + 2]; }
    });
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }));
  n.needsUpdate = true;
  return g;
}

function extrudeCentered(shape, depth, segs, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(depth - 2 * bevel, .001), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: segs });
  g.translate(0, 0, -Math.max(depth - 2 * bevel, .001) / 2);
  return smoothNormals(g);
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function boxGeometry(o, w, h, d) {
  const b = .006, r = Math.max(0, num(o.cornerRadiusFt) * FT);
  if (!r && Math.min(w, h, d) < .04) return new THREE.BoxGeometry(w, h, d);
  if (o.roundPlan) {
    const R = Math.max(.001, Math.min(r, w / 2 - b, d / 2 - b));
    const g = extrudeCentered(roundedRect(w - 2 * b, d - 2 * b, R), h, r ? 24 : 3, b);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const R = Math.max(.001, Math.min(r, w / 2 - b, h / 2 - b));
  return extrudeCentered(roundedRect(w - 2 * b, h - 2 * b, R), d, r ? 24 : 3, b);
}

function objectGeometry(o, w, h, d) {
  switch (o.shape) {
    case 'cylinder': return new THREE.CylinderGeometry(w / 2, num(o.bottomDiameterFt) ? num(o.bottomDiameterFt) * FT / 2 : w / 2, h, 64);
    case 'cone': return new THREE.CylinderGeometry(0, w / 2, h, 64);
    case 'sphere': return new THREE.SphereGeometry(w / 2, 48, 32);
    case 'torus': { const tube = Math.max(h / 2, .004); return new THREE.TorusGeometry(Math.max(w / 2 - tube, .01), tube, 24, 96, num(o.arcDeg, 360) * Math.PI / 180); }
    case 'curvedWall': {
      const R = Math.max(.05, num(o.radiusFt, 5) * FT), t = Math.min(Math.max(.01, num(o.thicknessFt, .25) * FT), R * .9);
      const arc = Math.max(5, Math.min(360, num(o.arcDeg, 90))) * Math.PI / 180, a0 = -Math.PI / 2 - arc / 2, a1 = -Math.PI / 2 + arc / 2;
      const s = new THREE.Shape(); s.absarc(0, 0, R, a0, a1, false); s.absarc(0, 0, R - t, a1, a0, true); s.closePath();
      const g = extrudeCentered(s, h, 96, .004);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case 'arch': {
      const W = w / 2, H = h / 2, t = Math.min(Math.max(.02, num(o.thicknessFt, 1) * FT), W * .9), ry = Math.min(h - .01, W), spr = H - ry;
      const s = new THREE.Shape(); s.moveTo(-W, -H); s.lineTo(-W, spr); s.absellipse(0, spr, W, ry, Math.PI, 0, true);
      s.lineTo(W, -H); s.lineTo(W - t, -H); s.lineTo(W - t, spr); s.absellipse(0, spr, W - t, Math.max(ry - t, .01), 0, Math.PI, false);
      s.lineTo(-W + t, -H); s.closePath();
      return extrudeCentered(s, d, 64, .004);
    }
    case 'prism': {
      const pts = (Array.isArray(o.points) ? o.points.filter(Array.isArray) : []).map(p => new THREE.Vector2(num(p[0]) * FT, num(p[1]) * FT));
      if (pts.length >= 3) {
        const outline = o.smooth ? new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)), true).getPoints(160).map(p => new THREE.Vector2(p.x, p.y)) : pts;
        return extrudeCentered(new THREE.Shape(outline), d, 24, .004);
      }
    }
  }
  return boxGeometry(o, w, h, d);
}

function kelvinColor(k) {
  const t = Math.max(1500, Math.min(9000, num(k, 4000))) / 6600;
  const c = new THREE.Color(1, Math.min(1, .39 * Math.log(Math.max(t, .3) * 66) / 1.63 - .1), t >= 1 ? 1 : Math.max(0, .54 * Math.log(Math.max(t * 66 - 10, 1)) / 2.3 - .3));
  return c;
}

function buildReconFloor() {
  const f = S.recon.footprint || {}, W = num(f.widthFt, 10) * FT, D = num(f.depthFt, 10) * FT, fl = S.recon.floor || {};
  const col = S.lightAdj.floorColor || safeHex(fl.color, '#444a55'), col2 = safeHex(fl.color2, col), mod = Math.max(.25, num(fl.moduleFt, 2)) * FT;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 512, 512);
  if (fl.pattern === 'checker') { x.fillStyle = col2; x.fillRect(0, 0, 256, 256); x.fillRect(256, 256, 256, 256); }
  else if (fl.pattern === 'stripes') { x.fillStyle = col2; x.fillRect(0, 0, 256, 512); }
  else if (fl.pattern === 'tiles') { x.strokeStyle = col2; x.lineWidth = 4; x.strokeRect(0, 0, 512, 512); }
  else if (fl.pattern === 'planks') { x.strokeStyle = col2; x.lineWidth = 3; [0, 128, 256, 384].forEach((y, i) => { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.moveTo(i % 2 ? 128 : 384, y); x.lineTo(i % 2 ? 128 : 384, y + 128); x.stroke(); }); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.repeat.set(W / mod, D / mod);
  const presets = { carpet: [.98, 'carpet'], vinyl: [.4, 'wood'], wood: [.35, 'wood'], tile: [.22, 'stone'], marble: [.1, 'stone'], concrete: [.55, 'stone'], rubber: [.8, null], epoxy: [.12, null] };
  const [roughness, detail] = presets[fl.material] || presets.carpet;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness });
  if (detail) { m.normalMap = detailMaps(detail).clone(); m.normalMap.needsUpdate = true; m.normalMap.repeat.set(W * 2, D * 2); m.normalScale.setScalar(detail === 'carpet' ? .8 : .25); }
  const h = Math.max(.02, num(fl.heightFt, .1) * FT);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), [mkMat(col, .7), mkMat(col, .7), m, mkMat(col, .7), mkMat(col, .7), mkMat(col, .7)]);
  floor.position.y = h / 2 - .005; floor.receiveShadow = true; boothG.add(floor);
  return h - .005;
}

function reconLights() {
  const L = S.recon.lighting || {}, adj = S.lightAdj;
  const warm = kelvinColor(num(L.colorTempK, 4000) - adj.warm * 1500);
  sun.color.copy(warm); sky.color.copy(warm).lerp(new THREE.Color(1, 1, 1), .6);
  const amb = Math.max(.1, Math.min(1, num(L.ambient, .55)));
  sun.intensity = .35 + .6 * amb; sky.intensity = .15 + .45 * amb;
  renderer.toneMappingExposure = .72 * adj.bright;
  (Array.isArray(S.recon.lights) ? S.recon.lights : []).slice(0, 12).forEach(l => {
    const count = Math.max(1, Math.min(8, Math.floor(num(l.repeat?.count, 1)))), step = vec3(l.repeat?.step).map(v => v * FT);
    const color = l.color ? hexColor(safeHex(l.color)) : warm, power = Math.min(1, num(l.intensity, .6));
    for (let i = 0; i < count; i++) {
      const pos = vec3(l.pos).map((v, a) => v * FT + step[a] * i);
      let p;
      if (l.type === 'spot') {
        p = new THREE.SpotLight(color, power * 2.4 / Math.sqrt(count), 12, Math.max(5, Math.min(70, num(l.coneDeg, 30))) * Math.PI / 180, .55, 1.6);
        p.target.position.set(...vec3(l.target).map((v, a) => v * FT + step[a] * i));
        boothG.add(p.target);
      } else p = new THREE.PointLight(color, power * 1.4 / Math.sqrt(count), 9, 2);
      p.position.set(...pos);
      boothG.add(p);
    }
  });
}

function buildRecon() {
  const fp = S.recon.footprint || {}, fw = num(fp.widthFt, 10), fd = num(fp.depthFt, 10);
  const lift = buildReconFloor();
  const groups = new Map();
  S.recon.objects.slice(0, 400).forEach(o => {
    if (o.shape === "text" && S.noText) return;
    if (o.shape === 'box' && num(o.size?.[1]) <= .5 && num(o.pos?.[1]) < .5 && num(o.size?.[0]) >= fw * .7 && num(o.size?.[2]) >= fd * .7) return;
    const [w, h, d] = vec3(o.size, 1).map(v => Math.max(.003, Math.abs(v) * FT));
    const [px, py, pz] = vec3(o.pos).map(v => v * FT);
    const [rx, ry, rz] = vec3(o.rot).map(v => v * Math.PI / 180);
    const count = Math.max(1, Math.min(60, Math.floor(num(o.repeat?.count, 1))));
    const step = vec3(o.repeat?.step).map(v => v * FT);
    for (let i = 0; i < count; i++) {
      const m = o.shape === 'text' ? textMesh(o, w, h) : new THREE.Mesh(objectGeometry(o, w, h, d), surfaceMat(o));
      m.position.set(px + step[0] * i, py + step[1] * i + lift, pz + step[2] * i);
      m.rotation.set(rx, ry, rz);
      m.castShadow = o.shape !== 'text' && o.material !== 'glass';
      m.receiveShadow = true;
      m.userData.label = o.name;
      if (o.movable) {
        const key = `${o.group || o.name}${count > 1 && !o.group ? '#' + i : ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
      } else boothG.add(m);
    }
  });
  groups.forEach((meshes, key) => {
    const box = new THREE.Box3();
    meshes.forEach(m => { m.updateMatrixWorld(); box.expandByObject(m); });
    const ctr = box.getCenter(new THREE.Vector3()), g = new THREE.Group();
    g.position.set(ctr.x, 0, ctr.z);
    meshes.forEach(m => { m.position.x -= ctr.x; m.position.z -= ctr.z; g.add(m); });
    boothG.add(g);
    makeDraggable(g, 'r:' + key);
  });
  reconLights();
}

// Furniture positioning
function makeDraggable(obj, key) {
  obj.userData.dragKey = key;
  obj.userData.base = { x: obj.position.x, y: obj.position.y, z: obj.position.z, r: obj.rotation.y };
  const d = S.drags[key];
}
let labelMark = 0;
function sectionLabel(name) {
  boothG.children.slice(labelMark).forEach(c => { if (!c.isLight && !c.userData.label) c.userData.label = name; });
  labelMark = boothG.children.length;
}
const FURN_NAMES = { "chair-task": "Task chair", "chair-padded": "Upholstered chair", lounge: "Lounge sofa", barstool: "Bar stool", "table-round": "Café table", "table-rect": "Rectangular table", cocktail: "Cocktail table", podium: "Podium", "tv-wall": "Wall TV", "tv-stand": "TV on stand", videowall: "Video wall", kiosk: "Touch kiosk", uplight: "Uplight", pendant: "Pendant light", neon: "Neon sign", floorlamp: "Floor lamp", plant: "Potted plant", banner: "Roll-up banner", merch: "Product display", brochure: "Brochure stand" };
function tagFurn(id, build) {
  const n = boothG.children.length;
  build();
  boothG.children.slice(n).forEach((o, i) => { makeDraggable(o, id + ":" + i); if (!o.userData.label) o.userData.label = FURN_NAMES[id] || id; });
}
function resetLayout() { S.drags = {}; rebuildBooth(); }

const dragRay = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragging = null;
function aimRay(cx, cy) {
  const r = canvas.getBoundingClientRect();
  camera.clearViewOffset();
  camera.updateMatrixWorld();
  dragRay.setFromCamera({ x: (cx - r.left) / r.width * 2 - 1, y: -(cy - r.top) / r.height * 2 + 1 }, camera);
}
function pickFurniture(cx, cy) {
  aimRay(cx, cy);
  const hits = dragRay.intersectObjects(boothG.children, true);
  for (let o = hits[0]?.object; o; o = o.parent) if (o.userData.dragKey || o.userData.artId) return o;
  return null;
}
function beginDrag(cx, cy) {
  const obj = pickFurniture(cx, cy); if (!obj) return false;
  if (obj.userData.artId) { dragging = { art: artItems.find(a => a.id === obj.userData.artId) }; selectArt(dragging.art.id); canvas.style.cursor = "grabbing"; return true; }
  const hit = dragRay.ray.intersectPlane(floorPlane, new THREE.Vector3()); if (!hit) return false;
  dragging = { obj, gx: obj.position.x - hit.x, gz: obj.position.z - hit.z };
  canvas.style.cursor = 'grabbing';
  return true;
}
function moveDrag(cx, cy) {
  aimRay(cx, cy);
  if (dragging.art) { const s = surfaceHit(); if (s) { dragging.art.pos = s.p; dragging.art.normal = s.n; poseArt(dragging.art); } return; }
  const hit = dragRay.ray.intersectPlane(floorPlane, new THREE.Vector3()); if (!hit) return;
  const { w, d } = getSZ(), { obj } = dragging, b = obj.userData.base;
  const free = isStructureKey(obj.userData.dragKey), px = obj.position.x, pz = obj.position.z;
  obj.position.x = free ? hit.x + dragging.gx : Math.max(-w / 2, Math.min(w / 2, hit.x + dragging.gx));
  obj.position.z = free ? hit.z + dragging.gz : Math.max(-d / 2, Math.min(d / 2, hit.z + dragging.gz));
  artItems.filter(a => a.host === obj.userData.dragKey).forEach(a => { a.pos.x += obj.position.x - px; a.pos.z += obj.position.z - pz; poseArt(a); });
  selBox.setFromObject(obj);
  const prev = S.drags[obj.userData.dragKey];
  S.drags[obj.userData.dragKey] = { x: obj.position.x - b.x, z: obj.position.z - b.z, r: prev ? prev.r : 0 };
  markDirty();
}
const canvasArea = document.getElementById('canvas-area');
function pressAt(x, y) {
  press = { x, y };
  const o = pickFurniture(x, y); if (!o || o.userData.locked) return false;
  const k = o.userData.dragKey;
  if (o.userData.artId || !isStructureKey(k) || k === selKey) return beginDrag(x, y);
  return false;
}
canvasArea.addEventListener("mousedown", e => { if (e.target === canvas && pressAt(e.clientX, e.clientY)) e.stopPropagation(); }, true);
canvasArea.addEventListener('touchstart', e => { if (e.touches.length === 1 && e.target === canvas && pressAt(e.touches[0].clientX, e.touches[0].clientY)) e.stopPropagation(); }, { capture: true, passive: true });
window.addEventListener('mousemove', e => {
  if (dragging) moveDrag(e.clientX, e.clientY);
  else if (e.target === canvas && !isDrag) canvas.style.cursor = pickFurniture(e.clientX, e.clientY) ? 'grab' : '';
});
window.addEventListener('touchmove', e => { if (dragging && e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
const endDrag = () => { dragging = null; canvas.style.cursor = ''; };
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);
canvas.addEventListener('dblclick', e => {
  const obj = pickFurniture(e.clientX, e.clientY); if (!obj) return;
  if (obj.userData.artId) { const a = artItems.find(i => i.id === obj.userData.artId); a.rot += 45; poseArt(a); renderArtList(); return; }
  obj.rotation.y += Math.PI / 4;
  const k = obj.userData.dragKey, d = S.drags[k] || { x: 0, z: 0, r: 0 };
  S.drags[k] = { ...d, r: d.r + Math.PI / 4 };
  markDirty();
});

// Booth size chosen before upload
function onKnownSize() {
  const v = document.getElementById('known-size').value;
  document.getElementById('known-custom').hidden = v !== 'custom';
  let dims = null;
  if (v === 'custom') dims = [num(document.getElementById('known-w').value), num(document.getElementById('known-d').value)];
  else if (v !== "auto") dims = v.split("x").map(Number).reverse();
  S.knownSize = dims && dims[0] > 0 && dims[1] > 0 ? { w: Math.min(dims[0], 100), d: Math.min(dims[1], 100) } : null;
  if (S.knownSize) {
    S.size = 'custom'; S.custom = S.knownSize;
    document.querySelectorAll("[data-g=size]").forEach(b => b.classList.remove("active"));
    rebuildBooth();
  }
}
function knownSizeText() {
  return S.knownSize ? `\nKNOWN FACT: the booth's true footprint is exactly ${S.knownSize.w} ft wide (x) by ${S.knownSize.d} ft deep (z). Use it as the master scale and set footprint to exactly this; every element must fit it.\n` : '';
}
function enforceSize(data) {
  const k = S.knownSize, f = data.footprint; if (!k) return;
  const sx = k.w / Math.max(num(f?.widthFt, k.w), .1), sz = k.d / Math.max(num(f?.depthFt, k.d), .1), sm = (sx + sz) / 2;
  const fix = a => { if (Array.isArray(a)) { a[0] = num(a[0]) * sx; a[2] = num(a[2]) * sz; } };
  data.objects.forEach(o => { fix(o.pos); fix(o.size); fix(o.repeat?.step); if (o.radiusFt) o.radiusFt *= sm; });
  (data.lights || []).forEach(l => { fix(l.pos); fix(l.target); fix(l.repeat?.step); });
  data.footprint = { widthFt: k.w, depthFt: k.d };
}
function onLightAdj() {
  S.lightAdj.bright = +document.getElementById('adj-bright').value / 100;
  S.lightAdj.warm = +document.getElementById('adj-warm').value / 100;
  rebuildBooth();
}
function onFloorColor(v) { S.lightAdj.floorColor = v; rebuildBooth(); }

// Uploaded logos, icons and artwork placed on booth surfaces
const artItems = [];
let artSeq = 0, artSelected = null, artUploadKind = 'artwork';
const ART_WIDTH_FT = { logo: 4, icon: 1, artwork: 6 };

function pickArtFile(kind) {
  artUploadKind = kind;
  document.getElementById('art-input').click();
}
function onArtFiles(e) {
  [...e.target.files].forEach(file => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const a = { id: ++artSeq, kind: artUploadKind, name: file.name, url, img, widthFt: ART_WIDTH_FT[artUploadKind], rot: 0, aspect: (img.naturalHeight || 1) / (img.naturalWidth || 1), mesh: null };
      if (!placeOnPanel(a)) placeAtViewCenter(a);
      artItems.push(a);
      artSelected = a.id;
      addArtMesh(a);
      renderArtList();
      markDirty();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
  e.target.value = '';
}
function surfaceHit() {
  const hit = dragRay.intersectObjects(boothG.children, true).find(h => {
    for (let o = h.object; o; o = o.parent) if (o.userData.artId) return false;
    return !!h.face;
  });
  if (hit) return { p: hit.point.clone(), n: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) };
  const p = dragRay.ray.intersectPlane(floorPlane, new THREE.Vector3());
  return p ? { p, n: new THREE.Vector3(0, 1, 0) } : null;
}
function placeAtViewCenter(a) {
  const r = canvas.getBoundingClientRect();
  aimRay(r.left + r.width / 2, r.top + r.height / 2);
  const s = surfaceHit() || { p: new THREE.Vector3(0, 1.5, 0), n: new THREE.Vector3(0, 0, 1) };
  a.pos = s.p; a.normal = s.n;
}
function poseArt(a) {
  const m = a.mesh; if (!m) return;
  const w = a.widthFt * FT;
  m.scale.set(w, w * a.aspect, 1);
  m.position.copy(a.pos).addScaledVector(a.normal, .008);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.normal);
  m.rotateZ(a.rot * Math.PI / 180);
  markDirty();
}
function addArtMesh(a) {
  const t = new THREE.Texture(a.img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .02, roughness: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  a.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  a.mesh.userData.artId = a.id;
  a.mesh.receiveShadow = true;
  boothG.add(a.mesh);
  poseArt(a);
}
function buildArt() { artItems.forEach(addArtMesh); }
function removeArt(a) {
  if (a.mesh) { dispose(a.mesh); boothG.remove(a.mesh); }
  artItems.splice(artItems.indexOf(a), 1);
  URL.revokeObjectURL(a.url);
  if (artSelected === a.id) artSelected = null;
  renderArtList();
  markDirty();
}
function selectArt(id) {
  artSelected = id;
  renderArtList();
}
function renderArtList() {
  const wrap = document.getElementById('art-list'); wrap.textContent = '';
  artItems.forEach(a => {
    const row = document.createElement('div');
    row.style.cssText = `display:grid;gap:6px;padding:8px;border-radius:var(--r);background:var(--panel);border:1.5px solid ${a.id === artSelected ? 'var(--accent)' : 'var(--border)'}`;
    row.onclick = () => { if (artSelected !== a.id) selectArt(a.id); };
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';
    const th = document.createElement('img'); th.src = a.url; th.alt = ''; th.style.cssText = 'width:30px;height:30px;object-fit:contain;flex-shrink:0';
    const nm = document.createElement('div'); nm.textContent = a.name; nm.style.cssText = 'flex:1;min-width:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const rm = document.createElement('button'); rm.className = 'btn btn-sm'; rm.textContent = 'Remove'; rm.onclick = ev => { ev.stopPropagation(); removeArt(a); };
    head.append(th, nm, rm);
    const slider = (label, min, max, step, val, fmt, set) => {
      const box = document.createElement('div'); box.className = 'rng'; box.style.margin = '0';
      const lb = document.createElement('div'); lb.className = 'rng-lbl'; lb.textContent = label;
      const v = document.createElement('val'); v.textContent = fmt(val); lb.append(v);
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.setAttribute('aria-label', label + ' of ' + a.name);
      inp.oninput = () => { set(+inp.value); v.textContent = fmt(+inp.value); poseArt(a); };
      box.append(lb, inp); return box;
    };
    row.append(head,
      slider('Width', .25, 40, .25, a.widthFt, x => x + ' ft', x => { a.widthFt = x; }),
      slider('Rotation', -180, 180, 5, a.rot, x => x + '°', x => { a.rot = x; }));
    wrap.append(row);
  });
  document.getElementById('art-empty').hidden = artItems.length > 0;
}

// Booth element editor: select, move, scale, recolor, cut openings, delete
const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText = function (...a) { if (!S.noText) nativeFillText.apply(this, a); };

let selKey = null, selObj = null, selArt = null, addSeq = 0, press = null, lastHit = null, pendingPanel = null;
const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffc400);
selBox.visible = false; scene.add(selBox);
const editOf = k => S.edits[k] || (S.edits[k] = {});
const isStructureKey = k => /^(p|a):/.test(k);

function setNoText(on) { S.noText = on; rebuildBooth(); }

function addStructure(kind) {
  const { w, d } = getSZ(), wf = w / FT, df = d / FT;
  const kinds = {
    wall: { name: 'Wall panel', shape: 'box', pos: [0, 4, 0], size: [8, 8, .35], color: '#e8e8e8', material: 'paint' },
    overhang: { name: 'Overhang', shape: 'box', pos: [0, 9.25, df / 4], size: [Math.min(wf, 12), .5, 6], color: '#e8e8e8', material: 'paint' },
    portal: { name: 'Entry portal', shape: 'box', pos: [0, 5, df / 2 - 1], size: [9, 10, 1], color: '#e8e8e8', material: 'paint', openings: [{ u: 0, w: 5, h: 8 }] },
    arch: { name: 'Arched entry', shape: 'arch', pos: [0, 5, df / 2 - 1], size: [9, 10, 1], thicknessFt: 1.2, color: '#e8e8e8', material: 'paint' },
    column: { name: 'Column', shape: 'cylinder', pos: [wf / 4, 5, df / 4], size: [1.5, 10, 1.5], color: '#e8e8e8', material: 'paint' },
  };
  const { openings, ...o } = kinds[kind], id = ++addSeq;
  S.added.push({ id, ...o });
  if (openings) editOf('a:' + id).openings = openings;
  selKey = 'a:' + id;
  rebuildBooth();
}

function openingGeometry(W, H, T, axisX, ops) {
  const s = new THREE.Shape(), bottom = -H / 2;
  s.moveTo(-W / 2, bottom);
  [...ops].sort((a, b) => a.u - b.u).forEach(o => {
    const ow = Math.min(num(o.w, 4) * FT, W - .1), oh = Math.min(num(o.h, 7.5) * FT, H - .08);
    const u = Math.max(-W / 2 + ow / 2 + .04, Math.min(W / 2 - ow / 2 - .04, num(o.u) * FT));
    s.lineTo(u - ow / 2, bottom); s.lineTo(u - ow / 2, bottom + oh); s.lineTo(u + ow / 2, bottom + oh); s.lineTo(u + ow / 2, bottom);
  });
  s.lineTo(W / 2, bottom); s.lineTo(W / 2, H / 2); s.lineTo(-W / 2, H / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + .5, p.getY(i) / H + .5);
  if (axisX) g.rotateY(Math.PI / 2);
  return g;
}
function thinAxis(obj) {
  if (!obj?.isMesh) return null;
  const s = obj.userData.size;
  if (s.y <= s.x && s.y <= s.z) return null;
  const thin = s.x < s.z ? 'x' : 'z', long = thin === 'x' ? s.z : s.x;
  return s[thin] <= long * .4 ? thin : null;
}

function poseObj(obj) {
  const k = obj.userData.dragKey, e = S.edits[k] || {}, b = obj.userData.base, d = S.drags[k] || { x: 0, z: 0, r: 0 };
  const sx = num(e.sx, 1), sy = num(e.sy, 1), sz = num(e.sz, 1);
  obj.position.set(b.x + d.x, b.y + num(e.dy) + (sy - 1) * obj.userData.size.y / 2, b.z + d.z);
  obj.rotation.y = b.r + d.r;
  if (e.openings?.length && thinAxis(obj)) obj.scale.set(1, 1, 1); else obj.scale.set(sx, sy, sz);
  markDirty();
}
function paintObj(obj, hex) {
  obj.traverse(n => {
    if (!n.isMesh) return;
    n.material = Array.isArray(n.material)
      ? n.material.map(m => { const c = m.clone(); c.color.set(hex); c.map = null; return c; })
      : (() => { const c = n.material.clone(); c.color.set(hex); c.map = null; c.needsUpdate = true; return c; })();
  });
  markDirty();
}

function finalizeElements() {
  buildPlacedItems();
  (S.added || []).forEach(o => {
    const [w, h, d] = vec3(o.size, 1).map(v => v * FT);
    const m = new THREE.Mesh(objectGeometry(o, w, h, d), surfaceMat(o));
    m.position.set(...vec3(o.pos).map(v => v * FT));
    m.castShadow = m.receiveShadow = true;
    m.userData.label = o.name; m.userData.dragKey = 'a:' + o.id;
    boothG.add(m);
    m.userData.dragKey = null;
    makeDraggable(m, 'a:' + o.id);
  });
  const seen = {};
  [...boothG.children].forEach(c => {
    if (c.isLight || (!c.isMesh && !c.isGroup)) return;
    if (!c.userData.base) {
      const base = `p:${c.position.x.toFixed(2)},${c.position.y.toFixed(2)},${c.position.z.toFixed(2)}`;
      seen[base] = (seen[base] || 0) + 1;
      makeDraggable(c, base + '#' + seen[base]);
    }
    c.userData.base.y = c.position.y;
    if (c.isMesh) {
      c.geometry.computeBoundingBox();
      const sz = c.geometry.boundingBox.getSize(new THREE.Vector3());
      c.userData.size = sz;
    } else {
      const r = c.rotation.y; c.rotation.y = 0; c.updateMatrixWorld(true);
      c.userData.size = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
      c.rotation.y = r;
    }
    const sz = c.userData.size;
    c.userData.locked = c.isMesh && sz.y < .4 && c.position.y < .2 && sz.x > 2 && sz.z > 2;
    const e = S.edits[c.userData.dragKey];
    if (e?.deleted) { dispose(c); boothG.remove(c); return; }
    if (e?.openings?.length) {
      const axis = thinAxis(c);
      if (axis) {
        const sx = num(e.sx, 1), sy = num(e.sy, 1), sz2 = num(e.sz, 1);
        const W = axis === 'x' ? sz.z * sz2 : sz.x * sx, T = axis === 'x' ? sz.x * sx : sz.z * sz2;
        c.geometry.dispose();
        c.geometry = openingGeometry(W, sz.y * sy, T, axis === 'x', e.openings);
        if (Array.isArray(c.material)) c.material = c.material[4] || c.material[0];
      }
    }
    poseObj(c);
    if (e?.color) paintObj(c, e.color);
  });
  selObj = selKey ? boothG.children.find(c => c.userData.dragKey === selKey) || null : null;
  if (selKey && !selObj) selKey = null;
  syncSelection();
}

function syncSelection() {
  if (selObj) { selBox.setFromObject(selObj); selBox.visible = true; } else selBox.visible = false;
  renderInspector();
  markDirty();
}
function selectObj(obj) { selObj = obj; selKey = obj ? obj.userData.dragKey : null; selArt = null; syncSelection(); }
function clickAt(cx, cy) {
  const obj = pickFurniture(cx, cy);
  lastHit = obj ? surfaceHit() : null;
  if (obj?.userData.artId) {
    selObj = null; selKey = null;
    selArt = artItems.find(a => a.id === obj.userData.artId) || null;
    selectArt(selArt?.id ?? null);
    syncSelection();
  } else selectObj(obj);
}
function deleteSelected() {
  if (selArt) { removeArt(selArt); selArt = null; syncSelection(); return; }
  if (!selKey) return;
  editOf(selKey).deleted = true;
  [...artItems].filter(a => a.host === selKey).forEach(removeArt);
  selKey = null; selObj = null;
  rebuildBooth();
}
function clearAllElements() {
  boothG.children.forEach(c => { if (c.userData.dragKey) editOf(c.userData.dragKey).deleted = true; });
  [...artItems].forEach(removeArt);
  selKey = null; selObj = null; selArt = null;
  rebuildBooth();
}
function restoreDeleted() {
  Object.values(S.edits).forEach(e => { delete e.deleted; });
  rebuildBooth();
}
function resetSelected() {
  if (!selKey) return;
  delete S.edits[selKey]; delete S.drags[selKey];
  rebuildBooth();
}
function panelArt() { pendingPanel = selObj ? { obj: selObj, key: selKey, hit: lastHit } : null; pickArtFile('artwork'); }
function placeOnPanel(a) {
  const p = pendingPanel; pendingPanel = null;
  if (!p || !boothG.children.includes(p.obj)) return false;
  const box = new THREE.Box3().setFromObject(p.obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  let n = p.hit?.n?.clone();
  if (!n) {
    const toCam = camera.position.clone().sub(c);
    n = s.x < s.z ? new THREE.Vector3(Math.sign(toCam.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(toCam.z) || 1);
  }
  const surface = p.hit ? p.hit.p.clone() : c.clone().addScaledVector(n, n.x ? s.x / 2 : s.z / 2);
  a.pos = c.clone().addScaledVector(n, surface.clone().sub(c).dot(n));
  a.normal = n; a.host = p.key;
  const faceW = Math.abs(n.y) > .7 ? Math.max(s.x, s.z) : Math.abs(n.x) > .7 ? s.z : s.x, faceH = Math.abs(n.y) > .7 ? Math.min(s.x, s.z) : s.y;
  a.widthFt = Math.max(.25, Math.round(Math.min(faceW, faceH / a.aspect) * .9 / FT * 4) / 4);
  return true;
}

// Inspector
function field(parent, label, val, step, onChange) {
  const box = document.createElement('label'); box.style.cssText = 'display:grid;gap:2px;font-size:10px;color:var(--fg-muted);min-width:0';
  box.textContent = label;
  const i = document.createElement('input'); i.type = 'number'; i.step = step; i.value = val;
  i.style.cssText = 'width:100%;font:12px var(--font-mono);padding:4px 5px;background:var(--panel2);border:1px solid var(--border);border-radius:4px;color:var(--fg)';
  i.onchange = () => { if (Number.isFinite(+i.value)) onChange(+i.value); };
  box.append(i); parent.append(box);
  return i;
}
function fieldGrid(parent, cols) { const g = document.createElement('div'); g.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px`; parent.append(g); return g; }
function action(parent, label, fn, primary) { const b = document.createElement('button'); b.className = 'btn btn-sm' + (primary ? ' btn-primary' : ''); b.textContent = label; b.onclick = fn; parent.append(b); return b; }
const ft2 = m => +(m / FT).toFixed(2);

function renderInspector() {
  const el = document.getElementById('inspector'); el.textContent = '';
  el.hidden = !selObj && !selArt;
  const title = document.createElement('div'); title.style.cssText = 'font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.25;overflow-wrap:anywhere';
  el.append(title);
  if (selArt) {
    const a = selArt; title.textContent = a.name;
    const g = fieldGrid(el, 2);
    field(g, 'Width (ft)', a.widthFt, .25, v => { a.widthFt = Math.max(.1, v); poseArt(a); renderArtList(); });
    field(g, 'Rotation (°)', a.rot, 5, v => { a.rot = v; poseArt(a); renderArtList(); });
    action(el, 'Delete', deleteSelected);
    return;
  }
  if (!selObj) return;
  const o = selObj, k = selKey, e = editOf(k), s = o.userData.size, d = S.drags[k] || { x: 0, z: 0, r: 0 };
  title.textContent = o.userData.label || (k.startsWith('p:') ? 'Booth element' : k.replace(/^r:/, '').split(':')[0]);
  const hint = document.createElement('div'); hint.style.cssText = 'font-size:10px;color:var(--fg-muted);line-height:1.4';
  hint.textContent = o.userData.locked ? 'Floor stays in place. Resize, recolor or delete it here.' : 'Drag it in the 3D view to move it.';
  el.append(hint);
  const setDim = (axis, val) => {
    e["s" + axis] = Math.max(.02, uReadM(val) / Math.max(s[axis], .001));
    e.openings?.length ? rebuildBooth() : (poseObj(o), syncSelection());
  };
  const g = fieldGrid(el, 3);
  field(g, "Width " + uLabel(), uShowM(s.x * num(e.sx, 1)), .25, v => setDim('x', v));
  field(g, "Height " + uLabel(), uShowM(s.y * num(e.sy, 1)), .25, v => setDim('y', v));
  field(g, "Depth " + uLabel(), uShowM(s.z * num(e.sz, 1)), .25, v => setDim('z', v));
  const g2 = fieldGrid(el, 2);
  field(g2, "Raise off floor " + uLabel(), uShowM(num(e.dy)), .25, v => { e.dy = uReadM(v); poseObj(o); syncSelection(); });
  field(g2, 'Rotate °', Math.round(d.r * 180 / Math.PI), 5, v => {
    S.drags[k] = { ...d, r: v * Math.PI / 180 }; poseObj(o); syncSelection();
  });
  const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--fg-muted)';
  row.textContent = 'Color';
  const c = document.createElement('input'); c.type = 'color'; c.value = e.color || '#e8e8e8'; c.style.cssText = 'width:44px;height:24px;padding:0;border:1px solid var(--border);background:none';
  c.oninput = () => { e.color = c.value; paintObj(o, c.value); };
  row.append(c); el.append(row);
  action(el, 'Add artwork to this panel', panelArt, true);
  if (thinAxis(o)) {
    const ops = e.openings || [];
    ops.forEach((op, i) => {
      const lb = document.createElement('div'); lb.style.cssText = 'font-size:10px;font-weight:600;color:var(--fg-muted)'; lb.textContent = `Opening ${i + 1}`; el.append(lb);
      const r = fieldGrid(el, 3);
      field(r, "Wide " + uLabel(), uShowFt(op.w), .25, v => { op.w = Math.max(1, uReadFt(v)); rebuildBooth(); });
      field(r, "Tall " + uLabel(), uShowFt(op.h), .25, v => { op.h = Math.max(1, uReadFt(v)); rebuildBooth(); });
      field(r, "Offset " + uLabel(), uShowFt(op.u), .25, v => { op.u = uReadFt(v); rebuildBooth(); });
      action(el, 'Remove opening', () => { ops.splice(i, 1); rebuildBooth(); });
    });
    action(el, 'Cut walk-through opening', () => { (e.openings = ops).push({ u: 0, w: 4, h: 7.5 }); rebuildBooth(); });
  }
  const g3 = fieldGrid(el, 2);
  action(g3, 'Reset', resetSelected);
  action(g3, 'Delete', deleteSelected);
}

window.addEventListener('keydown', e => {
  if (!['Delete', 'Backspace'].includes(e.key) || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (selKey || selArt) { e.preventDefault(); deleteSelected(); }
});
window.addEventListener('mouseup', e => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) clickAt(e.clientX, e.clientY);
  press = null;
});
window.addEventListener('touchend', e => {
  const t = e.changedTouches[0];
  if (press && t && Math.hypot(t.clientX - press.x, t.clientY - press.y) < 8) clickAt(t.clientX, t.clientY);
  press = null;
});

// Licensed photo backdrop, lit from its own colors, with shadows composited on it
const defaultEnvMap = scene.environment, defaultGroundMat = ground.material;
const shadowCatcher = new THREE.ShadowMaterial({ opacity: .5 });
let bgPhoto = null, bgTex = null, bgEnv = null;

function pickBgPhoto() { document.getElementById('bg-input').click(); }
function onBgFile(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => {
    if (bgPhoto) URL.revokeObjectURL(bgPhoto.url);
    bgPhoto = { img, url, name: f.name, shift: 50, blur: 2, bright: 100 };
    setEnv('none', document.getElementById('env-none'));
    if (bgEnv) bgEnv.dispose();
    const eq = new THREE.Texture(img); eq.colorSpace = THREE.SRGBColorSpace; eq.mapping = THREE.EquirectangularReflectionMapping; eq.needsUpdate = true;
    bgEnv = pmrem.fromEquirectangular(eq).texture; eq.dispose();
    applyBg();
    document.getElementById('bg-controls').hidden = false;
    document.getElementById('bg-name').textContent = f.name;
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
function clearBg() {
  if (!bgPhoto) return;
  URL.revokeObjectURL(bgPhoto.url); bgPhoto = null;
  document.getElementById('bg-controls').hidden = true;
  applyBg();
  if (currentEnv === 'none') buildEnvironment('none');
}
function onBgAdj() {
  bgPhoto.shift = +document.getElementById('bg-shift').value;
  bgPhoto.blur = +document.getElementById('bg-blur').value;
  bgPhoto.bright = +document.getElementById('bg-bright').value;
  applyBg();
}
function applyBg() {
  if (bgTex) { bgTex.dispose(); bgTex = null; }
  if (!bgPhoto) {
    scene.environment = defaultEnvMap; ground.material = defaultGroundMat;
    markDirty(); return;
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()), W = size.x, H = size.y;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), { img } = bgPhoto;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.06, dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  x.filter = `blur(${bgPhoto.blur * W / 1200}px) brightness(${bgPhoto.bright}%)`;
  x.drawImage(img, (W - dw) / 2, (H - dh) * bgPhoto.shift / 100, dw, dh);
  bgTex = new THREE.CanvasTexture(c); bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex; scene.fog = null;
  scene.environment = bgEnv; ground.material = shadowCatcher; ground.visible = true;
  markDirty();
}

// Generic, logo-free neighbouring exhibits for the convention hall
function addHallDetail(addE) {
  const pal = ['#e8e8ea', '#2a2d33', '#d9d6cf', '#3b3f46', '#f0efeb', '#1f2933', '#c7c9cc', '#7a2e2e'];
  const seedRand = (a => () => (a = (a * 16807) % 2147483647) / 2147483647)(7);
  const mat = hex => new THREE.MeshStandardMaterial({ color: hexColor(hex), roughness: .6 });
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
    const x = i * 11, z = j * 11;
    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
    const w = 6 + seedRand() * 3, h = 2.4 + seedRand() * 2.6, ry = Math.floor(seedRand() * 4) * Math.PI / 2, m = mat(pal[Math.floor(seedRand() * pal.length)]);
    const parts = [[w, h, .2, 0, h / 2, -2.5], [.2, h * .8, 4, -w / 2, h * .4, -.5], [w * .4, 1, .7, 0, .5, 1.5], [w, .5, .25, 0, h + .9, -2.5]];
    parts.forEach(([a, b, c, px, py, pz]) => {
      const s = Math.sin(ry), cs = Math.cos(ry);
      addE(new THREE.BoxGeometry(a, b, c), m, x + px * cs + pz * s, py, z - px * s + pz * cs, 0, ry);
    });
  }
  const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.42) });
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) addE(new THREE.BoxGeometry(5, .05, .9), panel, i * 10, 13.4, j * 10);
  const ceil = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 1, side: THREE.DoubleSide });
  addE(new THREE.PlaneGeometry(120, 120), ceil, 0, 14, 0, Math.PI / 2, 0);
}

// High-resolution export
let exporting = false;
function setExportMsg(t) { document.getElementById('export-msg').textContent = t; }
async function exportRender() {
  if (exporting) return;
  const downloads = window.claude ? await window.claude.use('downloads') : null;
  if (!downloads) { setExportMsg('Saving is unavailable in this view. Open the page on claude.ai.'); return; }
  const longSide = +document.getElementById('export-size').value, samples = +document.getElementById('export-q').value;
  const area = document.getElementById('canvas-area'), ar = area.clientWidth / Math.max(area.clientHeight, 1);
  const W = ar >= 1 ? longSide : Math.round(longSide * ar), H = ar >= 1 ? Math.round(longSide / ar) : longSide;
  exporting = true;
  const helper = selBox.visible, btn = document.getElementById('export-btn'), pr = renderer.getPixelRatio();
  btn.disabled = true; selBox.visible = false;
  try {
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    if (bgPhoto) applyBg();
    resetHQ(); hqTarget = samples;
    while (hqN < samples) {
      stepHQ();
      setExportMsg(`Rendering ${hqN}/${samples}…`);
      await new Promise(r => setTimeout(r));
    }
    const blob = await new Promise(r => hqCanvas.toBlob(r, 'image/png'));
    lastRenderBlob = blob;
    setExportMsg('Waiting for you to confirm the save…');
    await downloads.save({ filename: `booth-render-${W}x${H}.png`, data: blob });
    setExportMsg(`Saved ${W} × ${H} PNG.`);
  } catch (e) {
    setExportMsg(e?.code === 'declined' ? 'Save cancelled.' : 'The image could not be saved. Try a smaller size.');
  } finally {
    renderer.setPixelRatio(pr); hqTarget = HQ_SAMPLES; selBox.visible = helper;
    hqSum = null; exporting = false; btn.disabled = false;
    resize();
    if (bgPhoto) applyBg();
    camUpdate(); markDirty();
  }
}

// Walking attendees: real 3D figures in the aisles, so perspective follows the camera
const crowd = new THREE.Group(); scene.add(crowd);
let walkers = [], crowdOn = false, crowdWalk = true, crowdCount = 44, crowdHalf = 0, crowdClock = performance.now();
const crowdGeo = {
  leg: new THREE.CylinderGeometry(.075, .055, .84, 8), arm: new THREE.CylinderGeometry(.05, .04, .62, 8),
  torso: new THREE.CylinderGeometry(.19, .15, .62, 10), hips: new THREE.CylinderGeometry(.15, .16, .16, 10),
  head: new THREE.SphereGeometry(.105, 14, 12), hair: new THREE.SphereGeometry(.112, 14, 8, 0, 6.3, 0, 1.7),
  shoe: new THREE.BoxGeometry(.1, .07, .26), badge: new THREE.BoxGeometry(.08, .11, .01),
  shadow: new THREE.CircleGeometry(.38, 20), neck: new THREE.CylinderGeometry(.045, .05, .1, 8),
};
const crowdMats = {};
const crowdMat = hex => crowdMats[hex] || (crowdMats[hex] = new THREE.MeshStandardMaterial({ color: hexColor(hex), roughness: .78 }));
const crowdShadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .32, depthWrite: false });
const pickOf = (a, r) => a[Math.floor(r() * a.length) % a.length];

function makePerson(r) {
  const tops = ['#1f2a44', '#ffffff', '#3a3d42', '#7a1f2b', '#2f5d50', '#c9c4b8', '#101216', '#4b6d9c'];
  const pants = ['#16181d', '#2c3550', '#4a4238', '#34363b', '#6b6658'];
  const skins = ['#f0c8a8', '#d9a57f', '#a8704a', '#70472e', '#e6b892'];
  const hairs = ['#16110d', '#3b2a1c', '#7a5a35', '#8c8c8c', '#b08a55'];
  const skin = crowdMat(pickOf(skins, r)), top = crowdMat(pickOf(tops, r)), pant = crowdMat(pickOf(pants, r)), shoe = crowdMat('#141414');
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const limb = (x, y, geo, mat, len, extra) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p);
    add(geo, mat, 0, -len / 2, 0, p);
    extra(p); return p;
  };
  const legL = limb(-.085, .88, crowdGeo.leg, pant, .84, p => add(crowdGeo.shoe, shoe, 0, -.85, .05, p));
  const legR = limb(.085, .88, crowdGeo.leg, pant, .84, p => add(crowdGeo.shoe, shoe, 0, -.85, .05, p));
  add(crowdGeo.hips, pant, 0, .92, 0);
  add(crowdGeo.torso, top, 0, 1.28, 0).scale.z = .72;
  const armL = limb(-.235, 1.54, crowdGeo.arm, top, .62, p => add(crowdGeo.head, skin, 0, -.64, 0, p).scale.setScalar(.42));
  const armR = limb(.235, 1.54, crowdGeo.arm, top, .62, p => add(crowdGeo.head, skin, 0, -.64, 0, p).scale.setScalar(.42));
  add(crowdGeo.neck, skin, 0, 1.63, 0);
  add(crowdGeo.head, skin, 0, 1.76, 0);
  add(crowdGeo.hair, crowdMat(pickOf(hairs, r)), 0, 1.78, -.012);
  add(crowdGeo.badge, crowdMat('#f4f4f4'), 0, 1.24, .14);
  const sh = add(crowdGeo.shadow, crowdShadow, 0, .015, 0); sh.rotation.x = -Math.PI / 2;
  g.scale.setScalar(.92 + r() * .14);
  g.traverse(m => { if (m.isMesh && m !== sh) m.castShadow = true; });
  return { g, legL, legR, armL, armR };
}

function buildCrowd() {
  crowd.clear(); walkers = [];
  crowd.visible = crowdOn;
  if (!crowdOn) { markDirty(); return; }
  const { w, d } = getSZ(), hx = w / 2, hz = d / 2;
  crowdHalf = Math.max(hx, hz);
  let seed = 41; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Booth-side aisles reverse before reaching neighbours; main aisles run the length of the hall
  const lanes = [
    { axis: 'x', line: hz + 1.6, min: -16, max: 16, spread: .6, weight: 1 }, { axis: 'z', line: hx + 1.6, min: -16, max: 16, spread: .6, weight: 3 },
    { axis: 'z', line: -hx - 1.6, min: -16, max: 16, spread: .6, weight: 3 },
  ];
  [-27.5, -16.5, 16.5, 27.5].forEach(v => {
    lanes.push({ axis: 'x', line: v, min: -50, max: 50, spread: 1.4, weight: 2 });
    lanes.push({ axis: 'z', line: v, min: -50, max: 50, spread: 1.4, weight: 2 });
  });
  const bag = lanes.flatMap(l => Array(l.weight).fill(l));
  for (let i = 0; i < crowdCount; i++) {
    const lane = bag[i % bag.length], p = makePersonPlus(r);
    const standing = r() < .16;
    walkers.push({ ...p, lane, off: (r() - .5) * 2 * lane.spread, pos: lane.min + r() * (lane.max - lane.min), dir: r() < .5 ? 1 : -1, speed: standing ? 0 : .9 + r() * .6, phase: r() * 6.28 });
    crowd.add(p.g);
  }
  poseCrowd(0);
  markDirty();
}

function poseCrowd(dt) {
  walkers.forEach(a => {
    if (a.speed) {
      a.pos += a.dir * a.speed * dt; a.phase += a.speed * dt * 5.2;
      if (a.pos > a.lane.max || a.pos < a.lane.min) { a.dir *= -1; a.pos = Math.max(a.lane.min, Math.min(a.lane.max, a.pos)); }
    }
    const x = a.lane.axis === 'x';
    a.g.position.set(x ? a.pos : a.lane.line + a.off, a.speed ? Math.abs(Math.sin(a.phase)) * .025 : 0, x ? a.lane.line + a.off : a.pos);
    a.g.rotation.y = x ? (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.dir > 0 ? 0 : Math.PI);
    const swing = a.speed ? Math.sin(a.phase) * .46 : 0;
    a.legL.rotation.x = swing; a.legR.rotation.x = -swing;
    a.armL.rotation.x = -swing * .75; a.armR.rotation.x = swing * .75;
  });
}
function onCrowdCount(v) { crowdCount = +v; document.getElementById('crowd-count-v').textContent = v; buildCrowd(); }
function onCrowdWalk(on) { crowdWalk = on; crowdClock = performance.now(); markDirty(); }
function syncCrowdControls() {
  document.getElementById('crowd-controls').hidden = !crowdOn;
}
function crowdLiveFrame() {
  if (!crowdOn || !crowdWalk || !walkers.length) return false;
  const now = performance.now();
  poseCrowd(Math.min((now - crowdClock) / 1000, .1)); crowdClock = now;
  if (hqCanvas.style.visibility !== 'hidden' || hqN) resetHQ();
  hqStatus.textContent = 'Live · people walking';
  renderer.render(scene, camera);
  return true;
}

// Custom fonts: every canvas font on the booth swaps its family for the chosen upload
const fontList = [];
let fontSeq = 0, activeFont = null;
const fontSetter = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
  get() { return fontSetter.get.call(this); },
  set(v) { fontSetter.set.call(this, activeFont ? String(v).replace(/(\d+(?:\.\d+)?px)\s+.*$/, `$1 "${activeFont}", sans-serif`) : v); },
  configurable: true,
});

async function onFontFiles(e) {
  const msg = document.getElementById('font-msg');
  for (const file of [...e.target.files]) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { msg.textContent = `${file.name} is not a TTF or OTF font.`; continue; }
    try {
      const family = 'BoothFont' + (++fontSeq);
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      fontList.push({ family, name: file.name.replace(/\.(ttf|otf|woff2?)$/i, '') });
      activeFont = family;
      msg.textContent = `Using ${file.name}.`;
    } catch { msg.textContent = `${file.name} could not be read as a font.`; }
  }
  e.target.value = '';
  renderFontPicker();
  rebuildBooth();
}
function setActiveFont(v) { activeFont = v || null; rebuildBooth(); }
function renderFontPicker() {
  const sel = document.getElementById('font-pick');
  sel.textContent = '';
  [['', 'Default (Arial)'], ...fontList.map(f => [f.family, f.name])].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o);
  });
  sel.value = activeFont || '';
  sel.hidden = !fontList.length;
}

// 3D model export: GLB inside a zip, since saves accept .zip but not .glb
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  files.forEach(({ name, data }) => {
    const nm = enc.encode(name), crc = crc32(data), loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, nm.length, true);
    parts.push(loc, nm, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, nm.length, true);
    cen.setUint32(42, offset, true);
    central.push(cen, nm);
    offset += 30 + nm.length + data.length;
  });
  const cenSize = central.reduce((s, p) => s + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
function buildGlb() {
  return new Promise((resolve, reject) => {
    const helper = selBox.visible; selBox.visible = false;
    try {
      new THREE.GLTFExporter().parse(boothG, glb => { selBox.visible = helper; resolve(new Uint8Array(glb)); }, err => { selBox.visible = helper; reject(err); }, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    } catch (e) { selBox.visible = helper; reject(e); }
  });
}
async function exportModel() {
  const msg = document.getElementById('model-msg'), btn = document.getElementById('model-btn');
  const downloads = window.claude ? await window.claude.use('downloads') : null;
  if (!downloads) { msg.textContent = 'Saving is unavailable in this view. Open the page on claude.ai.'; return; }
  btn.disabled = true; msg.textContent = 'Building the 3D model…';
  try {
    const glb = await buildGlb();
    const readme = new TextEncoder().encode(`AI Booth Design 3D model\n\nbooth.glb is a binary glTF 2.0 file in meters, Y up, with materials and textures embedded.\nIt opens in Blender (File > Import > glTF 2.0), SketchUp, 3ds Max, Cinema 4D, Unreal, Unity and most AI 3D tools.\nLights are included as KHR_lights_punctual; the show floor, crowd and background are not part of the model.\n`);
    const zip = zipStore([{ name: 'booth.glb', data: glb }, { name: 'README.txt', data: readme }]);
    msg.textContent = 'Waiting for you to confirm the save…';
    await downloads.save({ filename: 'booth-3d-model.zip', data: zip });
    msg.textContent = `Saved booth-3d-model.zip (${(zip.size / 1048576).toFixed(1)} MB).`;
  } catch (e) {
    msg.textContent = e?.code === 'declined' ? 'Save cancelled.' : 'The model could not be exported.';
  } finally { btn.disabled = false; }
}

// AI variation prompts: Claude reads the render and writes prompts for outside image and video tools
let promptCtl = null, lastRenderBlob = null;
function sceneBrief() {
  const { lbl } = getSZ(), parts = new Set();
  boothG.children.forEach(c => { const l = c.userData.label; if (l) parts.add(l); });
  return [
    `Booth: ${lbl}${S.recon ? ', rebuilt from a photo' : ''}.`,
    `Company name shown: ${S.noText ? '(all text removed)' : S.brand.company}. Tagline: ${S.noText ? '-' : S.brand.tagline}.`,
    `Brand colors: primary ${S.brand.primary}, secondary ${S.brand.secondary}, background ${S.brand.bg}.`,
    parts.size ? `Named parts: ${[...parts].slice(0, 40).join(', ')}.` : '',
    `Environment: ${currentEnv}${bgPhoto ? ' with a hall photo backdrop' : ''}.`,
  ].filter(Boolean).join('\n');
}
async function currentViewBlob() {
  if (lastRenderBlob) return lastRenderBlob;
  const helper = selBox.visible; selBox.visible = false;
  renderer.render(scene, camera);
  const src = hqCanvas.style.visibility === 'visible' ? hqCanvas : canvas;
  const b = await new Promise(r => src.toBlob(r, 'image/jpeg', .92));
  selBox.visible = helper;
  return b;
}
async function writePrompts() {
  const out = document.getElementById('vp-out'), status = document.getElementById('vp-status');
  const sample = window.claude ? await window.claude.use('sample') : null;
  if (!sample) { status.textContent = 'Prompt writing needs the page opened on claude.ai, signed in.'; return; }
  const tool = document.getElementById('vp-tool').value, count = +document.getElementById('vp-count').value, dir = document.getElementById('vp-dir').value.trim().slice(0, 2000);
  const isVideo = /video/.test(tool);
  const prompt = `The image is a 3D render of a trade show booth design. Write ${count} prompts for ${tool} that produce ultra photorealistic ${isVideo ? 'video clips' : 'photographs'} of THIS booth as if built and photographed at a real convention center.
Keep the booth's exact layout, structures, proportions, colors, materials and wording. Vary only photography: camera angle and lens, time of show (setup, busy show hours, evening reception), attendee crowd, lighting mood. Describe real materials (tension fabric, brushed aluminum, LED edge lighting, carpet pile), real camera settings, and natural imperfections so it does not look CG.
${isVideo ? 'Each prompt describes one 5-10 second shot with a specific camera move (slow dolly, orbit, walk-through) and what moves in frame.' : 'Each prompt describes one still with aspect ratio and lens.'}
${tool.includes('Midjourney') ? 'Use Midjourney style: comma-separated descriptors, end with --ar 16:9 --style raw --v 7.' : ''}
Facts about the design:\n${sceneBrief()}
${dir ? 'Art direction from the user: ' + dir : ''}
Reply with only JSON: {"prompts":[{"title":string,"prompt":string}],"negative":string (things to avoid, for tools that accept a negative prompt),"tips":string (one or two sentences on attaching the render as an image reference in ${tool})}`;
  promptCtl = new AbortController();
  document.getElementById('vp-run').disabled = true; document.getElementById('vp-stop').hidden = false;
  status.textContent = 'Claude is looking at the render…'; out.textContent = '';
  try {
    const data = await sample.json(prompt, { images: [await currentViewBlob()], signal: promptCtl.signal, cache: false });
    const list = Array.isArray(data?.prompts) ? data.prompts : [];
    if (!list.length) throw { code: 'invalid_json' };
    [...list.map(p => [String(p.title || 'Prompt'), String(p.prompt || '')]), ...(data.negative ? [['Avoid (negative prompt)', String(data.negative)]] : [])]
      .forEach(([t, p]) => out.append(promptCard(t, p)));
    status.textContent = data.tips ? String(data.tips) : 'Copy a prompt into your generator, and attach the render as the image reference.';
  } catch (e) {
    status.textContent = { cancelled: 'Stopped.', not_granted: 'Claude access was declined for this page.', rate_limited: 'Usage limit reached. Try again later.', invalid_json: 'The answer came back incomplete. Try again.' }[e?.code] || 'Could not write prompts. Try again.';
  } finally {
    document.getElementById('vp-run').disabled = false; document.getElementById('vp-stop').hidden = true;
  }
}
function promptCard(title, text) {
  const card = document.createElement('div'); card.style.cssText = 'display:grid;gap:5px;padding:8px;background:var(--panel);border:1px solid var(--border);border-radius:var(--r)';
  const head = document.createElement('div'); head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px';
  const h = document.createElement('div'); h.style.cssText = 'font-size:11px;font-weight:600;min-width:0;overflow-wrap:anywhere'; h.textContent = title;
  const ta = document.createElement('textarea'); ta.readOnly = true; ta.value = text; ta.rows = 5;
  ta.style.cssText = 'width:100%;resize:vertical;font:11px/1.45 var(--font-mono);padding:6px;background:var(--panel2);color:var(--fg);border:1px solid var(--border);border-radius:4px';
  const b = document.createElement('button'); b.className = 'btn btn-sm'; b.textContent = 'Copy';
  b.onclick = () => {
    navigator.clipboard.writeText(text).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); })
      .catch(() => { ta.focus(); ta.select(); b.textContent = 'Press ⌘C'; });
  };
  const ff = document.createElement("a"); ff.className = "btn btn-sm btn-primary"; ff.textContent = "Open in Firefly";
  ff.href = "https://firefly.adobe.com/"; ff.target = "_blank"; ff.rel = "noopener noreferrer";
  ff.title = "Copies this prompt and opens Adobe Firefly in a new tab";
  ff.style.cssText = "text-decoration:none;color:#fff;display:inline-flex;align-items:center";
  ff.onclick = () => {
    navigator.clipboard.writeText(text).then(() => { ff.textContent = "Copied, paste in Firefly"; setTimeout(() => { ff.textContent = "Open in Firefly"; }, 3000); }).catch(() => { ta.focus(); ta.select(); });
  };
  const btns = document.createElement("div"); btns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end";
  btns.append(b); if (!/^Avoid/.test(title)) btns.append(ff);
  head.append(h, btns); card.append(head, ta);
  return card;
}

// ═══ Booth setup: type, size, units, construction system ═══
const BOOTH_TYPES = { inline: 'Inline', corner: 'Corner', peninsula: 'Peninsula', island: 'Island' };
const isM = () => S.units === 'm';
function fmtFt(ft) {
  if (isM()) return (ft * FT).toFixed(2) + ' m';
  const whole = Math.floor(ft + 1e-6), inch = Math.round((ft - whole) * 12);
  return inch === 12 ? `${whole + 1}′` : inch ? `${whole}′ ${inch}″` : `${whole}′`;
}
function fmtDims(D, W) { return isM() ? `${(D * FT).toFixed(1)} × ${(W * FT).toFixed(1)} m` : `${D} × ${W} ft`; }
const uLabel = () => (isM() ? 'm' : 'ft');
const uShowM = m => +(isM() ? m : m / FT).toFixed(2);
const uReadM = v => (isM() ? v : v * FT);
const uShowFt = ft => +(isM() ? ft * FT : ft).toFixed(2);
const uReadFt = v => (isM() ? v / FT : v);

function getSZ() {
  const fp = S.recon && S.recon.footprint;
  if (fp) { const W = num(fp.widthFt, 10), D = num(fp.depthFt, 10); return { w: W * FT, d: D * FT, lbl: fmtDims(D, W), type: 'From photo' }; }
  let D, W;
  if (S.size === 'custom' && S.custom) { W = S.custom.w; D = S.custom.d; } else [D, W] = S.size.split('x').map(Number);
  return { w: W * FT, d: D * FT, lbl: fmtDims(D, W), type: BOOTH_TYPES[S.boothType] || 'Inline' };
}
function pickIn(group, btn) {
  document.querySelectorAll(`[data-g="${group}"]`).forEach(b => b.classList.toggle('active', b === btn));
}
function setSize(s, btn) {
  S.size = s; pickIn('size', btn);
  document.getElementById('cs-row').hidden = s !== 'custom';
  if (s === 'custom') onCustomSize(); else { fitPlacedToBooth(); rebuildBooth(); }
}
function onCustomSize() {
  const D = num(document.getElementById('cs-d').value), W = num(document.getElementById('cs-w').value);
  if (D > 0 && W > 0) { S.custom = { w: Math.min(W, 100), d: Math.min(D, 100) }; S.size = 'custom'; rebuildBooth(); }
}
function setBoothType(t, btn) {
  S.boothType = t; pickIn('type', btn);
  if (t === 'inline' || t === 'corner') {
    S.els.sidewalls = true; document.getElementById('el-sidewalls').checked = true;
    if (S.sideH < 1) { S.sideH = Math.min(4, S.wallH); document.getElementById('sideH').value = S.sideH; document.getElementById('sideH-v').textContent = fmtFt(S.sideH); }
  }
  syncCornerSide();
  rebuildBooth();
}
function setCornerSide(side, btn) { S.cornerSide = side; pickIn('cside', btn); rebuildBooth(); }
function syncCornerSide() {
  const ico = document.querySelector(`[data-g=type][onclick*="'corner'"] .opt-ico`); if (ico) ico.style.transform = S.cornerSide === "right" ? "scaleX(-1)" : "";
  document.getElementById('corner-side').hidden = S.boothType !== 'corner';
  pickIn('cside', document.querySelector(`[data-g=cside][onclick*="'${S.cornerSide}'"]`));
}
function setSystem(s, btn) { S.system = s; pickIn('sys', btn); rebuildBooth(); }
function setWallOpt(k, v) { S[k] = v; rebuildBooth(); }
function setUnits(u, btn) {
  S.units = u; pickIn('unit', btn);
  document.getElementById('wallH-v').textContent = fmtFt(S.wallH);
  document.getElementById('sideH-v').textContent = fmtFt(S.sideH);
  updateInfo(); renderInspector(); markDirty();
}
function onWallH(v) { S.wallH = +v; document.getElementById('wallH-v').textContent = fmtFt(+v); rebuildBooth(); }
function onSideH(v) { S.sideH = +v; document.getElementById('sideH-v').textContent = fmtFt(+v); rebuildBooth(); }
function sideWallXs(w, wT) {
  if (S.boothType === 'inline') return [-w / 2 + wT / 2, w / 2 - wT / 2];
  if (S.boothType === 'corner') return S.cornerSide === 'right' ? [w / 2 - wT / 2] : [-w / 2 + wT / 2];
  return [];
}

function holeTexture(len) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#2b2e33'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#0d0e10'; x.beginPath(); x.arc(16, 16, 6, 0, 6.3); x.fill();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, len / .062);
  return t;
}
function buildSystem(E, w, d, fy, wallH, sH, wT, bwW, bwZ) {
  const runs = [], sys = S.system;
  if (E.backwall && S.boothType !== 'island') runs.push({ x0: -bwW / 2, z0: bwZ, x1: bwW / 2, z1: bwZ, h: wallH, nx: 0, nz: 1 });
  const sides = E.sidewalls && sH > 0 ? sideWallXs(w, wT) : [];
  sides.forEach(x => runs.push({ x0: x, z0: -d / 2, x1: x, z1: d / 2, h: sH, nx: x < 0 ? 1 : -1, nz: 0 }));
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; boothG.add(m); return m; };
  const post = { uprights80: [.08, '#c9ccd2', .3, .9], holes: [.062, '#2b2e33', .5, .3], slim: [.04, '#e4e5e8', .35, .7] }[sys];
  runs.forEach(r => {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), along = r.nz ? 0 : Math.PI / 2;
    const face = (t, out) => [r.x0 + (r.x1 - r.x0) * t + r.nx * out, r.z0 + (r.z1 - r.z0) * t + r.nz * out];
    if (post) {
      const [p, col, rough, metal] = post, n = Math.max(1, Math.round(len / .99));
      const m = sys === 'holes' ? new THREE.MeshStandardMaterial({ map: holeTexture(r.h), roughness: rough, metalness: metal }) : mkMat(col, rough, metal);
      for (let i = 0; i <= n; i++) { const [x, z] = face(i / n, -(wT / 2 + p / 2 - .005)); add(new THREE.BoxGeometry(p, r.h, p), m, x, fy + r.h / 2, z); }
      const [cx, cz] = face(.5, -(wT / 2 + p / 2 - .005)), rail = mkMat(col, rough, metal);
      [p / 2, r.h - p / 2].forEach(y => add(new THREE.BoxGeometry(len, p, p), rail, cx, fy + y, cz, along));
    } else if (S.cladding === 'panels') {
      const n = Math.max(1, Math.round(len / .99)), seam = mkMat('#0b0c0e', .9, 0);
      for (let i = 1; i < n; i++) { const [x, z] = face(i / n, wT / 2 + .002); add(new THREE.BoxGeometry(.006, r.h, .004), seam, x, fy + r.h / 2, z, along); }
    }
    if (sys === 'timber') {
      const wood = new THREE.MeshStandardMaterial({ color: hexColor('#a8774a'), roughness: .55, normalMap: detailMaps('wood') });
      const [cx, cz] = face(.5, 0);
      add(new THREE.BoxGeometry(len + .02, .035, wT + .03), wood, cx, fy + r.h + .017, cz, along);
      [0, 1].forEach(t => { const [x, z] = face(t, 0); add(new THREE.BoxGeometry(wT + .03, r.h, wT + .03), wood, x, fy + r.h / 2, z); });
    }
  });
  const { r, g, b } = hex2rgb(S.brand.bg);
  const sideCol = sys === 'slim' ? new THREE.Color(.93, .93, .93) : new THREE.Color(r * .65, g * .65, b * .65);
  if (S.corner === 'rounded' && runs.length && runs[0].nz) {
    const R = .35;
    sides.forEach(x => {
      const s = x < 0 ? 1 : -1, geo = objectGeometry({ shape: 'curvedWall', radiusFt: R / FT, arcDeg: 90, thicknessFt: wT / FT }, 1, sH, 1);
      add(geo, new THREE.MeshStandardMaterial({ color: sideCol, roughness: .85 }), x + s * (wT / 2 + R), fy + sH / 2, bwZ + wT / 2 + R, s > 0 ? -Math.PI * .75 : Math.PI * .75);
    });
  }
  if (S.endCap !== 'none') sides.forEach(x => {
    const left = x < 0;
    if (S.endCap !== 'both' && (S.endCap === 'left') !== left) return;
    const len = Math.min(.9, w / 3), s = left ? 1 : -1;
    add(new THREE.BoxGeometry(len, sH, wT), new THREE.MeshStandardMaterial({ color: sideCol, roughness: .85 }), x + s * (len / 2), fy + sH / 2, d / 2 - wT / 2);
  });
  if (S.ceiling === 'grid' && sys !== 'canopy') {
    const al = mkMat('#c9ccd2', .35, .85), y = fy + wallH + .03;
    for (let i = 0, n = Math.max(1, Math.round(w / 1)); i <= n; i++) add(new THREE.BoxGeometry(.05, .05, d), al, -w / 2 + w * i / n, y, 0);
    for (let i = 0, n = Math.max(1, Math.round(d / 1)); i <= n; i++) add(new THREE.BoxGeometry(w, .05, .05), al, 0, y, -d / 2 + d * i / n);
  } else if (S.ceiling === 'fabric' && sys !== 'canopy') {
    const c = add(new THREE.BoxGeometry(w, .03, d), new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: .9, emissive: 0xffffff, emissiveIntensity: .18 }), 0, fy + wallH, 0);
    c.castShadow = false;
  }
  if (sys === 'canopy') {
    const leg = mkMat('#b8bcc4', .4, .8), cloth = new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: .9, side: THREE.DoubleSide }), H = wallH + .1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => add(new THREE.CylinderGeometry(.025, .025, H, 12), leg, a * (w / 2 - .03), fy + H / 2, c * (d / 2 - .03)));
    const roofGeo = new THREE.ConeGeometry(1, 1.5, 4, 1, true); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(w / Math.SQRT2, 1, d / Math.SQRT2);
    add(roofGeo, cloth, 0, fy + H + .75, 0);
    const val = mkMat(S.brand.primary, .85, 0);
    [[w, .05, 0, d / 2], [w, .05, 0, -d / 2], [.05, d, w / 2, 0], [.05, d, -w / 2, 0]].forEach(([a, c, x, z]) => add(new THREE.BoxGeometry(a, .25, c), val, x, fy + H - .125, z));
  }
  if (S.boothType === 'island' && E.header) {
    const rad = Math.min(w, d) * .3, y = fy + Math.max(wallH + 1.5, 4.2);
    const t = headerTex(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    add(new THREE.CylinderGeometry(rad, rad, .9, 64, 1, true), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: .6, emissive: hexColor(S.brand.primary), emissiveIntensity: .12 }), 0, y, 0);
    const cable = mkMat('#888888', .4, .8);
    [0, 1, 2, 3].forEach(i => { const a = i * Math.PI / 2 + .4; add(new THREE.CylinderGeometry(.004, .004, 1.2, 4), cable, Math.cos(a) * rad, y + .45 + .6, Math.sin(a) * rad).userData.rigging = true; });
  }
}

// ═══ Views, pan ═══
function setView(v, btn) {
  document.querySelectorAll('.view-controls .vbtn').forEach(b => b.classList.toggle('active', b === btn));
  const { w, d } = getSZ(), span = Math.max(w, d);
  camera.fov = 45; oTarget.set(0, 1.2, 0);
  const sideR = span * 1.4 + 6;
  if (v === 'front') { oTh = 0; oPh = 1.35; oR = sideR; }
  else if (v === 'back') { oTh = Math.PI; oPh = 1.35; oR = sideR; }
  else if (v === 'left') { oTh = -Math.PI / 2; oPh = 1.35; oR = sideR; }
  else if (v === 'right') { oTh = Math.PI / 2; oPh = 1.35; oR = sideR; }
  else if (v === 'top') { camera.fov = 20; oTarget.set(0, 0, 0); oTh = 0; oPh = .01; oR = span * .75 / Math.tan(10 * Math.PI / 180) + 2; }
  else if (v === 'eye') { camera.fov = 58; oTarget.set(0, 1.6, 0); oTh = 0; oPh = Math.PI / 2; oR = d / 2 + 3.2; }
  else { oTh = Math.PI / 4; oPh = 1.0; oR = span * 1.45 + 5; }
  camera.updateProjectionMatrix(); camUpdate();
}
let panning = null, spaceHeld = false;
window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) { spaceHeld = true; e.preventDefault(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('mousedown', e => {
  if (e.target !== canvas || !(e.button === 2 || e.shiftKey || spaceHeld)) return;
  panning = { x: e.clientX, y: e.clientY }; e.stopPropagation(); canvas.style.cursor = 'move';
}, true);
window.addEventListener('mousemove', e => {
  if (!panning) return;
  const k = oR * Math.tan(camera.fov * Math.PI / 360) * 2 / canvas.clientHeight;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  oTarget.addScaledVector(right, -(e.clientX - panning.x) * k).addScaledVector(up, (e.clientY - panning.y) * k);
  panning = { x: e.clientX, y: e.clientY }; camUpdate();
});
window.addEventListener('mouseup', () => { if (panning) { panning = null; canvas.style.cursor = ''; } });

// ═══ Dimension labels and measuring ═══
let measureMode = false, measureA = null;
function toggleDims(btn) { S.showDims = !S.showDims; btn.classList.toggle('active', S.showDims); }
function toggleMeasure(btn) {
  measureMode = !measureMode; measureA = null; btn.classList.toggle('active', measureMode);
  document.getElementById('measure-hint').hidden = !measureMode;
  canvas.style.cursor = measureMode ? 'crosshair' : '';
}
function clearMeasures() { S.measures = []; measureA = null; }
function addMeasurePoint(x, y) {
  aimRay(x, y);
  const s = surfaceHit(); if (!s) return;
  if (!measureA) measureA = s.p.clone();
  else { S.measures.push({ a: measureA, b: s.p.clone() }); measureA = null; }
}
function pressAt(x, y) {
  if (measureMode) { addMeasurePoint(x, y); press = null; return true; }
  press = { x, y };
  const o = pickFurniture(x, y); if (!o || o.userData.locked) return false;
  const k = o.userData.dragKey;
  if (o.userData.artId || !isStructureKey(k) || k === selKey) return beginDrag(x, y);
  return false;
}
const dimSvg = document.getElementById('dim-svg');
function svgEl(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function toggleElDims(btn) { S.showElDims = !S.showElDims; btn.classList.toggle("active", S.showElDims); }
function drawElementSizes(proj, W) {
  const short = ft => { if (isM()) return (ft * FT).toFixed(2); const w = Math.floor(ft + 1e-6), i = Math.round((ft - w) * 12); return i === 12 ? `${w + 1}′` : !w ? `${i}″` : i ? `${w}′${i}″` : `${w}′`; };
  boothG.children.forEach(c => {
    const s = c.userData.size; if (!c.userData.dragKey || !s || c.userData.label === "Back wall edge post") return;
    const dx = s.x * c.scale.x, dz = s.z * c.scale.z, dy = s.y * c.scale.y;
    if (Math.max(dx, dy, dz) < .12) return;
    const box = new THREE.Box3().setFromObject(c), ctr = box.getCenter(new THREE.Vector3());
    const p = proj(new THREE.Vector3(ctr.x, box.max.y, ctr.z)); if (!p) return;
    const txt = `${short(dx / FT)} × ${short(dz / FT)} × ${short(dy / FT)}${isM() ? " m" : ""}`;
    const wPx = txt.length * 6.6 + 14, x = Math.max(4, Math.min(W - wPx - 4, p[0] - wPx / 2)), y = p[1] + 4;
    dimSvg.append(svgEl("rect", { x, y, width: wPx, height: 20, rx: 10, fill: "rgba(17,24,39,.82)" }));
    const t = svgEl("text", { x: x + wPx / 2, y: y + 10.5, fill: "#ffffff", "font-size": 11, "font-family": "DM Mono, monospace", "text-anchor": "middle", "dominant-baseline": "middle" });
    t.textContent = txt; dimSvg.append(t);
  });
}
function drawOverlay() {
  dimSvg.textContent = '';
  const selTarget = selObj ? selObj : (selArt && selArt.mesh) || null;
  if (!S.showDims && !S.showElDims && !S.measures.length && !measureA && !selTarget) return;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const proj = v => { const p = v.clone().project(camera); return p.z < 1 ? [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] : null; };
  const line = (a, b, label, color) => {
    const pa = proj(a), pb = proj(b); if (!pa || !pb) return;
    dimSvg.append(svgEl('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }));
    [pa, pb].forEach(p => dimSvg.append(svgEl('circle', { cx: p[0], cy: p[1], r: 3, fill: color })));
    const t = svgEl('text', { x: (pa[0] + pb[0]) / 2, y: (pa[1] + pb[1]) / 2 - 6, fill: '#ffffff', stroke: '#000000', 'stroke-width': 3, 'paint-order': 'stroke', 'font-size': 12, 'font-family': 'DM Mono, monospace', 'text-anchor': 'middle' });
    t.textContent = label; dimSvg.append(t);
  };
  if (S.showDims) {
    const { w, d } = getSZ(), o = .35;
    let top = 0;
    boothG.traverse(n => { if (n.isMesh && !n.userData.rigging && n.visible) { const b = new THREE.Box3().setFromObject(n); if (b.max.y > top && b.max.y < 30) top = b.max.y; } });
    line(new THREE.Vector3(-w / 2, .02, d / 2 + o), new THREE.Vector3(w / 2, .02, d / 2 + o), 'W ' + fmtFt(w / FT), '#ffc400');
    line(new THREE.Vector3(w / 2 + o, .02, -d / 2), new THREE.Vector3(w / 2 + o, .02, d / 2), 'D ' + fmtFt(d / FT), '#ffc400');
    if (top > .1) line(new THREE.Vector3(-w / 2 - o, 0, -d / 2), new THREE.Vector3(-w / 2 - o, top, -d / 2), 'H ' + fmtFt(top / FT), '#ffc400');
  }
  S.measures.forEach(m => line(m.a, m.b, fmtFt(m.a.distanceTo(m.b) / FT), '#3dd6ff'));
  if (measureA) { const p = proj(measureA); if (p) dimSvg.append(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: '#3dd6ff' })); }
  if (S.showElDims) drawElementSizes(proj, W);
  if (selTarget) {
    const box = new THREE.Box3().setFromObject(selTarget), c = box.getCenter(new THREE.Vector3());
    const p = proj(new THREE.Vector3(c.x, box.max.y + .12, c.z));
    if (p) {
      const name = selArt ? selArt.name : titleCase(selTarget.userData.label || "Booth element");
      const fs = 15, padX = 12, wPx = Math.min(W - 16, name.length * fs * .58 + padX * 2), hPx = 30;
      const x = Math.max(8, Math.min(W - wPx - 8, p[0] - wPx / 2)), y = Math.max(8, p[1] - hPx - 10);
      dimSvg.append(svgEl("rect", { x, y, width: wPx, height: hPx, rx: 15, fill: "#2563eb" }));
      dimSvg.append(svgEl("path", { d: `M${p[0] - 6} ${y + hPx} L${p[0]} ${y + hPx + 7} L${p[0] + 6} ${y + hPx} Z`, fill: "#2563eb" }));
      const t = svgEl("text", { x: x + wPx / 2, y: y + hPx / 2 + 1, fill: "#ffffff", "font-size": fs, "font-weight": 700, "font-family": "DM Sans, system-ui, sans-serif", "text-anchor": "middle", "dominant-baseline": "middle" });
      t.textContent = name; dimSvg.append(t);
    }
  }
}

function togglePanel() {
  const hide = document.body.classList.toggle("panel-hidden");
  document.getElementById("panel-btn").textContent = hide ? "Show panel" : "Panel";
  resize(); markDirty();
}
async function toggleFullscreen() {
  const b = document.getElementById("fs-btn");
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { b.textContent = "Full screen unavailable here"; setTimeout(() => { b.textContent = "Full screen"; }, 2500); }
}
document.addEventListener("fullscreenchange", () => {
  document.getElementById("fs-btn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  setTimeout(resize, 50);
});

// ═══ Power and theme ═══
function togglePower(btn) { S.power = !S.power; btn.classList.toggle('active', !S.power); btn.textContent = S.power ? 'Power on' : 'Power off'; rebuildBooth(); }
function applyPower() {
  if (S.power) return;
  boothG.traverse(n => {
    if (n.isLight) n.intensity = 0;
    if (n.isMesh) [].concat(n.material).forEach(m => { if (m.emissive) m.emissiveIntensity = 0; });
  });
}
const THEMES = ['system', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('theme-btn'); if (b) b.textContent = { system: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' }[t];
}
function cycleTheme() {
  let cur = 'system'; try { cur = localStorage.getItem('bs-theme') || 'system'; } catch {}
  const next = THEMES[(THEMES.indexOf(cur) + 1) % 3];
  try { localStorage.setItem('bs-theme', next); } catch {}
  applyTheme(next);
}
try { applyTheme(localStorage.getItem('bs-theme') || 'system'); } catch { applyTheme('system'); }

// Startup scene: a furnished 20 × 20 peninsula booth on a busy show floor, seen from the aisle
function heroCamera() {
  camera.fov = 40; camera.updateProjectionMatrix();
  oTarget.set(.2, 1.5, .2); oTh = .55; oPh = 1.4; oR = 10.5; camUpdate();
}
function loadStartupScene() {
  const set = (id, v) => { const e = document.getElementById(id); if (e) { if (e.type === 'checkbox') e.checked = v; else e.value = v; } };
  Object.assign(S.brand, { company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.', primary: '#0f5c7a', secondary: '#f2a541', accent: '#ffffff', bg: '#0b1f2a', graphicStyle: 'gradient', lightStyle: 'warm', lightInt: .85 });
  [['company-name', S.brand.company], ['tagline', S.brand.tagline], ['graphic-style', 'gradient'], ['light-style', 'warm'], ['light-int', 85], ['floor-mat', 'laminate']]
    .forEach(([k, v]) => set(k, v));
  ['primary', 'secondary', 'accent', 'bg'].forEach(k => { set('col-' + k, S.brand[k]); set('hex-' + k, S.brand[k]); });
  document.getElementById('light-int-v').textContent = '85%';
  S.wallH = 10; S.sideH = 4; set('wallH', 10); set('sideH', 4);
  document.getElementById('wallH-v').textContent = fmtFt(10); document.getElementById('sideH-v').textContent = fmtFt(4);
  S.size = '20x20'; S.boothType = 'peninsula'; S.system = 'seg'; S.corner = 'rounded';
  pickIn('size', document.querySelector('[data-g=size][onclick*="20x20"]'));
  pickIn('type', document.querySelector('[data-g=type][onclick*="peninsula"]'));
  const cornerSel = document.querySelector('select[onchange*="\'corner\'"]'); if (cornerSel) cornerSel.value = 'rounded';
  ['lounge', 'table-round', 'chair-padded', 'plant', 'uplight', 'pendant', 'brochure', 'kiosk'].forEach(f => {
    S.furn.add(f); document.getElementById('fb-' + f)?.classList.add('active');
  });
  crowdCount = 28; crowdWalk = false;
  const walk = document.querySelector('[onchange="onCrowdWalk(this.checked)"]'); if (walk) walk.checked = false;
  const cnt = document.querySelector('[oninput="onCrowdCount(this.value)"]'); if (cnt) cnt.value = 28;
  document.getElementById('crowd-count-v').textContent = '28';
  rebuildBooth();
  setEnv('showfloor', document.getElementById('env-showfloor'));
  heroCamera();
}
function resetCamera() { heroCamera(); }

// ═══ Realism pass: people, furniture, plants, neighbouring exhibits ═══
const lathe = (pts, segs = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
const fabricMat = hex => new THREE.MeshStandardMaterial({ color: hexColor(hex), roughness: .92, normalMap: detailMaps('fabric'), normalScale: new THREE.Vector2(.5, .5) });
const muted = (hex, k = .35) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#3a3f45'), k).getHexString();
const rbox = (w, h, d, r, plan = true) => boxGeometry({ cornerRadiusFt: r / FT, roundPlan: plan }, w, h, d);
function finishGroup(g, x, z, ry = 0) {
  g.position.set(x, 0, z); g.rotation.y = ry;
  g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  boothG.add(g); return g;
}
function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; }

// Real 3D models (CC0, from Poly Haven, in /models) that replace a built-in shape once loaded.
// The built-in shape shows meanwhile, and stays if the model can't be loaded.
const MODEL_CACHE = new Map();
function loadModel(url) {
  if (!MODEL_CACHE.has(url)) MODEL_CACHE.set(url, new Promise((res, rej) => new THREE.GLTFLoader().load(url, gl => res(gl.scene), undefined, rej)));
  return MODEL_CACHE.get(url);
}
function swapInModel(g, url, height) {
  if (!THREE.GLTFLoader) return g;
  loadModel(url).then(src => {
    const m = src.clone(true);
    m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), k = height / size.y;
    m.scale.setScalar(k);
    m.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k, -(box.min.z + size.z / 2) * k);
    [...g.children].forEach(c => g.remove(c)); g.add(m);
    markDirty();
  }).catch(err => console.warn('model not loaded, keeping built-in shape', url, err));
  return g;
}

// People
const pGeo = {
  torso: lathe([[.001, 0], [.15, .02], [.16, .12], [.15, .24], [.18, .4], [.2, .5], [.17, .57], [.07, .62], [.001, .63]], 24),
  pelvis: new THREE.SphereGeometry(.165, 20, 14), thigh: new THREE.CylinderGeometry(.078, .058, .45, 14), shin: new THREE.CylinderGeometry(.056, .042, .43, 14),
  knee: new THREE.SphereGeometry(.058, 12, 10), upper: new THREE.CylinderGeometry(.052, .044, .3, 12), fore: new THREE.CylinderGeometry(.043, .034, .27, 12),
  joint: new THREE.SphereGeometry(.046, 12, 10), hand: new THREE.SphereGeometry(.045, 12, 10), shoe: new THREE.SphereGeometry(.06, 16, 10),
  neck: new THREE.CylinderGeometry(.045, .052, .11, 12), head: new THREE.SphereGeometry(.104, 28, 22), nose: new THREE.SphereGeometry(.018, 8, 6),
  ear: new THREE.SphereGeometry(.022, 8, 6), hairCap: new THREE.SphereGeometry(.112, 28, 14, 0, Math.PI * 2, 0, 1.75), hairLong: rbox(.2, .3, .08, .04, false),
  bun: new THREE.SphereGeometry(.05, 12, 10), skirt: lathe([[.17, .5], [.2, .3], [.26, 0]], 24), lapel: new THREE.BoxGeometry(.07, .3, .01),
  badge: new THREE.BoxGeometry(.07, .1, .006), lanyard: new THREE.BoxGeometry(.008, .18, .004), bag: rbox(.32, .26, .1, .03, false), shadow: new THREE.CircleGeometry(.34, 24),
};
function makePerson(r) {
  const tops = ['#1f2a44', '#f2f2f0', '#3a3d42', '#6e1f2b', '#2f5d50', '#c9c4b8', '#15171b', '#4b6d9c', '#8a7a64'];
  const bottoms = ['#16181d', '#2c3550', '#4a4238', '#34363b', '#6b6658', '#1f2a44'];
  const skins = ['#f1cbb0', '#dcab86', '#b07a52', '#7a4e33', '#e9bc98', '#5c3b28'];
  const hairs = ['#16110d', '#3b2a1c', '#6e5032', '#8c8c8c', '#b08a55', '#2a1d14'];
  const skin = crowdMat(pickOf(skins, r)), top = fabricMat(pickOf(tops, r)), low = fabricMat(pickOf(bottoms, r));
  const shoeM = new THREE.MeshStandardMaterial({ color: hexColor(pickOf(['#141414', '#3b2a1c', '#e8e6e0'], r)), roughness: .45 });
  const hairM = new THREE.MeshStandardMaterial({ color: hexColor(pickOf(hairs, r)), roughness: .7 });
  const skirt = r() < .28, longHair = r() < .4, blazer = r() < .45, bag = r() < .25;
  const g = new THREE.Group(), add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
  const leg = s => {
    const hip = new THREE.Group(); hip.position.set(s * .09, .92, 0); g.add(hip);
    add(pGeo.thigh, low, 0, -.225, 0, hip);
    const knee = new THREE.Group(); knee.position.y = -.45; hip.add(knee);
    add(pGeo.knee, low, 0, 0, 0, knee);
    add(pGeo.shin, skirt ? skin : low, 0, -.215, 0, knee);
    add(pGeo.shoe, shoeM, 0, -.44, .045, knee).scale.set(1, .62, 2.1);
    return [hip, knee];
  };
  const arm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .205, 1.49, 0); g.add(sh);
    add(pGeo.joint, top, 0, 0, 0, sh).scale.setScalar(1.2);
    add(pGeo.upper, top, 0, -.15, 0, sh);
    const el = new THREE.Group(); el.position.y = -.3; sh.add(el);
    add(pGeo.joint, top, 0, 0, 0, el);
    add(pGeo.fore, blazer || r() < .6 ? top : skin, 0, -.135, 0, el);
    add(pGeo.hand, skin, 0, -.3, .005, el).scale.set(.75, 1.25, .5);
    sh.rotation.z = s * .06;
    return [sh, el];
  };
  const [legL, kneeL] = leg(-1), [legR, kneeR] = leg(1);
  add(pGeo.pelvis, low, 0, .95, 0).scale.set(1, .5, .72);
  if (skirt) add(pGeo.skirt, low, 0, .5, 0);
  add(pGeo.torso, top, 0, .93, 0).scale.z = .68;
  if (blazer) { add(pGeo.lapel, crowdMat('#efeeea'), 0, 1.36, .118).rotation.x = -.12; }
  add(pGeo.lanyard, crowdMat(pickOf(['#0f5c7a', '#b3261e', '#202124'], r)), 0, 1.36, .13);
  add(pGeo.badge, crowdMat('#f7f7f5'), 0, 1.24, .13);
  const [armL, elbowL] = arm(-1), [armR, elbowR] = arm(1);
  add(pGeo.neck, skin, 0, 1.6, 0);
  const head = add(pGeo.head, skin, 0, 1.75, .005); head.scale.set(.88, 1.12, .98);
  add(pGeo.nose, skin, 0, 1.735, .1).scale.set(.8, 1.2, 1);
  [-1, 1].forEach(s => add(pGeo.ear, skin, s * .094, 1.745, 0).scale.set(.5, 1, .8));
  add(pGeo.hairCap, hairM, 0, 1.775, -.01).scale.set(.92, 1.08, 1);
  if (longHair) add(pGeo.hairLong, hairM, 0, 1.63, -.075);
  else if (r() < .25) add(pGeo.bun, hairM, 0, 1.86, -.08);
  if (bag) { const b = add(pGeo.bag, crowdMat(pickOf(['#2b2b2b', '#8a6b4a', '#c9c4b8'], r)), .23, 1.0, .02); b.rotation.y = Math.PI / 2; }
  const sh = add(pGeo.shadow, crowdShadow, 0, .015, 0); sh.rotation.x = -Math.PI / 2;
  g.scale.setScalar(.9 + r() * .16);
  g.traverse(m => { if (m.isMesh && m !== sh) m.castShadow = true; });
  const phone = r() < .3;
  return { g, legL, legR, armL, armR, kneeL, kneeR, elbowL, elbowR, phone };
}
function poseCrowd(dt) {
  walkers.forEach(a => {
    if (a.speed) {
      a.pos += a.dir * a.speed * dt; a.phase += a.speed * dt * 5.4;
      if (a.pos > a.lane.max || a.pos < a.lane.min) { a.dir *= -1; a.pos = Math.max(a.lane.min, Math.min(a.lane.max, a.pos)); }
    }
    const x = a.lane.axis === 'x', p = a.phase, walk = a.speed ? 1 : 0;
    a.g.position.set(x ? a.pos : a.lane.line + a.off, walk * Math.abs(Math.cos(p)) * .022, x ? a.lane.line + a.off : a.pos);
    a.g.rotation.y = x ? (a.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.dir > 0 ? 0 : Math.PI);
    a.g.rotation.z = walk * Math.sin(p) * .02;
    const s = Math.sin(p) * .42 * walk;
    a.legL.rotation.x = s; a.legR.rotation.x = -s;
    a.kneeL.rotation.x = walk * Math.max(0, Math.sin(p + 1.3)) * .7 + (walk ? 0 : .04);
    a.kneeR.rotation.x = walk * Math.max(0, Math.sin(p + 1.3 + Math.PI)) * .7;
    a.armL.rotation.x = -s * .7; a.armR.rotation.x = s * .7;
    a.elbowL.rotation.x = -.18 - walk * Math.max(0, -Math.sin(p)) * .25;
    a.elbowR.rotation.x = a.phone && !walk ? -1.35 : -.18 - walk * Math.max(0, Math.sin(p)) * .25;
    if (a.phone && !walk) a.armR.rotation.x = -.35;
  });
}

// Furniture
function buildLounge(x, z, ry = 0) {
  const g = new THREE.Group(), cloth = fabricMat(muted(S.brand.primary)), legM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: .5, normalMap: detailMaps('wood') });
  part(g, rbox(1.84, .22, .86, .05), cloth, 0, .23, 0);
  [-.6, 0, .6].forEach(cx => { part(g, rbox(.58, .15, .68, .06), cloth, cx, .41, .06); part(g, rbox(.58, .44, .17, .07, false), cloth, cx, .69, -.3, -.14); });
  [-.84, .84].forEach(ax => part(g, rbox(.16, .5, .86, .06, false), cloth, ax, .4, 0));
  [-.82, .82].forEach(lx => [-.36, .36].forEach(lz => part(g, new THREE.CylinderGeometry(.022, .014, .13, 10), legM, lx, .065, lz)));
  finishGroup(g, x, z, ry);
}
function buildChairPadded(x, z, ry = 0) {
  const g = new THREE.Group(), cloth = fabricMat(muted(S.brand.primary, .2)), metal = mkMat('#202124', .35, .8);
  part(g, rbox(.48, .09, .47, .06), cloth, 0, .47, 0);
  part(g, objectGeometry({ shape: 'curvedWall', radiusFt: .38 / FT, arcDeg: 80, thicknessFt: .05 / FT }, 1, .4, 1), cloth, 0, .76, .14, -.12, Math.PI);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => part(g, new THREE.CylinderGeometry(.012, .01, .45, 8), metal, a * .19, .225, b * .19, b * .08, 0, -a * .08));
  finishGroup(g, x, z, ry);
}
function buildTableRound(x, z) {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: .22 });
  part(g, new THREE.CylinderGeometry(.45, .45, .028, 64), white, 0, .735, 0);
  part(g, lathe([[.26, 0], [.25, .02], [.12, .06], [.045, .3], [.04, .62], [.09, .72]], 48), white, 0, 0, 0);
  finishGroup(g, x, z);
}
function leafCrown(count, radius, height, cx, cy, cz, r) {
  const base = new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).quadraticCurveTo(.045, .06, 0, .15).quadraticCurveTo(-.045, .06, 0, 0), 4).toNonIndexed();
  const pos = [], nor = [], col = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = r(), v = r(), th = u * Math.PI * 2, ph = Math.acos(2 * v - 1) * .8;
    const rad = radius * (.55 + .45 * Math.cbrt(r()));
    const px = cx + Math.sin(ph) * Math.cos(th) * rad, py = cy + Math.cos(ph) * rad * height, pz = cz + Math.sin(ph) * Math.sin(th) * rad;
    e.set(-.6 - r() * .8, th + Math.PI / 2, (r() - .5) * .8); q.setFromEuler(e);
    m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(1, 1, 1).multiplyScalar(.7 + r() * .6));
    const gg = base.clone().applyMatrix4(m), p = gg.attributes.position, n = gg.attributes.normal;
    c.setHSL(.27 + r() * .06, .45 + r() * .2, .2 + r() * .14);
    for (let k = 0; k < p.count; k++) { pos.push(p.getX(k), p.getY(k), p.getZ(k)); nor.push(n.getX(k), n.getY(k), n.getZ(k)); col.push(c.r, c.g, c.b); }
    gg.dispose();
  }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, side: THREE.DoubleSide }));
}
function buildPlant(x, z) {
  let seed = Math.round((x + 9) * 97 + (z + 9) * 13) + 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new THREE.Group(), pot = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: .75, normalMap: detailMaps('stone'), normalScale: new THREE.Vector2(.3, .3) });
  part(g, lathe([[.001, 0], [.17, 0], [.2, .04], [.23, .44], [.24, .46], [.22, .46], [.2, .43], [.001, .43]], 40), pot, 0, 0, 0);
  part(g, new THREE.CylinderGeometry(.2, .2, .02, 32), mkMat('#2a1e14', .95), 0, .42, 0);
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: .9 });
  [[0, 0], [.04, .3], [-.05, -.4]].forEach(([dx, tilt]) => part(g, new THREE.CylinderGeometry(.012, .02, 1.05, 8), bark, dx, .95, 0, 0, 0, tilt * .25));
  g.add(leafCrown(520, .36, 1.15, 0, 1.55, 0, r));
  swapInModel(g, '/models/potted_plant_02/potted_plant_02.gltf', 1.85);
  finishGroup(g, x, z);
}
function kioskTex() {
  const c = document.createElement("canvas"); c.width = 320; c.height = 540; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, S.brand.primary); g.addColorStop(1, S.brand.bg); x.fillStyle = g; x.fillRect(0, 0, 320, 540);
  x.fillStyle = S.brand.secondary; x.fillRect(28, 300, 264, 54); x.fillStyle = S.brand.accent; x.textAlign = "center"; x.textBaseline = "middle";
  const name = S.brand.company || ""; let fs = 40; x.font = `700 ${fs}px Arial`; fs = Math.min(40, 40 * 270 / Math.max(1, x.measureText(name).width)); x.font = `700 ${fs}px Arial`;
  x.fillText(name, 160, 170); x.font = "600 20px Arial"; x.fillStyle = S.brand.bg; x.fillText("TAP TO EXPLORE", 160, 327);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildKiosk(x, z) {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: .35 });
  part(g, rbox(.55, .03, .4, .06), mkMat('#202124', .4, .6), 0, .015, 0);
  part(g, rbox(.14, 1.0, .1, .04, false), body, 0, .52, 0);
  part(g, rbox(.5, .82, .06, .03, false), body, 0, 1.25, .02, -.12);
  const kt = kioskTex(); const scr = new THREE.MeshStandardMaterial({ map: kt, emissive: 0xffffff, emissiveMap: kt, emissiveIntensity: .9, roughness: .15 });
  part(g, new THREE.PlaneGeometry(.44, .76), scr, 0, 1.25, .054, -.12);
  finishGroup(g, x, z);
}
function buildBrochureStand(x, z) {
  const g = new THREE.Group(), chrome = mkMat('#d7d9dd', .12, 1), acrylic = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .05, transparent: true, opacity: .25, depthWrite: false });
  part(g, new THREE.CylinderGeometry(.16, .17, .015, 32), chrome, 0, .008, 0);
  part(g, new THREE.CylinderGeometry(.012, .012, 1.35, 12), chrome, 0, .68, -.04);
  [.45, .78, 1.11].forEach((y, i) => {
    part(g, new THREE.BoxGeometry(.24, .2, .03), acrylic, 0, y, .02, .25);
    part(g, new THREE.BoxGeometry(.2, .26, .006), mkMat([S.brand.primary, S.brand.secondary, '#f2f1ee'][i], .7), 0, y + .05, .015, .25);
  });
  finishGroup(g, x, z);
}
function buildPendant(x, y, z) {
  const g = new THREE.Group(), brass = mkMat('#b58a4c', .3, .9);
  part(g, new THREE.CylinderGeometry(.003, .003, .45, 4), mkMat('#111111', .5), 0, y - .225, 0);
  const shade = part(g, lathe([[.02, .3], [.05, .27], [.1, .14], [.17, .02], [.18, 0]], 40), brass, 0, y - .75, 0);
  shade.material.side = THREE.DoubleSide;
  part(g, new THREE.SphereGeometry(.045, 16, 12), mkMat('#fff6e0', .3, 0, '#ffe8b0', 3), 0, y - .71, 0);
  const l = new THREE.PointLight(0xffe2b0, .55, 4.5, 2); l.position.set(0, y - .8, 0); g.add(l);
  finishGroup(g, x, z);
}
function buildUplight(x, z, color) {
  const g = new THREE.Group(), can = mkMat('#18191b', .45, .6);
  part(g, new THREE.CylinderGeometry(.06, .07, .16, 24), can, 0, .08, 0);
  part(g, new THREE.CylinderGeometry(.052, .052, .005, 24), mkMat(color, .3, 0, color, 2.5), 0, .163, 0);
  const s = new THREE.SpotLight(hexColor(color), 1.1, 6, .45, .6, 1.5);
  s.position.set(0, .18, 0); s.target.position.set(0, 3, -.6); g.add(s); g.add(s.target);
  finishGroup(g, x, z);
}

// Neighbouring exhibits: graphics, lit headers, counters, screens, carpet, hanging signs
function exhibitGraphic(hueA, hueB, k) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 512, 256);
  gr.addColorStop(0, `hsl(${hueA},45%,${18 + k * 4}%)`); gr.addColorStop(1, `hsl(${hueB},55%,${34 + k * 3}%)`);
  x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
  x.globalAlpha = .1; x.fillStyle = "#ffffff";
  x.beginPath(); x.moveTo(260 + k * 20, 0); x.lineTo(512, 0); x.lineTo(512, 256); x.lineTo(180 + k * 20, 256); x.fill();
  x.globalAlpha = .8; x.fillRect(48, 40, 160, 14); x.fillRect(48, 62, 100, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function addHallDetail(addE) {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  const graphics = [[200, 190], [15, 35], [210, 260], [150, 110], [0, 330], [45, 20], [190, 170], [260, 300]].map(([a, b], k) => new THREE.MeshStandardMaterial({ map: exhibitGraphic(a, b, k), roughness: .85 }));
  const carpets = ['#2a2d33', '#3b3f46', '#5a2a2a', '#22324a', '#3a3a30', '#d5d2cb'].map(c => new THREE.MeshStandardMaterial({ color: hexColor(c), roughness: .97 }));
  const white = new THREE.MeshStandardMaterial({ color: 0xeeedea, roughness: .5 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: .5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.4 });
  const screen = new THREE.MeshStandardMaterial({ map: exhibitGraphic(205, 230, 2), emissive: 0xffffff, emissiveMap: exhibitGraphic(205, 230, 2), emissiveIntensity: .7, roughness: .2 });
  const place = (geo, mat, sx, sy, sz, x, y, z, ry) => { const m = addE(geo, mat, x, y, z, 0, ry); m.scale.set(sx, sy, sz); return m; };
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
    const cx = i * 11, cz = j * 11;
    if (Math.abs(cx) < 12 && Math.abs(cz) < 12) continue;
    const w = 6 + r() * 3, dep = 4.5 + r() * 2, h = 2.4 + r() * 1.8, ry = Math.floor(r() * 4) * Math.PI / 2, s = Math.sin(ry), c = Math.cos(ry);
    const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const gm = graphics[Math.floor(r() * graphics.length)];
    let [x, z] = at(0, 0); place(box, carpets[Math.floor(r() * carpets.length)], w, .02, dep, x, .01, z, ry);
    [x, z] = at(0, -dep / 2 + .05); place(box, gm, w, h, .1, x, h / 2, z, ry);
    [x, z] = at(0, -dep / 2 + .12); place(box, glow, w * .96, .05, .04, x, h - .1, z, ry);
    if (r() < .7) { [x, z] = at(-w / 2 + .05, -dep * .1); place(box, white, .1, h * .6, dep * .8, x, h * .3, z, ry); }
    [x, z] = at((r() - .5) * w * .4, dep * .15); place(box, r() < .5 ? white : dark, 1.4 + r(), 1, .6, x, .5, z, ry);
    [x, z] = at(w * .25, -dep / 2 + .13); if (r() < .6) place(box, screen, 1.3, .75, .02, x, 1.6, z, ry);
    if (r() < .2) { const rad = 1.4 + r(); const m = addE(cyl, gm, cx, h + 2.2, cz, 0, 0); m.scale.set(rad, .9, rad); m.material.side = THREE.DoubleSide; }
  }
  const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.42) });
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) addE(new THREE.BoxGeometry(5, .05, .9), panel, i * 10, 13.4, j * 10);
  const ceil = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 1, side: THREE.DoubleSide });
  addE(new THREE.PlaneGeometry(120, 120), ceil, 0, 14, 0, Math.PI / 2, 0);
}

// ═══ Realism pass 2: bloom, bounce light, beams, hall ceiling, faces ═══
const bounce = new THREE.HemisphereLight(0xdfe6f0, 0x6b5a48, .2); scene.add(bounce);

// Camera-style bloom on the refined image: bright areas bleed softly
const bloomSmall = document.createElement('canvas'), bloomCtx = bloomSmall.getContext('2d', { willReadFrequently: true });
function applyBloom() {
  const W = hqCanvas.width, H = hqCanvas.height, w = Math.max(1, W >> 2), h = Math.max(1, H >> 2);
  bloomSmall.width = w; bloomSmall.height = h;
  bloomCtx.drawImage(hqCanvas, 0, 0, w, h);
  const img = bloomCtx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114, k = Math.max(0, (l - 222) / 33);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  bloomCtx.putImageData(img, 0, 0);
  hqCtx.save();
  hqCtx.globalCompositeOperation = 'lighter';
  hqCtx.filter = `blur(${Math.round(W / 160)}px)`; hqCtx.globalAlpha = .4; hqCtx.drawImage(bloomSmall, 0, 0, W, H);
  hqCtx.filter = `blur(${Math.round(W / 50)}px)`; hqCtx.globalAlpha = .22; hqCtx.drawImage(bloomSmall, 0, 0, W, H);
  hqCtx.restore();
}

// Soft light beams under the truss spots (visual only: not selectable, not exported)
const fxG = new THREE.Group(); scene.add(fxG);
let beamAlpha = null;
function buildBeams() {
  fxG.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
  fxG.clear();
  if (!S.power) return;
  if (!beamAlpha) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#000'); g.addColorStop(.55, '#444'); g.addColorStop(1, '#fff');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128); beamAlpha = new THREE.CanvasTexture(c);
  }
  boothG.children.filter(c => c.isPointLight).forEach(l => {
    const len = Math.max(.5, l.position.y - .05);
    const m = new THREE.Mesh(new THREE.ConeGeometry(len * .42, len, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: l.color, alphaMap: beamAlpha, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(l.position.x, l.position.y - len / 2 + .05, l.position.z + .25); m.rotation.x = -.18;
    fxG.add(m);
  });
}

// Hall ceiling: roof trusses, hanging aisle signs
function aisleSignTex(label) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#16324f'; x.fillRect(0, 0, 512, 160); x.fillStyle = '#ffffff'; x.fillRect(0, 138, 512, 6);
  x.font = '700 92px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 256, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function addHallDetailPlus(addE) {
  addHallDetail(addE);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: .6, metalness: .6 });
  for (let i = -6; i <= 6; i++) {
    addE(new THREE.BoxGeometry(.35, .5, 120), steel, i * 10, 13.1, 0);
    addE(new THREE.BoxGeometry(.25, .25, 120), steel, i * 10, 12.4, 0);
    for (let k = -12; k <= 12; k++) addE(new THREE.BoxGeometry(.08, .8, .08), steel, i * 10, 12.75, k * 5, .7, 0);
  }
  for (let j = -6; j <= 6; j++) addE(new THREE.BoxGeometry(120, .2, .2), steel, 0, 12.5, j * 10);
  const cable = new THREE.MeshBasicMaterial({ color: 0x222222 });
  [-27.5, -16.5, 16.5, 27.5].forEach((v, i) => [-38.5, 0, 38.5].forEach((u, k) => {
    const label = String((i + 1) * 100 + k * 10 + 100);
    const mat = new THREE.MeshStandardMaterial({ map: aisleSignTex(label), roughness: .7, emissive: 0xffffff, emissiveMap: aisleSignTex(label), emissiveIntensity: .25 });
    const sign = addE(new THREE.BoxGeometry(2.6, .8, .06), mat, v, 6.2, u, 0, Math.PI / 2 * (k % 2));
    sign.castShadow = false;
    [-1, 1].forEach(s => addE(new THREE.CylinderGeometry(.006, .006, 6.3, 4), cable, v + (k % 2 ? 0 : s * 1.1), 9.75, u + (k % 2 ? s * 1.1 : 0)));
  }));
}

// Faces and hair detail on attendees
const faceGeo = { eye: new THREE.SphereGeometry(.011, 10, 8), brow: new THREE.BoxGeometry(.032, .006, .008), mouth: new THREE.BoxGeometry(.034, .006, .006) };
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: .25 });
function makePersonPlus(r) {
  const p = makePerson(r);
  let hairM = null, skinM = null;
  p.g.children.forEach(m => {
    if (m.geometry === pGeo.hairCap) hairM = m.material;
    if (m.geometry === pGeo.head) skinM = m.material;
  });
  if (hairM) { hairM.normalMap = detailMaps('metal'); hairM.normalScale = new THREE.Vector2(.8, .8); hairM.roughness = .55; }
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.g.add(m); return m; };
  [-1, 1].forEach(s => {
    add(faceGeo.eye, eyeMat, s * .034, 1.768, .094);
    if (hairM) add(faceGeo.brow, hairM, s * .036, 1.79, .093).rotation.z = s * -.12;
  });
  if (skinM) add(faceGeo.mouth, new THREE.MeshStandardMaterial({ color: new THREE.Color(skinM.color).multiplyScalar(.7), roughness: .6 }), 0, 1.703, .093);
  return p;
}

// ═══ Item library: generic, logo-free items built at real size (meters, origin at floor center) ═══
const IN = .0254;
function captureBuilt(fn) {
  const n = boothG.children.length; fn();
  const g = boothG.children[n]; boothG.remove(g);
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); return g;
}
const M = {
  white: () => new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: .35 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: .45 }),
  chrome: () => mkMat('#d7d9dd', .12, 1),
  alu: () => mkMat('#c9ccd2', .35, .85),
  glass: () => new THREE.MeshStandardMaterial({ color: 0xdfeaf0, roughness: .03, transparent: true, opacity: .22, depthWrite: false, envMapIntensity: 2 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0xa8774a, roughness: .5, normalMap: detailMaps('wood'), normalScale: new THREE.Vector2(.4, .4) }),
  brand: (k = 'primary', rough = .5) => mkMat(S.brand[k], rough, 0),
  glow: (hex = '#ffffff', i = 1.6) => mkMat(hex, .3, 0, hex, i),
};
function screenMat(w = 480, h = 270) { const t = screenTex(w, h); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .85, roughness: .12 }); }
function brandPanelTex(w = 256, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, S.brand.primary); g.addColorStop(1, S.brand.bg); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = S.brand.secondary; x.fillRect(0, h * .72, w, h * .04);
  x.fillStyle = S.brand.accent; x.textAlign = 'center'; x.textBaseline = 'middle';
  const name = S.brand.company || ''; let fs = w * .14; x.font = `700 ${fs}px Arial`; fs = Math.min(fs, fs * w * .86 / Math.max(1, x.measureText(name).width)); x.font = `700 ${fs}px Arial`;
  x.fillText(name, w / 2, h * .32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const P = (g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => part(g, geo, mat, x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, s = 32) => new THREE.CylinderGeometry(rt, rb, h, s);
function cables(g, y, pts) { const m = mkMat('#777777', .4, .8); pts.forEach(([x, z]) => P(g, cyl(.003, .003, 1.4, 4), m, x, y + .7, z)); }

const CATALOG = [
  // Furniture
  { id: 'sofa', cat: 'Furniture', name: '3-seat lounge sofa', tags: 'couch seating', build: () => captureBuilt(() => buildLounge(0, 0, 0)) },
  { id: 'armchair', cat: 'Furniture', name: 'Lounge armchair', tags: 'seating', build: () => { const g = new THREE.Group(), c = fabricMat(muted(S.brand.primary)), leg = M.dark(); [[-.33, -.3], [.33, -.3], [-.33, .3], [.33, .3]].forEach(([x, z]) => P(g, cyl(.016, .011, .16, 10), leg, x, .08, z)); P(g, rbox(.8, .16, .76, .04), c, 0, .24, 0); P(g, rbox(.6, .12, .6, .06), c, 0, .38, .05); P(g, rbox(.62, .44, .14, .06, false), c, 0, .6, -.31, -.12); [-.34, .34].forEach(x => P(g, rbox(.12, .36, .76, .05, false), c, x, .42, 0)); return g; } },
  { id: 'chair', cat: 'Furniture', name: 'Upholstered side chair', tags: 'seating', build: () => captureBuilt(() => buildChairPadded(0, 0, 0)) },
  { id: 'stool', cat: 'Furniture', name: 'Bar stool', tags: 'seating counter', build: () => { const g = new THREE.Group(), m = M.chrome(); P(g, lathe([[.001, 0], [.235, 0], [.245, .008], [.24, .02], [.2, .034], [.06, .046], [.03, .05], [.001, .05]], 64), mkMat('#26282c', .3, .7), 0, 0, 0); P(g, cyl(.025, .025, .72, 16), m, 0, .38, 0); P(g, rbox(.38, .07, .38, .17), fabricMat(muted(S.brand.primary, .2)), 0, .76, 0); P(g, new THREE.TorusGeometry(.17, .008, 8, 40), m, 0, .3, 0, Math.PI / 2); return g; } },
  { id: 'cafe-table', cat: 'Furniture', name: 'Café table, 36 in round', tags: 'table', build: () => captureBuilt(() => buildTableRound(0, 0)) },
  { id: 'cocktail', cat: 'Furniture', name: 'Cocktail table, 42 in high', tags: 'table highboy', build: () => { const g = new THREE.Group(), w = M.white(); P(g, cyl(.32, .32, .03, 48), w, 0, 1.06, 0); P(g, lathe([[.24, 0], [.23, .02], [.06, .08], [.035, .5], [.035, 1.0], [.08, 1.05]], 40), w, 0, 0, 0); return g; } },
  { id: 'conf-table', cat: 'Furniture', name: 'Meeting table, 6 seats', tags: 'table conference', build: () => { const g = new THREE.Group(), d = M.dark(); P(g, rbox(2.1, .04, .95, .15), M.wood(), 0, .74, 0); [-.72, .72].forEach(x => { P(g, rbox(.07, .66, .07, .01, false), d, x, .37, 0); P(g, rbox(.1, .03, .72, .012, false), d, x, .015, 0); P(g, rbox(.08, .03, .78, .01, false), d, x, .705, 0); }); P(g, rbox(1.38, .05, .05, .01, false), d, 0, .6, 0); return g; } },
  { id: 'coffee-table', cat: 'Furniture', name: 'Coffee table', tags: 'table low', build: () => { const g = new THREE.Group(); P(g, rbox(1.1, .05, .6, .1), M.wood(), 0, .42, 0); [[-.48, -.24], [.48, -.24], [-.48, .24], [.48, .24]].forEach(([x, z]) => P(g, cyl(.018, .014, .4, 10), M.dark(), x, .2, z)); return swapInModel(g, '/models/coffee_table_round_01/coffee_table_round_01.gltf', .42); } },
  { id: 'reception', cat: 'Furniture', name: 'Curved reception counter', tags: 'desk welcome', build: () => { const g = new THREE.Group(); P(g, objectGeometry({ shape: 'curvedWall', radiusFt: 1.4 / FT, arcDeg: 100, thicknessFt: .5 / FT }, 1, 1.0, 1), M.brand(), 0, .5, -1.0); P(g, objectGeometry({ shape: 'curvedWall', radiusFt: 1.47 / FT, arcDeg: 102, thicknessFt: .62 / FT }, 1, .04, 1), M.white(), 0, 1.02, -1.0); P(g, objectGeometry({ shape: 'curvedWall', radiusFt: 1.4 / FT, arcDeg: 98, thicknessFt: .46 / FT }, 1, .02, 1), M.glow('#fff2d8', 2.2), 0, .05, -1.0); return g; } },
  { id: 'bench', cat: 'Furniture', name: 'Upholstered bench', tags: 'seating ottoman', build: () => { const g = new THREE.Group(), f = fabricMat(muted(S.brand.secondary, .3)), d = M.dark(); [[-.68, -.17], [.68, -.17], [-.68, .17], [.68, .17]].forEach(([x, z]) => P(g, cyl(.016, .012, .3, 10), d, x, .15, z)); P(g, rbox(1.5, .05, .45, .02), d, 0, .315, 0); [-.37, .37].forEach(x => P(g, rbox(.73, .12, .43, .05), f, x, .4, 0)); return g; } },
  // Display
  { id: 'showcase', cat: 'Display', name: 'Glass showcase', tags: 'vitrine cabinet', build: () => { const g = new THREE.Group(); P(g, rbox(.9, .9, .5, .03, false), M.white(), 0, .45, 0); P(g, new THREE.BoxGeometry(.88, .7, .48), M.glass(), 0, 1.25, 0); P(g, new THREE.BoxGeometry(.9, .02, .5), M.white(), 0, 1.61, 0); P(g, new THREE.SphereGeometry(.12, 32, 24), mkMat(S.brand.secondary, .2, .6), 0, 1.02, 0); P(g, new THREE.BoxGeometry(.8, .01, .4), M.glow('#ffffff', 1.2), 0, 1.6, 0); return g; } },
  { id: 'plinth', cat: 'Display', name: 'Product plinth', tags: 'pedestal', build: () => { const g = new THREE.Group(); P(g, rbox(.6, .95, .6, .03, false), M.white(), 0, .475, 0); P(g, rbox(.32, .22, .22, .03), mkMat(S.brand.primary, .3, .4), 0, 1.06, 0, 0, .5); return g; } },
  { id: 'tiered', cat: 'Display', name: 'Tiered display, 3 levels', tags: 'podium riser', build: () => { const g = new THREE.Group(), w = M.white(); [[.6, .3], [.45, .6], [.3, .9]].forEach(([r, y]) => P(g, cyl(r, r, .3, 48), w, 0, y - .15, 0)); return g; } },
  { id: 'shelving', cat: 'Display', name: 'Shelving unit', tags: 'shelves retail', build: () => { const g = new THREE.Group(), f = M.dark(), s = M.white(); [-.58, .58].forEach(x => [-.18, .18].forEach(z => P(g, new THREE.BoxGeometry(.03, 2, .03), f, x, 1, z))); [.15, .6, 1.05, 1.5, 1.95].forEach(y => P(g, new THREE.BoxGeometry(1.2, .025, .4), s, 0, y, 0)); [.6, 1.05, 1.5].forEach((y, i) => [-.35, 0, .35].forEach((x, k) => P(g, rbox(.16, .22, .14, .02), mkMat([S.brand.primary, S.brand.secondary, '#e8e6e0'][(i + k) % 3], .4), x, y + .125, 0))); return g; } },
  { id: 'slatwall', cat: 'Display', name: 'Slatwall panel with hooks', tags: 'wall retail', build: () => { const g = new THREE.Group(); P(g, new THREE.BoxGeometry(1.2, 2.2, .04), M.white(), 0, 1.1, 0); const dk = mkMat('#cfcfcc', .5); for (let y = .3; y < 2.1; y += .15) P(g, new THREE.BoxGeometry(1.2, .012, .005), dk, 0, y, .021); [[-.35, 1.4], [0, 1.4], [.35, 1.4], [-.2, .9], [.2, .9]].forEach(([x, y]) => P(g, rbox(.14, .2, .05, .015, false), mkMat(S.brand.primary, .4), x, y, .07)); return g; } },
  { id: 'brochure', cat: 'Display', name: 'Brochure stand', tags: 'literature', build: () => captureBuilt(() => buildBrochureStand(0, 0)) },
  { id: 'banner', cat: 'Display', name: 'Roll-up banner, 33 in', tags: 'retractable popup', build: () => { const g = new THREE.Group(); P(g, rbox(.86, .08, .22, .04), M.alu(), 0, .04, 0); P(g, cyl(.01, .01, 2, 8), M.alu(), 0, 1.04, -.05); P(g, new THREE.PlaneGeometry(.84, 2), new THREE.MeshStandardMaterial({ map: brandPanelTex(), roughness: .8, side: THREE.DoubleSide }), 0, 1.08, 0); return g; } },
  // Electronics
  { id: 'tv-stand', cat: 'Electronics', name: 'TV 65 in on floor stand', tags: 'screen monitor display', build: () => { const g = new THREE.Group(); P(g, rbox(.8, .03, .55, .05), M.dark(), 0, .015, 0); P(g, rbox(.1, 1.2, .06, .02, false), M.dark(), 0, .6, -.05); P(g, rbox(1.46, .84, .04, .01, false), M.dark(), 0, 1.45, 0); P(g, new THREE.PlaneGeometry(1.42, .8), screenMat(), 0, 1.45, .021); return g; } },
  { id: 'tv-wall', cat: 'Electronics', name: 'TV 75 in, wall mount', tags: 'screen monitor', build: () => { const g = new THREE.Group(); P(g, rbox(1.68, .96, .04, .01, false), M.dark(), 0, 1.6, 0); P(g, new THREE.PlaneGeometry(1.64, .92), screenMat(), 0, 1.6, .021); return g; } },
  { id: 'videowall', cat: 'Electronics', name: 'Video wall 3×3', tags: 'led screens', build: () => { const g = new THREE.Group(); P(g, new THREE.BoxGeometry(2.1, 2.4, .1), M.dark(), 0, 1.2, -.06); const t = screenTex(960, 540); t.colorSpace = THREE.SRGBColorSpace; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const tt = t.clone(); tt.needsUpdate = true; tt.repeat.set(1 / 3, 1 / 3); tt.offset.set(i / 3, j / 3); P(g, new THREE.PlaneGeometry(.66, .38), new THREE.MeshStandardMaterial({ map: tt, emissive: 0xffffff, emissiveMap: tt, emissiveIntensity: .85 }), -0.67 + i * .67, 1.4 + (j - 1) * .385, 0); } return g; } },
  { id: 'kiosk', cat: 'Electronics', name: 'Touch kiosk', tags: 'screen interactive', build: () => captureBuilt(() => buildKiosk(0, 0)) },
  { id: 'totem', cat: 'Electronics', name: 'LED totem screen', tags: 'digital signage', build: () => { const g = new THREE.Group(); P(g, rbox(.66, 2.0, .14, .04, false), M.dark(), 0, 1.0, 0); const t = brandPanelTex(256, 768); P(g, new THREE.PlaneGeometry(.6, 1.9), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .9 }), 0, 1.0, .071); return g; } },
  { id: 'laptop-desk', cat: 'Electronics', name: 'Demo desk with laptop', tags: 'computer table', build: () => { const g = new THREE.Group(); P(g, rbox(1.2, .04, .6, .03), M.white(), 0, .75, 0); [-.55, .55].forEach(x => P(g, new THREE.BoxGeometry(.04, .73, .55), M.white(), x, .365, 0)); P(g, rbox(.34, .015, .23, .01), M.alu(), 0, .78, .05); const s = P(g, rbox(.34, .23, .008, .01, false), M.alu(), 0, .895, -.065, -.25); P(g, new THREE.PlaneGeometry(.31, .2), screenMat(310, 200), 0, .896, -.059, -.25); return g; } },
  // Lighting
  { id: 'pendant', cat: 'Lighting', name: 'Brass pendant light', tags: 'hanging lamp', build: () => { const g = captureBuilt(() => buildPendant(0, 3.2, 0)); return g; } },
  { id: 'uplight', cat: 'Lighting', name: 'Floor uplight', tags: 'wash spot', build: () => captureBuilt(() => buildUplight(0, 0, S.brand.secondary)) },
  { id: 'floorlamp', cat: 'Lighting', name: 'Floor lamp', tags: 'standing lamp', build: () => { const g = new THREE.Group(); P(g, cyl(.16, .17, .02), M.dark(), 0, .01, 0); P(g, cyl(.012, .012, 1.5, 10), M.dark(), 0, .76, 0); const sh = P(g, lathe([[.12, .3], [.2, 0]], 40), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: .9, side: THREE.DoubleSide, emissive: 0xffe6c0, emissiveIntensity: .5 }), 0, 1.42, 0); const l = new THREE.PointLight(0xffe2b0, .5, 4, 2); l.position.set(0, 1.5, 0); g.add(l); return g; } },
  { id: 'lightbox', cat: 'Lighting', name: 'Backlit light box', tags: 'seg graphic panel', build: () => { const g = new THREE.Group(); P(g, rbox(1.0, 2.4, .1, .01, false), M.alu(), 0, 1.2, 0); const t = brandPanelTex(256, 614); P(g, new THREE.PlaneGeometry(.96, 2.36), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .75 }), 0, 1.2, .051); return g; } },
  // Vehicles
  { id: 'car', cat: 'Vehicles', name: 'Display car, sedan', tags: 'automotive vehicle', build: () => { const g = new THREE.Group(), paint = mkMat(S.brand.primary, .2, .7); P(g, rbox(4.6, .62, 1.84, .28, false), paint, 0, .58, 0); P(g, rbox(2.5, .58, 1.6, .3, false), new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: .05, metalness: .6 }), -.25, 1.12, 0); [[-1.45, .82], [1.45, .82], [-1.45, -.82], [1.45, -.82]].forEach(([x, z]) => { P(g, cyl(.34, .34, .24, 40), M.dark(), x, .34, z, Math.PI / 2); P(g, cyl(.22, .22, .25, 32), M.chrome(), x, .34, z, Math.PI / 2); }); [-.6, .6].forEach(z => P(g, rbox(.05, .1, .3, .02, false), M.glow('#f4f8ff', 2.5), 2.29, .7, z)); return g; } },
  { id: 'scooter', cat: 'Vehicles', name: 'Electric scooter', tags: 'micromobility', build: () => { const g = new THREE.Group(); P(g, rbox(.85, .06, .16, .03), M.dark(), 0, .14, 0); [-.42, .42].forEach(x => P(g, cyl(.1, .1, .05, 32), M.dark(), x, .1, 0, Math.PI / 2)); P(g, cyl(.018, .018, 1.0, 12), M.alu(), .4, .62, 0, 0, 0, .1); P(g, cyl(.015, .015, .5, 12), M.dark(), .35, 1.1, 0, Math.PI / 2); return g; } },
  // Equipment
  { id: 'robot-arm', cat: 'Equipment', name: 'Industrial robot arm', tags: 'machine automation demo', build: () => { const g = new THREE.Group(), o = mkMat('#f2a541', .35, .2), d = M.dark(); P(g, cyl(.35, .4, .25), d, 0, .125, 0); P(g, cyl(.25, .28, .35), o, 0, .42, 0); P(g, new THREE.SphereGeometry(.18, 24, 18), d, 0, .66, 0); P(g, rbox(.22, .95, .24, .08, false), o, .18, 1.05, 0, 0, 0, -.35); P(g, new THREE.SphereGeometry(.14, 24, 18), d, .35, 1.47, 0); P(g, rbox(.18, .7, .18, .06, false), o, .6, 1.6, 0, 0, 0, -1.1); P(g, cyl(.06, .06, .14), d, .92, 1.74, 0, 0, 0, -1.1); return g; } },
  { id: 'demo-machine', cat: 'Equipment', name: 'Demo machine cabinet', tags: 'equipment enclosure', build: () => { const g = new THREE.Group(); P(g, rbox(1.6, 1.4, 1.0, .05, false), mkMat('#e6e7ea', .4, .3), 0, .7, 0); P(g, new THREE.BoxGeometry(1.2, .6, .02), M.glass(), 0, 1.0, .51); P(g, rbox(.35, .25, .05, .02, false), M.dark(), .55, 1.25, .52); P(g, new THREE.BoxGeometry(1.6, .06, 1.0), M.brand('secondary'), 0, 1.43, 0); return g; } },
  { id: 'coffee-bar', cat: 'Equipment', name: 'Coffee bar station', tags: 'espresso barista hospitality', build: () => { const g = new THREE.Group(); P(g, rbox(1.8, 1.0, .7, .06), M.brand(), 0, .5, 0); P(g, rbox(1.85, .04, .74, .08), M.white(), 0, 1.02, 0); P(g, rbox(.5, .42, .45, .04, false), M.chrome(), -.4, 1.25, -.05); [.2, .32, .44].forEach(x => P(g, cyl(.04, .035, .09, 20), M.white(), x, 1.085, .1)); return g; } },
  // Plants and accessories
  { id: 'tree', cat: 'Plants & accessories', name: 'Potted tree, 6 ft', tags: 'plant green', build: () => captureBuilt(() => buildPlant(0, 0)) },
  { id: 'plant-small', cat: 'Plants & accessories', name: 'Table plant', tags: 'green small', build: () => { const g = new THREE.Group(); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; P(g, lathe([[.001, 0], [.09, 0], [.11, .18], [.001, .18]], 32), M.white(), 0, 0, 0); g.add(leafCrown(160, .16, .9, 0, .32, 0, r)); return swapInModel(g, '/models/potted_plant_04/potted_plant_04.gltf', .38); } },
  { id: 'hedge', cat: 'Plants & accessories', name: 'Planter box with greenery', tags: 'plant divider', build: () => { const g = new THREE.Group(); let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; P(g, rbox(1.6, .5, .4, .02, false), M.wood(), 0, .25, 0); [-.55, 0, .55].forEach(x => g.add(leafCrown(220, .28, .7, x, .72, 0, r))); return g; } },
  { id: 'rug', cat: 'Plants & accessories', name: 'Area rug, 6×9 ft', tags: 'carpet', build: () => { const g = new THREE.Group(); P(g, rbox(2.74, .012, 1.83, .04), new THREE.MeshStandardMaterial({ color: hexColor(muted(S.brand.secondary, .5)), roughness: 1, normalMap: detailMaps('carpet') }), 0, .006, 0); return g; } },
  { id: 'bin', cat: 'Plants & accessories', name: 'Waste bin', tags: 'trash', build: () => { const g = new THREE.Group(); P(g, cyl(.17, .15, .6, 32), M.alu(), 0, .3, 0); return g; } },
  // Panels
  { id: 'panel-1m', cat: 'Panels', name: 'Wall panel, 1 m', tags: 'partition', build: () => { const g = new THREE.Group(); P(g, new THREE.BoxGeometry(1, 2.44, .08), M.white(), 0, 1.22, 0); return g; } },
  { id: 'panel-2m', cat: 'Panels', name: 'Wall panel, 2 m', tags: 'partition', build: () => { const g = new THREE.Group(); P(g, new THREE.BoxGeometry(2, 2.44, .08), M.white(), 0, 1.22, 0); return g; } },
  { id: 'glass-wall', cat: 'Panels', name: 'Glass partition, 2 m', tags: 'divider', build: () => { const g = new THREE.Group(), a = M.alu(); P(g, new THREE.BoxGeometry(2, 2.3, .012), M.glass(), 0, 1.2, 0); [[2, .05, 0, .025], [2, .05, 0, 2.375]].forEach(([w, h, x, y]) => P(g, new THREE.BoxGeometry(w, h, .05), a, x, y, 0)); [-1, 1].forEach(s => P(g, new THREE.BoxGeometry(.05, 2.4, .05), a, s, 1.2, 0)); return g; } },
  // Structure
  { id: 'column', cat: 'Structure', name: 'Round column, 10 ft', tags: 'pillar', build: () => { const g = new THREE.Group(); P(g, cyl(.22, .22, 3.05, 48), M.white(), 0, 1.525, 0); return g; } },
  { id: 'arch', cat: 'Structure', name: 'Arched entry', tags: 'gateway', build: () => { const g = new THREE.Group(); P(g, objectGeometry({ shape: 'arch', thicknessFt: 1.2 }, 2.74, 3.05, .3), M.white(), 0, 1.525, 0); return g; } },
  { id: 'portal', cat: 'Structure', name: 'Walk-through portal', tags: 'entry doorway', build: () => { const g = new THREE.Group(); P(g, openingGeometry(2.74, 3.05, .3, false, [{ u: 0, w: 5, h: 8 }]), M.brand(), 0, 1.525, 0); return g; } },
  { id: 'stage', cat: 'Structure', name: 'Stage platform, 8×10 ft', tags: 'riser presentation', build: () => { const g = new THREE.Group(); P(g, rbox(3.05, .3, 2.44, .02), M.dark(), 0, .15, 0); P(g, new THREE.BoxGeometry(1, .15, .3), M.dark(), 0, .075, 1.37); P(g, new THREE.BoxGeometry(3.05, .015, .02), M.glow('#ffffff', 2), 0, .29, 1.23); return g; } },
  { id: 'truss-tower', cat: 'Structure', name: 'Truss tower, 12 ft', tags: 'rig', build: () => { const g = new THREE.Group(), a = M.alu(), h = 3.66; [[-.15, -.15], [.15, -.15], [-.15, .15], [.15, .15]].forEach(([x, z]) => P(g, cyl(.024, .024, h, 12), a, x, h / 2, z)); for (let y = .3; y < h; y += .5) { P(g, cyl(.01, .01, .42, 6), a, 0, y, -.15, 0, 0, .78); P(g, cyl(.01, .01, .42, 6), a, 0, y, .15, 0, 0, -.78); } P(g, rbox(.6, .02, .6, .02), a, 0, .01, 0); return g; } },
  // Rooms
  { id: 'meeting-room', cat: 'Rooms', name: 'Meeting room, 10×10 ft', tags: 'closed office private', build: () => { const g = new THREE.Group(), w = M.white(), s = 3.05, h = 2.6, t = .08; P(g, new THREE.BoxGeometry(s, h, t), w, 0, h / 2, -s / 2); [-1, 1].forEach(k => P(g, new THREE.BoxGeometry(t, h, s), w, k * s / 2, h / 2, 0)); P(g, openingGeometry(s, h, t, false, [{ u: 2, w: 3, h: 7 }]), M.brand(), 0, h / 2, s / 2); P(g, new THREE.BoxGeometry(s, .06, s), w, 0, h, 0); P(g, rbox(1.6, .04, .8, .1), M.wood(), 0, .74, 0); P(g, cyl(.05, .2, .72, 24), M.dark(), 0, .36, 0); return g; } },
  { id: 'storage', cat: 'Rooms', name: 'Storage closet, 3×5 ft', tags: 'closet back room', build: () => { const g = new THREE.Group(), w = M.white(), W = 1.52, D = .91, h = 2.44, t = .06; P(g, new THREE.BoxGeometry(W, h, t), w, 0, h / 2, -D / 2); [-1, 1].forEach(k => P(g, new THREE.BoxGeometry(t, h, D), w, k * W / 2, h / 2, 0)); P(g, openingGeometry(W, h, t, false, [{ u: 0, w: 2.6, h: 6.8 }]), w, 0, h / 2, D / 2); P(g, new THREE.BoxGeometry(W, .04, D), w, 0, h, 0); return g; } },
  // Hanging signs
  { id: 'sign-ring', cat: 'Hanging signs', name: 'Round hanging sign, 12 ft', tags: 'circle overhead', build: () => { const g = new THREE.Group(), r = 1.83, y = 4.6, t = headerTex(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); P(g, new THREE.CylinderGeometry(r, r, .9, 72, 1, true), new THREE.MeshStandardMaterial({ map: t, side: THREE.FrontSide, roughness: .6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .25 }), 0, y, 0); /* printed outside only; plain fabric lining inside, so text never shows mirrored */ P(g, new THREE.CylinderGeometry(r - .004, r - .004, .9, 72, 1, true), new THREE.MeshStandardMaterial({ color: hexColor(S.brand.primary), side: THREE.BackSide, roughness: .85 }), 0, y, 0); cables(g, y + .45, [[r, 0], [-r, 0], [0, r], [0, -r]]); return g; } },
  { id: 'sign-square', cat: 'Hanging signs', name: 'Square hanging sign, 10 ft', tags: 'overhead', build: () => { const g = new THREE.Group(), s = 3.05, y = 4.6, m = new THREE.MeshStandardMaterial({ map: headerTex(), roughness: .6, emissive: 0xffffff, emissiveMap: headerTex(), emissiveIntensity: .25 }); [0, 1, 2, 3].forEach(i => { const a = i * Math.PI / 2; P(g, new THREE.BoxGeometry(s, .9, .04), m, Math.sin(a) * s / 2, y, Math.cos(a) * s / 2, 0, a); }); cables(g, y + .45, [[s / 2, s / 2], [-s / 2, s / 2], [s / 2, -s / 2], [-s / 2, -s / 2]]); return g; } },
  { id: 'sign-banner', cat: 'Hanging signs', name: 'Hanging banner, 8 ft', tags: 'overhead flat', build: () => { const g = new THREE.Group(), y = 4.4, m = new THREE.MeshStandardMaterial({ map: headerTex(), roughness: .7, side: THREE.DoubleSide }); P(g, new THREE.PlaneGeometry(2.44, .9), m, 0, y, 0); P(g, cyl(.015, .015, 2.5, 8), M.alu(), 0, y + .46, 0, 0, 0, Math.PI / 2); cables(g, y + .47, [[-1.1, 0], [1.1, 0]]); return g; } },
  { id: 'sign-triangle', cat: 'Hanging signs', name: 'Triangle hanging sign', tags: 'overhead', build: () => { const g = new THREE.Group(), s = 2.6, y = 4.6, m = new THREE.MeshStandardMaterial({ map: headerTex(), roughness: .6 }), R = s / (2 * Math.tan(Math.PI / 3)); [0, 1, 2].forEach(i => { const a = i * Math.PI * 2 / 3; P(g, new THREE.BoxGeometry(s, .9, .04), m, Math.sin(a) * R, y, Math.cos(a) * R, 0, a); }); cables(g, y + .45, [[0, R * 2], [R * 1.7, -R], [-R * 1.7, -R]]); return g; } },
];
const CAT_INDEX = Object.fromEntries(CATALOG.map(c => [c.id, c]));
const LIB_CATS = [...new Set(CATALOG.map(c => c.cat))];

// Placed library items live in S.placed and rebuild with the booth
function buildPlacedItems() {
  (S.placed || []).forEach(p => {
    const def = CAT_INDEX[p.item]; if (!def) return;
    const g = def.build();
    g.position.set(num(p.x), 0, num(p.z)); g.rotation.y = num(p.ry);
    g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    g.userData.label = def.name;
    boothG.add(g);
    makeDraggable(g, 'i:' + p.id);
  });
}
let placeSeq = 0;
function addLibraryItem(id) {
  const r = canvas.getBoundingClientRect(); aimRay(r.left + r.width / 2, r.top + r.height * .62);
  const hit = dragRay.ray.intersectPlane(floorPlane, new THREE.Vector3()) || new THREE.Vector3();
  const { w, d } = getSZ();
  const p = { id: Date.now().toString(36) + (++placeSeq), item: id, x: Math.max(-w / 2, Math.min(w / 2, hit.x)), z: Math.max(-d / 2, Math.min(d / 2, hit.z)), ry: 0 };
  S.placed.push(p); selKey = 'i:' + p.id;
  closeModal(); rebuildBooth();
}

// Thumbnails, rendered once per session with a small offscreen renderer
const thumbCache = {};
let thumbRenderer = null;
function itemThumb(def) {
  if (thumbCache[def.id]) return thumbCache[def.id];
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(176, 132, false); thumbRenderer.outputColorSpace = THREE.SRGBColorSpace; thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping; thumbRenderer.toneMappingExposure = .9;
  }
  const sc = new THREE.Scene(); sc.environment = defaultEnvMap;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x777777, .9)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(3, 5, 4); sc.add(dl);
  const g = def.build(); sc.add(g);
  g.traverse(n => { if (n.isLight && n !== dl) n.intensity = 0; });
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, 176 / 132, .01, 100), dist = Math.max(s.x, s.y, s.z) * 2.1 + .2;
  cam.position.set(c.x + dist * .7, c.y + dist * .45, c.z + dist * .75); cam.lookAt(c);
  thumbRenderer.render(sc, cam);
  thumbCache[def.id] = { url: thumbRenderer.domElement.toDataURL('image/png'), size: s.clone() };
  sc.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) [].concat(n.material).forEach(m => m.dispose()); });
  return thumbCache[def.id];
}

// Shared modal
function openModal(title, wide) {
  const m = document.getElementById('modal'); m.hidden = false;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-card').style.maxWidth = wide ? '980px' : '560px';
  const body = document.getElementById('modal-body'); body.textContent = ''; return body;
}
function closeModal() { document.getElementById('modal').hidden = true; }
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });
["dragover", "drop"].forEach(t => document.getElementById("modal").addEventListener(t, e => e.preventDefault()));

function openLibrary() {
  const body = openModal('Add to your booth', true);
  body.innerHTML = `<div class="lib"><nav class="lib-cats" id="lib-cats"></nav><div class="lib-main"><input type="search" id="lib-q" placeholder="Search all items" aria-label="Search items"><div class="lib-grid" id="lib-grid"></div></div></div>`;
  const cats = document.getElementById('lib-cats');
  let current = 'All';
  ['All', ...LIB_CATS].forEach(c => {
    const b = document.createElement('button'); b.className = 'lib-cat' + (c === 'All' ? ' active' : ''); b.textContent = c;
    b.onclick = () => { current = c; cats.querySelectorAll('.lib-cat').forEach(x => x.classList.toggle('active', x === b)); draw(); };
    cats.append(b);
  });
  const q = document.getElementById('lib-q'); q.oninput = draw; setTimeout(() => q.focus(), 30);
  function draw() {
    const term = q.value.trim().toLowerCase(), grid = document.getElementById('lib-grid'); grid.textContent = '';
    const list = CATALOG.filter(c => (current === 'All' || c.cat === current) && (!term || (c.name + ' ' + c.cat + ' ' + c.tags).toLowerCase().includes(term)));
    if (!list.length) { const p = document.createElement('p'); p.className = 'lib-empty'; p.textContent = 'No items match.'; grid.append(p); return; }
    list.forEach(def => {
      const card = document.createElement('div'); card.className = 'lib-card';
      const img = document.createElement('img'); img.alt = ''; img.width = 176; img.height = 132;
      const nm = document.createElement('div'); nm.className = 'lib-name'; nm.textContent = def.name;
      const dims = document.createElement('div'); dims.className = 'lib-dims';
      const add = document.createElement('button'); add.className = 'btn btn-sm btn-primary'; add.textContent = 'Add'; add.onclick = () => addLibraryItem(def.id);
      card.append(img, nm, dims, add); grid.append(card);
      requestAnimationFrame(() => {
        const t = itemThumb(def); img.src = t.url;
        dims.textContent = isM() ? `${t.size.x.toFixed(2)} × ${t.size.z.toFixed(2)} × ${t.size.y.toFixed(2)} m` : `${Math.round(t.size.x / IN)}″ W × ${Math.round(t.size.z / IN)}″ D × ${Math.round(t.size.y / IN)}″ H`;
      });
    });
  }
  draw();
}

// ═══ Design format: one object for templates, AI builds, saved designs and files ═══
const FURN_IDS = ['chair-task', 'chair-padded', 'lounge', 'barstool', 'table-round', 'table-rect', 'cocktail', 'podium', 'tv-wall', 'tv-stand', 'videowall', 'kiosk', 'uplight', 'pendant', 'neon', 'floorlamp', 'plant', 'banner', 'merch', 'brochure'];
const DESIGN_KEYS = ['cornerSide', 'floorTrim', 'size', 'custom', 'boothType', 'system', 'units', 'corner', 'cladding', 'ceiling', 'endCap', 'wallH', 'sideH', 'floorMat', 'floorRiser', 'noText', 'power', 'knownSize'];
function serializeDesign() {
  const d = { v: 1, env: currentEnv };
  DESIGN_KEYS.forEach(k => { d[k] = S[k]; });
  d.els = { ...S.els }; d.brand = { ...S.brand }; d.furn = [...S.furn];
  d.placed = JSON.parse(JSON.stringify(S.placed || [])); d.added = JSON.parse(JSON.stringify(S.added || []));
  d.edits = JSON.parse(JSON.stringify(S.edits || {})); d.drags = JSON.parse(JSON.stringify(S.drags || {}));
  if (S.recon) d.recon = S.recon;
  return d;
}
function blankDesign() {
  return { v: 1, env: 'none', size: '10x10', custom: null, boothType: 'inline', system: 'seg', units: S.units, corner: 'sharp', cladding: 'single', ceiling: 'none', endCap: 'none', wallH: 8, sideH: 8, floorMat: 'carpet-solid', floorRiser: 'none', noText: false, power: true,
    els: { backwall: true, sidewalls: true, header: true, counter: true, shelf: false, lights: true, floor: true },
    brand: { company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.', primary: '#0a84ff', secondary: '#ff9f0a', accent: '#ffffff', bg: '#101820', graphicStyle: 'solid', logoScale: 1, lightStyle: 'warm', lightInt: .7 },
    furn: [], placed: [], added: [], edits: {}, drags: {} };
}
function applyDesign(raw) {
  const d = { ...blankDesign(), ...raw };
  DESIGN_KEYS.forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
  S.els = { ...blankDesign().els, ...(d.els || {}) };
  S.brand = { ...blankDesign().brand, ...(d.brand || {}) };
  ['primary', 'secondary', 'accent', 'bg'].forEach(k => { S.brand[k] = safeHex(S.brand[k], blankDesign().brand[k]); });
  S.furn = new Set((d.furn || []).filter(f => FURN_IDS.includes(f)));
  S.placed = (d.placed || []).filter(p => CAT_INDEX[p.item]);
  S.added = d.added || []; S.edits = d.edits || {}; S.drags = d.drags || {};
  S.recon = d.recon || null; S.measures = []; selKey = null; selObj = null;
  addSeq = Math.max(0, ...S.added.map(a => num(a.id)));
  syncControls();
  rebuildBooth();
  const envBtn = document.getElementById('env-' + (d.env || 'none'));
  setEnv(envBtn ? d.env : 'none', envBtn || document.getElementById('env-none'));
  setView('perspective', document.querySelector('.view-controls .vbtn'));
}
function syncControls() {
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v; };
  Object.keys(S.els).forEach(k => set('el-' + k, S.els[k]));
  set('company-name', S.brand.company); set('tagline', S.brand.tagline); set('graphic-style', S.brand.graphicStyle);
  set('light-style', S.brand.lightStyle); set('light-int', Math.round(S.brand.lightInt * 100)); document.getElementById('light-int-v').textContent = Math.round(S.brand.lightInt * 100) + '%';
  set('logo-scale', S.brand.logoScale); document.getElementById('logo-scale-v').textContent = (+S.brand.logoScale).toFixed(1) + '×';
  ['primary', 'secondary', 'accent', 'bg'].forEach(k => { set('col-' + k, S.brand[k]); set('hex-' + k, S.brand[k]); });
  set('floor-mat', S.floorMat); set('floor-riser', S.floorRiser); set('floor-trim', S.floorTrim); set('no-text', S.noText);
  set('wallH', S.wallH); set('sideH', S.sideH);
  document.getElementById('wallH-v').textContent = fmtFt(S.wallH); document.getElementById('sideH-v').textContent = fmtFt(S.sideH);
  renderSizeGrid();
  document.getElementById('cs-row').hidden = S.size !== 'custom';
  
  pickIn('type', document.querySelector(`[data-g=type][onclick*="'${S.boothType}'"]`));
  if (!S.cornerSide) S.cornerSide = "left"; syncCornerSide();
  pickIn('sys', document.querySelector(`[data-g=sys][onclick*="'${S.system}'"]`));
  pickIn('unit', document.querySelector(`[data-g=unit][onclick*="'${S.units}'"]`));
  ['corner', 'cladding', 'ceiling', 'endCap'].forEach(k => { const e = document.querySelector(`select[onchange*="'${k}'"]`); if (e) e.value = S[k]; });
  FURN_IDS.forEach(f => document.getElementById('fb-' + f)?.classList.toggle('active', S.furn.has(f)));
  const pw = document.querySelector('[onclick^="togglePower"]'); if (pw) { pw.textContent = S.power ? 'Lights on' : 'Lights off'; pw.classList.toggle('active', !S.power); }
}

// Templates
const TEMPLATES = [
  { name: '10×10 starter', note: 'Inline, fabric back wall, counter and two chairs', d: { size: '10x10', boothType: 'inline', wallH: 8, sideH: 3, furn: ['chair-padded', 'plant'], els: { backwall: true, sidewalls: true, header: true, counter: true, shelf: false, lights: true, floor: true }, floorMat: 'carpet-solid', brand: { company: 'YOUR COMPANY', tagline: 'Visit us at the show.', primary: '#1f6feb', secondary: '#f2a541', accent: '#ffffff', bg: '#0d1b2a', graphicStyle: 'gradient', logoScale: 1, lightStyle: 'warm', lightInt: .8 }, env: 'showfloor' } },
  { name: '10×20 product demo', note: 'Inline, video wall, demo desk, plinths', d: { size: '10x20', boothType: 'inline', wallH: 8, sideH: 4, furn: ['uplight'], placed: [{ id: 't1', item: 'videowall', x: 1.3, z: -1.2, ry: 0 }, { id: 't2', item: 'laptop-desk', x: -1.4, z: .2, ry: 0 }, { id: 't3', item: 'plinth', x: .6, z: .5, ry: 0 }, { id: 't4', item: 'plinth', x: 2.2, z: .5, ry: 0 }, { id: 't5', item: 'banner', x: -2.6, z: 1.1, ry: .3 }], els: { backwall: true, sidewalls: true, header: true, counter: false, shelf: false, lights: true, floor: true }, floorMat: 'concrete', brand: { company: 'VOLTEDGE', tagline: 'See it run live.', primary: '#111827', secondary: '#22d3ee', accent: '#ffffff', bg: '#0b0f17', graphicStyle: 'geometric', logoScale: 1, lightStyle: 'cool', lightInt: .85 }, env: 'showfloor' } },
  { name: '20×20 lounge', note: 'Peninsula, sofa, café table, kiosk, plants', d: { size: '20x20', boothType: 'peninsula', wallH: 10, sideH: 4, corner: 'rounded', furn: ['lounge', 'table-round', 'chair-padded', 'plant', 'uplight', 'pendant', 'brochure', 'kiosk'], floorMat: 'laminate', brand: { company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.', primary: '#0f5c7a', secondary: '#f2a541', accent: '#ffffff', bg: '#0b1f2a', graphicStyle: 'gradient', logoScale: 1, lightStyle: 'warm', lightInt: .85 }, env: 'showfloor' } },
  { name: '20×20 island tower', note: 'Island, center wall, hanging ring sign, coffee bar', d: { size: '20x20', boothType: 'island', wallH: 12, sideH: 0, furn: ['plant'], placed: [{ id: 't1', item: 'coffee-bar', x: 0, z: 1.6, ry: 0 }, { id: 't2', item: 'stool', x: -.5, z: 2.4, ry: 0 }, { id: 't3', item: 'stool', x: .5, z: 2.4, ry: 0 }, { id: 't4', item: 'totem', x: -2.4, z: -1.8, ry: .4 }, { id: 't5', item: 'totem', x: 2.4, z: -1.8, ry: -.4 }, { id: 't6', item: 'cocktail', x: 2, z: 1.8, ry: 0 }], floorMat: 'dark-wood', brand: { company: 'HALCYON', tagline: 'Pause here.', primary: '#5b3df5', secondary: '#f9c74f', accent: '#ffffff', bg: '#1a1033', graphicStyle: 'diagonal', logoScale: 1.1, lightStyle: 'accent', lightInt: .8 }, env: 'showfloor' } },
  { name: '30×30 flagship', note: 'Island, display car, stage, meeting room, video wall', d: { size: '30x30', boothType: 'island', wallH: 12, sideH: 0, ceiling: 'none', furn: [], placed: [{ id: 't1', item: 'car', x: -1.8, z: 1.4, ry: .5 }, { id: 't2', item: 'stage', x: 2.6, z: 2.4, ry: 0 }, { id: 't3', item: 'meeting-room', x: 2.7, z: -2.8, ry: 0 }, { id: 't4', item: 'videowall', x: 0, z: -.7, ry: Math.PI }, { id: 't6', item: 'sofa', x: -3, z: -2.6, ry: 0 }, { id: 't7', item: 'tree', x: -4.1, z: -3.9, ry: 0 }], floorMat: 'marble', brand: { company: 'AURELIA MOTORS', tagline: 'The next drive.', primary: '#14213d', secondary: '#fca311', accent: '#ffffff', bg: '#0b1020', graphicStyle: 'gradient', logoScale: 1, lightStyle: 'daylight', lightInt: .9 }, env: 'showfloor' } },
  { name: 'Outdoor canopy', note: '10×10 pop-up tent, table, banner', d: { size: '10x10', boothType: 'island', system: 'canopy', wallH: 8, sideH: 0, els: { backwall: false, sidewalls: false, header: false, counter: false, shelf: false, lights: false, floor: true }, furn: [], placed: [{ id: 't1', item: 'conf-table', x: 0, z: -.4, ry: 0 }, { id: 't2', item: 'banner', x: -1.1, z: -.9, ry: .2 }, { id: 't3', item: 'chair', x: 0, z: -1.2, ry: 0 }], floorMat: 'rubber', brand: { company: 'TRAILHEAD', tagline: 'Gear for every season.', primary: '#2d6a4f', secondary: '#f4a261', accent: '#ffffff', bg: '#1b2b24', graphicStyle: 'solid', logoScale: 1, lightStyle: 'daylight', lightInt: .7 }, env: 'tent' } },
];
function openTemplates() {
  const body = openModal('AI Build', true);
  const ai = document.createElement('div'); ai.className = 'ai-box';
  ai.innerHTML = `<label for="ai-text">Describe a booth and Claude builds it</label><textarea id="ai-text" rows="3" placeholder="e.g. A 20×30 corner booth for a coffee brand, warm wood, a bar with stools, two screens and lots of plants"></textarea><div class="ai-refs"><div class="ai-refs-head"><span>Reference images (optional, up to 4)</span><button class="btn btn-sm" type="button" id="ai-ref-add">Add images</button><input type="file" id="ai-ref-input" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif"></div><div id="ai-ref-list" class="ai-ref-list"></div><div class="ai-drop-hint">Drag and drop images here</div></div><div class="ai-row"><button class="btn btn-sm btn-primary" id="ai-run">Build it</button><button class="btn btn-sm" id="ai-stop" hidden>Stop</button><span id="ai-msg" aria-live="polite"></span></div>`;
  body.append(ai);
  document.getElementById('ai-run').onclick = aiBuild;
  document.getElementById('ai-ref-add').onclick = () => document.getElementById('ai-ref-input').click();
  document.getElementById('ai-ref-input').onchange = onAiRefFiles;
  const zone = body.querySelector(".ai-refs");
  ["dragenter", "dragover"].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; zone.classList.add("drag-over"); }));
  zone.addEventListener("dragleave", e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    const files = [...(e.dataTransfer.files || [])].filter(f => /^image\/(png|jpe?g|webp|gif)$/.test(f.type));
    if (files.length) onAiRefFiles({ target: { files, value: "" } });
  });
  drawAiRefs();
  document.getElementById('ai-stop').onclick = () => aiCtl?.abort();
}

// Generate: photo-realistic image and video (preview until passes and the generation service are connected)
const GEN_PASSES = { week: { name: '1 Week Pass', img: 3, vid: 1 }, month: { name: '1 Month Pass', img: 6, vid: 2 }, year: { name: '1 Year Pass', img: 30, vid: 8 } };
const genState = { pass: 'week', used: { img: 0, vid: 0 }, items: [] };
function openGenerate() {
  const body = openModal('AI Render', true);
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:grid;gap:12px';
  wrap.innerHTML = `<div class="gen-note"><b>Preview.</b> Generation turns on once passes and the AI image and video service are connected. For now this shows how credits work and queues your current render; no image or video is created yet.</div>
  <div class="gen-top"><label style="font-size:12px;color:var(--fg-muted);display:flex;gap:8px;align-items:center">Pass <select class="gen-pass" id="gen-pass">${Object.entries(GEN_PASSES).map(([k, p]) => `<option value="${k}"${k === genState.pass ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label>
  <div class="gen-credits"><div class="gen-chip"><b id="gen-img-left"></b><span>Images left</span></div><div class="gen-chip"><b id="gen-vid-left"></b><span>Videos left</span></div></div></div>
  <textarea class="gen-dir" id="gen-dir" rows="3" aria-label="Art direction" placeholder="Art direction, e.g. busy show hours, warm evening light"></textarea>
  <div class="gen-btns"><button class="btn btn-primary" id="gen-img">Generate image · 1 credit</button><button class="btn" id="gen-vid">Generate video · 1 credit</button></div>
  <div class="gen-status" id="gen-status" aria-live="polite">Frame the view you want, then generate. The current view is used as the reference.</div>
  <div class="ss-title">Your Generations</div><div class="gen-grid" id="gen-grid"></div>`;
  body.append(wrap);
  const vp = document.getElementById('vp-dir'); document.getElementById('gen-dir').value = vp ? vp.value : '';
  if (acct.signedIn && (!acct.live || acct.row)) { genState.pass = acct.pass; const sel = document.getElementById('gen-pass'); sel.value = acct.pass; sel.disabled = true; }
  document.getElementById('gen-pass').onchange = e => { genState.pass = e.target.value; genState.used = { img: 0, vid: 0 }; drawGen(); };
  document.getElementById('gen-img').onclick = () => queueGen('img');
  document.getElementById('gen-vid').onclick = () => queueGen('vid');
  drawGen();
}
function drawGen() {
  const p = GEN_PASSES[genState.pass], li = p.img - genState.used.img, lv = p.vid - genState.used.vid;
  const a = document.getElementById('gen-img-left'); if (!a) return;
  a.textContent = `${li} / ${p.img}`; document.getElementById('gen-vid-left').textContent = `${lv} / ${p.vid}`;
  document.getElementById('gen-img').disabled = li <= 0; document.getElementById('gen-vid').disabled = lv <= 0;
  const grid = document.getElementById('gen-grid'); grid.textContent = '';
  if (!genState.items.length) { const e = document.createElement('div'); e.className = 'gen-empty'; e.style.gridColumn = '1/-1'; e.textContent = 'Generated images and videos will appear here.'; grid.append(e); return; }
  genState.items.forEach(it => {
    const d = document.createElement('div'); d.className = 'gen-item';
    const im = document.createElement('img'); im.src = it.url; im.alt = it.kind === 'img' ? 'Render queued for a photo-realistic image' : 'Render queued for a video clip';
    const t = document.createElement('div'); t.className = 'tag'; t.textContent = (it.kind === 'img' ? 'Image' : 'Video') + ' · queued (preview)';
    d.append(im, t); grid.append(d);
  });
}
async function queueGen(kind) {
  const p = GEN_PASSES[genState.pass], st = document.getElementById('gen-status');
  if (genState.used[kind] >= p[kind]) return;
  st.textContent = 'Capturing the current view…';
  try {
    const blob = await currentViewBlob();
    genState.used[kind]++; genState.items.unshift({ kind, url: URL.createObjectURL(blob) });
    st.textContent = kind === 'img' ? 'Queued. When generation is live, this returns a photo-realistic image in about 20 seconds and uses 1 image credit.' : 'Queued. When generation is live, this returns a 5–10 second video clip in a few minutes and uses 1 video credit.';
  } catch { st.textContent = "Couldn't capture the view. Try again."; }
  drawGen();
}

// Accounts: real sign-in through window.aibdAuth (Supabase) on the hosted site; a preview everywhere else.
const acct = { signedIn: false, name: '', email: '', pass: 'month', row: null, live: !!window.aibdAuth };
const PASS_DAYS = { week: 7, month: 30, year: 365 };
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
if (window.aibdAuth) window.aibdAuth.onChange(st => {
  acct.signedIn = !!st.user; acct.email = st.user?.email || ''; acct.name = acct.email; acct.row = st.pass;
  if (st.pass) { acct.pass = st.pass.plan; genState.pass = st.pass.plan; genState.used = { img: st.pass.images_used, vid: st.pass.videos_used }; }
  drawAcctBtn();
  const t = document.getElementById('modal-title')?.textContent || '';
  if (!document.getElementById('modal').hidden && /^(Sign In|Your Account)$/i.test(t)) openAccount();
});
function openAccount() { return acct.live ? openAccountLive() : openAccountPreview(); }
function openAccountLive() {
  const body = openModal(acct.signedIn ? 'Your Account' : 'Sign In', false);
  const w = document.createElement('div'); w.className = 'acct-wrap'; body.append(w);
  if (!acct.signedIn) {
    w.innerHTML = `<p style="font-size:13px;color:var(--fg-muted);line-height:1.5">Use the email you bought your pass with. We'll email you a one-time sign-in link, so there's no password to remember.</p>
      <div class="acct-field"><label for="acct-email">Email</label><input id="acct-email" type="email" autocomplete="email" placeholder="you@company.com"></div>
      <button class="btn btn-primary" id="acct-send">Email me a sign-in link</button>
      <div class="acct-msg" id="acct-msg" aria-live="polite"></div>
      <p style="font-size:12px;color:var(--fg-muted)">No pass yet? <a href="/#pricing" style="color:var(--accent)">See passes and pricing</a></p>`;
    const msg = document.getElementById('acct-msg'), btn = document.getElementById('acct-send'), input = document.getElementById('acct-email');
    const send = async () => {
      const v = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.textContent = 'Enter a valid email address.'; return; }
      btn.disabled = true; msg.textContent = 'Sending…';
      try { await window.aibdAuth.sendLink(v); showSent(v); return; }
      catch (e) { msg.textContent = /rate|seconds|too many/i.test(e?.message || '') ? 'Too many sign-in emails. Wait a minute and try again.' : "Couldn't send the sign-in link. Try again."; }
      btn.disabled = false;
    };
    // After sending: replace the form with a clear "check your email" message, and hold back resending for a minute.
    const showSent = email => {
      w.innerHTML = `<div class="acct-sent">
          <div class="acct-sent-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
          <div class="acct-sent-title">Check your email</div>
          <p>We sent a sign-in link to <b id="acct-sent-to"></b>. Open it on this or any device to finish signing in.</p>
          <p class="acct-sent-small">It can take a minute to arrive. If it isn't in your inbox, check spam or promotions.</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" id="acct-resend" disabled>Send again</button><button class="btn" id="acct-change">Use a different email</button></div>
        <div class="acct-msg" id="acct-msg" aria-live="polite"></div>`;
      document.getElementById('acct-sent-to').textContent = email;
      const resend = document.getElementById('acct-resend'), m2 = document.getElementById('acct-msg');
      let left = 60;
      const tick = () => {
        if (!resend.isConnected) return clearInterval(timer);
        left--; resend.textContent = left > 0 ? `Send again in ${left}s` : 'Send again'; resend.disabled = left > 0;
        if (left <= 0) clearInterval(timer);
      };
      resend.textContent = `Send again in ${left}s`;
      const timer = setInterval(tick, 1000);
      resend.onclick = async () => {
        resend.disabled = true; m2.textContent = 'Sending…';
        try { await window.aibdAuth.sendLink(email); showSent(email); }
        catch (e) { m2.textContent = /rate|seconds|too many/i.test(e?.message || '') ? 'Too many sign-in emails. Wait a minute and try again.' : "Couldn't send the sign-in link. Try again."; resend.disabled = false; }
      };
      document.getElementById('acct-change').onclick = () => openAccountLive();
    };
    btn.onclick = send; input.onkeydown = e => { if (e.key === 'Enter') send(); };
    setTimeout(() => input.focus(), 50);
    return;
  }
  const r = acct.row, p = r ? GEN_PASSES[r.plan] : null;
  w.innerHTML = `<div class="acct-card">
      <div class="acct-row"><span>Signed in as</span><b id="acct-who"></b></div>
      <div class="acct-row"><span>Pass</span><b>${p ? p.name + (r.livemode ? '' : ' (test)') : 'No active pass'}</b></div>
      ${r ? `<div class="acct-row"><span>Active until</span><b>${fmtDate(r.ends_at)}</b></div>` : ''}
    </div>
    ${r ? `<div class="gen-credits">${r.ai_total ? `<div class="gen-chip"><b>${r.ai_total - r.ai_used} / ${r.ai_total}</b><span>AI actions left</span></div>` : ''}<div class="gen-chip"><b>${r.images_total - r.images_used} / ${r.images_total}</b><span>Images left</span></div><div class="gen-chip"><b>${r.videos_total - r.videos_used} / ${r.videos_total}</b><span>Videos left</span></div></div>` : '<p style="font-size:13px;color:var(--fg-muted);line-height:1.5">Buy a pass with this email to unlock AI features and image and video credits. It shows up here a few seconds after checkout.</p>'}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${r ? '<button class="btn" id="acct-refresh">Refresh</button>' : '<a class="btn btn-primary" href="/#pricing" style="text-align:center">See passes</a>'}<button class="btn" id="acct-out">Sign out</button></div>
    <div class="acct-msg" id="acct-msg" aria-live="polite"></div>`;
  document.getElementById('acct-who').textContent = acct.email;
  const rf = document.getElementById('acct-refresh'); if (rf) rf.onclick = async () => { rf.disabled = true; await window.aibdAuth.refresh(); };
  document.getElementById('acct-out').onclick = async () => { await window.aibdAuth.signOut(); closeModal(); };
}
function drawAcctBtn() {
  const b = document.getElementById('acct-btn'); if (!b) return;
  b.textContent = '';
  if (acct.signedIn) { const d = document.createElement('span'); d.className = 'acct-dot'; d.textContent = (acct.name[0] || 'A').toUpperCase(); b.append(d, document.createTextNode('Account')); }
  else b.textContent = 'Sign in';
}
function openAccountPreview() {
  const body = openModal(acct.signedIn ? 'Your Account' : 'Sign In', false);
  const w = document.createElement('div'); w.className = 'acct-wrap'; body.append(w);
  const note = `<div class="gen-note"><b>Preview.</b> Accounts turn on when passes go on sale. Nothing you type here is sent or saved.</div>`;
  if (!acct.signedIn) {
    w.innerHTML = `${note}
      <p style="font-size:13px;color:var(--fg-muted);line-height:1.5">Use the email you bought your pass with. We'll send a one-time sign-in link, so there's no password to remember.</p>
      <div class="acct-field"><label for="acct-email">Email</label><input id="acct-email" type="email" autocomplete="email" placeholder="you@company.com"></div>
      <button class="btn btn-primary" id="acct-send">Email me a sign-in link</button>
      <div class="acct-or">or</div>
      <button class="btn" id="acct-google">Continue with Google</button>
      <div class="acct-msg" id="acct-msg" aria-live="polite"></div>
      <p style="font-size:12px;color:var(--fg-muted)">No pass yet? <a href="#" id="acct-buy" style="color:var(--accent)">See passes and pricing</a></p>`;
    const msg = document.getElementById('acct-msg');
    const done = () => { msg.innerHTML = 'In the live version you\'d now check your inbox. <button class="btn btn-sm" id="acct-demo">Continue as a preview account</button>';
      document.getElementById('acct-demo').onclick = () => { acct.signedIn = true; acct.name = 'Preview'; drawAcctBtn(); openAccount(); }; };
    document.getElementById('acct-send').onclick = () => {
      const v = document.getElementById('acct-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.textContent = 'Enter a valid email address.'; return; }
      document.getElementById('acct-email').value = ''; done();
    };
    document.getElementById('acct-google').onclick = done;
    document.getElementById('acct-buy').onclick = e => { e.preventDefault(); msg.textContent = 'Passes are listed on the AI Booth Design website under Pricing.'; };
    return;
  }
  const p = GEN_PASSES[acct.pass], exp = new Date(Date.now() + PASS_DAYS[acct.pass] * 864e5);
  const used = genState.pass === acct.pass ? genState.used : { img: 0, vid: 0 };
  w.innerHTML = `${note}
    <div class="acct-card">
      <div class="acct-row"><span>Signed in as</span><b>Preview account</b></div>
      <div class="acct-row"><span>Pass</span><b><select class="gen-pass" id="acct-pass">${Object.entries(GEN_PASSES).map(([k, v]) => `<option value="${k}"${k === acct.pass ? ' selected' : ''}>${v.name}</option>`).join('')}</select></b></div>
      <div class="acct-row"><span>Active until</span><b>${exp.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b></div>
    </div>
    <div class="gen-credits"><div class="gen-chip"><b>${p.img - used.img} / ${p.img}</b><span>Images left</span></div><div class="gen-chip"><b>${p.vid - used.vid} / ${p.vid}</b><span>Videos left</span></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" id="acct-topup">Buy more credits</button><button class="btn" id="acct-out">Sign out</button></div>
    <div class="acct-msg" id="acct-msg" aria-live="polite"></div>`;
  document.getElementById('acct-pass').onchange = e => { acct.pass = e.target.value; genState.pass = acct.pass; genState.used = { img: 0, vid: 0 }; openAccount(); };
  document.getElementById('acct-topup').onclick = () => { document.getElementById('acct-msg').textContent = 'Top-ups (5 images for $19, 1 video for $15) open with checkout.'; };
  document.getElementById('acct-out').onclick = () => { acct.signedIn = false; acct.name = ''; drawAcctBtn(); closeModal(); };
}

// AI build from a description
let aiCtl = null;
const aiRefs = [];
function onAiRefFiles(e) {
  [...e.target.files].slice(0, 4 - aiRefs.length).forEach(f => {
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => { aiRefs.push({ url, img, name: f.name }); drawAiRefs(); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  });
  e.target.value = "";
}
function drawAiRefs() {
  const list = document.getElementById("ai-ref-list"); if (!list) return;
  list.textContent = "";
  aiRefs.forEach((r, i) => {
    const card = document.createElement("div"); card.className = "ai-ref";
    const im = document.createElement("img"); im.src = r.url; im.alt = r.name;
    const x = document.createElement("button"); x.type = "button"; x.className = "ai-ref-x"; x.textContent = "✕"; x.setAttribute("aria-label", "Remove " + r.name);
    x.onclick = () => { URL.revokeObjectURL(r.url); aiRefs.splice(i, 1); drawAiRefs(); };
    card.append(im, x); list.append(card);
  });
  const add = document.getElementById("ai-ref-add"); if (add) add.disabled = aiRefs.length >= 4;
}
async function aiBuild() {
  const msg = document.getElementById('ai-msg'), text = document.getElementById('ai-text').value.trim().slice(0, 1500);
  if (!text) { msg.textContent = 'Describe the booth first.'; return; }
  const sample = window.claude ? await window.claude.use('sample') : null;
  if (!sample) { msg.textContent = 'AI build needs the page opened on claude.ai, signed in.'; return; }
  const catalog = CATALOG.map(c => `${c.id} (${c.name})`).join('; ');
  const prompt = `Design a trade show booth from this request: "${text}"
Reply with only JSON:
{"size":"DxW" depth×width in feet, one of 10x10,10x20,10x30,20x20,20x30,20x40,30x30,30x40,40x40 or "custom" with "custom":{"w":ft,"d":ft},
"boothType":"inline|corner|peninsula|island","system":"seg|uprights80|holes|slim|timber|canopy",
"wallH":6-16,"sideH":0-12,"corner":"sharp|rounded","cladding":"single|panels","ceiling":"none|grid|fabric","endCap":"none|left|right|both",
"floorMat":"carpet-solid|carpet-tile|vinyl|laminate|dark-wood|marble|concrete|rubber",
"els":{"backwall":bool,"sidewalls":bool,"header":bool,"counter":bool,"shelf":bool,"lights":bool,"floor":bool},
"brand":{"company":string,"tagline":string,"primary":"#rrggbb","secondary":"#rrggbb","accent":"#rrggbb","bg":"#rrggbb","graphicStyle":"solid|gradient|geometric|diagonal","lightStyle":"warm|cool|daylight|accent|rgb","lightInt":0.3-1},
"placed":[{"item":catalog id,"x":feet,"z":feet,"rotDeg":number}] (2 to 14 items),
"env":"showfloor|convention|openfloor|drama|studio|tent"}
Catalog ids: ${catalog}.
Coordinates: feet from the booth floor center, x to the right, z toward the aisle (+z is the open front), the back wall sits at z = -depth/2. Keep every item inside the footprint and clear of each other; leave a walkway from the front. Hanging signs go at the center. Use the company and colors from the request if given.${aiRefs.length ? `
REFERENCE IMAGES: ${aiRefs.length} image(s) are attached. Use them as the main visual reference: match the layout, structures, materials, colors, lighting mood and style they show as closely as the catalog and options allow, while still following the written request.` : ""}`;
  aiCtl = new AbortController();
  document.getElementById('ai-run').disabled = true; document.getElementById('ai-stop').hidden = false; msg.textContent = 'Claude is designing… usually under a minute.';
  try {
    const opts = { signal: aiCtl.signal, cache: false };
    if (aiRefs.length) opts.images = await Promise.all(aiRefs.map(r => imageBlob(r.img, 1600)));
    const d = await sample.json(prompt, opts);
    if (!d || typeof d !== 'object') throw { code: 'invalid_json' };
    const enumOk = (v, list, def) => list.includes(v) ? v : def;
    const sizes = [...FT_SIZES, ...M_SIZES, 'custom'];
    const design = {
      size: enumOk(d.size, sizes, '20x20'), custom: d.custom && num(d.custom.w) > 0 && num(d.custom.d) > 0 ? { w: Math.min(100, num(d.custom.w)), d: Math.min(100, num(d.custom.d)) } : null,
      boothType: enumOk(d.boothType, Object.keys(BOOTH_TYPES), 'inline'), system: enumOk(d.system, ['seg', 'uprights80', 'holes', 'slim', 'timber', 'canopy'], 'seg'),
      wallH: Math.max(6, Math.min(16, Math.round(num(d.wallH, 8)))), sideH: Math.max(0, Math.min(12, Math.round(num(d.sideH, 8)))),
      corner: enumOk(d.corner, ['sharp', 'rounded'], 'sharp'), cladding: enumOk(d.cladding, ['single', 'panels'], 'single'), ceiling: enumOk(d.ceiling, ['none', 'grid', 'fabric'], 'none'), endCap: enumOk(d.endCap, ['none', 'left', 'right', 'both'], 'none'),
      floorMat: enumOk(d.floorMat, ['carpet-solid', 'carpet-tile', 'vinyl', 'laminate', 'dark-wood', 'marble', 'concrete', 'rubber'], 'carpet-solid'),
      els: d.els && typeof d.els === 'object' ? Object.fromEntries(Object.entries(d.els).map(([k, v]) => [k, !!v])) : undefined,
      brand: { ...blankDesign().brand, ...(d.brand || {}), company: String(d.brand?.company || 'AI BOOTH DESIGN').slice(0, 40), tagline: String(d.brand?.tagline || '').slice(0, 80), lightInt: Math.max(.3, Math.min(1, num(d.brand?.lightInt, .8))) },
      env: enumOk(d.env, ['showfloor', 'convention', 'openfloor', 'drama', 'studio', 'tent'], 'showfloor'),
    };
    if (design.size === 'custom' && !design.custom) design.size = '20x20';
    const [D, W] = design.size === 'custom' ? [design.custom.d, design.custom.w] : design.size.split('x').map(Number);
    design.placed = (Array.isArray(d.placed) ? d.placed : []).filter(p => CAT_INDEX[p?.item]).slice(0, 24).map((p, i) => ({
      id: 'ai' + Date.now().toString(36) + i, item: p.item,
      x: Math.max(-W / 2, Math.min(W / 2, num(p.x))) * FT, z: Math.max(-D / 2, Math.min(D / 2, num(p.z))) * FT, ry: num(p.rotDeg) * Math.PI / 180,
    }));
    closeModal();
    applyDesign(design);
  } catch (e) {
    msg.textContent = { cancelled: 'Stopped.', not_granted: 'Claude access was declined for this page.', rate_limited: 'Usage limit reached. Try again later.', invalid_json: 'The design came back incomplete. Try again.' }[e?.code] || e?.message || 'Could not build that. Try again.';
  } finally {
    const run = document.getElementById('ai-run'); if (run) run.disabled = false;
    const st = document.getElementById('ai-stop'); if (st) st.hidden = true;
  }
}

// Saved designs (this browser) and design files (any computer)
const STORE = 'bs-designs-v1';
function readStore() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } }
function writeStore(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } }
function openDesigns() {
  const body = openModal('Your designs');
  body.innerHTML = `<div class="ds-row"><input type="text" id="ds-name" placeholder="Design name" aria-label="Design name" maxlength="60"><button class="btn btn-sm btn-primary" id="ds-save">Save</button></div>
  <div class="ds-row"><button class="btn btn-sm" id="ds-new">New design</button><button class="btn btn-sm" id="ds-export">Save as file</button><button class="btn btn-sm" id="ds-import">Open file</button><input type="file" id="ds-file" hidden accept=".json,application/json"></div>
  <p class="ds-msg" id="ds-msg" aria-live="polite">Designs save in this browser. Use Save as file to move one to another computer. Uploaded photos, artwork and fonts are not included.</p>
  <div id="ds-list" class="ds-list"></div>`;
  document.getElementById('ds-name').value = S.brand.company ? `${S.brand.company} ${getSZ().lbl}` : '';
  document.getElementById('ds-save').onclick = saveDesign;
  document.getElementById('ds-new').onclick = () => confirmInline(document.getElementById('ds-new'), 'Start over? Unsaved changes are lost.', () => { closeModal(); applyDesign(starterDesign()); heroCamera(); });
  document.getElementById('ds-export').onclick = exportDesignFile;
  document.getElementById('ds-import').onclick = () => document.getElementById('ds-file').click();
  document.getElementById('ds-file').onchange = importDesignFile;
  drawDesignList();
}
function dsMsg(t) { const m = document.getElementById('ds-msg'); if (m) m.textContent = t; }
function saveDesign() {
  const name = document.getElementById('ds-name').value.trim() || 'Untitled design';
  const list = readStore(), existing = list.find(x => x.name === name);
  const entry = { id: existing?.id || Date.now().toString(36), name, savedAt: Date.now(), design: serializeDesign() };
  const next = [entry, ...list.filter(x => x.id !== entry.id)];
  if (!writeStore(next)) { dsMsg('This browser would not save it (storage blocked or full). Use Save as file instead.'); return; }
  dsMsg(`Saved “${name}”.`); drawDesignList();
}
function drawDesignList() {
  const wrap = document.getElementById('ds-list'); wrap.textContent = '';
  const list = readStore();
  if (!list.length) { const p = document.createElement('p'); p.className = 'ds-msg'; p.textContent = 'No saved designs yet.'; wrap.append(p); return; }
  list.forEach(x => {
    const row = document.createElement('div'); row.className = 'ds-item';
    const info = document.createElement('div'); info.style.minWidth = '0';
    const n = document.createElement('strong'); n.textContent = x.name;
    const t = document.createElement('span'); t.textContent = new Date(x.savedAt).toLocaleString();
    info.append(n, t);
    const open = document.createElement('button'); open.className = 'btn btn-sm btn-primary'; open.textContent = 'Open';
    open.onclick = () => { closeModal(); applyDesign(x.design); };
    const del = document.createElement('button'); del.className = 'btn btn-sm'; del.textContent = 'Delete';
    del.onclick = () => confirmInline(del, `Delete “${x.name}”? This cannot be undone.`, () => { writeStore(readStore().filter(y => y.id !== x.id)); drawDesignList(); });
    row.append(info, open, del); wrap.append(row);
  });
}
function confirmInline(anchor, text, onYes) {
  const box = document.createElement('div'); box.className = 'ds-confirm';
  const s = document.createElement('span'); s.textContent = text;
  const y = document.createElement('button'); y.className = 'btn btn-sm btn-primary'; y.textContent = 'Yes';
  const n = document.createElement('button'); n.className = 'btn btn-sm'; n.textContent = 'Cancel';
  y.onclick = () => { box.remove(); onYes(); }; n.onclick = () => box.remove();
  box.append(s, y, n);
  (anchor.closest('.ds-item') || anchor.closest('.ds-row')).after(box);
}
async function exportDesignFile() {
  const downloads = window.claude ? await window.claude.use('downloads') : null;
  if (!downloads) { dsMsg('Saving files is unavailable in this view. Open the page on claude.ai.'); return; }
  const name = (document.getElementById('ds-name').value.trim() || 'booth-design').replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50) || 'booth-design';
  try {
    await downloads.save({ filename: name + '.json', data: JSON.stringify({ boothStudioDesign: 1, name, design: serializeDesign() }, null, 1) });
    dsMsg('Saved ' + name + '.json.');
  } catch (e) { dsMsg(e?.code === 'declined' ? 'Save cancelled.' : 'The file could not be saved.'); }
}
async function importDesignFile(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || j.boothStudioDesign !== 1 || typeof j.design !== 'object') throw 0;
    closeModal(); applyDesign(j.design);
  } catch { dsMsg('That file is not an AI Booth Design design.'); }
}

// ═══ UI shell: sidebar with brand and tabs, collapsible sections, floating canvas controls ═══
(function buildShell() {
  const $ = s => document.querySelector(s), sidebar = $('#sidebar'), area = $('#canvas-area');
  // Sidebar top: brand + tabs
  const top = document.createElement('div'); top.className = 'side-top';
  const brand = document.createElement('div'); brand.className = 'side-brand';
  brand.append($('header .logo'));
  const ver = document.createElement('span'); ver.className = 'ver'; ver.textContent = 'v58'; brand.append(ver);
  const tabs = $('header .htabs');
  ['Booth', 'Items', 'Brand', 'Specs'].forEach((t, i) => { tabs.children[i].textContent = t; });
  top.append(brand, tabs); sidebar.prepend(top);

  // Canvas: floating actions
  const acts = $('header .hactions');
  const tl = document.createElement('div'); tl.className = 'cv-top-left';
  const add = document.createElement('button'); add.className = 'cv-pill cv-add'; add.innerHTML = '<span aria-hidden="true" style="font-size:17px;line-height:1">+</span> Add item'; add.onclick = openLibrary;
  const ai = document.createElement('button'); ai.className = 'cv-pill cv-ai'; ai.innerHTML = '<span aria-hidden="true">✦</span> AI Build'; ai.onclick = openTemplates;
  const gen = document.createElement('button'); gen.className = 'cv-pill cv-gen'; gen.innerHTML = '<span aria-hidden="true">✦</span> AI Render'; gen.onclick = openGenerate;
  tl.append(add, ai, gen);
  [...acts.children].forEach(b => { if (/openLibrary|openTemplates/.test(b.getAttribute('onclick') || '')) b.remove(); });
  acts.className = 'cv-top-right';
  const exp = [...acts.children].find(b => /exportSpecs/.test(b.getAttribute('onclick') || '')); if (exp) { exp.textContent = 'Specs file'; exp.classList.remove('btn-primary'); }
  const rv = [...acts.children].find(b => /resetCamera/.test(b.getAttribute('onclick') || '')); if (rv) rv.textContent = 'Reset view';
  const ds = [...acts.children].find(b => /openDesigns/.test(b.getAttribute('onclick') || '')); if (ds) { ds.classList.add('btn-primary'); acts.append(ds); }
  const ab = document.createElement('button'); ab.className = 'btn acct-btn'; ab.id = 'acct-btn'; ab.onclick = openAccount; acts.append(ab); drawAcctBtn();
  if (location.hash === '#signin') setTimeout(openAccount, 600);
  area.append(tl, acts);

  // Bottom toolbar: views | tools
  const bottom = document.createElement('div'); bottom.className = 'cv-bottom';
  const views = $('.view-controls');
  const toolCol = $('[onclick^="toggleDims"]').parentElement;
  const tools = document.createElement('div'); tools.className = 'tool-controls';
  [...toolCol.querySelectorAll('button')].forEach(b => tools.append(b));
  const hint = $('#measure-hint'); area.append(hint); toolCol.remove();
  const sep = document.createElement('div'); sep.className = 'cv-sep';
  bottom.append(views, sep, tools); area.append(bottom);
  $('header').remove();

  // Section order on the Booth tab, then collapsible sections everywhere
  const design = $('#tab-design'), byLabel = l => [...design.querySelectorAll(':scope > .ss')].find(s => s.querySelector('.ss-label')?.textContent.trim() === l);
  const order = ['Booth Setup', 'Wall Height', 'Structure Elements', 'Flooring Material', 'Show Floor Environment', 'Build & Edit'];
  const out = ['Export Render', '3D Model', 'AI Variation Prompts'];
  order.forEach(l => { const s = byLabel(l); if (s) design.append(s); });
  const g = document.createElement('div'); g.className = 'side-group'; g.textContent = 'Output'; design.append(g);
  out.forEach(l => { const s = byLabel(l); if (s) design.append(s); });
  const OPEN = ['Booth Setup', 'Build & Edit', 'Seating', 'Logos, Icons & Artwork', 'Company', 'Reference / Logo Upload'];
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('bs-sections') || '{}'); } catch {}
  document.querySelectorAll('#sidebar .ss').forEach(s => {
    const lab = s.querySelector(':scope > .ss-label'); if (!lab) return;
    const name = lab.textContent.trim();
    const det = document.createElement('details'); det.className = 'sec';
    det.open = name in saved ? saved[name] : OPEN.includes(name);
    const sum = document.createElement('summary'); sum.textContent = name;
    s.before(det); det.append(sum, s);
    det.addEventListener('toggle', () => { saved[name] = det.open; try { localStorage.setItem('bs-sections', JSON.stringify(saved)); } catch {} });
  });

  // Plan icons for booth types, glyphs for construction systems
  const svg = inner => `<svg class="opt-ico" viewBox="0 0 34 26" fill="none" stroke="currentColor" aria-hidden="true">${inner}</svg>`;
  const room = '<rect x="3" y="3" width="28" height="20" rx="1.5" stroke-opacity=".35" stroke-dasharray="2 2"/>';
  const icons = {
    inline: room + '<path d="M3 23V3h28v20" stroke-width="2.6"/>',
    corner: room + '<path d="M3 23V3h28" stroke-width="2.6"/>',
    peninsula: room + '<path d="M3 3h28" stroke-width="2.6"/>',
    island: room + '<path d="M12 13h10" stroke-width="2.6"/>',
    seg: '<rect x="4" y="4" width="26" height="18" rx="1.5" fill="currentColor" fill-opacity=".18" stroke-width="1.6"/>',
    uprights80: '<rect x="4" y="4" width="26" height="18" stroke-width="1"/><path d="M4 4v18M13 4v18M21 4v18M30 4v18" stroke-width="2.8"/>',
    holes: '<rect x="4" y="4" width="26" height="18" stroke-width="1"/><path d="M4 4v18M17 4v18M30 4v18" stroke-width="2.6" stroke-dasharray="2 1.6"/>',
    slim: '<rect x="4" y="4" width="26" height="18" fill="currentColor" fill-opacity=".08" stroke-width="1"/><path d="M4 4v18M17 4v18M30 4v18" stroke-width="1.4"/>',
    timber: '<rect x="4" y="5" width="26" height="17" stroke-width="1.4"/><path d="M3 4h28" stroke-width="2.6"/><path d="M8 10c4-2 8 2 12 0s6-1 7 0M8 16c4-2 8 2 12 0s6-1 7 0" stroke-width="1"/>',
    canopy: '<path d="M3 11 17 4l14 7z" fill="currentColor" fill-opacity=".18" stroke-width="1.6"/><path d="M5 11v11M29 11v11" stroke-width="1.6"/>',
  };
  document.querySelectorAll('[data-g=type],[data-g=sys]').forEach(b => {
    const k = (b.getAttribute('onclick').match(/'([\w]+)'/) || [])[1];
    if (icons[k]) b.insertAdjacentHTML('afterbegin', svg(icons[k]));
  });
  const relabel = { "Persp": "3D", "Eye level": "Eye", "Dimensions": "Booth size", "Clear measures": "Clear", "Hide panel": "Panel", "Full screen": "Full screen" };
  document.querySelectorAll(".cv-bottom .vbtn, .cv-top-right .btn").forEach(b => { const t = b.textContent.trim(); if (relabel[t]) { b.title = t; b.setAttribute("aria-label", t); b.textContent = relabel[t]; } });
  resize();
})();

// Specs file: the viewer blocks new windows, so offer the specs sheet as an HTML file
async function exportSpecs() {
  updateSpecs();
  const { lbl, type } = getSZ(), tot = wt(), hrs = sh();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = document.getElementById('specs-tbody').innerHTML;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Booth Specs – ${esc(S.brand.company)}</title><style>body{font-family:system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#111}h1{font-size:26px}p{color:#666;font-size:13px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:7px 10px;border-bottom:2px solid #000;color:#666}td{padding:9px 10px;border-bottom:1px solid #eee;font-size:12px}.badge{padding:2px 7px;border-radius:4px;font-weight:600;font-size:10px}.badge-g{background:#e6f7ee;color:#1a7a4a}.badge-w{background:#fff8e0;color:#a07000}</style></head><body><h1>${esc(S.brand.company)} — Booth Specification</h1><p>${esc(lbl)} · ${esc(type)} · Generated ${new Date().toLocaleDateString()}</p><table><thead><tr><th>Component</th><th>Dimensions</th><th>Material</th><th>Qty</th><th>Est. Weight</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:20px"><b>Est. total weight:</b> ${tot} lbs · <b>Setup time:</b> ${hrs} hrs · <b>Power:</b> ${pw()} amps · <b>Furnishings:</b> ${S.furn.size} items</p></body></html>`;
  const downloads = window.claude ? await window.claude.use('downloads') : null;
  const btns = [...document.querySelectorAll('button[onclick^="exportSpecs"]')];
  const flash = t => btns.forEach(b => { const o = b.dataset.label || (b.dataset.label = b.textContent); b.textContent = t; setTimeout(() => { b.textContent = o; }, 2200); });
  if (!downloads) { flash('Saving unavailable here'); return; }
  try { await downloads.save({ filename: 'booth-specs.html', data: html }); flash('Saved'); }
  catch (e) { flash(e?.code === 'declined' ? 'Cancelled' : 'Could not save'); }
}

// Extra library items used by the startup booth
function brochureTex(i) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 180; const x = c.getContext('2d');
  x.fillStyle = ['#ffffff', S.brand.primary, '#f4f1ea', S.brand.bg, '#ffffff', S.brand.secondary][i % 6]; x.fillRect(0, 0, 128, 180);
  x.fillStyle = [S.brand.primary, S.brand.secondary, S.brand.primary, S.brand.secondary, S.brand.bg, S.brand.bg][i % 6];
  x.fillRect(0, 108, 128, 72); x.globalAlpha = .7; x.fillRect(14, 22, 70, 9); x.fillRect(14, 38, 46, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
[
  { id: 'podium', cat: 'Display', name: 'Presentation podium, 36 in', tags: 'lectern speaker stand', build: () => {
    const g = new THREE.Group(), body = mkMat(S.brand.primary, .45, .1);
    P(g, rbox(1.0, .035, .52, .05), M.dark(), 0, .018, 0);
    P(g, rbox(.92, 1.12, .4, .05, false), body, 0, .595, 0);
    P(g, new THREE.PlaneGeometry(.84, .92), new THREE.MeshStandardMaterial({ map: brandPanelTex(350, 400), roughness: .6 }), 0, .62, .201);
    P(g, rbox(.98, .035, .52, .035), M.white(), 0, 1.2, .025, -.22);
    P(g, rbox(.94, .014, .024, .006), M.chrome(), 0, 1.16, .28, -.22);
    return g;
  } },
  { id: 'brochure-rack', cat: 'Display', name: 'Acrylic brochure rack, 6 pockets', tags: 'literature display', build: () => {
    const g = new THREE.Group(), chrome = M.chrome(), acrylic = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .04, transparent: true, opacity: .2, depthWrite: false, envMapIntensity: 2.2 });
    [-.31, .31].forEach(x => { P(g, cyl(.012, .012, 1.55, 14), chrome, x, .775, -.05); P(g, rbox(.05, .02, .42, .01), chrome, x, .01, 0); });
    P(g, cyl(.01, .01, .62, 10), chrome, 0, 1.52, -.05, 0, 0, Math.PI / 2);
    let k = 0;
    [.5, .87, 1.24].forEach(y => [-.15, .15].forEach(x => {
      P(g, new THREE.BoxGeometry(.27, .2, .035), acrylic, x, y, .02, -.18);
      P(g, new THREE.BoxGeometry(.27, .012, .045), acrylic, x, y - .1, .03, -.18);
      P(g, new THREE.PlaneGeometry(.23, .32), new THREE.MeshStandardMaterial({ map: brochureTex(k++), roughness: .7 }), x, y + .05, .005, -.18);
    }));
    return g;
  } },
].forEach(def => { CATALOG.push(def); CAT_INDEX[def.id] = def; });

// Startup booth: one back wall, podium, bar-height table with two stools, large TV, brochure rack
function loadStartupScene() {
  crowdCount = 28; crowdWalk = false;
  const walk = document.querySelector('[onchange="onCrowdWalk(this.checked)"]'); if (walk) walk.checked = false;
  const cnt = document.querySelector('[oninput="onCrowdCount(this.value)"]'); if (cnt) cnt.value = 28;
  document.getElementById('crowd-count-v').textContent = '28';
  const backZ = -6.1 / 2 + .08 + .03;
  applyDesign({
    size: '20x20', boothType: 'peninsula', system: 'seg', wallH: 10, sideH: 0, corner: 'sharp',
    els: { backwall: true, sidewalls: false, header: false, counter: false, shelf: false, lights: false, floor: true },
    floorMat: 'carpet-solid', floorTrim: false, furn: [],
    brand: { company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.', primary: '#0f5c7a', secondary: '#f2a541', accent: '#ffffff', bg: '#0b1f2a', graphicStyle: 'gradient', logoScale: .85, lightStyle: 'warm', lightInt: .85 },
    placed: [
      { id: 'start-podium', item: 'podium', x: -1.75, z: 1.25, ry: .35 },
      { id: 'start-table', item: 'cocktail', x: .45, z: .35, ry: 0 },
      { id: 'start-stool-1', item: 'stool', x: -.12, z: .55, ry: 0 },
      { id: 'start-stool-2', item: 'stool', x: 1.02, z: .55, ry: 0 },
      { id: 'start-rack', item: 'brochure-rack', x: -2.35, z: -2.2, ry: .3 },
    ],
    env: 'showfloor',
  });
  heroCamera();
}

// Specs page navigation: remembers the tab you came from and offers a way back
const TAB_NAMES = { design: 'Booth', furnish: 'Items', branding: 'Brand', specs: 'Specs' };
let currentTab = 'design', prevTab = 'design';
function switchTab(t) {
  if (t !== currentTab) { prevTab = currentTab; currentTab = t; }
  ['design', 'furnish', 'branding', 'specs'].forEach((id, i) => {
    document.querySelectorAll('.htab')[i].classList.toggle('active', id === t);
    const el = document.getElementById('tab-' + id); if (el) el.hidden = id !== t;
  });
  document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.t === t));
  const isSpecs = t === 'specs';
  document.getElementById('sidebar').style.display = isSpecs ? 'none' : '';
  document.getElementById('canvas-wrap').style.display = isSpecs ? 'none' : '';
  document.getElementById('specs-panel').classList.toggle('open', isSpecs);
  if (isSpecs) {
    const back = prevTab === 'specs' ? 'design' : prevTab;
    document.getElementById('specs-back-name').textContent = TAB_NAMES[back];
    updateSpecs();
    document.getElementById('specs-panel').scrollTop = 0;
  } else { resize(); markDirty(); }
}
function goBackFromSpecs() { switchTab(prevTab === 'specs' ? 'design' : prevTab); }
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && currentTab === 'specs' && document.getElementById('modal').hidden) goBackFromSpecs();
});

// Specs for library items and Build & Edit structures: [weight lbs each, amps each, material]
const CAT_SPEC = {
  'Furniture': [25, 0, 'Upholstery / hardwood / steel'], 'Display': [30, 0, 'Laminate / acrylic / aluminum'], 'Electronics': [45, 3, 'Commercial display + mount'],
  'Lighting': [8, 1, 'LED fixture'], 'Vehicles': [3300, 0, 'Display vehicle'], 'Equipment': [180, 6, 'Demo equipment'], 'Plants & accessories': [20, 0, 'Live or artificial plant / planter'],
  'Panels': [35, 0, 'Panel system'], 'Structure': [120, 0, 'Painted MDF / aluminum'], 'Rooms': [450, 2, 'Modular panels + door'], 'Hanging signs': [60, 0, 'Fabric over aluminum frame'],
};
const ITEM_SPEC = {
  sofa: [140, 0, 'Upholstered hardwood frame'], armchair: [55, 0, 'Upholstered hardwood frame'], chair: [18, 0, 'Upholstery on steel legs'], stool: [16, 0, 'Steel base, padded seat'],
  'cafe-table': [28, 0, 'Lacquered MDF top, steel base'], cocktail: [32, 0, 'Lacquered MDF top, steel base'], 'conf-table': [110, 0, 'Wood veneer, steel legs'], 'coffee-table': [35, 0, 'Wood veneer'],
  reception: [160, 1, 'Laminate counter, LED base'], bench: [40, 0, 'Upholstered foam'], showcase: [120, 1, 'Tempered glass, laminate base'], plinth: [35, 0, 'Painted MDF'], tiered: [45, 0, 'Painted MDF'],
  shelving: [70, 0, 'Steel frame, laminate shelves'], slatwall: [60, 0, 'Slatwall MDF'], brochure: [12, 0, 'Chrome + acrylic'], banner: [10, 0, 'Aluminum base, printed vinyl'],
  'tv-stand': [95, 2, '65 in LCD on floor stand'], 'tv-wall': [55, 2, '75 in LCD, wall mount'], videowall: [260, 12, '3×3 LCD tiles, frame'], kiosk: [70, 2, 'Touch display in kiosk housing'],
  totem: [110, 4, 'LED totem screen'], 'laptop-desk': [55, 1, 'Laminate desk + laptop'], pendant: [6, .5, 'Brass shade, LED'], uplight: [5, .5, 'LED uplight'], floorlamp: [14, .5, 'Steel lamp, fabric shade'],
  lightbox: [45, 2, 'Backlit SEG fabric light box'], car: [3300, 0, 'Display vehicle'], scooter: [40, 0, 'Display e-scooter'], 'robot-arm': [320, 10, 'Industrial robot arm'], 'demo-machine': [400, 8, 'Machine enclosure'],
  'coffee-bar': [180, 12, 'Laminate bar, espresso machine'], tree: [45, 0, 'Artificial tree, ceramic pot'], 'plant-small': [6, 0, 'Plant, ceramic pot'], hedge: [90, 0, 'Wood planter, greenery'],
  rug: [25, 0, 'Area rug'], bin: [8, 0, 'Aluminum bin'], 'panel-1m': [30, 0, 'Painted panel'], 'panel-2m': [55, 0, 'Painted panel'], 'glass-wall': [90, 0, 'Tempered glass, aluminum frame'],
  column: [80, 0, 'Painted column wrap'], arch: [140, 0, 'Painted MDF arch'], portal: [160, 0, 'Painted MDF portal'], stage: [220, 1, 'Carpeted stage deck, LED edge'], 'truss-tower': [90, 0, 'Aluminum box truss'],
  'meeting-room': [650, 2, 'Modular walls, door, ceiling'], storage: [260, 1, 'Modular walls, door'], 'sign-ring': [75, 0, 'Fabric over aluminum ring'], 'sign-square': [80, 0, 'Fabric over aluminum frame'],
  'sign-banner': [25, 0, 'Fabric banner, aluminum bar'], 'sign-triangle': [70, 0, 'Fabric over aluminum frame'], podium: [60, 0, 'Laminate podium'], 'brochure-rack': [18, 0, 'Chrome frame, acrylic pockets'],
};
const itemBaseSize = {};
function itemSize(id) {
  if (itemBaseSize[id]) return itemBaseSize[id];
  const g = CAT_INDEX[id].build(), s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  g.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) [].concat(n.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
  return itemBaseSize[id] = s;
}
function specLines() {
  const lines = new Map();
  const inch = m => `${Math.round(m / .0254)}″`;
  (S.placed || []).forEach(p => {
    const def = CAT_INDEX[p.item], e = S.edits['i:' + p.id] || {}; if (!def || e.deleted) return;
    const s = itemSize(p.item), w = s.x * num(e.sx, 1), d = s.z * num(e.sz, 1), h = s.y * num(e.sy, 1);
    const dims = `${inch(w)} W × ${inch(d)} D × ${inch(h)} H`, key = p.item + '|' + dims;
    const [lbs, amps, mat] = ITEM_SPEC[p.item] || CAT_SPEC[def.cat] || [20, 0, '—'];
    const row = lines.get(key) || { name: def.name, dims, mat, qty: 0, lbs, amps };
    row.qty++; lines.set(key, row);
  });
  (S.added || []).forEach(o => {
    const e = S.edits['a:' + o.id] || {}; if (e.deleted) return;
    const [w, h, d] = vec3(o.size, 1).map((v, i) => v * num([e.sx, e.sy, e.sz][i], 1));
    const dims = `${fmtFt(w)} W × ${fmtFt(d)} D × ${fmtFt(h)} H`, key = 'a|' + o.name + '|' + dims;
    const row = lines.get(key) || { name: o.name, dims, mat: 'Painted MDF / aluminum', qty: 0, lbs: Math.round(Math.max(20, Math.max(w * h, w * d) * 2.2)), amps: 0 };
    row.qty++; lines.set(key, row);
  });
  return [...lines.values()];
}
const placedCount = () => specLines().reduce((n, r) => n + r.qty, 0);
const placedWeight = () => Math.round(specLines().reduce((n, r) => n + r.qty * r.lbs, 0));
const placedAmps = () => specLines().reduce((n, r) => n + r.qty * r.amps, 0);

// Standard booth sizes, depth × width. Imperial keys "DxW" in feet; metric keys "m:DxW" in meters (EU / Asia shell scheme and raw space)
const FT_SIZES = ['10x10', '10x20', '10x30', '20x20', '20x30', '20x40', '30x30', '30x40', '40x40'];
const M_SIZES = ['m:2x3', 'm:3x3', 'm:3x4', 'm:3x5', 'm:3x6', 'm:3x9', 'm:4x6', 'm:6x6', 'm:6x9', 'm:6x12', 'm:9x9', 'm:9x12', 'm:12x12'];
function sizeDimsM(key) {
  if (key.startsWith('m:')) return key.slice(2).split('x').map(Number);
  return key.split('x').map(n => +n * FT);
}
function nearestSize(dM, wM, list) {
  let best = list[0], err = Infinity;
  list.forEach(k => { const [d, w] = sizeDimsM(k), e = Math.abs(d - dM) + Math.abs(w - wM); if (e < err) { err = e; best = k; } });
  return best;
}
function getSZ() {
  const fp = S.recon && S.recon.footprint;
  if (fp) { const W = num(fp.widthFt, 10), D = num(fp.depthFt, 10); return { w: W * FT, d: D * FT, lbl: fmtDims(D, W), type: 'From photo' }; }
  let dM, wM;
  if (S.size === 'custom' && S.custom) { wM = S.custom.w * FT; dM = S.custom.d * FT; } else [dM, wM] = sizeDimsM(S.size);
  return { w: wM, d: dM, lbl: S.size.startsWith('m:') && isM() ? `${dM} × ${wM} m` : fmtDims(+(dM / FT).toFixed(2), +(wM / FT).toFixed(2)), type: BOOTH_TYPES[S.boothType] || 'Inline' };
}
function specKey() { const { w, d } = getSZ(); return nearestSize(d, w, FT_SIZES); }
function renderSizeGrid() {
  const grid = document.getElementById('size-grid'), metric = isM();
  document.getElementById('size-label').textContent = metric ? 'Size: depth × width, meters (EU / Asia standards)' : 'Size: depth × width, feet';
  grid.textContent = '';
  (metric ? M_SIZES : FT_SIZES).forEach(k => {
    const [d, w] = metric ? k.slice(2).split('x').map(Number) : k.split('x').map(Number);
    const b = document.createElement('button'); b.className = 'sz-btn'; b.dataset.g = 'size';
    b.setAttribute('onclick', `setSize('${k}',this)`);
    b.innerHTML = `${d}×${w}<small>${(d * w).toLocaleString()} ${metric ? 'm²' : 'ft²'}</small>`;
    b.classList.toggle('active', S.size === k);
    grid.append(b);
  });
  const c = document.createElement('button'); c.className = 'sz-btn'; c.dataset.g = 'size'; c.style.gridColumn = '1/-1';
  c.setAttribute('onclick', "setSize('custom',this)"); c.textContent = 'Custom size'; c.classList.toggle('active', S.size === 'custom');
  grid.append(c);
  document.getElementById('cs-d-label').textContent = `Depth (${uLabel()})`;
  document.getElementById('cs-w-label').textContent = `Width (${uLabel()})`;
  if (S.custom) { document.getElementById('cs-d').value = +uShowFt(S.custom.d).toFixed(2); document.getElementById('cs-w').value = +uShowFt(S.custom.w).toFixed(2); }
}
function onCustomSize() {
  const D = uReadFt(num(document.getElementById('cs-d').value)), W = uReadFt(num(document.getElementById('cs-w').value));
  if (D > 0 && W > 0) { S.custom = { w: Math.min(W, 100), d: Math.min(D, 100) }; S.size = 'custom'; fitPlacedToBooth(); rebuildBooth(); }
}
function setUnits(u, btn) {
  if (S.units === u) { pickIn('unit', btn); return; }
  S.units = u; pickIn('unit', btn);
  if (S.size !== 'custom' && !S.recon) {
    const [d, w] = sizeDimsM(S.size);
    S.size = nearestSize(d, w, u === 'm' ? M_SIZES : FT_SIZES);
  }
  renderSizeGrid();
  document.getElementById('wallH-v').textContent = fmtFt(S.wallH);
  document.getElementById('sideH-v').textContent = fmtFt(S.sideH);
  fitPlacedToBooth(); rebuildBooth(); renderInspector(); markDirty();
}
renderSizeGrid();

// Starter layout: one back wall, podium, bar table with two stools, brochure rack, placed to suit any booth size
function starterLayout(w, d) {
  const inX = v => Math.max(-w / 2 + .35, Math.min(w / 2 - .35, v)), inZ = v => Math.max(-d / 2 + .35, Math.min(d / 2 - .35, v));
  if (w < 4.5 || d < 4.5) {
    const tx = Math.min(w * .18, w / 2 - .9), gap = .5;
    return {
      "start-podium": [-w / 2 + .56, d / 2 - .36, 0],
      "start-table": [tx, Math.min(0, d / 2 - .9), 0],
      "start-stool-1": [tx - gap, Math.min(.22, d / 2 - .6), 0],
      "start-stool-2": [tx + gap, Math.min(.22, d / 2 - .6), 0],
      "start-rack": [-w / 2 + .42, -d / 2 + .45, 0],
    };
  }
  const tx = inX(w * .1), tz = inZ(d * .06), gap = Math.min(.58, w * .12);
  return {
    "start-podium": [inX(-w * .3), inZ(d * .28), .35],
    "start-table": [tx, tz, 0],
    "start-stool-1": [inX(tx - gap), inZ(tz + .22), 0],
    "start-stool-2": [inX(tx + gap), inZ(tz + .22), 0],
    "start-rack": [inX(-w * .39), inZ(-d / 2 + .5), .3],
  };
}
const STARTER_ITEMS = { 'start-podium': 'podium', 'start-table': 'cocktail', 'start-stool-1': 'stool', 'start-stool-2': 'stool', 'start-rack': 'brochure-rack' };
function starterPlaced(w, d) {
  const L = starterLayout(w, d);
  return Object.entries(STARTER_ITEMS).map(([id, item]) => ({ id, item, x: L[id][0], z: L[id][1], ry: L[id][2] }));
}
function starterDesign(sizeKey) {
  const key = sizeKey || (isM() ? 'm:6x6' : '20x20'), [dM, wM] = sizeDimsM(key);
  return {
    size: key, boothType: 'peninsula', system: 'seg', wallH: 10, sideH: 0, corner: 'sharp', units: S.units,
    els: { backwall: true, sidewalls: false, header: false, counter: false, shelf: false, lights: false, floor: true },
    floorMat: 'carpet-solid', floorTrim: false, furn: [],
    brand: { company: 'AI BOOTH DESIGN', tagline: 'Design. Build. Show.', primary: '#0f5c7a', secondary: '#f2a541', accent: '#ffffff', bg: '#0b1f2a', graphicStyle: 'gradient', logoScale: .85, lightStyle: 'warm', lightInt: .85 },
    placed: starterPlaced(wM, dM), env: 'showfloor',
  };
}
// After a size change: starter pieces move to their spot for the new size; everything else is kept inside the floor
function fitPlacedToBooth() {
  if (S.recon) return;
  const { w, d } = getSZ(), L = starterLayout(w, d);
  (S.placed || []).forEach(p => {
    if (L[p.id]) { [p.x, p.z, p.ry] = L[p.id]; delete S.drags['i:' + p.id]; return; }
    const dr = S.drags['i:' + p.id] || { x: 0, z: 0 };
    p.x = Math.max(-w / 2 + .3, Math.min(w / 2 - .3, p.x + dr.x)) - dr.x;
    p.z = Math.max(-d / 2 + .3, Math.min(d / 2 - .3, p.z + dr.z)) - dr.z;
  });
}
function updateCeilingVis() {
  const show = camera.position.y < 12.4;
  envGroup.children.forEach(m => { if (m.position.y > 11) m.visible = show; });
}
function loadStartupScene() {
  crowdCount = 28; crowdWalk = false;
  const walk = document.querySelector('[onchange="onCrowdWalk(this.checked)"]'); if (walk) walk.checked = false;
  const cnt = document.querySelector('[oninput="onCrowdCount(this.value)"]'); if (cnt) cnt.value = 28;
  document.getElementById('crowd-count-v').textContent = '28';
  const tpl = linkedTemplate();
  const link = tpl ? null : linkedSize();
  if (link) S.units = link.units;
  applyDesign(tpl ? JSON.parse(JSON.stringify(tpl.d)) : starterDesign(link ? link.key : '20x20'));
  if (typeof renderSizeGrid === 'function') renderSizeGrid();
  heroCamera();
  if (link?.custom) {
    const z = getSZ(); S.custom = { w: z.w / FT, d: z.d / FT }; renderSizeGrid();
    const cb = document.querySelector('#size-grid [onclick*="custom"]');
    if (cb) setSize('custom', cb);
    setTimeout(() => { const f = document.getElementById('cs-d'); if (f) { f.focus(); f.select(); } }, 300);
  }
  if (link || tpl) { const { w, d } = getSZ(), k = Math.max(1, Math.max(w, d) / 6.1); oR = 10.5 * k; oTarget.y = 1.5 * Math.min(k, 1.6); camUpdate(); }
  if (tpl && tpl === TEMPLATES[TEMPLATE_SLUGS.island]) { oR *= 1.3; oTarget.y = 2.6; camUpdate(); }
}
// Size links from the website, e.g. #size-20x30 (feet) or #size-m3x6 (meters)
function linkedSize() {
  const m = /^#size-(m)?(custom|\d+x\d+)$/.exec(location.hash || ''); if (!m) return null;
  const units = m[1] ? 'm' : 'ft';
  if (m[2] === 'custom') return { key: m[1] ? 'm:6x6' : '20x20', units, custom: true };
  const key = m[1] ? 'm:' + m[2] : m[2];
  return (m[1] ? M_SIZES : FT_SIZES).includes(key) ? { key, units } : null;
}
// Design links from the website, e.g. #design-flagship
const TEMPLATE_SLUGS = { starter: 0, demo: 1, lounge: 2, island: 3, flagship: 4, canopy: 5 };
function linkedTemplate() {
  const m = /^#design-([a-z]+)$/.exec(location.hash || ''); if (!m || !(m[1] in TEMPLATE_SLUGS)) return null;
  return TEMPLATES[TEMPLATE_SLUGS[m[1]]] || null;
}
window.addEventListener('hashchange', () => { if (linkedSize() || linkedTemplate()) loadStartupScene(); });

// Button labels in Title Case, including buttons created or relabelled later
function titleCase(s) { return s.replace(/(^|[\s(\/"“-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/(\d)(\s?)(In|Ft|Mm|Cm|M)\b/g, (m, d, sp, u) => d + sp + u.toLowerCase()); }
const TC_SEL = "button, a.btn, h1, h2, h3, #modal-title, details.sec > summary, .ss-label, .side-group, .ss-title, .sc-label, .tpl-head, .ai-box > label, .ai-refs-head > span, .lib-name, .ref-pane-header, #inspector > div:first-child";
function titleCaseButtons(root) {
  const btns = root.matches && root.matches(TC_SEL) ? [root] : [...(root.querySelectorAll ? root.querySelectorAll(TC_SEL) : [])];
  btns.forEach(btn => {
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let skip = false;
      for (let p = n.parentElement; p && p !== btn; p = p.parentElement) {
        if (p.tagName === 'SMALL' || (p.tagName === 'SPAN' && p.parentElement && p.parentElement.classList.contains('tpl-card'))) { skip = true; break; }
      }
      if (skip) continue;
      const t = titleCase(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t;
    }
  });
}
titleCaseButtons(document.body);
new MutationObserver(list => list.forEach(m => {
  if (m.type === 'characterData') { const b = m.target.parentElement && m.target.parentElement.closest(TC_SEL); if (b) titleCaseButtons(b); }
  else m.addedNodes.forEach(n => { if (n.nodeType === 1) titleCaseButtons(n); else if (n.nodeType === 3 && n.parentElement) { const b = n.parentElement.closest(TC_SEL); if (b) titleCaseButtons(b); } });
})).observe(document.body, { childList: true, subtree: true, characterData: true });

// ═══════════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════════
function resize(){
  const area=document.getElementById('canvas-area');
  const W=area.clientWidth, H=area.clientHeight;
  if(!W||!H) return;
  renderer.setSize(W,H,false);
  camera.aspect=W/H; camera.updateProjectionMatrix();
  if(typeof bgPhoto!=="undefined"&&bgPhoto) applyBg();
}
window.addEventListener('resize',resize);
resize();

(function animate(){ requestAnimationFrame(animate); renderFrame(); drawOverlay(); })();

// INIT
loadStartupScene();
