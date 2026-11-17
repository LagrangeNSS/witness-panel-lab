import {fresh,node,ek,nk,lk,cellEdges} from './engine.mjs';

const square=(color)=>({type:'square',color});
const star=(color)=>({type:'star',color});
const tri=(count)=>({type:'tri',color:3,count});
const poly=(shape,rot=false,type='poly')=>({type,color:type==='poly'?3:5,shape,rot});
const route=(p,points)=>points.map(([x,y])=>node(p,x,y));
const dots=(p,points,line=0)=>Object.fromEntries(route(p,points).map(n=>[nk(n),{line,pitch:0}]));
const study=fresh();
const studyRoute=route(study,[[0,5],[1,5],[2,5],[2,4],[2,3],[3,3],[3,4],[4,4],[4,5],[5,5],[5,4],[5,3],[5,2],[5,1],[5,0]]);
study.cells={1:square(0),3:tri(1),7:star(0),8:square(0),11:tri(1),17:square(2),22:poly([[0,0],[0,1],[1,1]],true),23:star(2)};
delete study.cells[8];
const cuts=new Set(studyRoute.slice(1).map((n,i)=>ek(n,studyRoute[i])));
for(const c of [3,11]) {
  const count=cellEdges(study,c).filter(e=>cuts.has(e)).length;
  if(count) study.cells[c]=tri(count);else delete study.cells[c];
}
study.cells[9]=tri(1);
study.dots=dots(study,[[2,3],[4,4],[5,2]]);
study.gaps=[ek(node(study,1,0),node(study,1,1)),ek(node(study,3,1),node(study,4,1))];

const maze=fresh(5,4);
maze.dots=dots(maze,[[0,1],[2,2],[3,1],[5,2]]);
maze.gaps=[[[1,3],[1,4]],[[2,1],[2,2]],[[3,0],[4,0]],[[3,2],[4,2]],[[4,3],[5,3]]].map(([a,b])=>ek(...route(maze,[a,b])));
const twin=fresh(6,4);
twin.sym='x';
twin.ends={[node(twin,2,0)]:3};
twin.dots={...dots(twin,[[0,2],[1,2],[2,1]],1),...dots(twin,[[6,2],[5,2],[4,1]],2)};
const triangles=fresh(4,4);
const triangleRoute=route(triangles,[[0,4],[0,3],[1,3],[1,2],[0,2],[0,1],[1,1],[2,1],[2,2],[3,2],[3,1],[4,1],[4,0]]);
const triangleCuts=new Set(triangleRoute.slice(1).map((n,i)=>ek(n,triangleRoute[i])));
for(const cell of [0,4,5,7,8,11,12]) {
  const count=cellEdges(triangles,cell).filter(e=>triangleCuts.has(e)).length;
  if(count) triangles.cells[cell]=tri(count);
}
const neg=fresh(3,2);
neg.cells={0:poly([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],true),2:poly([[0,0],[1,0],[2,0]],false,'neg')};
const negEnd=node(neg,3,1);neg.ends={[negEnd]:0};
const erase=fresh(4,3);
erase.cells={0:square(0),1:square(0),4:square(2),5:{type:'erase',color:1},11:square(2)};
erase.dots=dots(erase,[[2,3],[2,1]]);
const sound=fresh(4,3);
sound.pitches=[1,3,2];sound.dots={
  [nk(node(sound,1,3))]:{pitch:1,line:0},[lk(node(sound,1,1),node(sound,1,0))]:{pitch:3,line:0},
  [nk(node(sound,3,1))]:{pitch:2,line:0}};
const pillar=fresh(6,3);
pillar.wrap=true;pillar.sym='shift';pillar.starts=[node(pillar,0,3)];pillar.ends={[node(pillar,5,0)]:3};
pillar.dots={...dots(pillar,[[5,3],[5,2]],1),...dots(pillar,[[2,3],[2,2]],2)};
pillar.cells={0:star(4),7:star(4),4:square(0),9:square(1)};
const chromatic=fresh(4,4);
chromatic.light=6;
chromatic.cells={0:square(2),4:square(0),5:square(2),6:square(6),9:square(5),12:square(0),15:square(5)};
chromatic.useLight=true;

export const presets=[
  {name:'swamp study',label:'swamp',icon:'poly',panel:study,path:studyRoute.slice(0,8)},
  {name:'broken maze',label:'maze',icon:'dot',panel:maze},
  {name:'symmetry',label:'mirror',icon:'sym',panel:twin},
  {name:'triangles',label:'triangles',icon:'tri',panel:triangles},
  {name:'subtraction',label:'subtract',icon:'neg',panel:neg},
  {name:'cancellation',label:'cancel',icon:'erase',panel:erase},
  {name:'sound sequence',label:'sound',icon:'pitch',panel:sound},
  {name:'cylindrical panel',label:'pillar',icon:'wrap',panel:pillar},
  {name:'chromatic filters',label:'color',icon:'mix',panel:chromatic},
];
