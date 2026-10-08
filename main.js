<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Полётный симулятор БПЛА</title>
<style>
:root{--bg:#0d1b26;--pn:rgba(13,27,38,.86);--tx:#e8f0f5;--mu:#8ea6b6;--ac:#ffb02e;--ok:#5fd1a0;--bad:#ff6b5b;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html,body{height:100%;margin:0;background:var(--bg);color:var(--tx);font:13px/1.45 system-ui,"Segoe UI",sans-serif;overflow:hidden}
#c{display:block;position:absolute;inset:0;width:100%;height:100%}
.p{position:absolute;background:var(--pn);border:1px solid #27465b;border-radius:6px;padding:10px 12px;max-height:calc(100% - 24px);overflow:auto}
#menu{left:10px;top:10px;width:232px}#tel{right:10px;top:10px;width:236px;font-variant-numeric:tabular-nums}
#bot{left:50%;transform:translateX(-50%);bottom:10px;color:var(--mu);font-size:12px;text-align:center;max-width:90%}
h3{margin:0 0 6px;font-size:13px;color:var(--ac)}label{display:block;margin:6px 0 2px;color:var(--mu)}
select,input[type=range],textarea,button{width:100%;box-sizing:border-box;background:#14293a;color:var(--tx);border:1px solid #2c516a;border-radius:4px;padding:4px;font:inherit}
button{cursor:pointer;margin-top:6px}button:hover{border-color:var(--ac)}
.ck{display:inline-block;margin:4px 8px 0 0}.ck input{vertical-align:middle}
.row{display:flex;justify-content:space-between}.row b{font-weight:600}
.bar{height:6px;background:#1c3345;border-radius:3px;overflow:hidden;margin:2px 0 6px}.bar i{display:block;height:100%;background:var(--ok)}
#alert{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:var(--bad);color:#210a06;padding:8px 14px;border-radius:6px;font-weight:600;display:none;max-width:420px;text-align:center}
#rep{position:absolute;inset:0;background:rgba(7,14,20,.94);display:none;overflow:auto;padding:16px}
#rep canvas{background:#0f2231;border:1px solid #27465b;border-radius:4px;margin:4px}
textarea{height:90px;font:11px monospace}
@media(max-width:700px){#menu{width:170px}#tel{width:170px;font-size:11px}}
</style></head><body>
<canvas id="c"></canvas>
<div class="p" id="menu">
<h3>Параметры полёта</h3>
<label>Модель БПЛА</label><select id="selModel"></select>
<label>Местность</label><select id="selTer"></select>
<label>Осадки</label><select id="selWx"><option value="clear">Ясно</option><option value="rain">Дождь</option><option value="snow">Снег</option><option value="hail">Град</option></select>
<label>Ветер: <span id="wsv"></span></label><input id="ws" type="range" min="0" max="25" step=".5" value="7">
<label>Откуда дует: <span id="wdv"></span></label><input id="wd" type="range" min="0" max="359" value="315">
<label>Температура: <span id="tv"></span> °C</label><input id="temp" type="range" min="-30" max="40" value="15">
<label>Турбулентность: <span id="tbv"></span>%</label><input id="turb" type="range" min="0" max="100" value="30">
<div><span class="ck"><input type="checkbox" id="kVec" checked> Силы</span><span class="ck"><input type="checkbox" id="kFlow" checked> Поток</span><span class="ck"><input type="checkbox" id="kTr" checked> След</span><span class="ck"><input type="checkbox" id="kSen" checked> Камера</span></div>
<button id="bRes">Сброс полёта (R)</button><button id="bRep">Отчёт о полёте</button>
<details><summary style="margin-top:8px;cursor:pointer;color:var(--mu)">Загрузить свою модель (JSON)</summary><textarea id="json"></textarea><button id="bLoad">Загрузить модель</button></details>
</div>
<div class="p" id="tel"></div>
<div class="p" id="bot">W/S — тангаж · A/D — крен · Q/E — рыскание · Пробел/Shift — тяга · H — автопилот · C — камера · V — векторы · мышь: вращение/колесо · геймпад поддерживается</div>
<div id="alert"></div>
<div id="rep"><button id="bClose" style="width:140px">Закрыть</button> <button id="bCsv" style="width:200px">Скачать CSV</button><div id="gr"></div><pre id="evl" style="color:var(--mu)"></pre></div>
<script src="vendor/three.min.js"></script>
<script>
// ===== Цифровые профили БПЛА (хранятся как JSON; новые модели грузятся через форму меню) =====
const MODELS={
 quad:{name:'Квадрокоптер X',rotors:4,mass:1.4,maxThrust:30,armLen:.25,cd:1.0,area:.05,battWh:70,maxTilt:35,yawRate:120,climb:3},
 heavy:{name:'Гексакоптер H6 (грузовой)',rotors:6,mass:3.4,maxThrust:62,armLen:.45,cd:1.2,area:.12,battWh:180,maxTilt:30,yawRate:80,climb:2.5}};
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),V3=THREE.Vector3;
const rn=()=>{let s=0;for(let i=0;i<6;i++)s+=Math.random();return(s-3)/.707};
// ===== Местность: функция высоты рельефа (аналитическая, чтобы считать столкновения с землёй без сетки) =====
const TER={field:{n:'Полигон',h:()=>0},hills:{n:'Холмы',h:(x,z)=>7*Math.sin(x*.03)*Math.cos(z*.026)+4*Math.sin(x*.07+z*.05)},
 mount:{n:'Горы',h:(x,z)=>38*Math.max(0,Math.sin(x*.012+1)*Math.cos(z*.011))+6*Math.sin(x*.05)*Math.cos(z*.04)},forest:{n:'Лес',h:()=>0},city:{n:'Городская застройка',h:()=>0}};
for(const k in MODELS)$('selModel').add(new Option(MODELS[k].name,k));
for(const k in TER)$('selTer').add(new Option(TER[k].n,k));
$('json').value=JSON.stringify(MODELS.quad,null,1);
// ===== Сцена =====
const R=new THREE.WebGLRenderer({canvas:$('c'),antialias:true}),S=new THREE.Scene(),CAM=new THREE.PerspectiveCamera(65,1,.1,1500);
S.add(new THREE.HemisphereLight(0xcfe6ff,0x445533,.9));const sun=new THREE.DirectionalLight(0xffffff,.8);sun.position.set(80,150,60);S.add(sun);
let world=null,boxes=[],M=MODELS.quad,TERK='field',H=TER.field.h;
function build(){
 if(world)S.remove(world);world=new THREE.Group();boxes=[];S.add(world);TERK=$('selTer').value;H=TER[TERK].h;
 const g=new THREE.PlaneGeometry(1000,1000,200,200);g.rotateX(-Math.PI/2);const p=g.attributes.position,col=[];
 for(let i=0;i<p.count;i++){const y=H(p.getX(i),p.getZ(i));p.setY(i,y);const r=clamp(y/35,0,1);col.push(.3+.4*r,.5+.1*r,.25+.45*r)}
 g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();
 world.add(new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true})));
 const pad=new THREE.Mesh(new THREE.CircleGeometry(2,24),new THREE.MeshBasicMaterial({color:0xffb02e}));pad.rotation.x=-Math.PI/2;pad.position.y=H(0,0)+.03;world.add(pad);
 if(TERK==='forest')for(let i=0;i<260;i++){const x=(Math.random()-.5)*600,z=(Math.random()-.5)*600;if(Math.hypot(x,z)<10)continue;
  const t=new THREE.Mesh(new THREE.ConeGeometry(2.2,10+Math.random()*6,7),new THREE.MeshLambertMaterial({color:0x1f5a2e}));t.position.set(x,6,z);world.add(t)}
 if(TERK==='city')for(let i=-6;i<=6;i++)for(let j=-6;j<=6;j++){if(Math.abs(i)<1&&Math.abs(j)<1)continue;const h=10+Math.random()*50,w=14+Math.random()*6,b={x:i*40,z:j*40,w,d:w,h};boxes.push(b);
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL(.58,.1,.35+Math.random()*.3)}));m.position.set(b.x,h/2,b.z);world.add(m)}
 const sky=TERK==='mount'?0x9db8d0:0xa9c9e0;S.background=new THREE.Color(sky);S.fog=new THREE.Fog(sky,120,700);
}
// ===== Модель дрона =====
const drone=new THREE.Group();S.add(drone);let rotors=[],cone;
function buildDrone(){
 while(drone.children.length)drone.remove(drone.children[0]);rotors=[];const L=M.armLen*3.2;
 drone.add(new THREE.Mesh(new THREE.BoxGeometry(L*.35,L*.15,L*.5),new THREE.MeshLambertMaterial({color:0x2a3a46})));
 const nose=new THREE.Mesh(new THREE.BoxGeometry(L*.12,L*.1,L*.2),new THREE.MeshBasicMaterial({color:0xffb02e}));nose.position.z=-L*.3;drone.add(nose);
 for(let i=0;i<M.rotors;i++){const a=i/M.rotors*Math.PI*2+Math.PI/M.rotors,x=Math.sin(a)*L,z=-Math.cos(a)*L;
  const arm=new THREE.Mesh(new THREE.BoxGeometry(.05*L,.05*L,L),new THREE.MeshLambertMaterial({color:0x111111}));arm.position.set(x/2,0,z/2);arm.rotation.y=-a;drone.add(arm);
  const r=new THREE.Mesh(new THREE.CylinderGeometry(L*.55,L*.55,.02,16),new THREE.MeshBasicMaterial({color:0x6fb8ff,transparent:true,opacity:.35}));r.position.set(x,.05,z);drone.add(r);rotors.push(r)}
 // зона видимости камеры (радиус 15 м, раствор 18°), для визуализации покрытия сенсора
 const cg=new THREE.ConeGeometry(5,15,16,1,true);cg.translate(0,-7.5,0);cg.rotateX(Math.PI/2);cg.rotateX(-.35);
 cone=new THREE.Mesh(cg,new THREE.MeshBasicMaterial({color:0xffb02e,wireframe:true,transparent:true,opacity:.5}));drone.add(cone);
}
// ===== Визуализация: силы, след, аэропоток, осадки =====
const arr=[0x5fd1a0,0xffb02e,0xff6b5b,0x4aa8ff].map(c=>{const a=new THREE.ArrowHelper(new V3(0,1,0),new V3(),1,c,.4,.25);S.add(a);return a});
const TR=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xff4fa0}));S.add(TR);let trail=[];
const mkPts=(n,c,s)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));const o=new THREE.Points(g,new THREE.PointsMaterial({color:c,size:s,transparent:true,opacity:.8}));o.frustumCulled=false;S.add(o);return o};
const FL=mkPts(220,0x1fd1ff,.18),PR=mkPts(1500,0xdfeaff,.12);
for(let i=0;i<220*3;i++)FL.geometry.attributes.position.array[i]=(Math.random()-.5)*16;
for(let i=0;i<1500*3;i++)PR.geometry.attributes.position.array[i]=(Math.random()-.5)*70;
// ===== Состояние =====
const P=new V3(),Vel=new V3(),tv=new V3(),W=new V3(),va=new V3();
let roll=0,pitch=0,yaw=0,used=0,mt=15,tgt=0,AP=false,camMode=0,camYaw=0,camPit=.3,camD=7,T=0,t=0,acc=0,last=0,alertT=0,gps=true,hard=false,REC=[],EV=[],inp={r:0,p:0,y:0,t:0},tel={},rec=0,sig=100,thr=0;
const k={};addEventListener('keydown',e=>{k[e.code]=1;if(e.target.tagName==='TEXTAREA')return;
 if(e.code==='KeyH'){AP=!AP;tgt=P.y;ev(AP?'Автопилот: удержание высоты и позиции ВКЛ':'Автопилот ВЫКЛ')}
 if(e.code==='KeyC')camMode=(camMode+1)%3;if(e.code==='KeyV')$('kVec').click();if(e.code==='KeyR')reset();
 if(e.code==='Space')e.preventDefault()});addEventListener('keyup',e=>k[e.code]=0);
