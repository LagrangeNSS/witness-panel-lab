import {
  COLORS,DIRS,fresh,sanitize,node,xy,stride,mod,ek,nk,lk,ck,pairs,mirror,geometry,extendable,regions,
  validate,normalShape,rotateShape,paletteColor,lightColor,
} from './engine.mjs';
import {ico} from './glyphs.mjs';
import {presets} from './presets.mjs';

const $=id=>document.getElementById(id);
const board=$('board');
const storeKey='witness-panel-lab-v1';
const history=[], future=[];
const tools={
  square:'Colored square',star:'Star',tri:'Triangles',poly:'Polyomino',neg:'Subtractive polyomino',erase:'Eraser clue',
  dot:'Hexagon dot',pitch:'Pitch hexagon',gap:'Broken edge',start:'Start point',end:'Exit point',hole:'Cutout',remove:'Remove clue',
  pencil:'Trace path',fill:'Place polyomino',mark:'Color annotation',anchor:'Required route mark',ban:'Blocked route mark',
  photo:'Import reference image',pan:'Align reference image',
};
const cellTools=['square','star','tri','poly','neg','erase','hole'];
const defaultShape=[[0,0],[0,1],[1,1]];
const colors=['Black','Ivory','Red','Yellow','Green','Blue','Purple','Cyan'];
let panel=structuredClone(presets[0].panel), title=presets[0].name, path=presets[0].path.slice();
let layerBank=[panel], layerIndex=0;
let marks={}, fills=[], photo=null, tool='poly', traceTool='pencil', mode='build', color=3, customColor='#da7358';
let count=1, pitch=2, line=0, shape=structuredClone(defaultShape), rot=false, exitDir=-1, fillNeg=false;
let fillSource=null, fillShape=structuredClone(defaultShape), soundTrack=0, mixA=3, mixB=4, mixSubtract=false;
let worker=null, solutions=[], selected=0, batchPrefix=[], solveFinished=false, solveTime=15000, check=null, status=null;
let drawRegions=false, showMarks=true, reveal=false, searchPrefix=false, hover=null, cursor=null, view=null, drag=null, audio=null;
function allPanels() {
  const deck=layerBank.slice();
  deck[layerIndex]=panel;
  return deck;
}
const snapshot=()=>({
  panel:structuredClone(panel),layers:structuredClone(allPanels()),layerIndex,title,path:path.slice(),
  marks:structuredClone(marks),fills:structuredClone(fills),photo:photo&&{...photo},
});
const esc=text=>String(text).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const safePhoto=src=>typeof src==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src)&&src.length<3800000;
function decode(data) {
  const clean=sanitize(data.panel||data), maxNode=stride(clean)*(clean.h+1);
  const layers=Array.isArray(data.layers)&&data.layers.length?data.layers.slice(0,9).map(sanitize):[clean];
  if(layers.some(p=>p.w!==clean.w||p.h!==clean.h||p.wrap!==clean.wrap||p.sym!==clean.sym)) throw new Error('Incompatible layers');
  const index=Number.isInteger(data.layerIndex)&&data.layerIndex>=0&&data.layerIndex<layers.length?data.layerIndex:0;
  layers[index]=clean;
  const validCell=c=>Number.isInteger(c)&&c>=0&&c<clean.w*clean.h;
  const colorOkay=c=>Number.isInteger(c)&&c>=0&&c<COLORS.length||typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
  const newMarks={}, newFills=[];
  for(const [k,c] of Object.entries(data.marks||{})) if(/^\d+$/.test(k)&&validCell(+k)&&colorOkay(c)) newMarks[k]=c;
  for(const f of Array.isArray(data.fills)?data.fills.slice(0,160):[]) {
    if(Array.isArray(f?.cells)&&f.cells.length&&f.cells.every(validCell)) newFills.push({cells:[...new Set(f.cells)],neg:!!f.neg});
  }
  const num=(n,d,min,max)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):d;
  const image=data.photo;
  return {
    panel:clean,layers,layerIndex:index,title:typeof data.title==='string'?data.title.slice(0,48):'untitled',
    path:Array.isArray(data.path)?data.path.filter(n=>Number.isInteger(n)&&n>=0&&n<maxNode).slice(0,maxNode):[],
    marks:newMarks,fills:newFills,photo:safePhoto(image?.src)?{src:image.src,x:num(image.x,0,-5,5),y:num(image.y,0,-5,5),zoom:num(image.zoom,1,.3,4),opacity:num(image.opacity,.65,0,1),angle:num(image.angle,0,-180,180),ratio:num(image.ratio,1,.1,10)}:null,
  };
}
try { const data=localStorage.getItem(storeKey); if(data) ({panel,layers:layerBank,layerIndex,title,path,marks,fills,photo}=decode(JSON.parse(data))); } catch {}
function save() {
  try {localStorage.setItem(storeKey,JSON.stringify({panel,layers:allPanels(),layerIndex,title,path,marks,fills,photo}));} catch {}
}
function undoable() {
  history.push(snapshot()); if(history.length>35) history.shift(); future.length=0;
}
function restore(data) {
  stop();
  ({panel,layers:layerBank,layerIndex,title,path,marks,fills,photo}=data);
  solutions=[];selected=0;check=null;status=null;hover=null;cursor=null;fillSource=null;
  save();render();
}
function change(fn,{keepPath=false}={}) {
  undoable();stop();fn();solutions=[];selected=0;check=null;status=null;fillSource=null;
  if(!keepPath) path=[];
  save();render();
}
function stop() { if(worker) worker.terminate();worker=null; }
function bn(icon,action,label,{active,disabled=false,text='',className='icon',style='',body=''}={}) {
  return `<button type="button" class="${className}${active?' on':''}" data-action="${esc(action)}" title="${esc(label)}" aria-label="${esc(label)}"${typeof active==='boolean'?` aria-pressed="${active}"`:''}${disabled?' disabled':''}${style?` style="${style}"`:''}>${body||ico(icon)}${text?`<span>${esc(text)}</span>`:''}</button>`;
}
const section=(label,body,cls='')=>`<section class="section ${cls}"><h2>${label}</h2>${body}</section>`;
const buttonRow=(html,cl='inline')=>`<div class="${cl}">${html}</div>`;
const select=(id,label,options,value)=>`<select id="${id}" aria-label="${label}" title="${label}">${options.map(([k,v])=>`<option value="${k}" ${String(k)===String(value)?'selected':''}>${v}</option>`).join('')}</select>`;
const slider=(id,label,icon,value,min,max,step)=>`<label class="slider" title="${label}">${ico(icon)}<input id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
const toolButton=(key,group)=>bn(key,group+':'+key,tools[key],{active:(group==='tool'?tool:traceTool)===key});
const swatches=(action,active,allowCustom=false)=>buttonRow(COLORS.map((c,i)=>bn('',action+':'+i,colors[i],{active:i===active,className:'swatch',style:'--color:'+c,body:' '})).join('')+(allowCustom?`<label title="Custom color" class="custom">${ico('plus')}<input type="color" id="custom-color" value="${customColor}" aria-label="Custom color"></label>`:''),'color-row');
const dotscale=[0,1,.72,.49];
function pitchIcon(value) {
  const s=dotscale[value],pts=Array.from({length:6},(_,i)=>[12+8*s*Math.cos(i*Math.PI/3),12+8*s*Math.sin(i*Math.PI/3)].join(',')).join(' ');
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polygon points="${pts}" fill="currentColor"/></svg>`;
}
function panelSettings() {
  const options=[['none','single'],['x','mirror ↔'],['y','mirror ↕'],['rot','rotate ↻']];
  if(panel.wrap&&panel.w%2===0) options.push(['shift','half-turn'],['shiftY','half-turn ↕']);
  return section('panel',buttonRow(`<span class="selector">${ico('sym')}${select('sym','Line symmetry',options,panel.sym)}</span>`+
    bn('wrap','wrap','Wrap as cylinder',{active:panel.wrap,disabled:panel.w<3})+
    bn(panel.hidden?'hide':'eye','hidden','Hide second line',{active:panel.hidden,disabled:panel.sym==='none'})+
    (panel.hidden&&panel.sym!=='none'?bn('layers','reveal','Show the hidden line',{active:reveal}):''))+layerControls(true));
}
function layerControls(editable) {
  const many=layerBank.length>1;
  if(!editable&&!many) return '';
  const controls=(many?bn('left','layer-prev','Previous layer',{disabled:layerIndex===0})+
    `<output class="layer-count" aria-label="Linked layer">${layerIndex+1}/${layerBank.length}</output>`+
    bn('right','layer-next','Next layer',{disabled:layerIndex>=layerBank.length-1}):'')+
    (editable?bn('layers','layer-add','Add linked layer',{disabled:layerBank.length>=9})+
      (many?bn('remove','layer-delete','Remove current layer'):''):'');
  return `<div class="inline layer-controls">${controls}</div>`;
}
function tones() {
  const tones=soundTrack===1?panel.pitches2:panel.pitches;
  return section('sound',buttonRow(
    select('sound-rule','Pitch source',[['dots','hexagons'],['rows','rows']],panel.sound)+
    (panel.sym!=='none'?bn('layers','sound-track','Switch sequence between two lines',{active:soundTrack===1}):'')+
    bn('volume','play-sound','Play pitch sequence',{disabled:!tones.length})+
    bn('clear','clear-pitches','Clear pitch sequence',{disabled:!tones.length})
  )+`<div class="pitch-line">${[1,2,3].map(n=>bn('', 'append-pitch:'+n,['','Append low pitch','Append mid pitch','Append high pitch'][n],{body:pitchIcon(n)})).join('')}<div class="pitch-strip" aria-label="Pitch sequence">${tones.map((n,i)=>bn('','remove-pitch:'+i,'Remove pitch '+(i+1),{body:pitchIcon(n)})).join('')}</div></div>`);
}
function shapeGrid() {
  return `<div class="shape-row"><div class="shape-grid" aria-label="Polyomino stencil">${Array.from({length:25},(_,i)=>{
    const x=i%5,y=Math.floor(i/5);
    return bn('','shape:'+i,'Stencil column '+(x+1)+', row '+(y+1),{active:shape.some(p=>p[0]===x&&p[1]===y),body:' '});
  }).join('')}</div>${bn('rotate','rotatable','Allow polyomino rotations',{active:rot})}${bn('undo','shape-reset','Reset polyomino stencil')}</div>`;
}
function buildDesk() {
  let html=section('symbols',buttonRow(['square','star','tri','poly','neg','erase','dot','pitch','gap','start','end','hole'].map(key=>toolButton(key,'tool')).join(''),'tools')+
    `<div class="tool-row" style="margin-top:6px">${toolButton('remove','tool')}${bn('pencil','mode:trace','Draw a path')}</div>`,'tools-section');
  if(['poly','neg'].includes(tool)) html+=section('shape',shapeGrid());
  if(tool==='tri') html+=section('triangles',buttonRow([1,2,3].map(n=>bn('','count:'+n,n+' triangles',{active:n===count,body:glyph('tri',12,12,15,'currentColor',{count:n})})).join('')));
  if(tool==='dot'||tool==='pitch') html+=section('line',buttonRow([0,1,2].map(n=>bn('dot','line:'+n,['Either line','Primary line','Secondary line'][n],{active:n===line,style:'color:'+['#272722','#c75132','#4179a2'][n]})).join(''))+
    (tool==='pitch'?`<div class="pitch-line">${[1,2,3].map(n=>bn('','pitch:'+n,['','Low pitch','Mid pitch','High pitch'][n],{active:pitch===n,body:pitchIcon(n)})).join('')}</div>`:''));
  if(tool==='end') html+=section('exit',buttonRow(['end','right','down','left','up'].map((id,i)=>bn(id,'exit-dir:'+(i-1),['Auto exit direction','Right','Down','Left','Up'][i],{active:exitDir===i-1})).join('')));
  if(cellTools.includes(tool)&&tool!=='hole') html+=section('color',swatches('color',color,true));
  html+=panelSettings();
  if(tool==='pitch'||panel.pitches.length||panel.pitches2.length) html+=tones();
  else html+=section('sound',buttonRow(bn('pitch','tool:pitch','Edit pitch sequence')));
  return html;
}
function fillControls() {
  const num=fills.reduce((sum,s)=>sum+(s.neg?-s.cells.length:s.cells.length),0);
  return section('tiles',`<div class="inline">${bn('poly','fill-sign:0','Positive tile',{active:!fillNeg})}${bn('neg','fill-sign:1','Negative tile',{active:fillNeg})}${bn('rotate','fill-rotate','Rotate selected tile',{disabled:fillSource!==null&&!panel.cells[fillSource]?.rot})}${bn('undo','fill-undo','Remove last tile',{disabled:!fills.length})}${bn('clear','fill-clear','Clear all tiles',{disabled:!fills.length})}<output class="rgb" aria-label="Net tile count">${num>0?'+':''}${num}</output></div>`+
    (traceTool==='fill'?`<div class="tool-row" style="margin-top:7px">${bn('anchor','fill-source','Pick a tile symbol',{active:fillSource===null})}${bn('remove','fill-remove','Remove a placed tile')}${bn('','tool-shape','Reset tile',{body:glyph(fillNeg?'neg':'poly',12,12,19,fillNeg?'#4079b0':'#a4662b',{shape:fillShape})})}</div>`:''));
}
const primary=['#ed5035','#6baf68','#4a84d3'];
function colorDesk() {
  const mask=panel.light;
  const mix=mixSubtract?(mixA&~mixB):mixA|mixB;
  const lightRGB=['#251f1c','#ff5240','#5ad05a','#ffd54a','#5297ff','#e977e6','#75dce5','#fff7df'];
  const rgb=(base,key)=>buttonRow([1,2,4].map((n,i)=>bn('',key+':'+n,['Red','Green','Blue'][i]+' channel',{active:!!(base&n),className:'swatch',style:'--color:'+primary[i],body:' '})).join(''),'color-row');
  return section('light',`<div class="swatches-mix">${rgb(mask,'light')}<span class="mix-result" style="background:${lightRGB[mask]}" aria-label="Filter result"></span>${bn('layers','use-light','Apply filtered colors to puzzle rules',{active:panel.useLight})}${bn('undo','reset-light','Reset light filter',{disabled:mask===7&&!panel.useLight})}</div>
    <div class="swatches-mix" style="margin-top:9px">${rgb(mixA,'mix-a')}${bn(mixSubtract?'minus':'plus','mix-mode',mixSubtract?'Subtract RGB channels':'Add RGB channels',{active:mixSubtract})}${rgb(mixB,'mix-b')}${bn('fill','mix-color','Use mixed color for marks and symbols',{className:'mix-result',style:'--color:'+lightRGB[mix]})}</div>`);
}
function traceDesk() {
  return section('tools',buttonRow(['pencil','fill','mark','anchor','ban','photo'].map(key=>key==='photo'?bn('photo','photo','Import reference image'):toolButton(key,'trace-tool')).join(''),'tools'),'tools-section')+
    (traceTool==='mark'?section('color',swatches('color',color,true)):'')+
    fillControls()+
    section('reference',buttonRow(bn('photo','photo','Import reference image')+bn('pan','trace-tool:pan','Align reference image',{active:traceTool==='pan',disabled:!photo})+
      bn('layers','show-marks','Show reference annotations',{active:showMarks})+bn('clear','photo-clear','Remove reference image',{disabled:!photo})+
      bn('remove','annotations-clear','Clear reference annotations',{disabled:!Object.keys(marks).length&&!panel.required.length&&!panel.blocked.length}))+
      (photo?`<div class="reference-control">${slider('photo-opacity','Image opacity','eye',photo.opacity,0,1,.01)}${slider('photo-zoom','Image zoom','pan',photo.zoom,.3,4,.01)}${slider('photo-angle','Image angle','rotate',photo.angle,-180,180,1)}</div>`:''))+
    colorDesk()+(panel.pitches.length||panel.pitches2.length?tones():'');
}
function solveDesk() {
  return section('search',bn(worker?'stop':'solve',worker?'stop':'run',worker?'Stop search':'Find solutions',
    {text:worker?'stop':'find solutions',className:'solve-button',disabled:!worker&&(!panel.starts.length||!Object.keys(panel.ends).length)}),
    'tools-section')+
    section('solutions',buttonRow(bn('left','solution-prev','Previous solution',{disabled:selected<1})+
      `<output class="solve-counter">${solutions.length?String(selected+1).padStart(2,'0'):'—'} / ${String(solutions.length).padStart(2,'0')}</output>`+
      bn('right','solution-next','Next solution',{disabled:selected>=solutions.length-1})+bn('plus','more','Search for more solutions',{disabled:!!worker||!solutions.length||solveFinished})))+
    section('path',layerControls(false)+buttonRow(bn('layers','region','Show path regions',{active:drawRegions})+
      bn('anchor','prefix','Search from current trace',{active:searchPrefix,disabled:!path.length&&!searchPrefix})+
      bn('hint','hint','Reveal one valid next move',{disabled:!!worker})+bn('check','validate','Check current path',{disabled:!path.length})+
      (panel.hidden&&panel.sym!=='none'?bn('eye','reveal','Show hidden line',{active:reveal}):'')))+
    section('time',buttonRow(select('time','Search time limit',[[5000,'5 s'],[15000,'15 s'],[60000,'60 s'],[180000,'180 s']],solveTime)));
}
function ui() {
  const focus=document.activeElement?.dataset?.action;
  $('mode').innerHTML=['build','trace','solve'].map(id=>bn(id,'mode:'+id,id,{active:mode===id,text:id,className:'mode-key'})).join('');
  $('files').innerHTML=bn('new','new','New panel')+bn('open','open','Open panel JSON')+bn('export','export','Export panel JSON');
  $('board-title').textContent=title;
  $('dimensions').innerHTML=mode==='build'?['w','h'].map((id,i)=>`<span class="stepper">${bn('minus','size:'+id+':-1','Decrease '+(i?'height':'width'),{disabled:panel[id]<=(id==='w'&&panel.wrap?3:1)})}<output aria-label="${i?'Height':'Width'}">${panel[id]}</output>${bn('plus','size:'+id+':1','Increase '+(i?'height':'width'),{disabled:panel[id]>=10})}</span>`).join('×'):`${panel.w} × ${panel.h}`;
  $('desk').innerHTML=mode==='build'?buildDesk():mode==='trace'?traceDesk():solveDesk();
  $('actions').innerHTML=bn('undo','undo','Undo',{disabled:!history.length})+bn('redo','redo','Redo',{disabled:!future.length})+
    bn('clear','path-clear','Clear path',{disabled:!path.length})+bn('check','validate','Check path',{disabled:!path.length})+
    bn('layers','region','Show regions',{active:drawRegions});
  $('presets').innerHTML=presets.map((preset,i)=>bn('', 'preset:'+i,preset.name,{className:'preset',text:preset.label,body:thumb(preset.icon),active:preset.name===title})).join('');
  if(focus) document.querySelector(`button[data-action="${CSS.escape(focus)}"]:not(:disabled)`)?.focus({preventScroll:true});
}
function report(label,icon='info',type='') {
  status=label?{label,icon,type}:null;paintStatus();
}
function paintStatus() {
  const element=$('status');
  const fallback={label:panel.wrap?'cylinder':panel.sym!=='none'?'two lines':'ready',icon:panel.wrap?'wrap':panel.sym!=='none'?'sym':'',type:''};
  const s=status||fallback;
  element.className='status '+s.type;
  element.innerHTML=(s.icon?ico(s.icon):'')+esc(s.label);
}
function render() {ui();paintBoard();paintStatus();}
function launch(kind) {
  if(worker) return;
  const hint=kind==='hint', append=kind==='more';
  const prefix=append?batchPrefix.slice():hint||searchPrefix?path.slice():[];
  if(!hint&&!append) batchPrefix=prefix;
  if(!append&&!hint) {solutions=[];selected=0;solveFinished=false;}
  const known=append?solutions.slice():[];
  const thread=new Worker('./worker.mjs',{type:'module'});worker=thread;
  check=null;report('searching','clock');ui();
  thread.onmessage=({data})=>{
    if(worker!==thread) return;
    if(data.solution&&!hint) {
      solutions.push(data.solution);
      if(solutions.length===1||append&&known.length+1===solutions.length) {
        if(solutions.length===1) undoable();
        selected=solutions.length-1;path=data.solution.slice();save();paintBoard();
      }
      report(solutions.length+' found','check','good');ui();
    } else if(data.explored!==undefined&&!data.result&&!solutions.length) report(data.explored.toLocaleString()+' paths','clock');
    if(data.result||data.error) {
      stop();
      const r=data.result;
      if(data.error) report('search error','cross','bad');
      else if(hint&&r.found.length) {
        if(r.found[0].length===prefix.length&&path.length===prefix.length) checkPath();
        else {undoable();path=r.found[0].slice(0,Math.min(r.found[0].length,Math.max(prefix.length,path.length+1)));save();report('next move','hint','good');}
      } else if(r.limited) report(solutions.length?solutions.length+' found · time limit':'time limit','clock');
      else if(hint||!solutions.length) report('no solution','cross','bad');
      else if(!r.found.length) report('no more solutions','check','good');
      else report(solutions.length+' found','check','good');
      if(r&&!hint) solveFinished=r.complete;
      render();
    }
  };
  thread.onerror=()=>{stop();report('search error','cross','bad');ui();};
  thread.postMessage({panel,options:{limit:solveTime,max:hint?1:12,startPath:prefix,skip:known,linked:allPanels().filter((_,i)=>i!==layerIndex)}});
}
function checkPath() {
  check=validate(panel,path);
  const misses=check.ok?allPanels().flatMap((p,i)=>i!==layerIndex&&!validate(p,path).ok?[i+1]:[]):[];
  if(misses.length) report('conflict · layer '+misses[0],'cross','bad');
  else if(check.ok) report(check.cancelled?.length?'valid · '+check.cancelled.length/2+' canceled':'valid path','check','good');
  else if(check.limited) report('time limit','clock');
  else if(check.partial) report('draw to an exit','end');
  else report(check.invalid?.length?check.invalid.length+' conflicts':'invalid path','cross','bad');
  paintBoard();
}
function resized(old,nextW,nextH,nextWrap) {
  const p=fresh(nextW,nextH), edges=new Set();
  p.wrap=nextWrap;p.sym=old.sym;p.hidden=old.hidden;
  if(p.sym.startsWith('shift')&&(!p.wrap||p.w%2)) p.sym='none';
  for(const [a,b] of pairs(p)) edges.add(ek(a,b));
  const vertex=(id,anchor=false)=>{
    let [x,y]=xy(old,id);
    if(anchor&&y===old.h) y=p.h;
    if(anchor&&!old.wrap&&x===old.w) x=p.w;
    if(x>p.w||y>p.h) return null;
    return node(p,x,y);
  };
  const cell=c=>{const x=c%old.w,y=Math.floor(c/old.w);return x<p.w&&y<p.h?y*p.w+x:null;};
  const key=k=>{
    if(k.startsWith('n:')) {const a=vertex(+k.slice(2));return a!==null?nk(a):null;}
    const [a,b]=k.slice(2).split('-').map(n=>vertex(+n));
    return a!==null&&b!==null&&edges.has(ek(a,b))?lk(a,b):null;
  };
  p.starts=[...new Set(old.starts.map(n=>vertex(n,true)).filter(n=>n!==null))];
  p.ends=Object.fromEntries(Object.entries(old.ends).map(([n,d])=>[vertex(+n,true),d]).filter(([n])=>n!==null));
  p.cells=Object.fromEntries(Object.entries(old.cells).map(([i,c])=>[cell(+i),c]).filter(([i])=>i!==null));
  p.dots=Object.fromEntries(Object.entries(old.dots).map(([k,c])=>[key(k),c]).filter(([k])=>k!==null));
  p.gaps=old.gaps.map(k=>key('e:'+k)).filter(Boolean).map(k=>k.slice(2));
  p.holes=old.holes.map(cell).filter(c=>c!==null);
  for(const field of ['required','blocked']) p[field]=old[field].map(key).filter(Boolean);
  for(const field of ['pitches','pitches2','sound','light','useLight']) p[field]=old[field];
  return {panel:p,cell};
}
function resize(w,h,wrap=panel.wrap) {
  const next=allPanels().map(p=>resized(p,w,h,wrap));
  const cell=next[layerIndex].cell;
  marks=Object.fromEntries(Object.entries(marks).map(([i,c])=>[cell(+i),c]).filter(([i])=>i!==null));
  fills=fills.map(f=>({...f,cells:f.cells.map(cell)})).filter(f=>!f.cells.includes(null));
  layerBank=next.map(r=>r.panel);panel=layerBank[layerIndex];
}
function switchLayer(index) {
  if(index<0||index>=layerBank.length) return;
  layerBank=allPanels();layerIndex=index;panel=layerBank[index];check=null;fillSource=null;
  save();render();
}
function addLayer() {
  const p=fresh(panel.w,panel.h);
  p.wrap=panel.wrap;p.sym=panel.sym;p.starts=panel.starts.slice();p.ends={...panel.ends};
  layerBank=allPanels();layerBank.push(p);layerIndex=layerBank.length-1;panel=p;
}
function resetLayers() {layerBank=[panel];layerIndex=0;}

