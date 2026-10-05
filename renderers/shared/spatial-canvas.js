import { shaderHash } from './render-math.js';
import { activeGlyphRamp } from './character-sets.js';
import { createAccentSampler } from './fractal-accents.js';
import { SPATIAL_UNIFORM_FLOATS, accentsEnabled, fillSpatialUniforms } from './spatial.js';
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
function sceneRay(qx, qy, yaw, pitch) {
    const forward = [Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch)];
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = [-Math.sin(yaw)*Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw)*Math.sin(pitch)];
    return add(add(forward, mul(right, qx)), mul(up, qy));
}

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
        if(mode==='corridor')return x< -1||x>1?[3.2,2]:[0,0];
        if(mode==='cathedral')return Math.abs(x)>6?[9,1]:Math.abs(x)>2&&Math.abs(x)<5&&mod(z,4)<1?[7.5,3]:[0,0];
        if(mode==='relief')return x< -8||x>=8?[0,0]:[.15+Math.sqrt(dot(sample((x+8.5)/16,(z+.5)/32),LUMA))*p.sceneRelief,4];
        if(mode==='coast'&&x<3)return [0,0];
        if(Math.abs(x)<3||mod(z,8)<2||mod(x+3,8)<2)return [0,0];
        return [mode==='coast'?.8+hash(x,z)*2.4:1.4+hash(x,z)*6,1];
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
        let media=h.normal[1]>.5?mapped(x*.125,z*.125):mapped(side*.125,1-y*.25,2);
        if(h.material===4)media=sample((Math.floor(x-h.normal[0]*.001)+8.5)/16,(mod(Math.floor(z-h.normal[2]*.001),32)+.5)/32);
        color=mix(color,mul(media,.5+light),p.sceneMedia);
        if(h.material===3)color=add(color,mul(tint,.25*p.sceneGlow));
        return {color:mix(color,fogColor,1-Math.exp(-h.distance*p.sceneFog)),glyph:lit?6:5};
    };
    const orbitalDistance=point=>{
        const t=time*.3,center=[Math.sin(t)*.9,Math.cos(t*.7)*.4,0];
        const angle=.65+t*.7,ty=point[1]*Math.cos(angle)-point[2]*Math.sin(angle),tz=point[1]*Math.sin(angle)+point[2]*Math.cos(angle);
        return Math.min(Math.hypot(...point.map((n,i)=>n-center[i]))-.95,Math.hypot(Math.hypot(point[0],tz)-1.65,ty)-.22);
    };
    // CPU reference mirrors the shared GPU estimators and their iteration bounds.
    const fractalDistance=point=>{
        const q=mul(point,1/p.fractalZoom),shape=p.fractalMorph,detail=p.fractalDetail;
        if(mode==='ruins'){
            const height=1.4+hash(Math.floor(q[0]/6),mod(Math.floor(q[2]/6),16))*2.8;
            const cell=[mod(q[0],6)-3,q[1]-height,mod(q[2],6)-3];
            const box=cell.map((v,i)=>Math.abs(v)-[2.1,height,2.1][i]);
            let distance=Math.hypot(...box.map(v=>Math.max(v,0)))+Math.min(Math.max(...box),0),scale=.5;
            for(let i=0;i<8&&i<detail;i++){
                const holes=cell.map(v=>Math.abs(1-Math.abs(fract(v*scale*.5+.5)*2-1)*3));scale*=3;
                const cross=Math.min(Math.max(holes[0],holes[1]),Math.max(holes[1],holes[2]),Math.max(holes[2],holes[0]));
                distance=Math.max(distance,(cross-(.7+shape*.5))/scale);
            }
            return Math.min(distance,q[1]+.3)*p.fractalZoom;
        }
        let z=q,derivative=1;
        if(mode==='mandelbulb'){
            const power=6+shape*3;
            for(let i=0;i<8&&i<detail;i++){
                const radius=Math.max(Math.hypot(...z),.00001);if(radius>4)break;
                const theta=Math.acos(clamp(z[1]/radius,-1,1))*power,phi=z[0]*z[0]+z[2]*z[2]>1e-12?Math.atan2(z[2],z[0])*power:0;
                const raised=radius**(power-1);derivative=raised*power*derivative+1;
                z=add(mul([Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi)],raised*radius),q);
            }
            const radius=Math.max(Math.hypot(...z),.00001);
            return .5*Math.log(radius)*radius/derivative*p.fractalZoom;
        }
        const scale=-1.7-shape*.6;
        for(let i=0;i<8&&i<detail;i++){
            z=z.map(v=>clamp(v,-1,1)*2-v);
            const fold=clamp(1/Math.max(dot(z,z),.0001),1,4);
            z=add(mul(z,fold*scale),q);derivative=derivative*fold*Math.abs(scale)+1;
        }
        return (Math.hypot(...z)/derivative-.002)*p.fractalZoom;
    };
    const fractalTint=phase=>[0,2.1,4.2].map(offset=>.5+Math.cos(phase+offset)*.45);
    const mandelbrot=(u,v)=>{
        const spin=p.scenePitch*Math.PI/180+(p.sceneRoute==='orbit'?time*.07:0),q=[u*2-1,(v*2-1)/aspect];
        const rotated=[q[0]*Math.cos(spin)-q[1]*Math.sin(spin),q[0]*Math.sin(spin)+q[1]*Math.cos(spin)];
        const scale=1.65*Math.exp(-2.8*(.5-.5*Math.cos(time*.13)))/p.fractalZoom,media=mapped(u,v,aspect);
        const c=add(add([-.7435,.1314+(p.sceneHeight-1.25)*.1],mul(rotated,scale*Math.tan(p.sceneFov*Math.PI/360))),mul(media.slice(0,2).map(v=>v-.5),p.sceneMedia*p.fractalMorph*.035*scale));
        let z=[0,0],count=0,escaped=false;
        for(let i=0;i<128&&i<p.fractalDetail*16;i++){
            z=add([z[0]*z[0]-z[1]*z[1],2*z[0]*z[1]],c);count=i;
            if(dot(z,z)>64){escaped=true;break;}
        }
        if(escaped)count=count+1-Math.log(Math.log(Math.hypot(...z)))/Math.log(2);
        const bands=.7+.3*Math.cos(count*.2),tint=mul(fractalTint(count*.12+time*.16+p.sceneSeed*.1),bands);
        const fade=Math.exp(-Math.max(count,0)*.035),base=[.018,.025,.05];
        return {color:mul(mix(escaped?mix(base,tint,fade):base,mul(media,escaped?.18+(.37+bands*.65)*fade:.18),p.sceneMedia),p.sceneLight),glyph:5};
    };
    const fractal=(u,v)=>{
        const ruins=mode==='ruins',plane=Math.tan(p.sceneFov*Math.PI/360);
        const angle=p.sceneRoute==='orbit'?time*.18:Math.sin(time*.17)*.35,radius=mode==='mandelbox'?4.6+Math.sin(time*.12)*.6:3.1;
        let ro=[Math.sin(angle)*radius,p.sceneHeight-1.25,-Math.cos(angle)*radius],yaw=-angle;
        if(ruins){ro=[Math.sin(time*.12)*.35,p.sceneHeight,mod(time,96)+.5];yaw=(p.sceneRoute==='weave'?Math.sin(time*.13)*.3:0)+(p.sceneRoute==='orbit'?time*.18:0);}
        const rd=normal(sceneRay((u*2-1)*plane,(1-v*2)*plane/aspect,yaw,p.scenePitch*Math.PI/180));
        const sky=ruins?[.78,.82,.84]:[.018,.035,.065];
        const backdrop={color:mix(sky,mul(mapped(u,v,aspect),ruins?.85:.16),p.sceneMedia*.65),glyph:7};
        let distance=0,farLimit=32;
        if(mode==='mandelbulb'){
            const b=dot(ro,rd),discriminant=b*b-dot(ro,ro)+4*p.fractalZoom*p.fractalZoom;
            if(discriminant<0)return backdrop;
            const span=Math.sqrt(discriminant);distance=Math.max(0,-b-span);farLimit=Math.min(farLimit,-b+span);
            if(farLimit<distance)return backdrop;
        }
        for(let i=0;i<64;i++){
            const point=add(ro,mul(rd,distance)),d=fractalDistance(point);
            if(d<.012+distance*.001){
                const n=normal([0,1,2].map(axis=>fractalDistance(point.map((v,j)=>v+(axis===j?.02:0)))-fractalDistance(point.map((v,j)=>v-(axis===j?.02:0)))));
                const light=(.18+Math.max(dot(n,normal([-.5,.8,-.6])),0)*1.4)/(1+i*.045)*p.sceneLight;
                const tint=ruins?[.68,.72,.73]:fractalTint(Math.hypot(...point)*2.2+n[1]*3+time*.12+p.sceneSeed*.1);
                const media=mapped(point[0]*.2+.5,-point[1]*.2+.6);
                return {color:mix(mix(mul(tint,light),mul(media,.12+light),p.sceneMedia),sky,1-Math.exp(-distance*p.sceneFog)),glyph:5};
            }
            distance+=Math.max(.004,d*.75);if(distance>farLimit)break;
        }
        return backdrop;
    };
    const pitch=(p.scenePitch||0)*Math.PI/180;
    return (u,v)=>{
        if(mode==='mandelbrot')return mandelbrot(u,v);
        if(['ruins','mandelbulb','mandelbox'].includes(mode))return fractal(u,v);
        if(mode==='orbitals'){
            const plane=Math.tan(p.sceneFov*Math.PI/360);
            const orbit=p.sceneRoute==='orbit'?time*.25:p.sceneRoute==='weave'?Math.sin(time*.22)*.35:0;
            const ro=[Math.sin(orbit)*4.6,p.sceneHeight,-Math.cos(orbit)*4.6],rd=normal(sceneRay((u*2-1)*plane,(1-v*2)*plane/aspect,-orbit,pitch));let t=0;
            for(let i=0;i<48;i++){
                const point=add(ro,mul(rd,t)),d=orbitalDistance(point);
                if(d<.006){
                    const n=normal([0,1,2].map(axis=>orbitalDistance(point.map((v,i)=>v+(axis===i?.01:0)))-d));
                    const light=.2+Math.max(0,dot(n,normal([-.4,.8,-.6]))),bands=.5+.5*Math.sin(point[1]*18+time);
                    return {color:mix(mul(mix([.08,.8,.98],[1,.12,.6],bands),light*p.sceneLight),mapped(point[0]*.25+.5,.5-point[1]*.25),p.sceneMedia),glyph:5};
                } t+=Math.max(.004,d);if(t>14)break;
            }return {color:mix(sky(rd),mul(sample(u,v),.12),p.sceneMedia),glyph:7};
        }
        const weave=p.sceneRoute==='weave',angle=(weave?Math.sin(time*.14)*.32:0)+(p.sceneRoute==='orbit'?time*.25:0);
        const ro=[.5+(weave?Math.sin(time*.22)*.85:0),p.sceneHeight+(mode==='relief'?p.sceneRelief:0),mod(time,32)+.5];
        const plane=Math.tan(p.sceneFov*Math.PI/360),qx=(u*2-1)*plane,qy=(1-v*2)*plane/aspect;
        const rd=sceneRay(qx,qy,angle,pitch);
        const h=traceSpatialRay(ro,rd,map);let distance=h.distance,result=h.material?surface(h):{color:mode==='coast'?mix(sky(rd),mul(sample(u,v),.65),p.sceneMedia):sky(rd),glyph:7};
        if(rd[1]<-.0001){
            const t=-ro[1]/rd[1];if(t<h.distance){
                distance=t;const fp=add(ro,mul(rd,t)),lane=mode==='city'&&Math.abs(fp[0]-.5)<.045&&mod(fp[2],4)<1.6?.25:0,grid=mode==='corridor'&&(fract(fp[0])<.025||fract(fp[2])<.025)?.08:0;
                let color=mix([.07+lane,.1+lane*.7,.15+grid],mul(mapped(fp[0]*.125,fp[2]*.125),.55),p.sceneMedia);
                if(p.sceneWet>0){
                    const ripple=Math.sin(fp[2]*12.566370614+time*3)*Math.sin(fp[0]*12-time)*.018;
                    const reflectionRay=[rd[0]+ripple,-rd[1],rd[2]],reflection=traceSpatialRay(add(fp,[0,.015,0]),reflectionRay,map,Math.max(.1,40-t));
                    color=mix(color,reflection.material?surface(reflection).color:sky(reflectionRay),p.sceneWet*(.25+.65*(1-Math.min(1,Math.abs(normal(rd)[1])))**3));
                } result={color:mix(color,fogColor,1-Math.exp(-t*p.sceneFog)),glyph:4};
            }
        }
        if(mode==='corridor'||mode==='cathedral'){
            const vaulted=mode==='cathedral',ceiling=vaulted?9:3.2;
            for(let side=0;side<2;side++){
                const slope=vaulted?(side===1?.65:-.65):0,denominator=rd[1]+slope*rd[0];
                if(denominator<=.0001)continue;
                const t=(ceiling-ro[1]-slope*(ro[0]-.5))/denominator,point=add(ro,mul(rd,t));
                if(t>0&&t<distance&&(!vaulted||slope*(point[0]-.5)>=0)){
                    distance=t;const rib=mod(point[2],4)<.16?.45:0;
                    result={color:mix([.08+rib*.3,.13+rib*.65,.2+rib],mul(mapped(point[0]*.125,point[2]*.125),.8),p.sceneMedia),glyph:5};
                }
            }
        }
        if(p.sceneRain>0)for(let i=0;i<4;i++){
            const depth=3+i*5;if(depth>=distance)continue;const point=add(ro,mul(rd,depth)),drop=hash(point[0]*3,mod(point[2],32)*3),stroke=fract(point[1]*.7+time*2.5+drop);
            if(drop>1-p.sceneRain*.25&&fract(point[0]*3)<.06&&stroke>.62)result={color:add(result.color,mul([.3,.5,.7],1-depth/40)),glyph:1};
        }
        return result;
    };
}
export function renderSpatialCells(p, pixels, sw, sh, cols, rows, process, state, now, sampleTime = 0) {
    const length=cols*rows*4;
    if(state.cells?.length!==length){state.cells=new Uint8ClampedArray(length);state.history=new Float32Array(length);state.nextHistory=new Float32Array(length);state.clock={};}
    const uniforms=state.uniforms ||= new Float32Array(SPATIAL_UNIFORM_FLOATS);
    fillSpatialUniforms(uniforms,p,cols,rows,[...activeGlyphRamp(p)].length,state.clock,now);
    const sample=(u,v)=>{
        const x=Math.min(sw-1,Math.floor(clamp(u)*sw)),y=Math.min(sh-1,Math.floor(clamp(v)*sh)),i=(y*sw+x)*4;
        return [pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255];
    };sample.aspect=sw/sh;
    const scene=createSpatialSampler(p,sample,uniforms[17],uniforms[2]),base=uniforms[22],total=uniforms[23];
    const accent = accentsEnabled(p) ? createAccentSampler(p, sample, process, cols, rows, uniforms[17], uniforms[2], state, uniforms[34]) : null;
    const old=(u,v)=>{if(!uniforms[21]||u<0||v<0||u>=1||v>=1)return [0,0,0,0];const i=(Math.floor(v*rows)*cols+Math.floor(u*cols))*4;return Array.from(state.history.subarray(i,i+4));};
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const u=(x+.5)/cols,v=(y+.5)/rows,spatial=p.visualMode!=='flat';
        // Retain the existing flat sampling controls when enabling an accent.
        let sampleU=u,sampleV=v;
        if(accent){
            const sx=x+sampleTime*(p.jitterSpeed||0)*7.13,sy=y+sampleTime*(p.jitterSpeed||0)*11.71;
            sampleU=(x+(p.sampleX??.5)+(shaderHash(sx,sy)-.5)*(p.jitterAmount||0))/cols;
            sampleV=(y+(p.sampleY??.5)+(shaderHash(sx+37,sy+91)-.5)*(p.jitterAmount||0))/rows;
        }
        const result=spatial?scene(...(accent ? accent.warp(u,v,x,y) : [u,v])):{color:sample(sampleU,sampleV),glyph:0};
        const processed=process(result.color.map(n=>clamp(n)*255),x,y);
        let color=processed.slice(0,3).map(n=>n/255),alpha=(processed[3]??dot(processed.slice(0,3),LUMA))/255;
        if (accent && p.accentPlacement !== 'trails') { const c = accent([...color, alpha], u, v, x, y); color = c.slice(0, 3); alpha = c[3]; }
        if(uniforms[35])alpha=Math.min(.999,alpha)*base/total;
        if(spatial&&p.sceneMaterialGlyphs&&mod(x+y*3,16)/16>=p.sceneMedia&&dot(color,LUMA)>.075)alpha=uniforms[24+result.glyph];
        if(!spatial&&p.edgeAmount>0){
            const gx=dot(sample(u+1/cols,v).map((n,i)=>n-sample(u-1/cols,v)[i]),LUMA),gy=dot(sample(u,v+1/rows).map((n,i)=>n-sample(u,v-1/rows)[i]),LUMA);
            const strength=Math.hypot(gx,gy),threshold=.35+(.045-.35)*p.edgeAmount,previous=old(u,v);
            if(strength>threshold){alpha=uniforms[24+(Math.abs(gx)>Math.abs(gy)*2?1:Math.abs(gy)>Math.abs(gx)*2?0:gx*gy>0?3:2)];if(strength<threshold*1.35&&previous[3]>=uniforms[24]&&previous[3]<=uniforms[27])alpha=previous[3];}
        }
        if(uniforms[18]>0){
            const angle=uniforms[20],px=(u-.5)*Math.exp(-uniforms[19]),py=(v-.5)*Math.exp(-uniforms[19]);
            const previous=old(px*Math.cos(angle)-py*Math.sin(angle)+.5,px*Math.sin(angle)+py*Math.cos(angle)+.5);
            let oldColor=mul(previous.slice(0,3),uniforms[18]);
            let oldAlpha=previous[3];
            if (accent && p.accentPlacement === 'trails') {
                const tail = accent([...oldColor, oldAlpha * uniforms[18]], u, v, x, y, true);
                oldColor = tail.slice(0, 3); oldAlpha = tail[3];
            }
            if(dot(oldColor,LUMA)>dot(color,LUMA))alpha=oldAlpha;color=color.map((n,i)=>Math.max(n,oldColor[i]));
        }
        state.cells.set([...color.map(n=>Math.round(clamp(n)*255)),Math.round(clamp(alpha)*255)],(y*cols+x)*4);
        state.nextHistory.set([...color.map(n=>clamp(n)),clamp(alpha)],(y*cols+x)*4);
    }
    [state.history,state.nextHistory]=[state.nextHistory,state.history];return state.cells;
}