let drag=0;$('c').onpointerdown=()=>drag=1;addEventListener('pointerup',()=>drag=0);
addEventListener('pointermove',e=>{if(drag){camYaw-=e.movementX*.006;camPit=clamp(camPit+e.movementY*.005,-.2,1.3)}});
addEventListener('wheel',e=>{camD=clamp(camD+e.deltaY*.01,2,40)});
function ev(s){EV.push([t,s]);if(EV.length>200)EV.shift()}
function reset(){M=MODELS[$('selModel').value]||M;buildDrone();P.set(0,H(0,0)+.15,0);Vel.set(0,0,0);tv.set(0,0,0);roll=pitch=yaw=0;used=0;mt=+$('temp').value;tgt=P.y;AP=false;t=0;REC=[];EV=[];trail=[];gps=true;hard=false;ev('Старт: '+M.name+', '+TER[TERK].n)}
const fvec=()=>new V3(Math.sin(yaw),0,-Math.cos(yaw)),rvec=()=>new V3(Math.cos(yaw),0,Math.sin(yaw));
function readInp(){let r=(k.KeyD?1:0)-(k.KeyA?1:0),p=(k.KeyW?1:0)-(k.KeyS?1:0),y=(k.KeyE?1:0)-(k.KeyQ?1:0),th=(k.Space?1:0)-((k.ShiftLeft||k.ShiftRight)?1:0);
 const g=navigator.getGamepads&&[...navigator.getGamepads()].find(x=>x);if(g){const d=v=>Math.abs(v)>.12?v:0;y+=d(g.axes[0]);th-=d(g.axes[1]);r+=d(g.axes[2]);p-=d(g.axes[3])}
 inp={r:clamp(r,-1,1),p:clamp(p,-1,1),y:clamp(y,-1,1),t:clamp(th,-1,1)}}