function setMode(id) {
  if(id===mode) return;
  if(mode==='solve') stop();
  mode=id; hover=null;cursor=null;check=null;status=null;
  render();
}
function clearPath() {
  undoable();stop();path=[];solutions=[];check=null;status=null;save();render();
}
function choosePreset(i) {
  const p=presets[i];
  if(p.icon==='mix') { mode='trace';traceTool='pencil'; }
  change(()=>{panel=structuredClone(p.panel);resetLayers();title=p.name;marks={};fills=[];photo=null;path=p.path?.slice()||[];},{keepPath:true});
}
function exportPuzzle() {
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,...snapshot()},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=(title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'panel')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function playTones() {
  const tones=soundTrack===1?panel.pitches2:panel.pitches;
  if(!tones.length) return;
  audio??=new AudioContext();
  audio.resume();
  tones.forEach((tone,i)=>{
    const time=audio.currentTime+i*.29,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type='sine';osc.frequency.value=[0,392,523.25,698.46][tone];
    gain.gain.setValueAtTime(.001,time);gain.gain.exponentialRampToValueAtTime(.15,time+.03);gain.gain.exponentialRampToValueAtTime(.001,time+.22);
    osc.connect(gain).connect(audio.destination);osc.start(time);osc.stop(time+.24);
  });
}
function action(command) {
  const [a,b,c]=command.split(':'), i=+b;
  const pitches=soundTrack===1?'pitches2':'pitches';
  switch(a) {
    case 'mode': return setMode(b);
    case 'new': return change(()=>{panel=fresh();resetLayers();title='untitled';marks={};fills=[];photo=null;mode='build';});
    case 'open': return $('load-json').click();
    case 'photo': return $('load-image').click();
    case 'export': return exportPuzzle();
    case 'preset': return choosePreset(i);
    case 'undo': if(history.length) {future.push(snapshot());restore(history.pop());} return;
    case 'redo': if(future.length) {history.push(snapshot());restore(future.pop());} return;
    case 'path-clear': return clearPath();
    case 'validate': return checkPath();
    case 'tool':
      tool=b;
      if(b==='poly') color=3;
      if(b==='neg') color=5;
      if(b==='tri') color=3;
      if(b==='erase') color=1;
      break;
    case 'trace-tool': traceTool=b;break;
    case 'color': color=i;break;
    case 'count': count=i;break;
    case 'line': line=i;break;
    case 'pitch': pitch=i;break;
    case 'exit-dir': exitDir=i;break;
    case 'shape': {
      const x=i%5,y=Math.floor(i/5), index=shape.findIndex(([a,b])=>a===x&&b===y);
      if(index<0) shape.push([x,y]);else if(shape.length>1) shape.splice(index,1);
      break;
    }
    case 'shape-reset': shape=structuredClone(defaultShape);break;
    case 'rotatable': rot=!rot;break;
    case 'size': return change(()=>resize(panel.w+(b==='w'?+c:0),panel.h+(b==='h'?+c:0)));
    case 'layer-add': return change(addLayer,{keepPath:true});
    case 'layer-prev': return switchLayer(layerIndex-1);
    case 'layer-next': return switchLayer(layerIndex+1);
    case 'layer-delete': return change(()=>{
      layerBank=allPanels();layerBank.splice(layerIndex,1);
      layerIndex=Math.min(layerIndex,layerBank.length-1);panel=layerBank[layerIndex];
    },{keepPath:true});
    case 'wrap': return change(()=>resize(panel.w,panel.h,!panel.wrap));
    case 'hidden': return change(()=>{panel.hidden=!panel.hidden;},{keepPath:true});
    case 'reveal': reveal=!reveal;break;
    case 'sound-track': soundTrack=1-soundTrack;break;
    case 'append-pitch': return change(()=>{panel[pitches].push(i);},{keepPath:true});
    case 'remove-pitch': return change(()=>{panel[pitches].splice(i,1);},{keepPath:true});
    case 'clear-pitches': return change(()=>{panel[pitches]=[];},{keepPath:true});
    case 'play-sound': return playTones();
    case 'fill-sign': fillNeg=!!i;traceTool='fill';break;
    case 'fill-rotate': fillShape=rotateShape(fillShape);break;
    case 'fill-source': fillSource=null;traceTool='fill';break;
    case 'tool-shape': fillSource=null;fillShape=normalShape(shape);break;
    case 'fill-remove': traceTool='fill-remove';break;
    case 'fill-undo': return change(()=>fills.pop(),{keepPath:true});
    case 'fill-clear': return change(()=>{fills=[];},{keepPath:true});
    case 'show-marks': showMarks=!showMarks;break;
    case 'photo-clear': return change(()=>{photo=null;if(traceTool==='pan')traceTool='pencil';},{keepPath:true});
    case 'annotations-clear': return change(()=>{marks={};panel.required=[];panel.blocked=[];},{keepPath:true});
    case 'light': return change(()=>{panel.light^=i;},{keepPath:true});
    case 'reset-light': return change(()=>{panel.light=7;panel.useLight=false;},{keepPath:true});
    case 'use-light': return change(()=>{panel.useLight=!panel.useLight;},{keepPath:true});
    case 'mix-a': mixA^=i;break;
    case 'mix-b': mixB^=i;break;
    case 'mix-mode': mixSubtract=!mixSubtract;break;
    case 'mix-color': {
      const result=mixSubtract?(mixA&~mixB):mixA|mixB;
      color=[0,2,4,3,5,6,7,1][result];traceTool='mark';break;
    }
    case 'region': drawRegions=!drawRegions;break;
    case 'prefix': searchPrefix=!searchPrefix;break;
    case 'run': return launch('fresh');
    case 'more': return launch('more');
    case 'hint': return launch('hint');
    case 'stop': stop();report('search stopped','stop');break;
    case 'solution-prev':
    case 'solution-next':
      selected+=a==='solution-prev'?-1:1;
      path=solutions[selected].slice();check=null;save();break;
    default: return;
  }
  render();
}
document.addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(button&&!button.disabled)action(button.dataset.action);});
document.addEventListener('change',async e=>{
  const {id,value,files}=e.target;
  if(id==='sym') return change(()=>{for(const p of allPanels()) p.sym=value;if(value==='none')soundTrack=0;});
  if(id==='time') {solveTime=+value;return;}
  if(id==='sound-rule') return change(()=>{panel.sound=value;},{keepPath:true});
  if(id==='custom-color') {customColor=value;color=value;render();return;}
  if(id==='load-json'&&files.length) {
    try {
      const data=decode(JSON.parse(await files[0].text()));undoable();restore(data);report('panel loaded','open','good');
    } catch {report('invalid panel file','cross','bad');}
    e.target.value='';return;
  }
  if(id==='load-image'&&files.length) {
    const url=URL.createObjectURL(files[0]);
    try {
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,1440/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.fillStyle='#ede8db';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const src=canvas.toDataURL('image/jpeg',.83);
      change(()=>{photo={src,x:0,y:0,zoom:1,opacity:.68,angle:0,ratio:canvas.width/canvas.height};mode='trace';traceTool='pan';},{keepPath:true});
    } catch {report('image unavailable','cross','bad');}
    finally {URL.revokeObjectURL(url);e.target.value='';}
    return;
  }
});
let sliderStart=false;
document.addEventListener('input',e=>{
  if(!photo||!e.target.id.startsWith('photo-')) return;
  if(!sliderStart) {undoable();sliderStart=true;}
  photo[e.target.id.slice(6)]=+e.target.value;paintBoard();save();
});
document.addEventListener('change',e=>{if(e.target.id.startsWith('photo-')) {sliderStart=false;ui();}});

