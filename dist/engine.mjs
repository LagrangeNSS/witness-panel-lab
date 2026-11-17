export const COLORS = ['#282822','#fffaf0','#ea542f','#e9ab35','#62a675','#4079b0','#a26cac','#55abb4'];
export const DIRS = [[1,0],[0,1],[-1,0],[0,-1]];
export const normalShape = cells => {
  if (!cells.length) return [];
  const x0 = Math.min(...cells.map(p=>p[0])), y0 = Math.min(...cells.map(p=>p[1]));
  return cells.map(([x,y])=>[x-x0,y-y0]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
};
export const rotateShape = cells => normalShape(cells.map(([x,y])=>[-y,x]));
export const stride = p => p.wrap ? p.w : p.w+1;
export const mod = (x,n) => (x%n+n)%n;
export const node = (p,x,y) => y*stride(p)+(p.wrap?mod(x,p.w):x);
export const xy = (p,n) => [n%stride(p),Math.floor(n/stride(p))];
export const ek = (a,b) => a<b ? a+'-'+b : b+'-'+a;
export const nk = a => 'n:'+a;
export const lk = (a,b) => 'e:'+ek(a,b);
export const ck = a => 'c:'+a;
export const paletteColor = color => COLORS[color] || (typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)?color:COLORS[0]);
export function lightColor(color, mask) {
  if (mask===7) return color;
  if (typeof color==='number') {
    return ['#282822','#e94e3b','#62a675','#e9ab35','#4079b0','#a26cac','#55abb4','#fffaf0'][[0,7,1,3,2,4,5,6][color]&mask];
  }
  const value=parseInt(color.slice(1),16);
  return '#'+(value & ((mask&1?0xff0000:0)|(mask&2?0xff00:0)|(mask&4?0xff:0))).toString(16).padStart(6,'0');
}
export const clueColor = (p,c) => p.useLight ? paletteColor(lightColor(c.color,p.light)) : paletteColor(c.color);
export function fresh(w=5,h=5) {
  const p={w,h,wrap:false,sym:'none',hidden:false,starts:[],ends:{},cells:{},dots:{},gaps:[],holes:[],
    required:[],blocked:[],pitches:[],pitches2:[],sound:'dots',light:7,useLight:false};
  p.starts=[node(p,0,h)]; p.ends[node(p,w,0)]=0;
  return p;
}
export function pairs(p) {
  const out=[];
  for(let y=0;y<=p.h;y++) for(let x=0;x<stride(p);x++) {
    const a=node(p,x,y);
    if(x<p.w) out.push([a,node(p,x+1,y),x,y,0]);
    if(y<p.h) out.push([a,node(p,x,y+1),x,y,1]);
  }
  return out;
}
export function mirror(p,n) {
  const [x,y]=xy(p,n), mx=p.wrap?mod(-x,p.w):p.w-x;
  switch(p.sym) {
    case 'x': return node(p,mx,y);
    case 'y': return node(p,x,p.h-y);
    case 'rot': return node(p,mx,p.h-y);
    case 'shift': return node(p,x+p.w/2,y);
    case 'shiftY': return node(p,x+p.w/2,p.h-y);
    default: return n;
  }
}
export function hitCells(p,key) {
  const [type,value]=key.split(':');
  if(type==='c') return [+value];
  const cell=(x,y)=>y>=0&&y<p.h&&(p.wrap||x>=0&&x<p.w)?y*p.w+mod(x,p.w):-1;
  const [a,b]=value.split('-').map(Number);
  const [x,y]=xy(p,a);
  if(type==='n') return [cell(x-1,y-1),cell(x,y-1),cell(x-1,y),cell(x,y)].filter(c=>c>=0);
  const [u,v]=xy(p,b);
  if(y!==v) return [cell(x-1,y),cell(x,y)].filter(c=>c>=0);
  const left=p.wrap&&u===p.w-1&&x===0?u:Math.min(x,u);
  return [cell(left,y-1),cell(left,y)].filter(c=>c>=0);
}
export function cellEdges(p,c) {
  const x=c%p.w,y=Math.floor(c/p.w);
  const a=node(p,x,y), b=node(p,x+1,y), d=node(p,x,y+1), e=node(p,x+1,y+1);
  return [ek(a,b),ek(b,e),ek(d,e),ek(a,d)];
}
export function geometry(p) {
  const count=stride(p)*(p.h+1), holes=new Set(p.holes), blocked=new Set(p.blocked);
  const gaps=new Set(p.gaps), adjacent=Array.from({length:count},()=>[]), edges=new Set();
  for(const [a,b] of pairs(p)) {
    const edge=ek(a,b), around=hitCells(p,'e:'+edge);
    if(gaps.has(edge)||blocked.has('e:'+edge)||blocked.has(nk(a))||blocked.has(nk(b))||
      (around.length&&around.every(c=>holes.has(c)))) continue;
    edges.add(edge); adjacent[a].push(b); adjacent[b].push(a);
  }
  return {count,holes,blocked,edges,adjacent,mirrors:Array.from({length:count},(_,i)=>mirror(p,i)),sym:p.sym!=='none'};
}
export function extendable(g, path, to, visited) {
  const at=path.at(-1);
  if(!g.edges.has(ek(at,to))||visited.has(to)) return false;
  if(!g.sym) return true;
  const other=g.mirrors[to];
  return other!==to && !visited.has(other) && g.edges.has(ek(g.mirrors[at],other));
}
function tracks(p,path,g) {
  const lines=g.sym?[path,path.map(n=>g.mirrors[n])]:[path];
  const hits=lines.map(line=>{
    const set=new Set(line.map(nk));
    for(let i=1;i<line.length;i++) set.add(lk(line[i-1],line[i]));
    return set;
  });
  const cuts=new Set(hits.flatMap(line=>Array.from(line).filter(k=>k.startsWith('e:')).map(k=>k.slice(2))));
  return {lines,hits,cuts};
}
export function regions(p,cuts,holes=new Set(p.holes)) {
  const result=[], seen=new Set(holes);
  for(let i=0;i<p.w*p.h;i++) {
    if(seen.has(i)) continue;
    const group=[i]; seen.add(i);
    for(let z=0;z<group.length;z++) {
      const c=group[z], x=c%p.w, y=Math.floor(c/p.w), bounds=cellEdges(p,c);
      for(const [dx,dy,k] of [[0,-1,0],[1,0,1],[0,1,2],[-1,0,3]]) {
        const xx=x+dx, yy=y+dy;
        if(yy<0||yy>=p.h||(!p.wrap&&(xx<0||xx>=p.w))||cuts.has(bounds[k])) continue;
        const other=yy*p.w+mod(xx,p.w);
        if(!seen.has(other)) { seen.add(other); group.push(other); }
      }
    }
    result.push(group);
  }
  return result;
}
function variants(c) {
  const forms=[normalShape(c.shape)];
  if(c.rot) for(let i=1;i<4;i++) {
    const turn=rotateShape(forms.at(-1)); forms.push(turn);
  }
  return [...new Map(forms.map(s=>[JSON.stringify(s),s])).values()];
}
function polyFits(p,group,pieces,ctx) {
  if(!pieces.length) return true;
  const total=pieces.reduce((n,c)=>n+(c.type==='neg'?-1:1)*c.shape.length,0);
  if(total!==group.length) return false;
  const hasNeg=pieces.some(c=>c.type==='neg'), area=p.w*p.h, base=new Int16Array(area);
  for(const c of group) base[c]=1;
  const maps=new Map();
  for(const piece of pieces) {
    const key=JSON.stringify(variants(piece));
    if(maps.has(key)) continue;
    const takes=new Map();
    for(const shape of variants(piece)) for(let y=0;y<p.h;y++) for(let x=0;x<p.w;x++) {
      const cells=shape.map(([dx,dy])=>y+dy<p.h&&(p.wrap||x+dx<p.w)?(y+dy)*p.w+mod(x+dx,p.w):-1);
      if(cells.some(c=>c<0||ctx.holes.has(c)||(!hasNeg&&!base[c]))||new Set(cells).size!==cells.length) continue;
      const sorted=cells.sort((a,b)=>a-b);
      takes.set(sorted.join(','),sorted);
    }
    maps.set(key,[...takes.values()]);
  }
  const items=pieces.map(c=>({sign:c.type==='neg'?-1:1,options:maps.get(JSON.stringify(variants(c)))}));
  if(items.some(i=>!i.options.length)) return false;
  let order;
  if(hasNeg) {
    order=items.sort((a,b)=>a.sign-b.sign||a.options.length-b.options.length);
    const demand=base.slice();
    function signed(i) {
      ctx.tick();
      if(i===order.length) return demand.every(c=>c===0);
      const {sign,options}=order[i];
      if(sign<0) {
        for(const choice of options) {
          for(const c of choice) demand[c]++;
          if(signed(i+1)) return true;
          for(const c of choice) demand[c]--;
        }
        return false;
      }
      const optionsByCell=order.slice(i).map(item=>item.options.filter(opt=>opt.every(c=>demand[c]>0)));
      if(optionsByCell.some(o=>!o.length)) return false;
      const j=optionsByCell.reduce((a,o,b)=>o.length<optionsByCell[a].length?b:a,0)+i;
      [order[i],order[j]]=[order[j],order[i]];
      for(const choice of optionsByCell[j-i]) {
        for(const c of choice) demand[c]--;
        if(signed(i+1)) return true;
        for(const c of choice) demand[c]++;
      }
      [order[i],order[j]]=[order[j],order[i]];
      return false;
    }
    return signed(0);
  }
  function tile(remaining,left) {
    ctx.tick();
    if(!left) return true;
    let best=null;
    for(const c of group) {
      if(!base[c]) continue;
      const options=[];
      for(const i of remaining) for(const opt of items[i].options) {
        if(opt.includes(c)&&opt.every(n=>base[n])) options.push([i,opt]);
      }
      if(!options.length) return false;
      if(!best||options.length<best.length) best=options;
      if(best.length===1) break;
    }
    for(const [i,opt] of best) {
      for(const c of opt) base[c]=0;
      if(tile(remaining.filter(j=>j!==i),left-1)) return true;
      for(const c of opt) base[c]=1;
    }
    return false;
  }
  return tile(items.map((_,i)=>i),items.length);
}
function pitchValues(p,line,dots,which) {
  if(p.sound==='rows') {
    if(line.length<2) return [];
    const result=[];
    for(let i=1;i<line.length;i++) {
      const [x,y]=xy(p,line[i]),[prevX]=xy(p,line[i-1]);
      if(x!==prevX) result.push(y===0?3:y===p.h?1:2);
    }
    return result;
  }
  const result=[];
  const add=k=>{const d=dots[k];if(d?.pitch&&(!d.line||d.line===which)) result.push(d.pitch);};
  for(let i=0;i<line.length;i++) {
    if(i) add(lk(line[i-1],line[i]));
    add(nk(line[i]));
  }
  return result;
}
const same = (a,b) => a.length===b.length&&a.every((n,i)=>n===b[i]);
function assess(p,path,g,ctx) {
  const {lines,hits,cuts}=tracks(p,path,g);
  const groups=regions(p,cuts,g.holes);
  const miss=Object.entries(p.dots).filter(([key,c])=>!(c.line?hits[c.line-1]?.has(key):hits.some(h=>h.has(key))));
  const badRequired=p.required.filter(key=>!hits.some(h=>h.has(key)));
  const soundFailed=(p.pitches.length&&!same(p.pitches,pitchValues(p,lines[0],p.dots,1)))||
    (p.pitches2.length&&(!lines[1]||!same(p.pitches2,pitchValues(p,lines[1],p.dots,2))));
  const baseFailures=[...badRequired,...(soundFailed?['sound']:[])];
  if(ctx.fast&&baseFailures.length) return {ok:false};
  const groupMap=new Map();
  groups.forEach((group,i)=>{ for(const c of group) groupMap.set(c,i); });
  const groupClues=groups.map(group=>group.flatMap(c=>p.cells[c]?[{...p.cells[c],id:ck(c),c}]:[]));
  const badDots=new Map();
  for(const [key] of miss) {
    const adjacent=[...new Set(hitCells(p,key).map(c=>groupMap.get(c)).filter(i=>i!==undefined))];
    const eligible=adjacent.filter(i=>groupClues[i].some(c=>c.type==='erase'));
    if(!eligible.length) baseFailures.push(key);
    else badDots.set(key,eligible);
  }
  if(ctx.fast&&baseFailures.length) return {ok:false};
  const spent=[];
  function inspect(group,clues) {
    const invalid=new Set();
    const squares=clues.filter(c=>c.type==='square');
    if(new Set(squares.map(c=>clueColor(p,c))).size>1) for(const c of squares) invalid.add(c.id);
    const colors=new Map();
    for(const c of clues) if(c.color!==null&&c.color!==undefined) {
      const color=clueColor(p,c);
      colors.set(color,(colors.get(color)||0)+1);
    }
    for(const c of clues) {
      if(c.type==='star'&&colors.get(clueColor(p,c))!==2) invalid.add(c.id);
      if(c.type==='tri'&&cellEdges(p,c.c).filter(e=>cuts.has(e)).length!==c.count) invalid.add(c.id);
      if(c.type==='miss') invalid.add(c.id);
    }
    const polys=clues.filter(c=>c.type==='poly'||c.type==='neg');
    if(!invalid.size || clues.some(c=>c.type==='erase')) {
      let fits=true;
      if(polys.length) {
        const key=group.slice().sort((a,b)=>a-b).join(',')+'|'+polys.map(c=>c.id).join(',');
        fits=ctx.polyCache.get(key);
        if(fits===undefined) {
          fits=polyFits(p,group,polys,ctx);
          if(ctx.polyCache.size<20000) ctx.polyCache.set(key,fits);
        }
      }
      if(!fits) for(const c of polys) invalid.add(c.id);
    }
    return invalid;
  }
  function cancel(group,clues,seen) {
    ctx.tick();
    const key=clues.map(c=>c.id).join(',');
    if(seen.has(key)) return null;
    seen.add(key);
    const erasers=clues.filter(c=>c.type==='erase'), bad=inspect(group,clues);
    if(!erasers.length) return bad.size?null:[];
    if(erasers.length<clues.filter(c=>c.type==='miss').length) return null;
    for(const eraser of erasers) {
      const targets=clues.filter(c=>bad.has(c.id)||(c.type==='erase'&&c!==eraser));
      const without=clues.filter(c=>c!==eraser);
      if(!targets.length) {
        const after=inspect(group,without);
        targets.push(...without.filter(c=>after.has(c.id)));
      }
      for(const target of targets) {
        const rest=cancel(group,without.filter(c=>c!==target),seen);
        if(rest) return [eraser.id,target.id,...rest];
      }
    }
    return null;
  }
  const originals=groupClues.map(c=>[...c]);
  let detail=[];
  function assign(dots,i) {
    ctx.tick();
    if(i<dots.length) {
      const [key,spaces]=dots[i];
      for(const j of spaces) {
        groupClues[j].push({type:'miss',id:key});
        if(assign(dots,i+1)) return true;
        groupClues[j].pop();
      }
      return false;
    }
    const failures=[], used=[];
    for(let j=0;j<groups.length;j++) {
      const clues=groupClues[j];
      if(!clues.length) continue;
      const bad=inspect(groups[j],clues);
      if(clues.some(c=>c.type==='erase')) {
        const result=cancel(groups[j],clues,new Set());
        if(result) used.push(...result);
        else failures.push(...bad,...clues.filter(c=>c.type==='erase').map(c=>c.id));
      } else if(bad.size) failures.push(...bad);
      if(ctx.fast&&failures.length) return false;
    }
    detail=failures;
    if(!failures.length) {spent.push(...used);return true;}
    return false;
  }
  const success=assign([...badDots],0);
  if(!success&&!detail.length&&!ctx.fast) detail=[...badDots.keys(),...originals.flat().filter(c=>c.type==='erase').map(c=>c.id)];
  return {ok:success&&!baseFailures.length,invalid:[...new Set([...baseFailures,...detail])],cancelled:spent,groups};
}
function context(g,limit,fast) {
  const end=performance.now()+limit;
  let ticks=0;
  return {holes:g.holes,polyCache:new Map(),fast,tick(){
    if((++ticks&127)===0&&performance.now()>end) throw new Error('limit');
  }};
}
export function validate(p,path,limit=450) {
  const g=geometry(p);
  if(!path.length||!p.starts.includes(path[0])||!Object.hasOwn(p.ends,path.at(-1))) return {ok:false,partial:true};
  const visited=new Set([path[0],g.mirrors[path[0]]]);
  if((g.sym&&g.mirrors[path[0]]===path[0])||g.blocked.has(nk(path[0]))||(g.sym&&g.blocked.has(nk(g.mirrors[path[0]])))) return {ok:false,invalid:['path']};
  for(let i=1;i<path.length;i++) {
    if(!extendable(g,[path[i-1]],path[i],visited)) return {ok:false,invalid:['path']};
    visited.add(path[i]); if(g.sym) visited.add(g.mirrors[path[i]]);
  }
  try{return assess(p,path,g,context(g,limit,false));}catch(e){if(e.message==='limit') return {ok:false,limited:true};throw e;}
}
export function solve(p,{limit=14000,max=18,startPath=[],skip=[],linked=[],progress=()=>{}}={}) {
  const g=geometry(p), ctx=context(g,limit,true);
  const others=linked.map(panel=>({panel,geometry:geometry(panel)}));
  for(const other of others) other.context=context(other.geometry,limit,true);
  const ends=Object.keys(p.ends).map(Number).filter(n=>others.every(({panel})=>Object.hasOwn(panel.ends,n)));
  const startAllowed=s=>others.every(({panel,geometry})=>panel.starts.includes(s)&&
    !geometry.blocked.has(nk(s))&&(!geometry.sym||!geometry.blocked.has(nk(geometry.mirrors[s]))));
  for(const edge of g.edges) if(others.some(({geometry})=>!geometry.edges.has(edge))) g.edges.delete(edge);
  const visited=new Set(), path=[], found=[], skipped=new Set(skip.map(a=>a.join(',')));
  let explored=0,last=performance.now();
  const erasers=Object.values(p.cells).some(c=>c.type==='erase');
  const need=Object.entries(p.dots).filter(([_,c])=>!erasers||c.pitch&&(p.pitches.length||p.pitches2.length));
  const distance=n=>{
    const [x,y]=xy(p,n);
    return Math.min(...ends.map(e=>{const [a,b]=xy(p,e),dx=Math.abs(a-x);return (p.wrap?Math.min(dx,p.w-dx):dx)+Math.abs(b-y);}));
  };
  const ordered=g.adjacent.map(neighbors=>neighbors.slice().sort((a,b)=>distance(a)-distance(b)));
  const triangles=erasers?[]:Object.entries(p.cells).filter(([,c])=>c.type==='tri').map(([i,c])=>[cellEdges(p,+i),c.count]);
  const edgeTrace=new Set();
  const push=n=>{
    if(path.length) {
      edgeTrace.add(ek(path.at(-1),n));
      if(g.sym) edgeTrace.add(ek(g.mirrors[path.at(-1)],g.mirrors[n]));
    }
    path.push(n); visited.add(n); if(g.sym) visited.add(g.mirrors[n]);
  };
  const pop=()=>{
    const n=path.pop();
    if(path.length) {
      edgeTrace.delete(ek(path.at(-1),n));
      if(g.sym) edgeTrace.delete(ek(g.mirrors[path.at(-1)],g.mirrors[n]));
    }
    visited.delete(n); if(g.sym) visited.delete(g.mirrors[n]);
  };
  function visit() {
    ctx.tick(); explored++;
    if((explored&4095)===0&&performance.now()-last>260) {last=performance.now();progress({explored});}
    const at=path.at(-1);
    if(triangles.some(([edges,count])=>edges.filter(e=>edgeTrace.has(e)).length>count)) return false;
    if(ends.includes(at)) {
      const t=tracks(p,path,g);
      if(need.every(([k,c])=>(c.line?t.hits[c.line-1]?.has(k):t.hits.some(h=>h.has(k))))&&
        !skipped.has(path.join(','))&&assess(p,path,g,ctx).ok&&
        others.every(o=>assess(o.panel,path,o.geometry,o.context).ok)) {
        const result=path.slice(); found.push(result);progress({explored,solution:result});
        if(found.length>=max) return true;
      }
    }
    for(const next of ordered[at]) {
      if(!extendable(g,path,next,visited)) continue;
      push(next);
      if(visit()) return true;
      pop();
    }
    return false;
  }
  if(!ends.length) return {found,explored,complete:true};
  try {
    const starts=startPath.length?[startPath[0]]:p.starts;
    for(const s of starts) {
      if(!p.starts.includes(s)||!startAllowed(s)||g.blocked.has(nk(s))||(g.sym&&(g.mirrors[s]===s||g.blocked.has(nk(g.mirrors[s]))))) continue;
      push(s);
      let valid=true;
      for(const n of startPath.slice(1)) {
        if(!extendable(g,path,n,visited)) { valid=false;break; }
        push(n);
      }
      if(valid&&visit()) return {found,explored,complete:false,capped:true};
      while(path.length) pop();
    }
    return {found,explored,complete:true};
  } catch(e) {
    if(e.message==='limit') return {found,explored,complete:false,limited:true};
    throw e;
  }
}
export function sanitize(src) {
  if(!src||!Number.isInteger(src.w)||!Number.isInteger(src.h)||src.w<1||src.w>10||src.h<1||src.h>10) throw new Error('Invalid panel');
  const p=fresh(src.w,src.h);
  p.wrap=Boolean(src.wrap)&&p.w>=3;
  p.sym=['x','y','rot','shift','shiftY'].includes(src.sym)?src.sym:'none';
  if(p.sym.startsWith('shift')&&(!p.wrap||p.w%2)) p.sym='none';
  const len=stride(p)*(p.h+1), num=(n,end)=>Number.isInteger(n)&&n>=0&&n<end;
  const list=(a,filter)=>Array.isArray(a)?[...new Set(a.filter(filter))]:[];
  const entries=obj=>obj&&typeof obj==='object'?Object.entries(obj):[];
  const edges=new Set(pairs(p).map(([a,b])=>ek(a,b)));
  const clueKey=(k)=>typeof k==='string'&&((/^n:\d+$/.test(k)&&num(+k.slice(2),len))||(k.startsWith('e:')&&edges.has(k.slice(2))));
  const color=(c,fallback=0)=>num(c,COLORS.length)||(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))?c:fallback;
  p.starts=list(src.starts,n=>num(n,len));
  p.ends=Object.fromEntries(entries(src.ends).filter(([n,d])=>/^\d+$/.test(n)&&num(+n,len)&&num(d,4)));
  p.gaps=list(src.gaps,k=>edges.has(k)); p.holes=list(src.holes,c=>num(c,p.w*p.h));
  p.required=list(src.required,clueKey);p.blocked=list(src.blocked,clueKey);
  p.hidden=Boolean(src.hidden);p.useLight=Boolean(src.useLight);
  p.light=num(src.light,8)?src.light:7;
  p.sound=src.sound==='rows'?'rows':'dots';
  p.pitches=Array.isArray(src.pitches)?src.pitches.filter(n=>num(n-1,3)).slice(0,121):[];
  p.pitches2=Array.isArray(src.pitches2)?src.pitches2.filter(n=>num(n-1,3)).slice(0,121):[];
  for(const [key,c] of entries(src.dots)) if(clueKey(key)&&c&&typeof c==='object') {
    p.dots[key]={line:num(c.line,3)?c.line:0,pitch:num(c.pitch,4)?c.pitch:0};
  }
  for(const [key,c] of entries(src.cells)) {
    if(!/^\d+$/.test(key)||!num(+key,p.w*p.h)||p.holes.includes(+key)||!c||typeof c!=='object') continue;
    if(!['square','star','tri','poly','neg','erase'].includes(c.type)) continue;
    const clue={type:c.type,color:color(c.color)};
    if(c.type==='tri') clue.count=num(c.count-1,3)?c.count:1;
    if(c.type==='poly'||c.type==='neg') {
      const shape=new Map();
      if(Array.isArray(c.shape)) for(const point of c.shape) {
        if(Array.isArray(point)&&num(point[0],5)&&num(point[1],5)) shape.set(point.slice(0,2).join(','),point.slice(0,2));
      }
      if(!shape.size) continue;
      clue.shape=normalShape([...shape.values()]);clue.rot=Boolean(c.rot);
    }
    p.cells[key]=clue;
  }
  return p;
}