// ===== Физика (шаг 1/120 с): тяга + гравитация + квадратичное сопротивление относительно воздуха =====
function step(dt){
 const g=9.81,amb=+$('temp').value,agl=P.y-H(P.x,P.z),rho=1.225*288.15/(amb+273.15)*Math.exp(-P.y/8500);
 const tl=+$('turb').value/100,ws=+$('ws').value,sg=tl*(1.5+ws*.12);
 // турбулентность — процесс Орнштейна–Уленбека (коррелированные порывы, tau=2 с)
 for(const a of['x','y','z'])tv[a]+=-tv[a]*dt/2+sg*Math.sqrt(dt)*rn()*(a==='y'?.5:1);
 const b=+$('wd').value*Math.PI/180,sh=Math.pow(Math.max(agl,2)/10,.2); // профиль ветра по высоте
 W.set(-Math.sin(b)*ws*sh+tv.x,tv.y,Math.cos(b)*ws*sh+tv.z);
 va.copy(Vel).sub(W);const sp=va.length();
 yaw+=inp.y*M.yawRate*Math.PI/180*dt;
 const f=fvec(),r=rvec(),mx=M.maxTilt*Math.PI/180;let cr=inp.r*mx,cp=inp.p*mx;
 if(AP&&!inp.r&&!inp.p){cr=clamp(-.1*Vel.dot(r),-.4,.4);cp=clamp(-.1*Vel.dot(f),-.4,.4)} // автопилот гасит скорость
 // угловая динамика: ПД-подобное следование за командой + возмущение от порывов и бокового обдува
 roll+=(cr-roll)*6*dt-(.25*tv.dot(r)+.006*va.dot(r)*sp)*dt;
 pitch+=(cp-pitch)*6*dt-(.25*tv.dot(f)+.006*va.dot(f)*sp)*dt;
 const hov=M.mass*g/(M.maxThrust*rho/1.225),bt=100*(1-used/(M.battWh*(.6+.4*clamp((amb+20)/35,0,1))));
 let fr;
 if(AP){tgt=Math.max(tgt+inp.t*M.climb*dt,H(P.x,P.z)+.3);fr=hov/Math.max(.5,Math.cos(roll)*Math.cos(pitch))+.08*(tgt-P.y)-.12*Vel.y}
 else fr=hov*(1+.7*inp.t);
 if(agl<.3&&inp.t<=0&&!AP)fr=0;
 fr=clamp(fr,0,1);thr=fr;
 const bf=bt>10?1:bt>3?.85:bt>0?.6:0,Tn=fr*M.maxThrust*rho/1.225*bf;
 const u=new V3(Math.sin(pitch)*Math.sin(yaw)+Math.sin(roll)*Math.cos(yaw),Math.cos(pitch)*Math.cos(roll),-Math.sin(pitch)*Math.cos(yaw)+Math.sin(roll)*Math.sin(yaw)).normalize();
 const wx=$('selWx').value,kd=.5*rho*M.cd*M.area*(wx==='clear'?1:1.08);
 const Fd=va.clone().multiplyScalar(-kd*sp),Ft=u.clone().multiplyScalar(Tn);
 const a=Ft.clone().add(Fd).multiplyScalar(1/M.mass);a.y-=g;
 tel.a=a.clone();tel.Ft=Ft;tel.Fd=Fd;tel.u=u;
 Vel.addScaledVector(a,dt);P.addScaledVector(Vel,dt);
 // столкновения: земля и здания
 const h=H(P.x,P.z)+.15;if(P.y<h){if(Vel.y<-5&&!hard){ev('Жёсткая посадка ('+(-Vel.y).toFixed(1)+' м/с)');hard=true}P.y=h;Vel.y=Math.max(Vel.y,0);Vel.x*=1-3*dt;Vel.z*=1-3*dt;if(Math.abs(roll)<.3)hard=false}
 for(const q of boxes)if(Math.abs(P.x-q.x)<q.w/2+.3&&Math.abs(P.z-q.z)<q.d/2+.3&&P.y<q.h){ev('Столкновение со зданием');P.x-=Vel.x*dt*2;P.z-=Vel.z*dt*2;Vel.multiplyScalar(-.2)}
 if(u.y<0){ev('Опрокидывание — аппарат потерян, сброс');reset();return}
 // питание и тепло: мощность ~ T^1.5 (актуаторный диск), нагрев моторов от потерь, охлаждение набегающим потоком
 const pk=107*M.mass/Math.pow(M.mass*g,1.5),Pw=pk*Math.pow(Tn,1.5)+12;used+=Pw*dt/3600;
 mt+=(Pw/M.mass*.017-(mt-amb)*.08*(1+.15*sp))*dt;
 tel.Pw=Pw;tel.bt=bt;tel.sp=sp;tel.agl=agl;tel.cr=cr;
 // события и предупреждения
 const tilt=Math.acos(clamp(u.y,-1,1))*180/Math.PI;
 if((tilt>M.maxTilt*.85&&sp>6)||Math.abs(roll-cr)>.28||Math.abs(pitch-cp)>.28){if(t-alertT>3){ev('Потеря устойчивости: наклон '+tilt.toFixed(0)+'°, воздушная скорость '+sp.toFixed(1)+' м/с')}alertT=t;
  $('alert').style.display='block';$('alert').textContent='Потеря устойчивости: наклон '+tilt.toFixed(0)+'°. Уменьшите крен/тангаж, держите носом против ветра или включите автопилот (H)'}
 else if(t-alertT>1.5)$('alert').style.display='none';
 if(bt<15&&!tel.lowB){tel.lowB=1;ev('Низкий заряд батареи (<15%)')}
 const sats=(TERK==='city'&&agl<15)?4:(TERK==='forest'&&agl<4?5:10),ok=sats>=6;if(ok!==gps){gps=ok;ev(ok?'GPS восстановлен':'Потеря GPS-сигнала')}
 tel.sats=sats;sig=clamp(100-Math.hypot(P.x,P.z)/9,0,100);
 t+=dt;rec+=dt;if(rec>=.25){rec=0;REC.push([t,P.y,Math.hypot(Vel.x,Vel.z),roll*57.3,pitch*57.3,((yaw*57.3)%360+360)%360,bt,mt,sig])}
}
// ===== Отрисовка =====
function draw(dt){
 const f=fvec(),u=tel.u||new V3(0,1,0),Z=f.clone().negate(),X=new V3().crossVectors(u,Z).normalize();Z.crossVectors(X,u);
 drone.position.copy(P);drone.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,u,Z));
 rotors.forEach((r,i)=>{r.rotation.y+=(i%2?1:-1)*(5+thr*60)*dt});cone.visible=$('kSen').checked&&camMode!==1;drone.visible=camMode!==1;
 const vs=$('kVec').checked,m=M.mass*9.81;
 [[Vel,.8,0],[tel.Ft,3/m,1],[tel.Fd,3,2],[W,.8,3]].forEach(([v,s,i])=>{const a=arr[i],l=v?v.length()*s:0;a.visible=vs&&l>.05;if(a.visible){a.position.copy(P);a.setDirection(v.clone().normalize());a.setLength(l,Math.min(.5,l*.3),Math.min(.3,l*.2))}});
 if(!trail.length||trail[trail.length-1].distanceTo(P)>.8){trail.push(P.clone());if(trail.length>700)trail.shift()}
 TR.visible=$('kTr').checked;TR.geometry.setFromPoints(trail);
 // аэродинамический поток: частицы сносятся ветром, видно обтекание в системе дрона
 const fp=FL.geometry.attributes.position.array;FL.visible=$('kFlow').checked;
 for(let i=0;i<fp.length;i+=3){fp[i]+=-va.x*0+W.x*dt;fp[i+1]+=W.y*dt;fp[i+2]+=W.z*dt;
  for(let j=0;j<3;j++){const c=[P.x,P.y,P.z][j];while(fp[i+j]-c>8)fp[i+j]-=16;while(fp[i+j]-c<-8)fp[i+j]+=16}}
 // осадки
 const wx=$('selWx').value,pp=PR.geometry.attributes.position.array;PR.visible=wx!=='clear';
 const fall={rain:14,snow:1.6,hail:20}[wx]||0;PR.material.size=wx==='rain'?.1:wx==='snow'?.25:.3;PR.material.color.set(wx==='hail'?0xffffff:wx==='rain'?0x9fc2ff:0xffffff);
 if(wx!=='clear')for(let i=0;i<pp.length;i+=3){pp[i]+=W.x*dt*.6;pp[i+1]-=fall*dt;pp[i+2]+=W.z*dt*.6;
  if(pp[i+1]<P.y-30)pp[i+1]+=60;for(const j of[0,2]){const c=j?P.z:P.x;while(pp[i+j]-c>35)pp[i+j]-=70;while(pp[i+j]-c<-35)pp[i+j]+=70}}
 FL.geometry.attributes.position.needsUpdate=PR.geometry.attributes.position.needsUpdate=true;
 S.fog.far=wx==='clear'?700:wx==='snow'?200:350;
 // камеры: 0 — от третьего лица, 1 — FPV, 2 — наблюдатель
 if(camMode===0){const a=yaw+camYaw,o=new V3(-Math.sin(a)*Math.cos(camPit)*camD,Math.sin(camPit)*camD+1,Math.cos(a)*Math.cos(camPit)*camD);CAM.position.lerp(P.clone().add(o),.2);CAM.lookAt(P)}
 else if(camMode===1){CAM.position.copy(P).addScaledVector(u,.12);CAM.quaternion.copy(drone.quaternion);CAM.rotateX(.2)}
 else{if(CAM.position.distanceTo(P)>70||CAM.position.y<H(CAM.position.x,CAM.position.z)+2)CAM.position.set(P.x+25,P.y+15,P.z+25);CAM.lookAt(P)}
 R.render(S,CAM);
}
function panel(){
 const a=tel.a||new V3(),dir=['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'][Math.round(+$('wd').value/45)%8],bt=tel.bt??100,mtc=mt>70?'var(--bad)':'var(--tx)';
 const lat=57.153-P.z/111320,lon=65.534+P.x/(111320*Math.cos(lat*Math.PI/180));
 const L=(n,v,c)=>`<div class="row"><span style="color:var(--mu)">${n}</span><b style="color:${c||'inherit'}">${v}</b></div>`;
 $('tel').innerHTML='<h3>Телеметрия · '+['3-е лицо','FPV','наблюдатель'][camMode]+'</h3>'+
 L('Высота (бар.)',(P.y+.15*rn()).toFixed(1)+' м')+L('Над землёй (дальномер)',(tel.agl||0).toFixed(1)+' м')+L('Скорость возд./земл.',(tel.sp||0).toFixed(1)+' / '+Math.hypot(Vel.x,Vel.z).toFixed(1)+' м/с')+L('Верт. скорость',Vel.y.toFixed(1)+' м/с')+
 L('Крен / тангаж',(roll*57.3).toFixed(0)+'° / '+(pitch*57.3).toFixed(0)+'°')+L('Рыскание (магн.)',(((yaw*57.3+2*rn())%360+360)%360).toFixed(0)+'°')+
 L('Тяга',(thr*100).toFixed(0)+'%')+L('Акселерометр',(a.length()/9.81).toFixed(2)+' g')+L('Мощность',(tel.Pw||0).toFixed(0)+' Вт')+
 L('Заряд',bt.toFixed(0)+'%',bt<15?'var(--bad)':'')+`<div class="bar"><i style="width:${clamp(bt,0,100)}%;background:${bt<15?'var(--bad)':'var(--ok)'}"></i></div>`+
 L('Температура моторов',mt.toFixed(0)+' °C',mtc)+L('GPS',(gps?'3D fix':'НЕТ')+' · '+(tel.sats||0)+' спутн.',gps?'':'var(--bad)')+L('Координаты',lat.toFixed(5)+', '+lon.toFixed(5))+L('Сигнал связи',sig.toFixed(0)+'%')+
 L('Ветер',((+$('ws').value)).toFixed(1)+' м/с '+dir+' (порыв '+W.length().toFixed(1)+')')+L('Автопилот',AP?'ВКЛ (H)':'выкл (H)',AP?'var(--ok)':'')+
 '<div style="margin-top:6px;color:var(--mu);font-size:11px">'+EV.slice(-4).map(e=>e[0].toFixed(0)+'с '+e[1]).join('<br>')+'</div>';
 $('wsv').textContent=$('ws').value+' м/с';$('wdv').textContent=$('wd').value+'° ('+dir+')';$('tv').textContent=$('temp').value;$('tbv').textContent=$('turb').value;
}
// ===== Отчёт: графики и журнал, экспорт CSV =====
function plot(cv,i,label,col){const x=cv.getContext('2d'),w=cv.width,h=cv.height;x.clearRect(0,0,w,h);x.font='11px sans-serif';if(REC.length<2)return;let mn=1e9,mx=-1e9;REC.forEach(r=>{mn=Math.min(mn,r[i]);mx=Math.max(mx,r[i])});if(mx-mn<1e-6)mx=mn+1;
 x.strokeStyle=col;x.beginPath();REC.forEach((r,j)=>{const X=j/(REC.length-1)*w,Y=h-8-(r[i]-mn)/(mx-mn)*(h-30);j?x.lineTo(X,Y):x.moveTo(X,Y)});x.stroke();x.fillStyle='#8ea6b6';x.fillText(label+'  ['+mn.toFixed(1)+' … '+mx.toFixed(1)+']',6,13)}
