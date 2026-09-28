import { activeGlyphRamp } from './character-sets.js';
import { fillSpatialUniforms } from './spatial.js';
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const fract = x => x - Math.floor(x);
const mod = (x, n) => x - Math.floor(x / n) * n;
const mix = (a,b,t) => a.map((v,i) => v + (b[i]-v)*t);
const add = (a,b) => a.map((v,i) => v+b[i]);
const mul = (a,b) => a.map(v => v*b);
const dot = (a,b) => a.reduce((n,v,i) => n+v*b[i], 0);
const normal = a => mul(a,1/Math.max(0.00001,Math.hypot(...a)));
const LUMA = [0.2126,0.7152,0.0722];
const fogColor = [0.065,0.095,0.17];

// Small CPU reference for explicit Canvas mode; the existing global software
// density budget bounds its cost. The DDA is exported for geometric fixtures.
export function traceSpatialRay(ro, rd, map, farLimit = 40) {
    const cell = [Math.floor(ro[0]),Math.floor(ro[2])];
    const step = [rd[0]>=0?1:-1,rd[2]>=0?1:-1];
    const delta = [1/Math.max(0.00001,Math.abs(rd[0])),1/Math.max(0.00001,Math.abs(rd[2]))];
    const side = [(step[0]*(cell[0]-ro[0])+step[0]*0.5+0.5)*delta[0],(step[1]*(cell[1]-ro[2])+step[1]*0.5+0.5)*delta[1]];
    let entered=0, n=[0,0,-step[1]];
    const hit = (distance,normal,material) => ({distance,normal,point:add(ro,mul(rd,distance)),material});
    for(let i=0;i<64;i++) {
        const [height,material]=map(cell[0],cell[1]);
        const exit=Math.min(...side), atEntry=ro[1]+rd[1]*entered;
        if(height>0) {
            if(atEntry>=0&&atEntry<=height&&entered>0.001) return hit(entered,n,material);
            if(rd[1]<-0.00001&&atEntry>height) {
                const top=(height-ro[1])/rd[1];
                if(top>=entered&&top<=exit&&top<farLimit) return hit(top,[0,1,0],material);
            }
        }
        if(side[0]<side[1]) {entered=side[0];side[0]+=delta[0];cell[0]+=step[0];n=[-step[0],0,0];}
        else {entered=side[1];side[1]+=delta[1];cell[1]+=step[1];n=[0,0,-step[1]];}
        if(entered>=farLimit)break;
    }
    return hit(farLimit,[0,0,0],0);
}
export function createSpatialSampler(p, sample, aspect, time) {
    const mode=p.visualMode;
    const hash=(x,z)=>fract((Math.floor(x)*17+Math.floor(z)*43+p.sceneSeed*13)/97);
    const map=(x,zz)=> {
        const z=mod(zz,32);
        if(Math.abs(x)>24)return [0,0];
        if(mode==='corridor')return x< -2||x>2?[4,2]:[0,0];
        if(mode==='cathedral')return Math.abs(x)>6?[7,1]:Math.abs(x)>2&&mod(z,5)<1?[6,3]:[0,0];
        if(mode==='coast'&&x<2)return [0,0];
        if(Math.abs(x)<3||mod(z,8)<2||mod(x+3,8)<2)return [0,0];
        return mode==='relief'?[0.15+dot(sample(fract(x/16),fract(z/32)),LUMA)*p.sceneRelief,4]:[1.4+hash(x,z)*6,1];
    };
    const mapped=(u,v,surfaceAspect=1)=>{
        let uv=[fract(u),fract(v)]; const ratio=(sample.aspect||aspect)/surfaceAspect;
        if(p.sceneMediaFit!=='repeat'){
            const f=p.sceneMediaFit==='fit'?Math.max:Math.min;
            uv=[(uv[0]-.5)*f(1,1/ratio)+.5,(uv[1]-.5)*f(1,ratio)+.5];
            if(uv.some(c=>c<0||c>1))return [.01,.01,.01];
        }
        return sample(...uv);
    };
    const sky=rd=>{
        const color=mix([.035,.065,.15],[.18,.04,.19],Math.exp(-Math.abs(rd[1])*9));
        const star=hash(Math.floor(rd[0]*120/Math.max(.1,rd[1])),Math.floor(rd[2]*120/Math.max(.1,rd[1])))>.989&&rd[1]>.15?.45:0;
        return color.map(v=>v+star);
    };
    const surface=h=>{
        const [x,y,z]=h.point, side=Math.abs(h.normal[0])>.5?z:x;
        const wx=fract(side*3),wy=fract(y*2.5), lit=hash(mod(side,32)*3,y*2.5)>.32&&wx>.18&&wx<.76&&wy>.18&&wy<.72&&h.normal[1]<.5;
        const tint=mix([.03,.62,.95],[1,.16,.46],hash(x-h.normal[0]*.001,mod(z-h.normal[2]*.001,32)));
        const light=(.25+.6*Math.max(0,dot(h.normal,normal([-.6,.8,-.4]))))*p.sceneLight;
        const sy=clamp(y/.7),contact=.45+.55*sy*sy*(3-2*sy);
        const glow=Math.exp(-Math.hypot(wx-.47,wy-.45)*5)*p.sceneGlow*.25;
        let color=add(mul([.16,.2,.29],light*contact),mul(tint,((lit?.85:0)+glow)*p.sceneGlow*(.85+.15*Math.sin(time*.8+hash(mod(side,32)*3,y*2.5)*6.28))));
        const media=h.normal[1]>.5?mapped(x*.125,z*.125):mapped(side*.125,1-y*.25,2);
        color=mix(color,mul(media,.5+light),p.sceneMedia);
        if(h.material===3)color=add(color,mul(tint,.25*p.sceneGlow));
        return {color:mix(color,fogColor,1-Math.exp(-h.distance*p.sceneFog)),glyph:lit?6:5};
    };
    const orbitalDistance=point=>{
        const t=time*.3,center=[Math.sin(t)*.9,Math.cos(t*.7)*.4,0];
        return Math.min(Math.hypot(...point.map((n,i)=>n-center[i]))-.95,Math.hypot(Math.hypot(point[0],point[2])-1.65,point[1])-.22);
    };
    return (u,v)=>{
        if(mode==='orbitals'){
            const plane=Math.tan(p.sceneFov*Math.PI/360);
            const ro=[0,p.sceneHeight-.6,-5],rd=normal([(u*2-1)*plane,(1-v*2)*plane/aspect,1]);let t=0;
            for(let i=0;i<48;i++){
                const point=add(ro,mul(rd,t)),d=orbitalDistance(point);
                if(d<.006){
                    const n=normal([0,1,2].map(axis=>orbitalDistance(point.map((v,i)=>v+(axis===i?.01:0)))-d));
                    const light=.2+Math.max(0,dot(n,normal([-.4,.8,-.6]))),bands=.5+.5*Math.sin(point[1]*18+time);
                    return {color:mix(mul(mix([.08,.8,.98],[1,.12,.6],bands),light*p.sceneLight),mapped(point[0]*.25+.5,.5-point[1]*.25),p.sceneMedia),glyph:5};
                } t+=Math.max(.004,d);if(t>14)break;
            }return {color:mix(sky(rd),mul(sample(u,v),.55),p.sceneMedia),glyph:7};
        }
        const weave=p.sceneRoute==='weave',angle=(weave?Math.sin(time*.14)*.32:0)+(p.sceneRoute==='orbit'?time*.25:0);
        const ro=[.5+(weave?Math.sin(time*.22)*.85:0),p.sceneHeight,mod(time,32)+.5];
        const plane=Math.tan(p.sceneFov*Math.PI/360),qx=(u*2-1)*plane,qy=(1-v*2)*plane/aspect;
        const rd=[Math.sin(angle)+Math.cos(angle)*qx,qy,Math.cos(angle)-Math.sin(angle)*qx];
        const h=traceSpatialRay(ro,rd,map);let distance=h.distance,result=h.material?surface(h):{color:sky(rd),glyph:7};
        if(rd[1]<-.0001){
            const t=-ro[1]/rd[1];if(t<h.distance){
                distance=t;const fp=add(ro,mul(rd,t)),lane=Math.abs(fp[0]-.5)<.045&&mod(fp[2],4)<1.6?.25:0,grid=fract(fp[0])<.025||fract(fp[2])<.025?.08:0;
                let color=mix([.07+lane,.1+lane*.7,.15+grid],mul(mapped(fp[0]*.125,fp[2]*.125),.55),p.sceneMedia);
                if(p.sceneWet>0){
                    const ripple=Math.sin(fp[2]*12.566370614+time*3)*Math.sin(fp[0]*12-time)*.018;
                    const reflectionRay=[rd[0]+ripple,-rd[1],rd[2]],reflection=traceSpatialRay(add(fp,[0,.015,0]),reflectionRay,map,Math.max(.1,40-t));
                    color=mix(color,reflection.material?surface(reflection).color:sky(reflectionRay),p.sceneWet*(.25+.65*(1-Math.min(1,Math.abs(normal(rd)[1])))**3));
                } result={color:mix(color,fogColor,1-Math.exp(-t*p.sceneFog)),glyph:4};
            }
        }
        if((mode==='corridor'||mode==='cathedral')&&rd[1]>.0001){
            const t=((mode==='cathedral'?7:4)-ro[1])/rd[1];if(t>0&&t<distance){distance=t;const point=add(ro,mul(rd,t)),rib=mod(mod(point[2],32),5)<.12?.45:0;result={color:mix([.08+rib*.3,.13+rib*.65,.2+rib],mul(mapped(point[0]*.125,point[2]*.125),.8),p.sceneMedia),glyph:5};}
        }
        if(p.sceneRain>0)for(let i=0;i<4;i++){
            const depth=3+i*5;if(depth>=distance)continue;const point=add(ro,mul(rd,depth)),drop=hash(point[0]*3,mod(point[2],32)*3),stroke=fract(point[1]*.7+time*2.5+drop);
            if(drop>1-p.sceneRain*.25&&fract(point[0]*3)<.06&&stroke>.62)result={color:add(result.color,mul([.3,.5,.7],1-depth/40)),glyph:1};
        }
        return result;
    };
}
export function renderSpatialCells(p, pixels, sw, sh, cols, rows, process, state, now) {
    const length=cols*rows*4;
    if(state.cells?.length!==length){state.cells=new Uint8ClampedArray(length);state.history=new Float32Array(length);state.nextHistory=new Float32Array(length);state.clock={};}
    const uniforms=state.uniforms ||= new Float32Array(36);
    fillSpatialUniforms(uniforms,p,cols,rows,[...activeGlyphRamp(p)].length,state.clock,now);
    const sample=(u,v)=>{
        const x=Math.min(sw-1,Math.floor(clamp(u)*sw)),y=Math.min(sh-1,Math.floor(clamp(v)*sh)),i=(y*sw+x)*4;
        return [pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255];
    };sample.aspect=sw/sh;
    const scene=createSpatialSampler(p,sample,uniforms[17],uniforms[2]),base=uniforms[22],total=uniforms[23];
    const old=(u,v)=>{if(!uniforms[21]||u<0||v<0||u>=1||v>=1)return [0,0,0,0];const i=(Math.floor(v*rows)*cols+Math.floor(u*cols))*4;return Array.from(state.history.subarray(i,i+4));};
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const u=(x+.5)/cols,v=(y+.5)/rows,spatial=p.visualMode!=='flat';
        const result=spatial?scene(u,v):{color:sample(u,v),glyph:0};
        const processed=process(result.color.map(n=>Math.round(clamp(n)*255)),x,y);
        let color=processed.slice(0,3).map(n=>n/255),alpha=(processed[3]??dot(processed.slice(0,3),LUMA))/255;
        if(uniforms[35])alpha=Math.min(.999,alpha)*base/total;
        if(spatial&&p.sceneMaterialGlyphs&&mod(x+y*3,16)/16>=p.sceneMedia&&dot(color,LUMA)>.075)alpha=uniforms[24+result.glyph];
        if(!spatial&&p.edgeAmount>0){
            const gx=dot(sample(u+1/cols,v).map((n,i)=>n-sample(u-1/cols,v)[i]),LUMA),gy=dot(sample(u,v+1/rows).map((n,i)=>n-sample(u,v-1/rows)[i]),LUMA);
            const strength=Math.hypot(gx,gy),threshold=.35+(.045-.35)*p.edgeAmount,previous=old(u,v);
            if(strength>threshold){alpha=uniforms[24+(Math.abs(gx)>Math.abs(gy)*2?1:Math.abs(gy)>Math.abs(gx)*2?0:gx*gy>0?3:2)];if(strength<threshold*1.35&&previous[3]>=uniforms[24]&&previous[3]<=uniforms[27])alpha=previous[3];}
        }
        if(uniforms[18]>0){
            const angle=uniforms[20],px=(u-.5)*Math.exp(-uniforms[19]),py=(v-.5)*Math.exp(-uniforms[19]);
            const previous=old(px*Math.cos(angle)-py*Math.sin(angle)+.5,px*Math.sin(angle)+py*Math.cos(angle)+.5),oldColor=mul(previous.slice(0,3),uniforms[18]);
            if(dot(oldColor,LUMA)>dot(color,LUMA))alpha=previous[3];color=color.map((n,i)=>Math.max(n,oldColor[i]));
        }
        state.cells.set([...color.map(n=>Math.round(clamp(n)*255)),Math.round(clamp(alpha)*255)],(y*cols+x)*4);
        state.nextHistory.set([...color.map(n=>clamp(n)),clamp(alpha)],(y*cols+x)*4);
    }
    [state.history,state.nextHistory]=[state.nextHistory,state.history];return state.cells;
}
