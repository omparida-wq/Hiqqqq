// Appearance tracking between neural-network responses. Correlation tolerates
// brightness changes, while inconsistent patches reject an object that has left.
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];};
function patch(frame,x,y){const {width:w,height:h,data}=frame,r=2;if(x<r||y<r||x>=w-r||y>=h-r)return null;const p=[];let sum=0,sq=0;for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const v=data[(y+j)*w+x+i];p.push(v);sum+=v;sq+=v*v;}return {p,sum,norm:Math.sqrt(Math.max(0,sq-sum*sum/25))};}
function correlation(a,b){if(!a||!b||a.norm<22||b.norm<22)return -1;let dot=0;for(let i=0;i<25;i++)dot+=a.p[i]*b.p[i];return (dot-a.sum*b.sum/25)/(a.norm*b.norm);}
function features(frame,[x,y,w,h]){const candidates=[];const step=Math.max(3,Math.floor(Math.min(w,h)/5));for(let py=Math.max(3,Math.round(y+h*.15));py<Math.min(frame.height-3,y+h*.85);py+=step)for(let px=Math.max(3,Math.round(x+w*.15));px<Math.min(frame.width-3,x+w*.85);px+=step){const p=patch(frame,px,py);if(p?.norm>60)candidates.push({x:px,y:py,p});}const points=[];for(const p of candidates.sort((a,b)=>b.p.norm-a.p.norm)){if(points.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>5))points.push(p);if(points.length===7)break;}return points;}
export function trackRegion(previous,current,box){
 if(!previous||previous.width!==current.width||previous.height!==current.height)return null;
 const points=features(previous,box);if(points.length<3)return null;
 const matches=[];
 for(const p of points){let best=-1,bx=p.x,by=p.y;
  if(correlation(p.p,patch(current,p.x,p.y))>.985){matches.push({x:p.x,y:p.y,nx:p.x,ny:p.y,dx:0,dy:0});continue;}
  for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){const score=correlation(p.p,patch(current,p.x+dx,p.y+dy))-.0005*(dx*dx+dy*dy);if(score>best){best=score;bx=p.x+dx;by=p.y+dy;}}
  if(best<.78)continue;
  matches.push({x:p.x,y:p.y,nx:bx,ny:by,dx:bx-p.x,dy:by-p.y});
 }
 if(matches.length<3)return {lost:true};
 const dx=median(matches.map(p=>p.dx)),dy=median(matches.map(p=>p.dy));
 const good=matches.filter(p=>Math.hypot(p.dx-dx,p.dy-dy)<2.6);if(good.length<3)return {lost:true};
 const ratios=[];for(let i=0;i<good.length;i++)for(let j=i+1;j<good.length;j++){const a=good[i],b=good[j],before=Math.hypot(a.x-b.x,a.y-b.y);if(before>10)ratios.push(Math.hypot(a.nx-b.nx,a.ny-b.ny)/before);}
 const scale=ratios.length?Math.max(.94,Math.min(1.06,median(ratios))):1;
 const [x,y,w,h]=box,nw=w*scale,nh=h*scale,b=[x+dx+(w-nw)/2,y+dy+(h-nh)/2,nw,nh];
 if(b[0]+b[2]<3||b[1]+b[3]<3||b[0]>current.width-3||b[1]>current.height-3)return {lost:true};
 return {box:b,confidence:good.length/points.length};
}
export function grayFrame(pixels,width,height,time){const data=new Uint8Array(width*height);for(let i=0;i<data.length;i++)data[i]=(pixels[i*4]*77+pixels[i*4+1]*150+pixels[i*4+2]*29)>>8;return {data,width,height,time};}