const COLS=['Время, с','Высота, м','Скорость, м/с','Крен, °','Тангаж, °','Рыскание, °','Заряд, %','Темп. моторов, °C','Сигнал, %'];
$('bRep').onclick=()=>{$('rep').style.display='block';$('gr').innerHTML='';[1,2,3,4,5,6,7,8].forEach(i=>{const c=document.createElement('canvas');c.width=380;c.height=130;$('gr').appendChild(c);plot(c,i,COLS[i],['#5fd1a0','#4aa8ff','#ffb02e','#ff6b5b','#c9a6ff','#5fd1a0','#ff6b5b','#4aa8ff'][i-1])});
 $('evl').textContent='Журнал событий:\n'+EV.map(e=>e[0].toFixed(1)+' c  '+e[1]).join('\n')};
$('bClose').onclick=()=>$('rep').style.display='none';
$('bCsv').onclick=()=>{const s=COLS.join(';')+'\n'+REC.map(r=>r.map(v=>v.toFixed(2)).join(';')).join('\n')+'\n\n'+EV.map(e=>e[0].toFixed(1)+';'+e[1]).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:'text/csv'}));a.download='uav_flight_report.csv';a.click()};
$('bRes').onclick=reset;$('selModel').onchange=reset;$('selTer').onchange=()=>{build();reset()};
$('bLoad').onclick=()=>{try{const o=JSON.parse($('json').value);for(const f of['mass','maxThrust','armLen','cd','area','battWh','maxTilt','yawRate','climb','rotors'])if(!(o[f]>0))throw Error('поле '+f);
 const id='user'+Object.keys(MODELS).length;MODELS[id]=o;$('selModel').add(new Option(o.name||id,id));$('selModel').value=id;reset()}catch(e){alert('Ошибка в профиле: '+e.message)}};
function resize(){R.setSize(innerWidth,innerHeight,false);CAM.aspect=innerWidth/innerHeight;CAM.updateProjectionMatrix()}addEventListener('resize',resize);resize();
build();reset();
let pt=0;(function loop(n){requestAnimationFrame(loop);const d=Math.min(.05,(n-last)/1000||.016);last=n;readInp();acc+=d;while(acc>=1/120){step(1/120);acc-=1/120}draw(d);if(n-pt>100){pt=n;panel()}})(0);
</script></body></html>