function glyph(type,x,y,s,color,clue={}) {
  let art='';
  if(type==='square') art='<rect x="4.8" y="4.8" width="14.4" height="14.4" rx="1.2" fill="currentColor" stroke="#282822" stroke-opacity=".29" stroke-width=".7"/>';
  if(type==='star') art='<path fill="currentColor" stroke="#282822" stroke-opacity=".24" stroke-width=".55" d="m12 1.7 2.65 4.05 4.75-1.15-1.15 4.75L22.3 12l-4.05 2.65 1.15 4.75-4.75-1.15L12 22.3l-2.65-4.05-4.75 1.15 1.15-4.75L1.7 12l4.05-2.65L4.6 4.6l4.75 1.15z"/>';
  if(type==='tri') {
    const n=clue.count||1;
    art=Array.from({length:n},(_,i)=>{
      const at=12+(i-(n-1)/2)*7;
      return `<path d="M${at} 8l3.1 7h-6.2z" fill="currentColor" stroke="#282822" stroke-opacity=".15" stroke-width=".45"/>`;
    }).join('');
  }
  if(type==='erase') art='<path d="M12 12V4.5m0 7.5 6.3 5m-6.3-5-6.3 5" fill="none" stroke="#514d43" stroke-opacity=".55" stroke-width="4.15" stroke-linecap="round"/><path d="M12 12V4.5m0 7.5 6.3 5m-6.3-5-6.3 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
  if(type==='poly'||type==='neg') {
    const cells=clue.shape||defaultShape;
    const w=Math.max(...cells.map(p=>p[0]))+1,h=Math.max(...cells.map(p=>p[1]))+1;
    const unit=Math.min(7.1,18/Math.max(w,h));
    const left=12-unit*w/2,top=12-unit*h/2;
    art=`<g${clue.rot?' transform="rotate(-20 12 12)"':''}>`+cells.map(([a,b])=>`<rect x="${left+a*unit+.5}" y="${top+b*unit+.5}" width="${unit-1}" height="${unit-1}" rx=".6" fill="${type==='neg'?'none':'currentColor'}" stroke="${type==='neg'?'currentColor':'#282822'}" stroke-width="${type==='neg'?'1.15':'.55'}" stroke-opacity="${type==='neg'?1:.22}"/>`).join('')+'</g>';
  }
  return `<svg class="glyph" x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" viewBox="0 0 24 24" color="${color}" aria-hidden="true">${art}</svg>`;
}
function thumb(icon) {
  let g='';
  if(['poly','neg','tri','erase'].includes(icon)) g=glyph(icon,19,17,25,({poly:'#bd742e',neg:'#467295',tri:'#bf7135',erase:'#4b4a3d'})[icon],{count:3,rot:icon==='poly'});
  else if(icon==='dot'||icon==='pitch') {
    g='<path d="M8 25V17h10V9h12" stroke="#6b6858" stroke-width="2.2" fill="none"/>';
    for(const [i,[x,y]] of [[8,25],[18,17],[30,9]].entries()) g+=hex(x,y,icon==='pitch'?[3.9,2.7,1.9][i]:2.7,i===1?'#c45334':'#35362c');
  } else if(icon==='sym') g='<path d="M7 27V17h7v-8m16 18V17h-7v-8" stroke="#4e766c" stroke-width="2.4" fill="none"/><path d="M18.5 4v24" stroke="#898476" stroke-dasharray="2 2"/>';
  else if(icon==='mix') g='<circle cx="15" cy="14" r="6" fill="#e0523a" fill-opacity=".75"/><circle cx="22" cy="14" r="6" fill="#6fa76a" fill-opacity=".75"/><circle cx="18.5" cy="20" r="6" fill="#5282c8" fill-opacity=".72"/>';
  else g='<path d="M9 8v17c0 5 19 5 19 0V8" fill="none" stroke="#526561" stroke-width="1.7"/><ellipse cx="18.5" cy="8" rx="9.5" ry="3.5" fill="none" stroke="#526561" stroke-width="1.7"/><path d="M9 17c0 5 19 5 19 0" fill="none" stroke="#526561" stroke-width="1.7"/>';
  return `<svg viewBox="0 0 38 34" aria-hidden="true"><rect x="2" y="2" width="34" height="30" rx="4" fill="#e7e2d5" stroke="#cec7b7"/><path d="M8 7h22M8 17h22M8 27h22M8 7v20m11-20v20M30 7v20" stroke="#8e897a" stroke-opacity=".22"/>${g}</svg>`;
}
function hex(x,y,r,color,extra='') {
  const pts=Array.from({length:6},(_,i)=>[x+r*Math.cos(i*Math.PI/3),y+r*Math.sin(i*Math.PI/3)].join(',')).join(' ');
  return `<polygon points="${pts}" fill="${color}" ${extra}/>`;
}
const point=(x,y)=>`${view.left+x*view.step},${view.top+y*view.step}`;
const pointArr=(x,y)=>[view.left+x*view.step,view.top+y*view.step];
const center=c=>pointArr(c%panel.w+.5,Math.floor(c/panel.w)+.5);
function copies(n) {
  const [x,y]=xy(panel,n);
  return panel.wrap&&x===0?[[0,y],[panel.w,y]]:[[x,y]];
}
function dirMirror(dir) {
  if(panel.sym==='x'||panel.sym==='rot') {if(dir===0||dir===2)dir=(dir+2)%4;}
  if(['y','rot','shiftY'].includes(panel.sym)&&(dir===1||dir===3)) dir=(dir+2)%4;
  return dir;
}
function segments(a,b) {
  const [x,y]=xy(panel,a),[xx,yy]=xy(panel,b);
  if(!panel.wrap) return [[[x,y],[xx,yy]]];
  if(x===0&&xx===0) return [[[0,y],[0,yy]],[[panel.w,y],[panel.w,yy]]];
  if(Math.abs(x-xx)>1) return [[[x===0?panel.w:x,y],[xx===0?panel.w:xx,yy]]];
  return [[[x,y],[xx,yy]]];
}
function keyPosition(key) {
  const [t,value]=key.split(':');
  if(t==='n') return copies(+value).map(([x,y])=>pointArr(x,y));
  if(t==='c') return [center(+value)];
  if(t==='e') return segments(...value.split('-').map(Number)).map(([[x,y],[a,b]])=>pointArr((x+a)/2,(y+b)/2));
  return [];
}
function gridD(a,b,section=[0,1]) {
  return segments(a,b).map(([[x,y],[u,v]])=>`M${point(x+(u-x)*section[0],y+(v-y)*section[0])}L${point(x+(u-x)*section[1],y+(v-y)*section[1])}`).join('');
}
function pathD(line) {
  return line.slice(1).map((n,i)=>gridD(line[i],n)).join('');
}
function displayColor(c) {return paletteColor(lightColor(c,panel.light));}
function paintedTile(c,neg,opacity,preview=false) {
  const [x,y]=center(c),q=view.step;
  return `<rect x="${x-q*.455}" y="${y-q*.455}" width="${q*.91}" height="${q*.91}" rx="2.5" fill="${neg?'url(#hatch)':'#d78c31'}" fill-opacity="${opacity}" stroke="${neg?'#306896':'#9c561c'}" stroke-opacity="${preview?.75:Math.min(1,opacity+.18)}" stroke-width="1.5"${neg?' stroke-dasharray="4 3"':''}/>`;
}
function fillCells(at) {
  if(at===null||at===undefined||!fillShape.length) return [];
  const x=at%panel.w,y=Math.floor(at/panel.w);
  const cells=fillShape.map(([a,b])=>y+b<panel.h&&(panel.wrap||x+a<panel.w)?(y+b)*panel.w+mod(x+a,panel.w):-1);
  return cells.includes(-1)||cells.some(c=>panel.holes.includes(c))||new Set(cells).size!==cells.length?[]:cells;
}
function paintBoard() {
  const width=board.clientWidth,height=board.clientHeight;
  if(!width||!height) return;
  const ratio=width/height,H=470,W=H*ratio,step=Math.min((W-122)/panel.w,338/panel.h,96);
  view={step,left:(W-panel.w*step)/2,top:(H-panel.h*step)/2,W,H};
  if(step<=0) return;
  board.setAttribute('viewBox',`0 0 ${W} ${H}`);
  board.classList.toggle('photo-pan',mode==='trace'&&traceTool==='pan');
  board.classList.toggle('interactive',true);
  if(!board.hasAttribute('xmlns')) board.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const g=geometry(panel), q=step;
  const x=view.left,y=view.top,w=panel.w*q,h=panel.h*q,pad=30;
  let elems=`<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2 2-2m-2 8 8-8m-2 10 4-4" stroke="#386f9c" stroke-width="1.5"/></pattern><clipPath id="screen"><rect x="${x-pad}" y="${y-pad}" width="${w+pad*2}" height="${h+pad*2}" rx="9"/></clipPath></defs>`;
  elems+=`<rect x="${x-pad-6}" y="${y-pad-6}" width="${w+(pad+6)*2}" height="${h+(pad+6)*2}" rx="13" fill="#d8d2c4" stroke="#b4ae9d" stroke-width="1"/>
  <rect x="${x-pad}" y="${y-pad}" width="${w+pad*2}" height="${h+pad*2}" rx="9" fill="#eee9dc" stroke="#fbf7ec" stroke-width="1.2"/>`;
  if(photo&&safePhoto(photo.src)) {
    const iw=Math.max(w+pad*2,(h+pad*2)*photo.ratio)*photo.zoom, ih=iw/photo.ratio;
    const cx=W/2+photo.x*q, cy=H/2+photo.y*q;
    elems+=`<g clip-path="url(#screen)"><image href="${photo.src}" x="${cx-iw/2}" y="${cy-ih/2}" width="${iw}" height="${ih}" opacity="${photo.opacity}" transform="rotate(${photo.angle} ${cx} ${cy})" preserveAspectRatio="none"/></g>`;
  }
  const ticks=panel.wrap?`<path d="M${x-17} ${y-9}v${h+18}m${w+34} 0v-${h+18}" stroke="#8e7960" fill="none" stroke-dasharray="3 5" opacity=".8"/>`:'';
  elems+=ticks;
  const groupColors=['#b8cfb2','#d2a696','#d9c57b','#a2c7d1','#c9b0cc','#e6c49f'];
  if(drawRegions&&path.length>1) {
    const cuts=new Set(path.slice(1).map((n,i)=>ek(path[i],n)));
    if(g.sym) path.slice(1).forEach((n,i)=>cuts.add(ek(g.mirrors[path[i]],g.mirrors[n])));
    regions(panel,cuts).forEach((region,i)=>region.forEach(c=>{
      const [a,b]=center(c);elems+=`<rect x="${a-q/2+1}" y="${b-q/2+1}" width="${q-2}" height="${q-2}" fill="${groupColors[i%groupColors.length]}" opacity=".56"/>`;
    }));
  }
  for(const c of panel.holes) {
    const [a,b]=center(c);
    elems+=`<rect x="${a-q*.44}" y="${b-q*.44}" width="${q*.88}" height="${q*.88}" rx="3" fill="#bfb9ac" opacity=".55"/>`;
  }
  if(showMarks) for(const [c,mark] of Object.entries(marks)) {
    const [a,b]=center(+c);elems+=`<rect x="${a-q*.45}" y="${b-q*.45}" width="${q*.9}" height="${q*.9}" rx="2" fill="${displayColor(mark)}" opacity=".44"/>`;
  }
  const tally=new Map();
  for(const fill of fills) for(const c of fill.cells) {
    const [pos,neg]=tally.get(c)||[0,0];
    tally.set(c,fill.neg?[pos,neg+1]:[pos+1,neg]);
  }
  for(const [c,[pos,neg]] of tally) {
    const net=pos-neg;
    if(net) elems+=paintedTile(c,net<0,net<0?.65:.42);
    if(pos+neg>1) {
      const [a,b]=center(c),r=Math.min(9,q*.135);
      elems+=`<circle cx="${a+q*.29}" cy="${b-q*.29}" r="${r}" fill="${net<0?'#376c9a':net>0?'#986125':'#6f695a'}"/><text x="${a+q*.29}" y="${b-q*.29}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="${r*1.1}" fill="#fff9eb">${net}</text>`;
    }
  }
  if(mode==='trace'&&traceTool==='fill'&&hover?.cell!==null) for(const c of fillCells(hover?.cell)) elems+=paintedTile(c,fillNeg,.26,true);
  let rail='', cutRail='';
  const railWidth=Math.max(3.35,Math.min(7,q*.102));
  for(const [a,b] of pairs(panel)) {
    if(panel.gaps.includes(ek(a,b))) cutRail+=gridD(a,b,[0,.32])+gridD(a,b,[.68,1]);
    else if(g.edges.has(ek(a,b))||panel.blocked.includes(lk(a,b))||panel.blocked.includes(nk(a))||panel.blocked.includes(nk(b))) rail+=gridD(a,b);
  }
  elems+=`<path d="${rail+cutRail}" stroke="#615e50" stroke-opacity="${photo?.64:.79}" fill="none" stroke-width="${railWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const hot='#e7522c', cold='#4a85b1';
  const pathWidth=railWidth+1.5;
  const invalid=new Set(check?.invalid||[]), canceled=new Set(check?.cancelled||[]);
  const startSet=new Map(panel.starts.map(n=>[n,0]));
  const endSet=new Map(Object.entries(panel.ends).map(([n,d])=>[+n,[d,0]]));
  if(g.sym) {
    for(const n of panel.starts) if(!startSet.has(g.mirrors[n])) startSet.set(g.mirrors[n],2);
    for(const [n,d] of Object.entries(panel.ends)) if(!endSet.has(g.mirrors[+n])) endSet.set(g.mirrors[+n],[dirMirror(d),2]);
  }
  const showOther=mode==='build'||!panel.hidden||reveal;
  for(const [n,[d,line]] of endSet) if(line!==2||showOther) {
    for(const [a,b] of copies(n)) {
      const [dx,dy]=DIRS[d], at=point(a,b), tip=point(a+dx*.31,b+dy*.31);
      elems+=`<path d="M${at}L${tip}" fill="none" stroke="#615e50" stroke-opacity=".82" stroke-width="${railWidth}" stroke-linecap="round"/>`;
    }
  }
  for(const [n,line] of startSet) if(line!==2||showOther) for(const [a,b] of copies(n)) {
    const [at,bt]=pointArr(a,b);elems+=`<circle cx="${at}" cy="${bt}" r="${railWidth*1.65}" fill="${line===2?'#6d8c9d':'#696454'}"/>`;
  }
  const lines=path.length?(g.sym&&showOther?[path,path.map(n=>g.mirrors[n])]:[path]):[];
  lines.forEach((line,i)=>{
    const c=i?cold:hot,d=pathD(line);
    const start=line[0],end=line.at(-1),primary=path.at(-1);
    const endDir=panel.ends[primary];let endD='';
    if(endDir!==undefined) for(const [a,b] of copies(end)) {
      const [dx,dy]=DIRS[i?dirMirror(endDir):endDir];
      endD+=`M${point(a,b)}L${point(a+dx*.31,b+dy*.31)}`;
    }
    elems+=`<path d="${d+endD}" stroke="${c}" fill="none" stroke-width="${pathWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    for(const [a,b] of copies(start)) {
      const [at,bt]=pointArr(a,b);elems+=`<circle cx="${at}" cy="${bt}" r="${railWidth*1.7}" fill="${c}"/>`;
    }
    if(endDir===undefined&&end!==start) for(const [a,b] of copies(end)) {
      const [at,bt]=pointArr(a,b);elems+=`<circle cx="${at}" cy="${bt}" r="${railWidth*.68}" fill="${c}"/>`;
    }
  });
  for(const [c,clue] of Object.entries(panel.cells)) {
    const [a,b]=center(+c),s=Math.min(q*.53,41);
    if(fillSource===+c&&mode==='trace'&&traceTool==='fill') elems+=`<rect x="${a-s*.57}" y="${b-s*.57}" width="${s*1.14}" height="${s*1.14}" fill="none" stroke="#a34b26" stroke-width="1.4" rx="4"/>`;
    elems+=`<g opacity="${canceled.has(ck(c))?.24:1}">${glyph(clue.type,a,b,s,displayColor(clue.color),clue)}</g>`;
  }
  for(const [key,clue] of Object.entries(panel.dots)) for(const [a,b] of keyPosition(key)) {
    const radius=Math.max(4,railWidth*1.01)*(clue.pitch?dotscale[clue.pitch]:1);
    elems+=hex(a,b,radius,clue.line===1?'#ea9d58':clue.line===2?'#9bd4ee':'#2b2923',`stroke="#ece7d9" stroke-width="1.1" opacity="${canceled.has(key)?.27:1}"`);
  }
  if(showMarks) {
    for(const key of panel.required) for(const [a,b] of keyPosition(key)) elems+=`<circle cx="${a}" cy="${b}" r="9.5" fill="none" stroke="#326f59" stroke-width="2.7"/><circle cx="${a}" cy="${b}" r="2.2" fill="#326f59"/>`;
    for(const key of panel.blocked) for(const [a,b] of keyPosition(key)) elems+=`<circle cx="${a}" cy="${b}" r="8.4" fill="#eee4d4" stroke="#a13a28" stroke-width="2"/><path d="M${a-5} ${b+5}l10-10" stroke="#a13a28" stroke-width="2"/>`;
  }
  for(const k of invalid) for(const [a,b] of keyPosition(k)) elems+=`<circle cx="${a}" cy="${b}" r="${k.startsWith('c:')?Math.min(q*.32,22):11}" fill="none" stroke="#a52b18" stroke-width="2" stroke-dasharray="3 3"/>`;
  for(const k of canceled) for(const [a,b] of keyPosition(k)) elems+=`<path d="M${a-8} ${b+8}l16-16" stroke="#766f63" stroke-width="1.5"/>`;
  if(hover&&!drag) {
    const usingCell=mode==='build'&&cellTools.includes(tool)||mode==='trace'&&['mark','fill-remove'].includes(traceTool);
    const usingEdge=mode==='build'&&tool==='gap';
    const prediction=usingCell&&hover.cell!==null?center(hover.cell):usingEdge&&hover.edge?keyPosition(hover.edge)[0]:hover.key?keyPosition(hover.key)[0]:null;
    if(prediction&&(mode==='build'||mode==='trace'&&!['pan','fill','pencil'].includes(traceTool))) {
      const [a,b]=prediction;
      elems+=`<circle cx="${a}" cy="${b}" r="${usingCell?Math.min(q*.34,23):11}" fill="none" stroke="#a54425" stroke-opacity=".7" stroke-width="1.3" stroke-dasharray="3 3"/>`;
    }
  }
  if(cursor!==null&&document.activeElement===board) for(const [a,b] of copies(cursor)) {
    const [u,v]=pointArr(a,b);
    elems+=`<rect x="${u-9}" y="${v-9}" width="18" height="18" rx="4" fill="none" stroke="#8d301e" stroke-width="1.5"/>`;
  }
  board.innerHTML=elems;
}
function localPoint(e) {
  const matrix=board.getScreenCTM();
  if(!matrix) return null;
  const mean=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
  return [mean.x,mean.y];
}
function locate(a,b) {
  const {left,top,step}=view,x=(a-left)/step,y=(b-top)/step;
  const roundedX=Math.round(x),roundedY=Math.round(y);
  const cell=x>=0&&x<panel.w&&y>=0&&y<panel.h?Math.floor(y)*panel.w+Math.floor(x):null;
  const validNode=roundedX>=0&&roundedX<=panel.w&&roundedY>=0&&roundedY<=panel.h;
  const vertex=validNode?node(panel,roundedX,roundedY):null;
  const horizontal=Math.abs(y-roundedY)<=.34&&roundedY>=0&&roundedY<=panel.h&&x>=0&&x<panel.w;
  const vertical=Math.abs(x-roundedX)<=.34&&roundedX>=0&&roundedX<=panel.w&&y>=0&&y<panel.h;
  let edge=null;
  if(horizontal&&(!vertical||Math.abs(y-roundedY)<Math.abs(x-roundedX))) edge=lk(node(panel,Math.floor(x),roundedY),node(panel,Math.floor(x)+1,roundedY));
  else if(vertical) edge=lk(node(panel,roundedX,Math.floor(y)),node(panel,roundedX,Math.floor(y)+1));
  const distance=Math.hypot(x-roundedX,y-roundedY), key=validNode&&distance<=.30?nk(vertex):edge;
  return {vertex,key,cell,edge,distance};
}
function deferred(fn,{keepPath=true,keepSource=true}={}) {
  undoable();stop();fn();solutions=[];selected=0;check=null;status=null;
  if(!keepPath) path=[];
  if(!keepSource) fillSource=null;
  save();render();
}
function editAt(hit) {
  const {vertex,key,edge,cell}=hit;
  if(cellTools.includes(tool)) {
    if(cell===null||(tool!=='hole'&&panel.holes.includes(cell)))return;
    deferred(()=>{
      if(tool==='hole') {
        if(panel.holes.includes(cell)) panel.holes=panel.holes.filter(c=>c!==cell);
        else {panel.holes.push(cell);delete panel.cells[cell];}
        return;
      }
      const clue={type:tool,color};
      if(tool==='tri') clue.count=count;
      if(tool==='poly'||tool==='neg') Object.assign(clue,{shape:normalShape(shape),rot});
      panel.cells[cell]=clue;
    },{keepPath:false,keepSource:false});
  } else if(tool==='remove') {
    const actual=key&&key.startsWith('n:')?vertex:null;
    if(key===null&&cell===null)return;
    deferred(()=>{
      if(key&&Object.hasOwn(panel.dots,key)) delete panel.dots[key];
      else if(edge&&panel.gaps.includes(edge.slice(2))) panel.gaps=panel.gaps.filter(g=>g!==edge.slice(2));
      else if(actual!==null&&(panel.starts.includes(actual)||Object.hasOwn(panel.ends,actual))) {
        panel.starts=panel.starts.filter(n=>n!==actual);delete panel.ends[actual];
      } else if(cell!==null) {
        delete panel.cells[cell];panel.holes=panel.holes.filter(c=>c!==cell);
      }
    },{keepPath:false,keepSource:false});
  } else if(tool==='gap'&&edge) {
    const g=edge.slice(2);
    deferred(()=>{if(panel.gaps.includes(g))panel.gaps=panel.gaps.filter(k=>k!==g);else panel.gaps.push(g);},{keepPath:false});
  } else if(['dot','pitch'].includes(tool)&&key) {
    const clue={line,pitch:tool==='pitch'?pitch:0};
    deferred(()=>{if(panel.dots[key]?.line===clue.line&&panel.dots[key]?.pitch===clue.pitch)delete panel.dots[key];else panel.dots[key]=clue;},{keepPath:false});
  } else if(['start','end'].includes(tool)&&vertex!==null&&hit.distance<.55) {
    deferred(()=>{
      if(tool==='start') {
        if(panel.starts.includes(vertex)) panel.starts=panel.starts.filter(n=>n!==vertex);
        else panel.starts.push(vertex);
      } else {
        const [x,y]=xy(panel,vertex),d=exitDir>=0?exitDir:y===0?3:y===panel.h?1:x===0&&!panel.wrap?2:0;
        if(panel.ends[vertex]===d) delete panel.ends[vertex];else panel.ends[vertex]=d;
      }
    },{keepPath:false});
  }
}
function traceAt(hit) {
  if(traceTool==='fill') {
    if(hit.cell===null) return;
    const clue=panel.cells[hit.cell];
    if(fillSource===null&&clue&&['poly','neg'].includes(clue.type)) {
      fillSource=hit.cell;fillShape=structuredClone(clue.shape);fillNeg=clue.type==='neg';render();return;
    }
    const cells=fillCells(hit.cell);
    if(cells.length) deferred(()=>fills.push({cells,neg:fillNeg}));
    return;
  }
  if(traceTool==='fill-remove') {
    const at=fills.findLastIndex(f=>f.cells.includes(hit.cell));
    if(at>=0) deferred(()=>fills.splice(at,1));
    return;
  }
  if(traceTool==='mark'&&hit.cell!==null) {
    return deferred(()=>{if(marks[hit.cell]===color) delete marks[hit.cell];else marks[hit.cell]=color;});
  }
  if(['anchor','ban'].includes(traceTool)&&hit.key) {
    const field=traceTool==='anchor'?'required':'blocked',other=field==='blocked'?'required':'blocked';
    return deferred(()=>{
      if(panel[field].includes(hit.key)) panel[field]=panel[field].filter(k=>k!==hit.key);
      else {panel[field].push(hit.key);panel[other]=panel[other].filter(k=>k!==hit.key);}
    });
  }
}
function beginMove() {
  if(drag&&!drag.changed) {undoable();drag.changed=true;}
  else if(!drag) undoable();
  stop();check=null;status=null;solutions=[];selected=0;
}
function drawNode(n) {
  if(n===null||n===undefined) return false;
  const g=geometry(panel);
  if(path.length>1&&n===path.at(-2)) {
    beginMove();path.pop();paintBoard();return true;
  }
  if(path.length) {
    const visited=new Set(g.sym?[...path,...path.map(n=>g.mirrors[n])]:path);
    if(extendable(g,path,n,visited)) {beginMove();path.push(n);paintBoard();return true;}
  }
  if(panel.starts.includes(n)&&(!g.sym||g.mirrors[n]!==n)&&!g.blocked.has(nk(n))&&(!g.sym||!g.blocked.has(nk(g.mirrors[n])))) {
    if(path.length===1&&path[0]===n) return false;
    beginMove();path=[n];paintBoard();return true;
  }
  return false;
}
function finishDraw() {
  if(path.length>1&&Object.hasOwn(panel.ends,path.at(-1))) checkPath();
  save();ui();paintStatus();
}
const drawing=()=>mode==='solve'||mode==='trace'&&traceTool==='pencil';
board.addEventListener('pointerdown',e=>{
  if(e.button!==0||!view||drag) return;
  const pos=localPoint(e);if(!pos) return;
  cursor=null;const hit=locate(...pos);
  if(mode==='build') return editAt(hit);
  if(mode==='trace'&&traceTool==='pan'&&photo) {
    drag={kind:'pan',id:e.pointerId,pos,x:photo.x,y:photo.y,changed:false};
    board.setPointerCapture(e.pointerId);return;
  }
  if(!drawing()) return traceAt(hit);
  drag={kind:'draw',id:e.pointerId,pos,changed:false};
  board.setPointerCapture(e.pointerId);
  if(hit.distance<.48) drawNode(hit.vertex);
});
board.addEventListener('pointermove',e=>{
  if(!view) return;
  const pos=localPoint(e);if(!pos) return;
  if(drag?.id===e.pointerId&&drag.kind==='pan'&&photo) {
    if(!drag.changed) {undoable();drag.changed=true;}
    photo.x=Math.min(5,Math.max(-5,drag.x+(pos[0]-drag.pos[0])/view.step));
    photo.y=Math.min(5,Math.max(-5,drag.y+(pos[1]-drag.pos[1])/view.step));paintBoard();return;
  }
  if(drag?.id===e.pointerId&&drag.kind==='draw') {
    const from=drag.pos,delta=pos.map((n,i)=>n-from[i]),segments=Math.min(30,Math.max(1,Math.ceil(Math.hypot(...delta)/(view.step*.21))));
    for(let i=1;i<=segments;i++) {
      const hit=locate(from[0]+delta[0]*i/segments,from[1]+delta[1]*i/segments);
      if(hit.distance<.26&&hit.vertex!==path.at(-1)) {
        if(!path.length||geometry(panel).adjacent[path.at(-1)].includes(hit.vertex)) drawNode(hit.vertex);
      }
    }
    drag.pos=pos;return;
  }
  hover=locate(...pos);paintBoard();
});
function pointerEnd(e) {
  if(drag?.id!==e.pointerId)return;
  const task=drag;drag=null;
  if(task.kind==='draw'&&task.changed) finishDraw();
  if(task.kind==='pan') {save();ui();}
  paintBoard();
}
board.addEventListener('pointerup',pointerEnd);
board.addEventListener('pointercancel',pointerEnd);
board.addEventListener('pointerleave',()=>{hover=null;if(!drag)paintBoard();});
board.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey) return;
  const direction={ArrowRight:0,ArrowDown:1,ArrowLeft:2,ArrowUp:3}[e.key];
  if(direction!==undefined) {
    e.preventDefault();
    if(cursor===null) cursor=path.at(-1)??panel.starts[0]??0;
    const [x,y]=xy(panel,cursor),[dx,dy]=DIRS[direction];
    const a=x+dx,b=y+dy;
    if(b>=0&&b<=panel.h&&(panel.wrap||a>=0&&a<=panel.w)) {
      cursor=node(panel,a,b);
      if(drawing()&&path.length&&drawNode(cursor)) finishDraw();
    }
    paintBoard();return;
  }
  if(e.key==='Enter'||e.key===' ') {
    e.preventDefault();
    cursor??=panel.starts[0]??0;
    const [x,y]=xy(panel,cursor),cell=x<panel.w&&y<panel.h?y*panel.w+x:null;
    const hit={vertex:cursor,key:nk(cursor),cell,edge:null,distance:0};
    if(mode==='build') editAt(hit);else if(drawing()){if(drawNode(cursor))finishDraw();}else traceAt(hit);
  }
});
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')||e.altKey) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z') {e.preventDefault();action(e.shiftKey?'redo':'undo');}
  if(e.key==='Escape'&&worker){e.preventDefault();action('stop');}
});
new ResizeObserver(paintBoard).observe(board);
render();
