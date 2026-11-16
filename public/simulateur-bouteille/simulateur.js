// Simulateur 3D de bouteille Red Sea — scène, physique du liquide, condensation, galerie d'étiquettes.
// Attend three.js r128 en variable globale THREE (three.min.js, chargé juste avant). Mode d'emploi : README.md.
const LIB=[
 ["labels/egypte-sable-58075fae28.jpg", "Égypte — sable", "Version actuelle", "egypte-sable"],
 ["labels/chameau-noir-7b9039f9f9.jpg", "Noir — hibiscus rose", "Facettes roses + or", "chameau-noir"],
 ["labels/turquoise-v3-34ca84e520.jpg", "Turquoise V3", "Hibiscus + tampon", "turquoise-v3"],
 ["labels/rouge-tampon-6f381cea2e.jpg", "Rouge — tampon", "Bordeaux + mosaïque", "rouge-tampon"],
 ["labels/illustree-33e2627f50.jpg", "Illustrée", "Personnage qui boit", "illustree"],
 ["labels/cleopatre-60f9f062af.jpg", "Cléopâtre", "Illustration", "cleopatre"],
 ["labels/chameau-illu-ac4cd87bce.jpg", "Chameau illustré", "Illustration", "chameau-illu"],
 ["labels/momie-730df59deb.jpg", "Momie", "Illustration", "momie"]
];
const R=30.05, LABEL_W=197, OVER=8, LABEL_H=90, LABEL_Y=30;
// bouteille à col droit : Ø 60,1 mm, 242,6 mm de haut (proportions de la photo), pivot à mi-hauteur
const HTOP=242.6, CY=121, FLOOR_Y=-CY-.3, CAP_DY=HTOP-196, SEAM_Y=166;

// ---------- scène ----------
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
let PR=Math.min(devicePixelRatio||1,2),slow=0;renderer.setPixelRatio(PR);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.physicallyCorrectLights=true;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,10,24000), vcam=new THREE.PerspectiveCamera(32,1,10,24000);

// Lumière « cinéma » : UNE source, un grand projecteur diffusé placé à l'arrière gauche, en hauteur.
// Tout le reste n'est que son renvoi (réflecteur blanc à l'avant droit) et un reste de lumière sur le fond.
// La même liste sert aux reflets (verre, capsule, sol) et à la lumière qui traverse le liquide.
const KEY=new THREE.Vector3(-.394,.616,-.682).normalize();        // direction vers la source (≈ 38° de haut, 30° à gauche derrière)
const STUDIO=[
  {p:[KEY.x*10,KEY.y*10,KEY.z*10], w:3.8, h:16, c:[1,.94,.84], i:7.0, soft:.06, floor:false},   // la source
  {p:[6.5,2.4,6.5],   w:9,   h:9,  c:[1,.95,.90], i:.50, soft:.35},   // réflecteur blanc à l'avant droit
  {p:[7.6,2.6,-5.6],  w:1.8, h:9,  c:[1,.93,.86], i:3.0, soft:.10},   // réflecteur étroit à l'arrière droit (liseré)
  {p:[.9,2.0,-9.6],   w:.6,  h:4.6,c:[1,.90,.84], i:3.8, soft:.03, floor:false},   // petite carte blanche juste derrière la bouteille : le trait rouge vif au cœur du liquide
  {p:[-2.5,.75,-9],   w:20,  h:1.5,c:[1,.86,.80], i:.016, soft:.22}    // lueur au ras de l'horizon, sur le mur du fond
];
(function env(){
  const s=new THREE.Scene();s.background=new THREE.Color(0x050304);
  for(const L of STUDIO){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(L.w,L.h),new THREE.MeshBasicMaterial({color:new THREE.Color(L.c[0]*L.i,L.c[1]*L.i,L.c[2]*L.i),side:THREE.DoubleSide}));
    m.position.set(L.p[0],L.p[1],L.p[2]);m.lookAt(0,0,0);s.add(m);
  }
  const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(s,0.02).texture;
})();
const key=new THREE.DirectionalLight(0xfff0d8,3.0);key.position.copy(KEY).multiplyScalar(600);scene.add(key);
const fill=new THREE.DirectionalLight(0xfff4ea,.95);fill.position.set(420,160,400);scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff,0.05));

// profil de bouteille (mm) : rayon, hauteur
const profIn=[[0,0],[27.2,0],[29.4,1.3],[30.05,4.5],[30.05,128],[29.75,134],[28.9,139.5],[27.3,144.5],[25,149],[22.3,153],[19.8,157],[17.8,161],[16.5,165],[15.6,170],
  [14.9,176],[13.9,187],[12.8,198],[12.0,210],[11.4,225],[11.4,241.8],[10.8,HTOP]];
// extérieur du verre : même profil + la bague sous la capsule
const prof=profIn.slice(0,19).concat([[11.4,226.6],[14.3,227.6],[14.3,233.8],[13.3,234.6],[13.6,235.6],[13.6,241.6],[12.9,HTOP]]);   // bague + pas de vis, sous la capsule
const pivot=new THREE.Group();scene.add(pivot);          // on fait tourner ce pivot (centre de la bouteille)
const group=new THREE.Group();group.position.y=-CY;pivot.add(group);

// surface de révolution avec normales sortantes exactes (u = tour, v = longueur le long du profil)
function lathe(pts,seg){
  const n=pts.length,nr=[],pos=[],nor=[],uv=[],idx=[],S=[0];
  for(let i=1;i<n;i++)S.push(S[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  for(let i=0;i<n;i++){let x=0,y=0;
    for(const k of [i-1,i]){if(k<0||k>=n-1)continue;const dr=pts[k+1][0]-pts[k][0],dy=pts[k+1][1]-pts[k][1],l=Math.hypot(dr,dy)||1;x+=dy/l;y+=-dr/l}
    const l=Math.hypot(x,y)||1;nr.push([x/l,y/l]);}
  for(let i=0;i<n;i++)for(let j=0;j<=seg;j++){const a=j/seg*Math.PI*2,s=Math.sin(a),c=Math.cos(a);
    pos.push(pts[i][0]*s,pts[i][1],pts[i][0]*c);nor.push(nr[i][0]*s,nr[i][1],nr[i][0]*c);uv.push(j/seg,S[i]/S[n-1]);}
  for(let i=0;i<n-1;i++)for(let j=0;j<seg;j++){const a=i*(seg+1)+j,b=a+1,c=a+seg+1,d=c+1;idx.push(a,b,d,a,d,c)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;
}

// ---------- liquide : volume intérieur ----------
// Paroi fine : le verre épais fait paraître le liquide jusqu'au bord.
const WALL=0.7, Y0=3.2, Y1=HTOP-2.5, FILL_Y=188;
function rOut(y){for(let i=1;i<profIn.length;i++){const a=profIn[i-1],b=profIn[i];if(b[1]>a[1]&&y>=a[1]&&y<=b[1])return a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1])}return profIn[profIn.length-1][0]}
const inner=[[0,Y0],[rOut(Y0)-WALL-3,Y0],[rOut(Y0+1.2)-WALL-.6,Y0+1],[rOut(Y0+3)-WALL,Y0+3]];
for(const [r,y] of profIn){if(y>Y0+3&&y<Y1)inner.push([r-WALL,y])}
inner.push([rOut(Y1)-WALL,Y1],[0,Y1]);
function rIn(y){for(let i=1;i<inner.length;i++){const a=inner[i-1],b=inner[i];if(b[1]>a[1]&&y>=a[1]&&y<=b[1])return a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1])}return 0}
const liqGeo=lathe(inner,144);

// Volume conservé : pour une inclinaison donnée, on cherche la hauteur du plan qui garde le même volume.
const NS=400, DY=(Y1-Y0)/NS, SL=new Float32Array(NS*2);
for(let k=0;k<NS;k++){const y=Y0+(k+.5)*DY;SL[k*2]=y;SL[k*2+1]=rIn(y)}
function volBelow(h,c,s){let v=0;s=Math.max(s,2e-3);
  for(let k=0;k<NS;k++){const r=SL[k*2+1],x0=(h-SL[k*2]*c)/s;
    if(x0>=r)v+=Math.PI*r*r;else if(x0>-r)v+=r*r*Math.acos(-x0/r)+x0*Math.sqrt(r*r-x0*x0);}
  return v*DY;}
const V0=volBelow(FILL_Y,1,0);
function solveLevel(c,s){let lo=-280,hi=280;for(let i=0;i<34;i++){const m=(lo+hi)/2;if(volBelow(m,c,s)<V0)lo=m;else hi=m}return (lo+hi)/2}

// ---------- shaders ----------
const NB=24, NRIP=32;                                                       // bulles d'air affichées au maximum
const f5=n=>n.toFixed(5), v3=a=>`vec3(${f5(a[0])},${f5(a[1])},${f5(a[2])})`;
const envLines=list=>list.map(L=>{const c=new THREE.Vector3(L.p[0],L.p[1],L.p[2]),d=c.length();c.normalize();
  const u=new THREE.Vector3(0,1,0).cross(c).normalize(),v=new THREE.Vector3().crossVectors(c,u);
  return `col+=${v3(L.c)}*${f5(L.i)}*card(d,${v3(c.toArray())},${v3(u.toArray())},${v3(v.toArray())},vec2(${f5(L.w/2/d)},${f5(L.h/2/d)}),${f5(L.soft)}+blur);`}).join('\n');
const ENV_GLSL=envLines(STUDIO), ENV_GLSL_FLOOR=envLines(STUDIO.filter(L=>L.floor!==false)), ENV_GLSL_KEY=envLines([STUDIO[0]]);
// le studio vu dans une direction d ; blur élargit les bords des panneaux (reflet diffus, liquide un peu trouble)
const ENV_FN=`
float card(vec3 d,vec3 c,vec3 u,vec3 v,vec2 hs,float soft){
  float k=dot(d,c);if(k<=0.02)return 0.0;
  vec2 q=abs(vec2(dot(d,u),dot(d,v))/k);
  vec2 e=1.-smoothstep(hs-soft,hs+soft,q);
  vec2 g=clamp(1.-q*q/(hs*hs),0.,1.);                  // cœur du panneau plus chaud que ses bords
  return e.x*e.y*(.6+.4*g.x*g.y);}
vec3 env(vec3 d,float blur){
  float below=1.-smoothstep(-.06-blur*.2,.02+blur*.2,d.y);   // sous l'horizon : le sol noir brillant
  d.y=abs(d.y);                                              // il renvoie le studio comme un miroir sombre
  vec3 col=vec3(.0028,.0021,.0023)+vec3(.0036,.0027,.0027)*smoothstep(-.3,.9,d.y);
  ${ENV_GLSL}
  float k=mix(.70,.08,clamp(d.y*1.6,0.,1.));                 // reflet fort en rasant, faible en plongeant
  return mix(col,col*k+vec3(.0028,.0021,.0021),below);}
// ce que le sol renvoie du studio (le projecteur lui-même reste hors champ)
vec3 envFloor(vec3 d,float blur){
  d.y=abs(d.y);vec3 col=vec3(.0028,.0021,.0023)+vec3(.0036,.0027,.0027)*smoothstep(-.3,.9,d.y);
  ${ENV_GLSL_FLOOR}
  return col;}
// le projecteur seul : l'eau plate ne le renvoie pas vers la caméra, mais le flanc d'une ride, si
vec3 envKey(vec3 d,float blur){vec3 col=vec3(0.);
  ${ENV_GLSL_KEY}
  return col;}`;
// relief du verre moulé (mm), dans le repère de la bouteille : ondulations, peau d'orange,
// coutures de moule verticales et horizontales, couronne de picots au talon
const GLASS_FN=`
float hash3(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1.,0.,0.)),f.x),mix(hash3(i+vec3(0.,1.,0.)),hash3(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(hash3(i+vec3(0.,0.,1.)),hash3(i+vec3(1.,0.,1.)),f.x),mix(hash3(i+vec3(0.,1.,1.)),hash3(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float glassH(vec3 p,float fine){
  float r=length(p.xz);float a=atan(p.x,p.z);
  float h=.16*vnoise(p/vec3(13.,21.,13.))+.05*vnoise(p/4.6)+.009*fine*vnoise(p/1.2);
  float ds=abs(abs(a)-1.5708)*r;
  h+=.07*exp(-ds*ds/.09);
  float dr1=p.y-${f5(SEAM_Y)};float dr2=p.y-7.3;h+=.045*exp(-dr1*dr1/.10)+.04*exp(-dr2*dr2/.10);
  float band=smoothstep(1.,1.7,p.y)*(1.-smoothstep(5.7,6.4,p.y))*step(27.,r);
  vec2 g=vec2(a/6.28318*150.,p.y/1.2);g.x+=.5*mod(floor(g.y),2.);
  h+=band*fine*.26*(1.-smoothstep(.10,.44,length(fract(g)-.5)));
  return h;}
vec3 bumpN(vec3 p,vec3 n,float px){
  float fine=clamp(1.7-px*2.2,0.,1.);
  vec3 t1=normalize(vec3(p.z,0.,-p.x)+vec3(1e-4,0.,0.));vec3 t2=cross(n,t1);
  float e=.12+px*.5;
  float h0=glassH(p,fine);
  return normalize(n-((glassH(p+t1*e,fine)-h0)*t1+(glassH(p+t2*e,fine)-h0)*t2)/e);}`;

const VS=`varying vec3 vW;varying vec3 vN;
void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vN=(modelMatrix*vec4(normal,0.0)).xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
// verre : reflets nets du studio (Fresnel) déformés par le relief du verre, halo diffus, bords et fond épais assombris
const FS_GLASS=`uniform mat4 uInvModel;uniform vec3 uN;uniform float uD;uniform vec3 uWetN;uniform float uWetL;uniform sampler2D uMist;uniform float uFog;uniform vec3 uKey;varying vec3 vW;varying vec3 vN;
${ENV_FN}
${GLASS_FN}
void main(){
  vec3 V=normalize(vW-cameraPosition);vec3 Ng=normalize(vN);
  vec3 pl=(uInvModel*vec4(vW,1.)).xyz;float px=length(fwidth(pl));
  vec3 N=normalize((vec4(bumpN(pl,normalize((uInvModel*vec4(Ng,0.)).xyz),px),0.)*uInvModel).xyz);
  float far=step(0.,dot(Ng,V));if(far>.5)N=-N;        // paroi du fond, vue de l'intérieur
  float c=clamp(dot(-V,N),0.,1.);
  float F=.08+.92*pow(1.-c,5.);                        // deux faces de verre : ~8 % de reflet de face
  vec3 Rr=reflect(V,N);
  vec3 col=1.-exp(-(env(Rr,0.)*.85+env(Rr,.3)*.32)*F*mix(1.,.55,far)*1.3);
  float base=1.-smoothstep(2.4,4.4,pl.y);              // fond épais
  float aS=clamp(max(col.r,max(col.g,col.b))*2.2,0.,1.);
  float aD=(.30*pow(1.-c,3.)+.30*base)*(1.-far);
  gl_FragColor=vec4(col,1.);
  #include <encodings_fragment>
  gl_FragColor=vec4(gl_FragColor.rgb*aS+vec3(.030,.040,.036)*base*(1.-far)*(1.-aS),aS+aD*(1.-aS));
  // film de liquide laissé sur le verre là où la surface vient de passer : il s'égoutte en une seconde environ
  float film=smoothstep(0.,1.2,dot(uN,vW)-uD)*smoothstep(0.,3.,uWetL-dot(uWetN,pl)-5.*vnoise(vec3(pl.x*.4,3.,pl.z*.4)))*step(${f5(Y0)},pl.y)*step(pl.y,${f5(Y1)});
  film*=.45+.55*vnoise(vec3(pl.x*.9,pl.y*.07,pl.z*.9));       // bord irrégulier et coulures, accrochés au verre
  gl_FragColor.rgb+=vec3(.55,.03,.07)*film*.6*(1.-gl_FragColor.a);
  gl_FragColor.a+=film*.36*(1.-gl_FragColor.a);
  // buée : voile de micro-gouttes sur la face extérieure, éclairé par le projecteur ; absent là où une goutte vient de passer
  float mraw=texture2D(uMist,vec2(atan(pl.x,pl.z)/6.28318+.5,pl.y/${f5(HTOP)})).r*uFog*(1.-far)*smoothstep(.4,2.,pl.y)*(1.-smoothstep(224.5,226.,pl.y));
  float inLiq=step(dot(uN,vW),uD);                      // derrière le verre : du liquide (la buée rosit) ou du vide
  float lk=max(dot(N,uKey),0.);float lf=max(dot(N,vec3(.66,.24,.71)),0.);
  vec3 mc=mix(vec3(.40,.42,.45),vec3(.30,.06,.08),inLiq)*min(.5+.9*lk+.45*lf,1.3);
  float ma=mraw*(.5+.35*vnoise(pl*2.3)+.3*vnoise(pl*8.))*.30;
  gl_FragColor.rgb+=mc*ma*(1.-gl_FragColor.a);
  gl_FragColor.a+=ma*(1.-gl_FragColor.a);
  // perles fines de la buée, trop petites pour être simulées une à une : une par case d'environ 1,1 mm,
  // qui réapparaît à son rythme quand la buée revient ; visibles surtout de près
  float fineK=clamp(1.5-px*3.2,0.,1.);
  if(mraw>.01&&fineK>0.){
    float rr=length(pl.xz);vec2 sp=vec2(atan(pl.x,pl.z)*rr,pl.y)/1.1;
    sp+=(vec2(vnoise(pl*.55),vnoise(pl*.55+17.))-.5)*2.6;                 // semis irrégulier : on tord la grille…
    sp.x+=hash3(vec3(floor(sp.y),1.,4.))*7.;vec2 ci=floor(sp);            // … et on décale chaque rangée
    float h1=hash3(vec3(ci,3.));float h2=hash3(vec3(ci,9.));float h3=hash3(vec3(ci,5.));
    vec2 bd=(fract(sp)-.5-(vec2(h1,h2)-.5)*.44)/(.10+.18*h3);float b2=dot(bd,bd);
    if(b2<1.&&mraw>.18+.7*h1*h3&&h2*h3<.6){
      vec3 t1=(vec4(pl.z/rr,0.,-pl.x/rr,0.)*uInvModel).xyz;vec3 t2=(vec4(0.,1.,0.,0.)*uInvModel).xyz;
      vec2 tv=bd*.87/sqrt(1.-.75*b2);vec3 Nb=normalize(N+t1*tv.x+t2*tv.y);
      float cb=clamp(dot(-V,Nb),0.,1.);float Fb=.02+.98*pow(1.-cb,5.);
      float rel=dot(Nb,uKey)-dot(N,uKey);
      vec3 bc=env(reflect(V,Nb),0.)*Fb*1.5+mix(vec3(.55,.60,.66),vec3(1.,.09,.08),inLiq)*smoothstep(.10,.70,-rel)*clamp(dot(N,uKey)*.9+.55,0.,1.)*1.1;
      bc=pow(1.-exp(-bc*1.15),vec3(1./2.2));
      float ba=clamp(.04+.40*smoothstep(.55,1.,b2)+.22*smoothstep(.15,.7,rel)+max(bc.r,max(bc.g,bc.b))*.9,0.,.95)*fineK;
      gl_FragColor.rgb=gl_FragColor.rgb*(1.-ba)+bc*fineK;gl_FragColor.a=gl_FragColor.a*(1.-ba)+ba;
    }
  }
}`;
// passe 1 : faces arrière du volume (normale + distance) pour connaître l'épaisseur de liquide traversée
const FS_BACK=`varying vec3 vW;varying vec3 vN;uniform float uRef;
void main(){gl_FragColor=vec4(normalize(vN),length(vW-cameraPosition)-uRef+128.0);}`;
// passe 2 : le liquide. La lumière entre par le verre (avec son relief), traverse, ressort ou se réfléchit
// à l'intérieur selon Fresnel, et est absorbée selon l'épaisseur (Beer-Lambert) : mince = rouge vif, épais = bordeaux.
// La surface libre = plan qui penche + champ de vagues simulé (texture uWave) + bulles d'air.
const FS_LIQ=`
#define NP ${inner.length}
#define NB ${NB}
uniform sampler2D uBack;uniform vec2 uRes;uniform vec3 uN;uniform float uD;
uniform float uRef;uniform float uHasBack;uniform mat4 uVP;uniform mat4 uIVP;uniform mat4 uInvModel;uniform vec3 uSigma;
uniform vec2 uProf[NP];uniform sampler2D uWave;uniform vec3 uTA;uniform vec3 uTB;uniform vec3 uO;uniform float uWL;uniform vec4 uBub[NB];uniform vec3 uKey;
varying vec3 vW;varying vec3 vN;
const float IOR=1.34;
${ENV_FN}
${GLASS_FN}
// hauteur (mm) et pentes de la surface au-dessus du plan, lues dans la simulation
vec3 wave(vec3 P){
  vec2 uw=clamp(vec2(dot(P-uO,uTA),dot(P-uO,uTB))/(2.*uWL)+.5,0.,1.)*64.+.5;
  vec2 fu=fract(uw);fu=fu*fu*(3.-2.*fu);                 // interpolation lissée : pas de facettes entre les cases
  vec4 s=texture2D(uWave,(floor(uw)+fu-.5)/64.);
  return vec3((s.r-.5)*14.,(s.gb-.5)*3.);}
float rInner(float y){float r=0.;
  for(int i=1;i<NP;i++){vec2 a=uProf[i-1];vec2 b=uProf[i];if(b.y>a.y&&y>=a.y&&y<=b.y)r=mix(a.x,b.x,(y-a.y)/(b.y-a.y));}
  return r;}
// normale de la surface libre : vagues + ménisque (le liquide remonte contre le verre)
vec3 surfN(vec3 P){
  vec3 w=wave(P);vec3 n=uN-w.y*uTA-w.z*uTB;
  vec3 pl=(uInvModel*vec4(P,1.)).xyz;float r=length(pl.xz);
  float d=max(rInner(pl.y)-r,0.);
  vec3 ro=(vec4(pl.x,0.,pl.z,0.)*uInvModel).xyz/max(r,1e-3);
  ro-=uN*dot(ro,uN);
  n-=ro*1.1*exp(-d/1.25);
  return normalize(n);}
// Fresnel exact entre deux milieux (eta = indice de départ / indice d'arrivée) ; 1 = réflexion totale
float fres(float ci,float eta){ci=clamp(ci,0.,1.);float s2=eta*eta*(1.-ci*ci);if(s2>=1.)return 1.;
  float ct=sqrt(1.-s2);float rs=(eta*ci-ct)/(eta*ci+ct);float rp=(ci-eta*ct)/(ci+eta*ct);return .5*(rs*rs+rp*rp);}
vec3 rayAt(vec2 uv){vec4 w=uIVP*vec4(uv*2.-1.,1.,1.);return normalize(w.xyz/w.w-cameraPosition);}
vec3 through(vec3 d){return env(d,0.)*.9+env(d,.18)*.1;}    // vu à travers le liquide : net + un léger halo
void main(){
  vec3 cam=cameraPosition;
  vec3 V=normalize(vW-cam);
  float tIn=length(vW-cam);
  vec2 uv=gl_FragCoord.xy/uRes;
  vec3 Ng=normalize(vN);
  vec3 plIn=(uInvModel*vec4(vW,1.)).xyz;float px=length(fwidth(plIn));
  vec3 N1=normalize((vec4(bumpN(plIn,normalize((uInvModel*vec4(Ng,0.)).xyz),px),0.)*uInvModel).xyz);
  if(dot(N1,V)>-.03)N1=Ng;
  vec4 b=texture2D(uBack,uv);
  float tOut;vec3 Nb;
  if(uHasBack>.5&&b.a>0.){tOut=b.a-128.+uRef;Nb=normalize(b.xyz);}
  else{tOut=tIn+4.+52.*abs(dot(Ng,V));Nb=normalize(Ng-2.*dot(Ng,V)*V);}
  tOut=max(tOut,tIn+.3);
  float hIn=uD+wave(vW).x-dot(uN,vW);          // > 0 : ce point de la paroi est sous la surface
  vec3 P0;vec3 T1;vec3 refl=vec3(0.);float F=0.;bool top=false;
  if(hIn>0.){P0=vW;T1=refract(V,N1,1./IOR);if(dot(T1,T1)<.5)T1=V;}
  else{                                        // au-dessus : on ne voit du liquide que si le regard plonge sur la surface
    float dn=dot(uN,V);if(dn>-1e-4)discard;
    float tp=(uD-dot(uN,cam))/dn;
    tp=(uD+wave(cam+V*tp).x-dot(uN,cam))/dn;
    if(tp>=tOut-.05)discard;
    tp=max(tp,tIn);P0=cam+V*tp;top=true;
    vec3 nr=surfN(P0);
    F=fres(dot(-V,nr),1./IOR);
    vec3 Rr=reflect(V,nr);
    refl=env(Rr,0.)*.88+env(Rr,.3)*.12;
    T1=refract(V,nr,1./IOR);if(dot(T1,T1)<.5)T1=V;
    tIn=tp;
  }
  float d0=max(tOut-tIn,.3);
  vec3 Pb=cam+V*tOut;vec3 N2=Nb;
  if(uHasBack>.5){                             // où le rayon réfracté ressort-il vraiment ? (2 passes)
    for(int i=0;i<2;i++){
      vec4 cl=uVP*vec4(P0+T1*d0,1.);vec2 uv2=cl.xy/cl.w*.5+.5;
      vec4 b2=texture2D(uBack,uv2);
      if(b2.a>0.){Pb=cam+rayAt(uv2)*(b2.a-128.+uRef);N2=normalize(b2.xyz);d0=max(dot(Pb-P0,T1),.3);}
    }
  }
  float dW=max(length(Pb-P0),.3);
  float dnT=dot(uN,T1);
  float sP=(!top&&dnT>1e-4)?hIn/dnT:1e9;       // le rayon ressort-il par la surface (vue par en dessous) ?
  float thin=top?0.:1.-smoothstep(0.,1.9,hIn); // ménisque : coin de liquide plus mince contre la paroi
  vec3 col;float path;
  if(sP<dW){
    vec3 nr=surfN(P0+T1*sP);
    float Fs=fres(dot(T1,nr),IOR);
    path=sP;
    vec3 Lr=env(reflect(T1,-nr),.12)*exp(-uSigma*dW*.7);   // sous la surface : miroir
    vec3 Lt=vec3(0.);
    if(Fs<.999){vec3 T2=refract(T1,-nr,IOR);if(dot(T2,T2)>.5)Lt=through(T2);}
    col=mix(Lt,Lr,Fs);
  }else{
    path=dW;
    // le verre du fond a lui aussi son relief : la lumière qui ressort ondule un peu, comme dans une vraie bouteille
    vec3 plb=(uInvModel*vec4(Pb,1.)).xyz;
    vec3 N2b=normalize((vec4(bumpN(plb,normalize((uInvModel*vec4(N2,0.)).xyz),px),0.)*uInvModel).xyz);
    if(dot(T1,N2b)>.03)N2=N2b;
    float ci=dot(T1,N2);
    float F2=ci>0.?fres(ci,IOR):0.;
    vec3 Lt=vec3(0.);
    if(F2<.999){vec3 T2=ci>.03?refract(T1,-N2,IOR):T1;if(dot(T2,T2)<.5)T2=T1;
      Lt=through(T2);
      vec3 pl=plb;                             // derrière : le dos de l'étiquette bloque le contre-jour
      float lab=smoothstep(${f5(LABEL_Y-3)},${f5(LABEL_Y+3)},pl.y)*(1.-smoothstep(${f5(LABEL_Y+LABEL_H-4)},${f5(LABEL_Y+LABEL_H+4)},pl.y))*step(${f5(R-WALL-3)},length(pl.xz));
      Lt=mix(Lt,vec3(.10,.082,.07),lab);}
    vec3 Lr=env(reflect(T1,-N2),.15)*exp(-uSigma*dW*.9);   // reflet interne : la lumière repart vers l'avant
    col=mix(Lt,Lr,F2);
  }
  float seg=path;
  path*=1.-.72*thin*thin;
  col*=exp(-uSigma*path);
  col+=vec3(.0035,.00015,.0004)*(1.-exp(-.05*path));
  for(int i=0;i<NB;i++){vec4 bb=uBub[i];        // bulles d'air : petites sphères miroir dans le liquide
    if(bb.w>0.){vec3 dd=bb.xyz-P0;float t=clamp(dot(dd,T1),0.,seg);vec3 cc=P0+T1*t-bb.xyz;float d2=dot(cc,cc);
      if(d2<bb.w*bb.w){float kk=sqrt(d2)/bb.w;vec3 nb=normalize(cc-T1*sqrt(bb.w*bb.w-d2));
        vec3 rd=reflect(T1,nb);
        vec3 rb=(env(rd,.08)*1.6+vec3(1.,.9,.8)*6.*pow(max(dot(rd,uKey),0.),30.))*exp(-uSigma*(t+6.));   // elles accrochent le projecteur
        col=mix(col,rb+col*.3,(.25+.75*smoothstep(.2,.95,kk))*.9);}}}
  if(top)col=mix(col,refl,F);
  else col+=env(reflect(V,normalize(Ng*.5+uN*.87)),.06)*vec3(1.,.30,.34)*.20*pow(thin,5.);   // filet brillant du ménisque
  col=1.-exp(-col*1.15);
  gl_FragColor=vec4(col,1.);
  #include <encodings_fragment>
}`;
// sol noir brillant : miroir (image de la scène vue par une caméra retournée sous le sol), un peu flouté et imparfait ;
// flaque de lumière du projecteur ; ombre de la bouteille ; tache rouge de la lumière qui a traversé le liquide.
const FS_FLOOR=`
#define NP ${inner.length}
#define NR ${NRIP}
uniform vec4 uRip[NR];uniform float uTime;
uniform sampler2D uRefl;uniform mat4 uReflVP;uniform vec2 uReflPx;uniform float uHasRefl;uniform vec3 uBase;uniform vec3 uKey;uniform float uLift;
uniform mat4 uInvModel;uniform vec3 uA0;uniform vec3 uA1;uniform vec3 uN;uniform float uD;uniform vec2 uProf[NP];uniform vec3 uSigma;
uniform sampler2D uWave;uniform vec3 uTA;uniform vec3 uTB;uniform vec3 uO;uniform float uWL;
varying vec3 vW;
${ENV_FN}
${GLASS_FN}
float rInner(float y){float r=0.;
  for(int i=1;i<NP;i++){vec2 a=uProf[i-1];vec2 b=uProf[i];if(b.y>a.y&&y>=a.y&&y<=b.y)r=mix(a.x,b.x,(y-a.y)/(b.y-a.y));}
  return r;}
vec3 toS(vec3 c){return pow(clamp(c,0.,1.),vec3(1./2.2));}
// Ronds dans l'eau : chaque goutte tombée lance un paquet d'ondes capillaires (deux longueurs d'onde, 9 et 17 mm)
// qui avance à ~23 cm/s (la vitesse minimale des rides sur l'eau), s'étale, et s'éteint par étalement (1/√r) et viscosité.
// Renvoie la pente de la surface (∂h/∂x, ∂h/∂z).
vec2 ripples(vec2 q){vec2 g=vec2(0.);
  for(int i=0;i<NR;i++){vec4 rp=uRip[i];float t=uTime-rp.z;
    if(rp.w>0.&&t>0.&&t<7.){vec2 d=q-rp.xy;float r=length(d)+1e-3;
      float fr=231.*t;float w=5.+.17*fr;float x=r-fr*.84;float en=exp(-x*x/(w*w));
      if(en>.004){float ph=r-fr;float a=rp.w*exp(-t/1.7)/sqrt(1.+r/9.);
        float cs=.6*cos(.698*ph)+.4*cos(.370*ph);float sn=.6*.698*sin(.698*ph)+.4*.370*sin(.370*ph);
        g+=d/r*a*en*(-sn-cs*2.*x/(w*w));}}}
  return g;}
void main(){
  vec3 V=normalize(vW-cameraPosition);
  vec2 q=vW.xz;
  float n3=vnoise(vec3(q*.7,8.));
  // le sol est une eau parfaitement plate : seules les gouttes qui y tombent la rident
  vec2 rg=ripples(q)*(1.-smoothstep(2.,6.,max(fwidth(q.x),fwidth(q.y))));
  vec2 wob=-rg*.2;
  float r=length(q-uBase.xz);
  // --- miroir
  vec4 cl=uReflVP*vec4(vW,1.);vec2 uv=cl.xy/cl.w*.5+.5+wob;
  float rad=min(.8+r*.006+uLift*.03,5.);                                    // miroir d'eau : net, à peine plus doux en s'éloignant
  vec4 acc=texture2D(uRefl,uv)*.20;
  for(int i=0;i<8;i++){float a=float(i)*.7854+n3*6.283;acc+=texture2D(uRefl,uv+vec2(cos(a),sin(a))*uReflPx*rad*(i<4?1.:.5))*.10;}
  acc*=uHasRefl;
  float c=max(-V.y,0.);
  float F=.045+.955*pow(1.-c,5.);
  float gloss=.94;
  vec3 Rv=reflect(V,normalize(vec3(wob.x*5.,1.,wob.y*5.)));
  float rl=length(rg);
  // --- lumière du projecteur sur le sol : une flaque fixe dans l'espace, allongée dans l'axe du faisceau
  vec3 L=uKey;vec2 lh=normalize(L.xz);
  vec2 d2=q+lh*40.;float al=dot(d2,lh);float ac=dot(d2,vec2(-lh.y,lh.x));
  float pool=exp(-(al*al)/(330.*330.)-(ac*ac)/(215.*215.));
  vec3 light=vec3(1.,.94,.84)*2.4*L.y*pool;
  // autour, c'est la nuit : hors de la flaque, l'eau ne renvoie presque plus rien du studio et les rides ne brillent plus
  vec3 mir=acc.rgb+toS(1.-exp(-envFloor(Rv,.10)*1.15))*(1.-acc.a)*.20*(.10+.90*pool)+toS(1.-exp(-envKey(Rv,.05)*.10))*.7*smoothstep(.008,.05,rl)*(.14+.62*pool);
  float k=clamp(F*3.2,0.,.80)*gloss;
  // --- ce que la bouteille laisse passer : rien (étiquette, capsule), presque tout (verre), ou du rouge concentré (liquide)
  vec3 ab=uA1-uA0;float abl=length(ab);vec3 ax=ab/abl;vec3 w0=vW-uA0;
  float bq=dot(L,ax);float dq=dot(L,w0);float eq=dot(ax,w0);float den=max(1.-bq*bq,1e-3);
  float tq=clamp((eq-bq*dq)/den,-4.,abl+4.);float sq=max(tq*bq-dq,0.);
  float dmin=length(vW+L*sq-(uA0+ax*tq));
  vec3 trans=vec3(1.);
  if(dmin<38.){
    float hl=min(sqrt(38.*38.-dmin*dmin)/sqrt(max(1.-bq*bq,.02)),280.);float ds=2.*hl/22.;
    float liq=0.;float blk=0.;float gl=0.;
    for(int i=0;i<22;i++){float s=sq-hl+(float(i)+.5)*ds;
      if(s>0.){vec3 P=vW+L*s;vec3 pl=(uInvModel*vec4(P,1.)).xyz;float rr=length(pl.xz);
        float e=.5+.028*s;                                           // pénombre : le bord de l'ombre s'élargit avec la distance
        float cc=(1.-smoothstep(15.2-e,15.2+e,rr))*smoothstep(${f5(179.6+CAP_DY)}-e,${f5(179.6+CAP_DY)}+e,pl.y)*(1.-smoothstep(${f5(197.4+CAP_DY)}-e,${f5(197.4+CAP_DY)}+e,pl.y));
        float lc=(1.-smoothstep(30.4-e,30.4+e,rr))*smoothstep(${f5(LABEL_Y)}-e,${f5(LABEL_Y)}+e,pl.y)*(1.-smoothstep(${f5(LABEL_Y+LABEL_H)}-e,${f5(LABEL_Y+LABEL_H)}+e,pl.y));
        blk=max(blk,max(cc,lc*.93));
        float ri=rInner(clamp(pl.y,${f5(Y0+.1)},${f5(Y1-.1)}));float yin=smoothstep(-e,e,pl.y)*(1.-smoothstep(${f5(HTOP)}-e,${f5(HTOP)}+e,pl.y));
        liq+=ds*(1.-smoothstep(ri-e,ri+e,rr))*smoothstep(-e,e,uD-dot(uN,P))*yin;
        gl=max(gl,(1.-smoothstep(ri+.9-e,ri+.9+e,rr))*yin);}}
    float shim=1.;float dnl=dot(uN,L);
    if(abs(dnl)>.05){float sp=(uD-dot(uN,vW))/dnl;vec3 Ps=vW+L*sp;
      vec4 ws=texture2D(uWave,clamp(vec2(dot(Ps-uO,uTA),dot(Ps-uO,uTB))/(2.*uWL)+.5,0.,1.));
      shim=clamp(1.+((ws.g-.5)+(ws.b-.5))*10.+(ws.r-.5)*3.,.3,2.8);}               // la tache danse avec les vagues
    vec3 tl=exp(-uSigma*liq*.55)*(.22+3.3*exp(-dmin*dmin/98.))*shim*20.;            // le liquide fait loupe : trait vif au centre de l'ombre
    trans=mix(vec3(1.-.2*gl),tl,smoothstep(0.,4.,liq))*(1.-blk);
  }
  // sous l'eau, les rides concentrent ou dispersent un peu la lumière du projecteur sur le fond
  vec3 lin=vec3(.00004,.000033,.000036)+.0016*light*trans*clamp(1.-7.*dot(rg,lh),.3,2.2);
  vec3 col=toS(1.-exp(-lin*1.15))+mir*k;
  float a=1.-smoothstep(9000.,20000.,length(q));
  gl_FragColor=vec4(col*a,a);
}`;
const WN=64, waveData=new Uint8Array(WN*WN*4).fill(128), waveTex=new THREE.DataTexture(waveData,WN,WN,THREE.RGBAFormat);
waveTex.minFilter=waveTex.magFilter=THREE.LinearFilter;waveTex.needsUpdate=true;
// buée : carte (tour × hauteur) de la fine condensation sur le verre ; les gouttes qui coulent y tracent des chemins nets
const MW=256, MH=512, mist=new Uint8Array(MW*MH), mistTex=new THREE.DataTexture(mist,MW,MH,THREE.LuminanceFormat);
for(let i=0;i<MW*MH;i++)mist[i]=205+Math.random()*45;
mistTex.minFilter=mistTex.magFilter=THREE.LinearFilter;mistTex.wrapS=THREE.RepeatWrapping;mistTex.needsUpdate=true;
const U={uBack:{value:null},uRes:{value:new THREE.Vector2(1,1)},uN:{value:new THREE.Vector3(0,1,0)},uD:{value:0},
  uRef:{value:0},uHasBack:{value:0},uVP:{value:new THREE.Matrix4()},uIVP:{value:new THREE.Matrix4()},uInvModel:{value:new THREE.Matrix4()},
  uSigma:{value:new THREE.Vector3(.0042,.26,.23)},   // absorption par mm (R, V, B)
  uProf:{value:inner.map(([r,y])=>new THREE.Vector2(r,y))},
  uWave:{value:waveTex},uTA:{value:new THREE.Vector3(-1,0,0)},uTB:{value:new THREE.Vector3(0,0,1)},uO:{value:new THREE.Vector3()},uWL:{value:36},
  uBub:{value:Array.from({length:NB},()=>new THREE.Vector4())},uKey:{value:KEY},
  uWetN:{value:new THREE.Vector3(0,1,0)},uWetL:{value:0},         // surface « en retard » (repère bouteille) → film sur le verre
  uMist:{value:mistTex},uFog:{value:1}};
const liquid=new THREE.Mesh(liqGeo,new THREE.ShaderMaterial({uniforms:U,vertexShader:VS,fragmentShader:FS_LIQ,side:THREE.FrontSide,toneMapped:false,extensions:{derivatives:true}}));
liquid.renderOrder=0;group.add(liquid);
const glass=new THREE.Mesh(lathe(prof,160),new THREE.ShaderMaterial({uniforms:{uInvModel:U.uInvModel,uN:U.uN,uD:U.uD,uWetN:U.uWetN,uWetL:U.uWetL,uMist:U.uMist,uFog:U.uFog,uKey:U.uKey},vertexShader:VS,fragmentShader:FS_GLASS,side:THREE.DoubleSide,
  transparent:true,premultipliedAlpha:true,depthWrite:false,toneMapped:false,extensions:{derivatives:true}}));
glass.renderOrder=2;group.add(glass);

const gl=renderer.getContext();
const canFloat=renderer.capabilities.isWebGL2?!!(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float')):!!(gl.getExtension('OES_texture_half_float')&&gl.getExtension('EXT_color_buffer_half_float'));
let rt=null;const backScene=new THREE.Scene();
const backMesh=new THREE.Mesh(liqGeo,new THREE.ShaderMaterial({uniforms:{uRef:U.uRef},vertexShader:VS,fragmentShader:FS_BACK,side:THREE.BackSide,toneMapped:false}));
backMesh.matrixAutoUpdate=false;backMesh.frustumCulled=false;backScene.add(backMesh);
if(canFloat){rt=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,stencilBuffer:false});
  rt.texture.generateMipmaps=false;U.uBack.value=rt.texture;U.uHasBack.value=1;}

// sol + image miroir de la scène
const rtRefl=new THREE.WebGLRenderTarget(4,4,{format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,encoding:THREE.sRGBEncoding,stencilBuffer:false});
rtRefl.texture.generateMipmaps=false;
const FU={uRefl:{value:rtRefl.texture},uReflVP:{value:new THREE.Matrix4()},uReflPx:{value:new THREE.Vector2(1,1)},uHasRefl:{value:1},
  uBase:{value:new THREE.Vector3()},uKey:{value:KEY},uLift:{value:0},uInvModel:U.uInvModel,uA0:{value:new THREE.Vector3()},uA1:{value:new THREE.Vector3()},
  uN:U.uN,uD:U.uD,uProf:U.uProf,uSigma:U.uSigma,uWave:U.uWave,uTA:U.uTA,uTB:U.uTB,uO:U.uO,uWL:U.uWL,
  uRip:{value:Array.from({length:NRIP},()=>new THREE.Vector4(0,0,-100,0))},uTime:{value:0}};
const floor=new THREE.Mesh(new THREE.PlaneGeometry(44000,44000),new THREE.ShaderMaterial({uniforms:FU,
  vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:FS_FLOOR,transparent:true,premultipliedAlpha:true,depthWrite:false,toneMapped:false,extensions:{derivatives:true}}));
floor.rotation.x=-Math.PI/2;floor.position.y=FLOOR_Y;floor.renderOrder=-1;scene.add(floor);

// ---------- capsule à vis en aluminium doré ----------
// Forme : bague d'inviolabilité, jonc, jupe filetée, bande moletée, dessus légèrement embouti.
const capPts=[[13.7,180.2],[14.5,179.6],[15.0,179.9],[15.0,183.0],[14.82,183.25],[15.0,183.5],[15.0,183.9],[15.28,184.4],[15.0,184.9],[15.0,192.4],
  [15.22,192.75],[15.05,193.1],[15.05,196.5],[14.85,196.95],[14.3,197.3],[13.5,197.4],[10.6,197.4],[10.3,197.25],[0,197.25]];
// Matière : relief (pas de vis roulé, molette, fente de la bague), brossage fin, creux ombrés — dessinés dans 3 textures.
function capTextures(pts){
  const S=[0];for(let i=1;i<pts.length;i++)S.push(S[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const ST=S[S.length-1],W=2048,Hh=512,H=new Float32Array(W*Hh),D=new Float32Array(W*Hh),RG=new Float32Array(Hh);
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
  for(let iy=0;iy<Hh;iy++){
    const s=(iy+.5)/Hh*ST;let k=1;while(k<pts.length-1&&S[k]<s)k++;
    const t=(s-S[k-1])/Math.max(S[k]-S[k-1],1e-6),r=pts[k-1][0]+(pts[k][0]-pts[k-1][0])*t,y=pts[k-1][1]+(pts[k][1]-pts[k-1][1])*t;
    const side=r>14.6&&y<196.8,br=rnd()-.5,ph=rnd()*6.283,br2=rnd()-.5;RG[iy]=.30+.16*(rnd()-.5);
    const fT=sm(185.3,186.1,y)*(1-sm(191.5,192.3,y)),fK=sm(193.15,193.5,y)*(1-sm(196.1,196.45,y));
    const slit=Math.exp(-Math.pow((y-183.25)/.17,2)),ring=side?0:Math.exp(-Math.pow((r-12.2)/.4,2));
    for(let ix=0;ix<W;ix++){const u=(ix+.5)/W;let h=0,d=0;
      if(side){
        if(fT>0){const g=Math.pow(.5+.5*Math.cos(6.28318*((y-185.3)/3.3-u)),1.6)*fT;h-=.40*g;d=Math.max(d,g*.8)}   // pas de vis
        if(fK>0){const tri=Math.abs(2*((u*100)%1)-1);h+=.24*fK*tri;d=Math.max(d,fK*(1-tri)*.7)}                      // molette
        if(slit>.01){const open=((u*10)%1)>.1?1:.15;h-=.30*slit*open;d=Math.max(d,slit*open)}                        // fente + ponts
      }else h+=.10*ring;
      h+=.006*br*(.65+.35*Math.sin(u*6.28318*3+ph))+.003*br2;                                                       // brossage
      H[iy*W+ix]=h;D[iy*W+ix]=d;}}
  const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=Hh;return c};
  const cn=mk(),cr=mk(),cc=mk(),xn=cn.getContext('2d'),xr=cr.getContext('2d'),xc=cc.getContext('2d');
  const dn=xn.createImageData(W,Hh),dr=xr.createImageData(W,Hh),dc=xc.createImageData(W,Hh);
  const du=2*Math.PI*15/W,dv=ST/Hh;
  for(let iy=0;iy<Hh;iy++)for(let ix=0;ix<W;ix++){
    const i=iy*W+ix,o=((Hh-1-iy)*W+ix)*4;
    const nx=-(H[iy*W+(ix+1)%W]-H[iy*W+(ix+W-1)%W])/(2*du),ny=-(H[Math.min(iy+1,Hh-1)*W+ix]-H[Math.max(iy-1,0)*W+ix])/(2*dv),L=Math.hypot(nx,ny,1);
    dn.data[o]=(nx/L*.5+.5)*255;dn.data[o+1]=(ny/L*.5+.5)*255;dn.data[o+2]=(1/L*.5+.5)*255;dn.data[o+3]=255;
    const d=D[i],ao=1-.55*d;
    dr.data[o]=255;dr.data[o+1]=Math.min(255,(RG[iy]+.30*d)*255);dr.data[o+2]=255;dr.data[o+3]=255;
    dc.data[o]=226*ao;dc.data[o+1]=184*ao;dc.data[o+2]=104*ao;dc.data[o+3]=255;}
  xn.putImageData(dn,0,0);xr.putImageData(dr,0,0);xc.putImageData(dc,0,0);
  const tx=(c,srgb)=>{const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();if(srgb)t.encoding=THREE.sRGBEncoding;return t};
  return{normal:tx(cn),rm:tx(cr),map:tx(cc,true)};
}
const capTex=capTextures(capPts);
const cap=new THREE.Mesh(lathe(capPts,128),new THREE.MeshStandardMaterial({color:0xffffff,map:capTex.map,metalness:1,roughness:1,
  metalnessMap:capTex.rm,roughnessMap:capTex.rm,normalMap:capTex.normal,normalScale:new THREE.Vector2(1,1),envMapIntensity:1.25}));
cap.position.y=CAP_DY;group.add(cap);

// étiquette enroulée (+ son dos, visible à travers le verre)
const labelMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5,metalness:0,envMapIntensity:0.4});
const label=new THREE.Mesh(new THREE.CylinderGeometry(R+0.35,R+0.35,LABEL_H,192,1,true),labelMat);
label.position.y=LABEL_Y+LABEL_H/2;
// face avant (logo, ~53,6 mm depuis le bord gauche) tournée vers la caméra
label.rotation.y=-((321.5/6-OVER)/(LABEL_W-OVER))*Math.PI*2;label.renderOrder=3;group.add(label);
const labelBack=new THREE.Mesh(new THREE.CylinderGeometry(R+0.3,R+0.3,LABEL_H,96,1,true),new THREE.MeshStandardMaterial({color:0xb9ad9d,roughness:.95,metalness:0,side:THREE.BackSide,envMapIntensity:.3}));
labelBack.position.y=label.position.y;group.add(labelBack);

// ---------- manipulation : on tourne la bouteille elle-même, la gravité reste vers le bas ----------
const LOOK_Y=-27, LOOK0=new THREE.Vector3(0,LOOK_Y,0), LOOK=LOOK0.clone(), ELEV=8*Math.PI/180, DIST0=640;
let dist=DIST0,spinning=false;
const angVel=new THREE.Vector3(), ptrs=new Map();let drag=null;
const ARC_MM=135, clampD=d=>Math.min(1200,Math.max(170,d));
function placeCam(){camera.position.set(0,LOOK.y+dist*Math.sin(ELEV),dist*Math.cos(ELEV));camera.lookAt(LOOK);camera.updateMatrixWorld();}
placeCam();
// zoom : on s'approche du point visé par le curseur (pour aller voir le goulot ou le sol de près) ; en reculant on revient au cadrage d'origine
function zoomAt(f,px,py){
  const nd=clampD(dist*f);f=nd/dist;
  if(f<1&&px!=null){const hh=dist*Math.tan(camera.fov*Math.PI/360),hw=hh*camera.aspect,cx=px/Math.max(canvas.clientWidth,1)*2-1,cy=1-py/Math.max(canvas.clientHeight,1)*2;
    LOOK.addScaledVector(_a.set(1,0,0).applyQuaternion(camera.quaternion),cx*hw*(1-f)).addScaledVector(_b.set(0,1,0).applyQuaternion(camera.quaternion),cy*hh*(1-f));}
  else if(f>1)LOOK.lerp(LOOK0,Math.min(1,(f-1)*1.6));
  dist=nd;LOOK.x=Math.min(260,Math.max(-260,LOOK.x));LOOK.z=Math.min(260,Math.max(-260,LOOK.z));
  LOOK.y=Math.min(210,Math.max(FLOOR_Y+8-dist*Math.sin(ELEV),LOOK.y));placeCam();}
const loc=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const mmPerPx=()=>2*dist*Math.tan(camera.fov*Math.PI/360)/Math.max(canvas.clientHeight,1);
function arcVec(p){   // point de l'écran → sphère virtuelle centrée sur la bouteille
  const c=pivot.position.clone().project(camera),rad=ARC_MM/mmPerPx();
  const x=(p.x-(c.x*.5+.5)*canvas.clientWidth)/rad,y=-(p.y-(-c.y*.5+.5)*canvas.clientHeight)/rad,d2=x*x+y*y;
  return new THREE.Vector3(x,y,d2<=.5?Math.sqrt(1-d2):.5/Math.sqrt(d2)).normalize();}
const _q=new THREE.Quaternion();
function rotateBy(axisCam,angle){const ax=axisCam.clone().applyQuaternion(camera.quaternion).normalize();
  pivot.quaternion.premultiply(_q.setFromAxisAngle(ax,angle)).normalize();return ax;}
function pan(dx,dy){const r=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),u=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  pivot.position.addScaledVector(r,dx).addScaledVector(u,dy);pivot.position.clampLength(0,200);}
const multi=()=>{const[a,b]=[...ptrs.values()];return{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y),a:Math.atan2(b.y-a.y,b.x-a.x)}};
canvas.addEventListener('pointerdown',e=>{
  try{canvas.setPointerCapture(e.pointerId)}catch(_){}
  ptrs.set(e.pointerId,loc(e));
  if(ptrs.size===1){const p=loc(e);drag={mode:(e.button===2||e.button===1||e.ctrlKey||e.metaKey)?'pan':'rot',p,v:arcVec(p),t:performance.now()};angVel.set(0,0,0);}
  else if(ptrs.size===2){drag=Object.assign({mode:'multi'},multi());angVel.set(0,0,0);}
});
canvas.addEventListener('pointermove',e=>{
  if(!drag||!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,loc(e));
  if(drag.mode==='rot'){const p=loc(e),v=arcVec(p),ax=new THREE.Vector3().crossVectors(drag.v,v),s=ax.length();
    if(s>1e-7){const ang=Math.atan2(s,drag.v.dot(v)),w=rotateBy(ax,ang),now=performance.now(),dt=Math.max((now-drag.t)/1000,1/240);
      angVel.lerp(w.multiplyScalar(Math.min(ang/dt,22)),.5);drag.t=now;}
    drag.p=p;drag.v=v;
  }else if(drag.mode==='pan'){const p=loc(e),k=mmPerPx();pan((p.x-drag.p.x)*k,-(p.y-drag.p.y)*k);drag.p=p;
  }else if(drag.mode==='multi'&&ptrs.size>=2){const m=multi(),k=mmPerPx();
    pan((m.cx-drag.cx)*k,-(m.cy-drag.cy)*k);zoomAt(drag.d/Math.max(m.d,1),m.cx,m.cy);
    let da=m.a-drag.a;if(da>Math.PI)da-=2*Math.PI;if(da<-Math.PI)da+=2*Math.PI;rotateBy(new THREE.Vector3(0,0,1),-da);
    Object.assign(drag,m);}
});
function endPtr(e){ptrs.delete(e.pointerId);
  if(ptrs.size===1){const p=[...ptrs.values()][0];drag={mode:'rot',p,v:arcVec(p),t:performance.now()};}
  else if(ptrs.size===0){if(drag&&drag.mode==='rot'&&performance.now()-drag.t>90)angVel.set(0,0,0);if(drag&&drag.mode!=='rot')angVel.set(0,0,0);drag=null;}}
canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const p=loc(e);zoomAt(Math.exp(e.deltaY*.0012),p.x,p.y);},{passive:false});
canvas.addEventListener('keydown',e=>{const k=e.key,a=new THREE.Vector3();
  if(k==='ArrowLeft')a.set(0,-1,0);else if(k==='ArrowRight')a.set(0,1,0);else if(k==='ArrowUp')a.set(-1,0,0);else if(k==='ArrowDown')a.set(1,0,0);
  else if(k==='a'||k==='q')a.set(0,0,1);else if(k==='e'||k==='d')a.set(0,0,-1);
  else if(k==='+'||k==='='){zoomAt(.9);return}else if(k==='-'){zoomAt(1.1);return}else return;
  e.preventDefault();angVel.addScaledVector(a.applyQuaternion(camera.quaternion),1.6);});
// la bouteille ne traverse pas le sol : si on la penche ou la descend, elle remonte juste ce qu'il faut
const HULL=prof.concat(capPts.map(p=>[p[0],p[1]+CAP_DY]));
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_dq=new THREE.Quaternion(),_qi=new THREE.Quaternion();
function floorClamp(){_b.set(0,1,0).applyQuaternion(pivot.quaternion);const ay=_b.y,ah=Math.sqrt(Math.max(0,1-ay*ay));let low=1e9;
  for(const p of HULL){const v=(p[1]-CY)*ay-p[0]*ah;if(v<low)low=v}
  const minY=FLOOR_Y+.3-low;if(pivot.position.y<minY)pivot.position.y=minY;
  FU.uLift.value=pivot.position.y-minY;}

// ---------- physique du liquide ----------
// 1) Masse du liquide : la surface moyenne est un plan qui garde le volume. Un mouvement brusque l'emporte avec la bouteille,
//    puis la gravité le ramène comme un pendule. Frottement visqueux (linéaire) + traînée turbulente (quadratique).
// 2) Par-dessus : un champ de vagues simulé sur une grille (équation d'onde + viscosité), qui rebondit sur les parois,
//    est poussé par les parois qui bougent et par les accélérations, et reçoit de l'agitation quand l'écoulement est turbulent.
// 3) Le nombre de Reynolds Re = U·D/ν (vitesse du ballottement × largeur de la surface / viscosité) décide du régime.
const G=9810, DAMP=1.6, NU=1.0;                          // ν ≈ 1 mm²/s, proche de l'eau
const liq={n:new THREE.Vector3(0,1,0),w:new THREE.Vector3(),Re:0,turb:0,Rs:18,ext:18,W0:20};
const wet={n:new THREE.Vector3(0,1,0),lev:FILL_Y,init:false};
const prevQ=new THREE.Quaternion(),prevP=new THREE.Vector3(),vel=new THREE.Vector3(),acc=new THREE.Vector3();
function syncPhysics(){prevQ.copy(pivot.quaternion);prevP.copy(pivot.position);vel.set(0,0,0);acc.set(0,0,0);}
function physics(dt){
  // la rotation de la bouteille (hors rotation sur son propre axe) emporte le liquide
  _dq.copy(pivot.quaternion).multiply(_qi.copy(prevQ).invert());
  const sw=Math.sqrt(Math.max(0,1-_dq.w*_dq.w));
  if(sw>1e-6){const ang=2*Math.atan2(sw,Math.abs(_dq.w));
    _a.set(_dq.x,_dq.y,_dq.z).multiplyScalar((_dq.w<0?-1:1)*ang/sw);
    _b.set(0,1,0).applyQuaternion(pivot.quaternion);
    _a.addScaledVector(_b,-_a.dot(_b));
    const ap=_a.length();
    if(ap>1e-6)liq.n.applyAxisAngle(_a.multiplyScalar(1/ap),ap);}
  prevQ.copy(pivot.quaternion);
  // un déplacement brusque incline la gravité apparente
  _a.copy(pivot.position).sub(prevP).multiplyScalar(1/dt);
  _b.copy(_a).sub(vel).multiplyScalar(1/dt);vel.copy(_a);prevP.copy(pivot.position);
  acc.lerp(_b,1-Math.exp(-dt/.05));acc.clampLength(0,2*G);
  const tgt=_c.set(acc.x,G+acc.y,acc.z).normalize();
  // fréquence propre du ballottement : dépend de la largeur de la surface et de la profondeur
  // (1er mode d'une cuve : ω² = 1,841·g/a · tanh(1,841·h/a)) → vif quand la bouteille est debout, lent et lourd couchée
  const a=Math.max(liq.ext,8),depth=Math.max(V0/(Math.PI*liq.Rs*liq.Rs),4);
  const w0=Math.min(22,Math.max(9,Math.sqrt(G*1.841/a*Math.tanh(1.841*depth/a))));
  liq.W0+=(w0-liq.W0)*(1-Math.exp(-dt*6));
  // pendule amorti vers l'horizontale
  const sub=Math.max(1,Math.ceil(dt/.004)),h=dt/sub;
  for(let i=0;i<sub;i++){
    const damp=DAMP+.45*liq.w.length()+2.2*liq.turb;
    _a.crossVectors(liq.n,tgt).multiplyScalar(liq.W0*liq.W0).addScaledVector(liq.w,-damp);
    liq.w.addScaledVector(_a,h);
    _b.crossVectors(liq.w,liq.n);liq.n.addScaledVector(_b,h).normalize();
    liq.w.addScaledVector(liq.n,-liq.w.dot(liq.n));}
}
syncPhysics();

// champ de vagues : grille WN×WN posée sur le plan de la surface (repère tA, tB centré en O), demi-côté WL (mm)
const wh=new Float32Array(WN*WN),wv=new Float32Array(WN*WN),wt=new Float32Array(WN*WN),wm=new Uint8Array(WN*WN),wm0=new Uint8Array(WN*WN);
let WL=36,waveReady=false,waveRms=0;const CW=300,prevW=new THREE.Vector3(),tA=U.uTA.value,tB=U.uTB.value,O=U.uO.value;
function resample(f,k){   // change l'échelle du domaine (k = nouveau WL / ancien WL) en gardant les vagues à leur place
  for(let j=0;j<WN;j++)for(let i=0;i<WN;i++){const x=((i+.5)/WN-.5)*k+.5,y=((j+.5)/WN-.5)*k+.5;
    if(x<=0||x>=1||y<=0||y>=1){wt[j*WN+i]=0;continue}
    const fx=Math.min(WN-1.001,Math.max(0,x*WN-.5)),fy=Math.min(WN-1.001,Math.max(0,y*WN-.5)),i0=fx|0,j0=fy|0,a=fx-i0,b=fy-j0;
    wt[j*WN+i]=(f[j0*WN+i0]*(1-a)+f[j0*WN+i0+1]*a)*(1-b)+(f[(j0+1)*WN+i0]*(1-a)+f[(j0+1)*WN+i0+1]*a)*b;}
  f.set(wt);}
const NBR=[1,-1,WN,-WN];
function splat(k0,amp,rad){const i0=k0%WN,j0=(k0/WN)|0,r=Math.ceil(rad*2);   // impulsion lissée (pas de bruit pixel)
  for(let j=Math.max(1,j0-r);j<=Math.min(WN-2,j0+r);j++)for(let i=Math.max(1,i0-r);i<=Math.min(WN-2,i0+r);i++){const k=j*WN+i;
    if(wm[k])wv[k]+=amp*Math.exp(-((i-i0)*(i-i0)+(j-j0)*(j-j0))/(rad*rad))}}
function waveStep(dt,D,Tw){
  const n=liq.n,zr=Math.abs(n.z)<.9;_a.set(zr?0:1,0,zr?1:0);tA.crossVectors(_a,n).normalize();tB.crossVectors(n,tA);
  O.copy(pivot.position).addScaledVector(n,D-n.dot(pivot.position));
  // la grille dans le repère de la bouteille → quelles cases sont dans le liquide
  _qi.copy(pivot.quaternion).invert();
  const ol=_a.copy(O).sub(Tw).applyQuaternion(_qi).clone(),al=_b.copy(tA).applyQuaternion(_qi).clone(),bl=_c.copy(tB).applyQuaternion(_qi).clone();
  const dx=2*WL/WN;let cnt=0,ext=0,edge=false;
  for(let j=0;j<WN;j++)for(let i=0;i<WN;i++){const x=(i+.5)*dx-WL,y=(j+.5)*dx-WL,k=j*WN+i;
    const py=ol.y+x*al.y+y*bl.y;let ins=0;
    if(py>Y0&&py<Y1){const px=ol.x+x*al.x+y*bl.x,pz=ol.z+x*al.z+y*bl.z,ri=rIn(py);if(px*px+pz*pz<ri*ri)ins=1}
    wm[k]=ins;if(ins){cnt++;const e=Math.max(Math.abs(x),Math.abs(y));if(e>ext)ext=e;if(i<2||j<2||i>WN-3||j>WN-3)edge=true}}
  liq.Rs=Math.sqrt(Math.max(cnt,1)*dx*dx/Math.PI);liq.ext=Math.max(ext,liq.Rs);
  // le domaine suit la taille de la surface (petit disque debout, longue nappe couchée)
  let nWL=WL;if(edge||ext>.9*WL)nWL=Math.min(130,WL*1.3);else if(ext<.55*WL&&WL>36)nWL=Math.max(36,WL*.8);
  if(nWL!==WL){const k=nWL/WL;resample(wh,k);resample(wv,k);WL=nWL;U.uWL.value=WL;waveReady=false;return waveStep(dt,D,Tw)}
  // parois qui avancent ou reculent dans le liquide : elles poussent / aspirent
  if(waveReady){for(let j=1;j<WN-1;j++)for(let i=1;i<WN-1;i++){const k=j*WN+i;
    if(wm0[k]&&!wm[k]){wh[k]=0;wv[k]=0;for(const o of NBR)if(wm[k+o])wv[k+o]+=18}
    else if(!wm0[k]&&wm[k]){wh[k]=0;wv[k]=-10}}}
  else for(let k=0;k<WN*WN;k++)if(!wm[k]){wh[k]=0;wv[k]=0}
  wm0.set(wm);waveReady=true;
  // accélération angulaire du plan : la vraie surface est en retard sur lui
  const aA=(liq.w.dot(tA)-prevW.dot(tA))/dt,aB=(liq.w.dot(tB)-prevW.dot(tB))/dt;prevW.copy(liq.w);
  // agitation turbulente : petites impulsions au hasard, d'autant plus fortes que Re est grand
  const Us=liq.w.length()*liq.Rs;
  const nq=liq.turb*dt*220;
  for(let q=Math.floor(nq)+(Math.random()<nq%1?1:0);q>0;q--){const k=(Math.random()*WN*WN)|0;if(wm[k])splat(k,(Math.random()-.5)*Math.min(Us,400)*2,2.2+Math.random()*3.2)}
  const sub=Math.min(16,Math.max(1,Math.ceil(dt*CW/(.45*dx)))),h=dt/sub,cw=Math.min(CW,.5*dx/h),c2=cw*cw/(dx*dx),nu=Math.min((14+60*liq.turb)*NU/(dx*dx),.2/h),gam=.9+1.6*liq.turb;
  let rms=0;
  for(let s=0;s<sub;s++){
    for(let j=1;j<WN-1;j++){const y=(j+.5)*dx-WL;for(let i=1;i<WN-1;i++){const k=j*WN+i;if(!wm[k])continue;
      const hc=wh[k],vc=wv[k];
      const lap=(wm[k-1]?wh[k-1]:hc)+(wm[k+1]?wh[k+1]:hc)+(wm[k-WN]?wh[k-WN]:hc)+(wm[k+WN]?wh[k+WN]:hc)-4*hc;
      const lav=(wm[k-1]?wv[k-1]:vc)+(wm[k+1]?wv[k+1]:vc)+(wm[k-WN]?wv[k-WN]:vc)+(wm[k+WN]?wv[k+WN]:vc)-4*vc;
      wt[k]=vc+h*(c2*lap+nu*lav-gam*vc-.5*(y*aA-((i+.5)*dx-WL)*aB));}}
    for(let k=0;k<WN*WN;k++)if(wm[k]){wv[k]=wt[k];wh[k]+=h*wv[k]}}
  // filtre numérique : gomme le bruit à l'échelle d'une case (la vraie viscosité est trop faible pour le faire sur une grille)
  for(const f of [wh,wv]){for(let j=1;j<WN-1;j++)for(let i=1;i<WN-1;i++){const k=j*WN+i;if(!wm[k])continue;const c=f[k];
      wt[k]=c+.03*((wm[k-1]?f[k-1]:c)+(wm[k+1]?f[k+1]:c)+(wm[k-WN]?f[k-WN]:c)+(wm[k+WN]?f[k+WN]:c)-4*c)}
    for(let k=0;k<WN*WN;k++)if(wm[k])f[k]=wt[k]}
  // volume conservé (moyenne nulle), garde-fous
  let mean=0;for(let k=0;k<WN*WN;k++)if(wm[k])mean+=wh[k];mean/=Math.max(cnt,1);
  const hm=Math.min(6.5,.3*liq.Rs);
  for(let k=0;k<WN*WN;k++)if(wm[k]){let v=wh[k]-mean;if(!(v>-hm)){v=-hm;wv[k]*=.5}if(v>hm){v=hm;wv[k]*=.5}wh[k]=v;if(!(Math.abs(wv[k])<3000))wv[k]=0;rms+=wv[k]*wv[k]}
  waveRms=Math.sqrt(rms/Math.max(cnt,1));
  // on prolonge un peu au-delà des parois (pour la ligne de contact), puis hauteur + pentes dans la texture
  wt.set(wh);
  for(let p=0;p<2;p++){for(let j=1;j<WN-1;j++)for(let i=1;i<WN-1;i++){const k=j*WN+i;if(wm[k]||wt[k]!==0)continue;
      let s=0,c=0;for(const o of NBR){if(wm[k+o]||(p&&wt[k+o]!==0&&!wm[k+o])){s+=wt[k+o];c++}}
      if(c)wh[k]=s/c;}
    wt.set(wh);}
  for(let j=0;j<WN;j++)for(let i=0;i<WN;i++){const k=j*WN+i,o=k*4;
    const gx=(wt[j*WN+Math.min(i+1,WN-1)]-wt[j*WN+Math.max(i-1,0)])/(2*dx),gy=(wt[Math.min(j+1,WN-1)*WN+i]-wt[Math.max(j-1,0)*WN+i])/(2*dx);
    waveData[o]=Math.max(0,Math.min(255,(wt[k]/14+.5)*255));waveData[o+1]=Math.max(0,Math.min(255,(gx/3+.5)*255));waveData[o+2]=Math.max(0,Math.min(255,(gy/3+.5)*255));waveData[o+3]=255;}
  for(let k=0;k<WN*WN;k++)if(!wm[k])wh[k]=0;
  waveTex.needsUpdate=true;
}
// bulles d'air : entraînées sous la surface quand ça brasse, elles remontent, flottent un instant puis éclatent
const bub=Array.from({length:NB},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),r:0,life:0}));
function bubbleStep(dt,D,Tw){
  const n=liq.n,dx=2*WL/WN;
  if(liq.turb>.04&&Math.random()<liq.turb*dt*90){const b=bub.find(b=>b.r<=0);let k=0;for(let t=0;t<8&&!wm[k];t++)k=(Math.random()*WN*WN)|0;
    if(b&&wm[k]){const i=k%WN,j=(k/WN)|0;b.p.copy(O).addScaledVector(tA,(i+.5)*dx-WL).addScaledVector(tB,(j+.5)*dx-WL).addScaledVector(n,-(2+Math.random()*16));
      b.r=.45+Math.random()*Math.random()*1.3;b.v.copy(n).multiplyScalar(-(50+Math.random()*130)*liq.turb).add(_a.set(Math.random()-.5,0,Math.random()-.5).multiplyScalar(60));b.life=1}}
  _qi.copy(pivot.quaternion).invert();
  bub.forEach((b,i)=>{const u=U.uBub.value[i];if(b.r<=0){u.w=0;return}
    b.v.lerp(_a.set(0,70+70*b.r,0),1-Math.exp(-dt*3.5));b.p.addScaledVector(b.v,dt);
    _b.copy(b.p).sub(Tw).applyQuaternion(_qi);                              // reste dans la bouteille
    _b.y=Math.min(Y1-b.r,Math.max(Y0+b.r,_b.y));const rr=Math.hypot(_b.x,_b.z),rm=Math.max(rIn(_b.y)-b.r-.3,.1);
    if(rr>rm){_b.x*=rm/rr;_b.z*=rm/rr}
    b.p.copy(_b).applyQuaternion(pivot.quaternion).add(Tw);
    const s=D-n.dot(b.p);                                                   // profondeur sous la surface
    if(s<b.r*.6){b.p.addScaledVector(n,s-b.r*.6);b.v.multiplyScalar(.5);b.life-=dt*(1.6+2*Math.random())}else b.life-=dt*.12;
    if(b.life<=0){const x=(b.p.clone().sub(O).dot(tA)+WL)/dx|0,y=(b.p.clone().sub(O).dot(tB)+WL)/dx|0;
      if(x>0&&y>0&&x<WN-1&&y<WN-1&&wm[y*WN+x])wv[y*WN+x]-=45*b.r;b.r=0;u.w=0;return}
    u.set(b.p.x,b.p.y,b.p.z,b.r);});
}

// ---------- condensation ----------
// Bouteille sortie du frigo : une buée fine (carte « mist ») + des gouttes posées sur le verre.
// Chaque goutte subit, dans le repère de la bouteille, la pesanteur et les forces d'inertie du mouvement
// (centrifuge ω×(ω×x), d'Euler α×x, secousses). Tant que la poussée le long du verre reste sous son seuil d'accroche
// (capillarité : seuil ∝ 1/r², donc les petites tiennent et les grosses partent) elle ne bouge pas ; au-delà elle glisse,
// avale ses voisines et laisse une trace nette dans la buée. Si la force qui la décolle du verre dépasse son adhérence,
// elle part en vol libre et tombe dans l'eau du sol, où elle lance des ronds.
const ND=900, NF=64, RS=1.6, RD=1.45, YB0=.9, YB1=224.6;
const dropGeo=(()=>{const a=Math.PI/3,g=new THREE.SphereGeometry(1/Math.sin(a),12,5,0,Math.PI*2,0,a);g.translate(0,-Math.cos(a)/Math.sin(a),0);return g})();   // calotte : angle de contact 60°, base de rayon 1
const VS_DROP=`varying vec3 vW;varying vec3 vN;varying vec3 vB;
void main(){
  #ifdef USE_INSTANCING
  mat4 m=modelMatrix*instanceMatrix;
  #else
  mat4 m=modelMatrix;
  #endif
  vec4 w=m*vec4(position,1.0);vW=w.xyz;vN=(m*vec4(normal,0.0)).xyz;vB=(m*vec4(0.,1.,0.,0.)).xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FS_DROP=`uniform mat4 uInvModel;uniform vec3 uN;uniform float uD;uniform vec3 uKey;uniform float uAir;
varying vec3 vW;varying vec3 vN;varying vec3 vB;
${ENV_FN}
void main(){
  vec3 V=normalize(vW-cameraPosition);vec3 N=normalize(vN);vec3 B=normalize(vB);
  float c=clamp(dot(-V,N),0.,1.);
  float F=.02+.98*pow(1.-c,5.);
  vec3 col=env(reflect(V,N),0.)*F*1.5;                   // reflet du studio à la surface de la goutte
  float a;
  if(uAir>.5){                                           // goutte en vol : bille d'eau, le studio s'y voit à l'envers
    col+=env(refract(V,N,.752),.06)*(1.-F)*.85;a=.35+.5*pow(1.-c,2.);
  }else{
    vec3 pl=(uInvModel*vec4(vW,1.)).xyz;
    // ce qu'il y a derrière la goutte (papier, liquide ou verre vide) teinte la lumière qu'elle concentre
    float onLab=step(${f5(LABEL_Y)},pl.y)*step(pl.y,${f5(LABEL_Y+LABEL_H)});
    vec3 tint=mix(mix(vec3(.55,.60,.66),vec3(1.,.09,.08),step(dot(uN,vW),uD)),vec3(1.,.93,.82),onLab);
    float rel=dot(N,uKey)-dot(B,uKey);                   // < 0 : flanc opposé à la source, là où la lumière ressort concentrée
    col+=tint*smoothstep(.10,.70,-rel)*clamp(dot(B,uKey)*.9+.55,0.,1.)*1.1;
    a=.05+.42*(1.-smoothstep(.5,.66,dot(N,B)))+.25*smoothstep(.15,.7,rel);   // ligne de contact et flanc éclairé plus sombres
  }
  col=1.-exp(-col*1.15);
  gl_FragColor=vec4(col,1.);
  #include <encodings_fragment>
  gl_FragColor=vec4(gl_FragColor.rgb,clamp(a+max(gl_FragColor.r,max(gl_FragColor.g,gl_FragColor.b))*.9,0.,.95));
}`;
const dropU={uInvModel:U.uInvModel,uN:U.uN,uD:U.uD,uKey:U.uKey,uAir:{value:0}};
const dropMat=o=>new THREE.ShaderMaterial(Object.assign({vertexShader:VS_DROP,fragmentShader:FS_DROP,transparent:true,premultipliedAlpha:true,depthWrite:false,toneMapped:false},o));
const dropMesh=new THREE.InstancedMesh(dropGeo,dropMat({uniforms:dropU}),ND);dropMesh.frustumCulled=false;dropMesh.renderOrder=4;dropMesh.count=0;group.add(dropMesh);
const airMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),dropMat({uniforms:Object.assign({},dropU,{uAir:{value:1}})}),NF);
airMesh.frustumCulled=false;airMesh.renderOrder=5;airMesh.count=0;scene.add(airMesh);

const drops=[],fly=Array.from({length:NF},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),r:0,splash:true}));
const omega=new THREE.Vector3(),omegaP=new THREE.Vector3(),alphaW=new THREE.Vector3(),condQ=new THREE.Quaternion();
const S={},_gl=new THREE.Vector3(),_wl=new THREE.Vector3(),_al=new THREE.Vector3();
let fogOn=true,ripI=0,simT=0,chk=0,mistAcc=0,mistDirty=false;
const onLabel=y=>y>LABEL_Y-.3&&y<LABEL_Y+LABEL_H+.3, surfR=y=>onLabel(y)?R+.42:rOut(y)+.03;
function surf(th,y,o){     // surface extérieure au point (angle, hauteur), repère bouteille : rayon, normale sortante (nr, ny), tangente montante (tr, ty)
  const y0=Math.max(y-.25,0),y1=Math.min(y+.25,YB1+1),dr=onLabel(y)?0:(rOut(y1)-rOut(y0))/(y1-y0),l=Math.hypot(1,dr);
  o.ro=surfR(y);o.s=Math.sin(th);o.c=Math.cos(th);o.nr=1/l;o.ny=-dr/l;o.tr=dr/l;o.ty=1/l;return o}
function seedDrop(d,small){d.th=Math.random()*6.2832;d.y=170;
  for(let t=0;t<40;t++){const y=YB0+Math.random()*(YB1-YB0);if(onLabel(y)||Math.random()>rOut(y)/30.05)continue;d.y=y;break}   // sur le verre nu, au prorata de la surface
  d.r=small?.2+Math.random()*.2:.3+1.3*Math.pow(Math.random(),3);d.vy=d.vt=0;d.mov=false;d.dead=0;d.tr=0;d.g=.5+Math.random();return d}
for(let i=0;i<ND;i++)drops.push(seedDrop({},false));
function wipe(th,y,r,ro){  // la goutte qui passe efface la buée sous elle
  const cx=((th/6.2832+.5)%1)*MW,cy=y/HTOP*MH,rx=Math.max(r*1.25/(6.2832*ro)*MW,.8),ry=Math.max(r*1.25/HTOP*MH,.8);
  for(let j=Math.max(0,Math.floor(cy-ry));j<=Math.min(MH-1,Math.ceil(cy+ry));j++)for(let i=Math.floor(cx-rx);i<=Math.ceil(cx+rx);i++){
    const u=(i+.5-cx)/rx,v=(j+.5-cy)/ry,q=u*u+v*v;if(q<1.4){const k=j*MW+((i%MW)+MW)%MW,m=q<.6?0:(q-.6)/.8*255;if(mist[k]>m)mist[k]=m}}
  mistDirty=true}
function launch(px,py,pz,vx,vy,vz,r,sp){const f=fly.find(f=>f.r<=0);if(!f)return;f.p.set(px,py,pz);f.v.set(vx,vy,vz);f.r=r;f.splash=sp}
function detach(d,S){      // la goutte quitte le verre avec la vitesse du verre à cet endroit, sa glissade et un petit élan vers l'extérieur
  const ro=S.ro+d.r*.6;_a.set(ro*S.s,d.y,ro*S.c);group.localToWorld(_a);
  _b.copy(_a).sub(pivot.position);_c.crossVectors(omega,_b).add(vel);
  _b.set(d.vy*S.tr*S.s+d.vt*S.c+45*S.nr*S.s,d.vy*S.ty+45*S.ny,d.vy*S.tr*S.c-d.vt*S.s+45*S.nr*S.c).applyQuaternion(pivot.quaternion);
  launch(_a.x,_a.y,_a.z,_c.x+_b.x,_c.y+_b.y,_c.z+_b.z,d.r,true);d.dead=2+Math.random()*9}
function ripple(x,z,amp){FU.uRip.value[ripI].set(x,z,simT,amp);ripI=(ripI+1)%NRIP}
function splash(f){        // impact : un rond dans l'eau, et pour une vraie goutte quelques gouttelettes qui rebondissent
  const vy=Math.abs(f.v.y);ripple(f.p.x,f.p.z,Math.min(Math.max(.16*Math.pow(f.r,1.5)*(.55+vy/1800),.05),1.1));
  if(f.splash&&f.r>.7)for(let k=0,n=1+(Math.random()*3|0);k<n;k++){const a=Math.random()*6.2832,h=40+Math.random()*130;
    launch(f.p.x+Math.cos(a)*1.5,FLOOR_Y+.6,f.p.z+Math.sin(a)*1.5,Math.cos(a)*h,(.18+.25*Math.random())*vy+150,Math.sin(a)*h,.16+Math.random()*.16,false)}}
function condStep(dt){
  simT+=dt;FU.uTime.value=simT;
  // vitesse et accélération angulaires de la bouteille (monde), un peu lissées
  _dq.copy(pivot.quaternion).multiply(_qi.copy(condQ).invert());condQ.copy(pivot.quaternion);
  const sw=Math.sqrt(Math.max(0,1-_dq.w*_dq.w));
  if(sw>1e-7)_a.set(_dq.x,_dq.y,_dq.z).multiplyScalar((_dq.w<0?-1:1)*2*Math.atan2(sw,Math.abs(_dq.w))/sw/dt);else _a.set(0,0,0);
  _a.clampLength(0,45);omegaP.copy(omega);omega.lerp(_a,1-Math.exp(-dt/.035));
  alphaW.lerp(_b.copy(omega).sub(omegaP).multiplyScalar(1/dt),1-Math.exp(-dt/.06)).clampLength(0,900);
  if(!fogOn){dropMesh.count=0;airMesh.count=0;return}
  _qi.copy(pivot.quaternion).invert();
  _gl.set(-acc.x,-G-acc.y,-acc.z).applyQuaternion(_qi);_wl.copy(omega).applyQuaternion(_qi);_al.copy(alphaW).applyQuaternion(_qi);
  const wx=_wl.x,wy=_wl.y,wz=_wl.z,w2=_wl.lengthSq(),ke=1-Math.exp(-dt*9),arr=dropMesh.instanceMatrix.array;let n=0;
  // la buée se reforme lentement (une trace met une petite demi-minute à disparaître)
  mistAcc+=dt*9;if(mistAcc>=1){const inc=mistAcc|0;mistAcc-=inc;for(let i=0;i<MW*MH;i++){const m=mist[i]+inc;mist[i]=m>250?250:m}mistDirty=true}
  for(let i=0;i<ND;i++){const d=drops[i];
    if(d.dead>0){d.dead-=dt;if(d.dead<=0)seedDrop(d,true);continue}
    surf(d.th,d.y,S);
    const px=S.ro*S.s,pz=S.ro*S.c,xy=d.y-CY,wd=wx*px+wy*xy+wz*pz;
    // accélération apparente : pesanteur et secousses, centrifuge, Euler
    const ax=_gl.x+w2*px-wd*wx-(_al.y*pz-_al.z*xy),ay=_gl.y+w2*xy-wd*wy-(_al.z*px-_al.x*pz),az=_gl.z+w2*pz-wd*wz-(_al.x*xy-_al.y*px);
    const an=ax*S.nr*S.s+ay*S.ny+az*S.nr*S.c,aty=ax*S.tr*S.s+ay*S.ty+az*S.tr*S.c,att=ax*S.c-az*S.s,at=Math.hypot(aty,att);
    const lab=onLabel(d.y),ac=G*(RS/d.r)*(RS/d.r)*(lab?1.5:1),ad=G*(RD/d.r)*(RD/d.r);
    if(an>ad){detach(d,S);continue}                                                    // arrachée du verre
    if(at>(d.mov?ac*.55:ac)){const sp=Math.min(28*d.r*d.r*(at-ac*.55)/G,600);d.vy+=(aty/at*sp-d.vy)*ke;d.vt+=(att/at*sp-d.vt)*ke;d.mov=true}
    else{const k=Math.exp(-dt*14);d.vy*=k;d.vt*=k;if(Math.abs(d.vy)+Math.abs(d.vt)<1)d.mov=false}
    if(d.mov){
      const dy=d.vy*S.ty*dt;d.y+=dy;d.th+=(d.vt*dt+(Math.random()-.5)*.12*Math.abs(dy))/S.ro;
      if(d.th<0)d.th+=6.2832;else if(d.th>=6.2832)d.th-=6.2832;
      // bout du verre (talon ou capsule) : elle s'y accumule, et tombe si ce qui la pousse dépasse son adhérence
      if(d.y<YB0||d.y>YB1){d.y=d.y<YB0?YB0:YB1;if(Math.abs(aty)>ad*.8){detach(d,S);continue}d.vy=0}
      wipe(d.th,d.y,d.r,S.ro);
      for(let j=0;j<ND;j++){const e=drops[j];if(j===i||e.dead>0)continue;const ddy=e.y-d.y;if(ddy>3.2||ddy<-3.2)continue;       // elle avale celles qu'elle touche
        let dth=e.th-d.th;if(dth>3.1416)dth-=6.2832;else if(dth<-3.1416)dth+=6.2832;
        if(Math.hypot(ddy,dth*S.ro)<(d.r+e.r)*.92){d.r=Math.min(Math.cbrt(d.r*d.r*d.r+e.r*e.r*e.r),3);e.dead=1.5+Math.random()*7}}
      d.tr+=Math.hypot(dy,d.vt*dt);                                                    // … et sème un chapelet de petites gouttes derrière elle
      if(d.tr>4+d.g*5&&d.r>.8){d.tr=0;const e=drops.find(e=>e.dead>0);
        if(e){e.dead=0;e.th=d.th;e.y=Math.min(YB1,Math.max(YB0,d.y-Math.sign(d.vy||1)*d.r*1.6));e.r=.2+Math.random()*.16;e.vy=e.vt=0;e.mov=false;e.tr=0;
          d.r=Math.cbrt(Math.max(d.r*d.r*d.r-e.r*e.r*e.r,.05))}}
      surf(d.th,d.y,S);
    }else if(!lab&&d.r<2.4)d.r+=.012*d.g*dt;                                           // la condensation continue : les gouttes posées grossissent
    // matrice de l'instance : X = sens de la glissade (ou « vers le haut »), Y = normale, Z = X × Y ; un peu étirée quand elle file
    const sp=Math.hypot(d.vy,d.vt),el=d.mov?1+Math.min(sp/90,.9):1,ez=1/Math.sqrt(el),o=n*16,r=d.r;
    let tx=S.tr*S.s,ty=S.ty,tz=S.tr*S.c;if(sp>1){const a=d.vy/sp,b=d.vt/sp;tx=a*S.tr*S.s+b*S.c;ty=a*S.ty;tz=a*S.tr*S.c-b*S.s}
    const nx=S.nr*S.s,ny=S.ny,nz=S.nr*S.c;
    arr[o]=tx*r*el;arr[o+1]=ty*r*el;arr[o+2]=tz*r*el;arr[o+3]=0;arr[o+4]=nx*r;arr[o+5]=ny*r;arr[o+6]=nz*r;arr[o+7]=0;
    arr[o+8]=(ty*nz-tz*ny)*r*ez;arr[o+9]=(tz*nx-tx*nz)*r*ez;arr[o+10]=(tx*ny-ty*nx)*r*ez;arr[o+11]=0;
    arr[o+12]=S.ro*S.s;arr[o+13]=d.y;arr[o+14]=S.ro*S.c;arr[o+15]=1;n++;
  }
  // deux gouttes posées qui ont grossi jusqu'à se toucher fusionnent (on en vérifie quelques-unes par image)
  for(let q=0;q<24;q++){chk=(chk+1)%ND;const d=drops[chk];if(d.dead>0||d.mov)continue;const ro=surfR(d.y);
    for(let j=0;j<ND;j++){const e=drops[j];if(j===chk||e.dead>0||e.mov)continue;const ddy=e.y-d.y;if(ddy>4||ddy<-4)continue;
      let dth=e.th-d.th;if(dth>3.1416)dth-=6.2832;else if(dth<-3.1416)dth+=6.2832;
      if(Math.hypot(ddy,dth*ro)<(d.r+e.r)*.85){if(e.r>d.r){d.th=e.th;d.y=e.y}d.r=Math.min(Math.cbrt(d.r*d.r*d.r+e.r*e.r*e.r),3);e.dead=2+Math.random()*8}}}
  dropMesh.count=n;dropMesh.instanceMatrix.needsUpdate=true;
  if(mistDirty){mistTex.needsUpdate=true;mistDirty=false}
  // gouttes en vol : chute libre, puis impact dans l'eau
  let m=0;const fa=airMesh.instanceMatrix.array;
  for(const f of fly){if(f.r<=0)continue;
    for(let k=0;k<2;k++){f.v.y-=G*dt/2;f.p.addScaledVector(f.v,dt/2)}
    if(f.p.y-f.r<=FLOOR_Y){splash(f);f.r=0;continue}
    if(Math.abs(f.p.x)>4000||Math.abs(f.p.z)>4000){f.r=0;continue}
    const sp=f.v.length(),el=1+Math.min(sp/1400,1.4),o=m*16,r=f.r;                     // bille étirée dans le sens du mouvement
    _a.copy(f.v).multiplyScalar(1/(sp||1));_b.set(_a.y,-_a.x,0);if(_b.lengthSq()<1e-6)_b.set(1,0,0);_b.normalize();_c.crossVectors(_b,_a);
    fa[o]=_b.x*r;fa[o+1]=_b.y*r;fa[o+2]=_b.z*r;fa[o+3]=0;fa[o+4]=_a.x*r*el;fa[o+5]=_a.y*r*el;fa[o+6]=_a.z*r*el;fa[o+7]=0;
    fa[o+8]=_c.x*r;fa[o+9]=_c.y*r;fa[o+10]=_c.z*r;fa[o+11]=0;fa[o+12]=f.p.x;fa[o+13]=f.p.y;fa[o+14]=f.p.z;fa[o+15]=1;m++}
  airMesh.count=m;airMesh.instanceMatrix.needsUpdate=true;
}
const fogBtn=document.getElementById('fog');
if(fogBtn)fogBtn.onclick=()=>{fogOn=!fogOn;fogBtn.setAttribute('aria-pressed',fogOn);U.uFog.value=fogOn?1:0};

const loader=new THREE.TextureLoader();
let curSrc=null;                                         // image de l'étiquette affichée
function setLabel(src,name){
  curSrc=src;
  loader.load(src,t=>{
    t.encoding=THREE.sRGBEncoding;t.anisotropy=renderer.capabilities.getMaxAnisotropy();
    t.wrapS=THREE.ClampToEdgeWrapping;
    // on ne voit que 8 → 197 mm : le bord gauche est caché sous le recouvrement
    t.repeat.set((LABEL_W-OVER)/LABEL_W,1);t.offset.set(OVER/LABEL_W,0);
    if(labelMat.map)labelMat.map.dispose();labelMat.map=t;labelMat.needsUpdate=true;
  });
  document.getElementById('curName').firstChild.nodeValue=name;
  document.querySelectorAll('.card').forEach(c=>c.classList.toggle('on',c.dataset.src===src));
}

document.getElementById('spin').onclick=e=>{spinning=!spinning;e.currentTarget.setAttribute('aria-pressed',spinning)};
document.getElementById('reset').onclick=()=>{pivot.quaternion.identity();pivot.position.set(0,0,0);dist=DIST0;LOOK.copy(LOOK0);placeCam();angVel.set(0,0,0);
  liq.n.set(0,1,0);liq.w.set(0,0,0);prevW.set(0,0,0);wh.fill(0);wv.fill(0);waveReady=false;wet.init=false;bub.forEach(b=>b.r=0);fly.forEach(f=>f.r=0);syncPhysics();};

const _db=new THREE.Vector2(), hudEl=document.querySelector('.hud');
// cadrage : la capsule reste sous le bandeau de boutons, même quand il passe sur deux lignes (téléphone)
function frame(){const h=canvas.clientHeight||1,top=hudEl?(hudEl.offsetTop+hudEl.offsetHeight+6)/h:.08,hh=DIST0*Math.tan(camera.fov*Math.PI/360);
  const y=Math.max(LOOK_Y,Math.min(LOOK_Y+66,HTOP+7.4-CY-(.5-top)*2*hh/Math.cos(ELEV)));
  if(Math.abs(y-LOOK0.y)>.5){const same=LOOK.distanceTo(LOOK0)<1e-3;LOOK0.y=y;if(same){LOOK.copy(LOOK0);placeCam()}}}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(_db);if(rt)rt.setSize(_db.x,_db.y);
  const rw=Math.max(2,Math.round(_db.x*.7)),rh=Math.max(2,Math.round(_db.y*.7));rtRefl.setSize(rw,rh);FU.uReflPx.value.set(1/rw,1/rh);
  vcam.aspect=camera.aspect;vcam.updateProjectionMatrix();frame();}
new ResizeObserver(resize).observe(canvas);resize();
function camUniforms(cam,w,h){U.uVP.value.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);U.uIVP.value.copy(U.uVP.value).invert();
  U.uRef.value=cam.position.distanceTo(pivot.position);U.uRes.value.set(w,h);}

const reEl=document.getElementById('re');let reShown=0,reT=0;
const clock=new THREE.Clock(),_t=new THREE.Vector3(),_nl=new THREE.Vector3();
(function loop(){requestAnimationFrame(loop);
  const raw=clock.getDelta(),dt=Math.min(Math.max(raw,1e-3),1/20);
  // si l'image rame, on baisse la finesse du rendu plutôt que la fluidité
  if(raw>.036&&raw<2){slow+=Math.min(raw,.25);if(slow>1.6&&PR>1&&!window.__rs){PR=Math.max(1,PR*.8);renderer.setPixelRatio(PR);resize();slow=0}}else slow=Math.max(0,slow-.05);
  // inertie de rotation après le lâcher + rotation automatique sur l'axe de la bouteille
  if(!drag||drag.mode!=='rot'){const s=angVel.length();if(s>1e-3){pivot.quaternion.premultiply(_q.setFromAxisAngle(_a.copy(angVel).multiplyScalar(1/s),s*dt)).normalize();angVel.multiplyScalar(Math.exp(-dt*2.4));}}
  if(spinning)pivot.quaternion.multiply(_q.setFromAxisAngle(_a.set(0,1,0),dt*.5)).normalize();
  floorClamp();
  pivot.updateMatrixWorld(true);
  physics(dt);
  // niveau du plan pour garder le volume, dans le repère de la bouteille puis dans le monde
  _nl.copy(liq.n).applyQuaternion(_qi.copy(pivot.quaternion).invert());
  const c=Math.max(-1,Math.min(1,_nl.y)),lev=solveLevel(c,Math.sqrt(1-c*c));
  group.getWorldPosition(_t);
  const D=lev+_t.dot(liq.n);
  U.uN.value.copy(liq.n);U.uD.value=D;
  if(!wet.init){wet.n.copy(_nl);wet.lev=lev;wet.init=true}
  const kw=1-Math.exp(-dt/.9);wet.n.lerp(_nl,kw).normalize();wet.lev+=(lev-wet.lev)*kw;
  U.uWetN.value.copy(wet.n);U.uWetL.value=wet.lev;
  // Reynolds : vitesse du ballottement au bord de la surface × sa largeur / viscosité
  const Us=liq.w.length()*liq.Rs+waveRms*.5;liq.Re=Us*2*liq.Rs/NU;
  const tgtTurb=Math.max(0,Math.min(1,(liq.Re-2000)/7000));liq.turb+=(tgtTurb-liq.turb)*(1-Math.exp(-dt*(tgtTurb>liq.turb?12:1.6)));
  waveStep(dt,D,_t);
  bubbleStep(dt,D,_t);
  condStep(dt);
  reShown=Math.max(liq.Re,reShown*Math.exp(-dt*2.5));reT+=dt;
  if(reEl&&reT>.15){reT=0;const v=reShown<40?0:Math.round(reShown/50)*50;
    reEl.textContent='Re ≈ '+v.toLocaleString('fr-FR')+' · '+(v<40?'au repos':v<2000?'laminaire':v<4000?'transitoire':'turbulent');}
  U.uInvModel.value.copy(group.matrixWorld).invert();
  FU.uA0.value.copy(_t);FU.uA1.value.set(0,HTOP+2,0).applyMatrix4(group.matrixWorld);FU.uBase.value.copy(pivot.position);
  backMesh.matrix.copy(liquid.matrixWorld);backMesh.matrixWorldNeedsUpdate=true;
  // 1) la scène vue depuis sous le sol → image miroir
  vcam.position.set(camera.position.x,2*FLOOR_Y-camera.position.y,camera.position.z);vcam.lookAt(LOOK.x,2*FLOOR_Y-LOOK.y,LOOK.z);vcam.updateMatrixWorld();
  camUniforms(vcam,rtRefl.width,rtRefl.height);
  if(rt){renderer.setRenderTarget(rt);renderer.render(backScene,vcam);}
  floor.visible=false;renderer.setRenderTarget(rtRefl);renderer.render(scene,vcam);floor.visible=true;
  FU.uReflVP.value.copy(U.uVP.value);
  // 2) la scène vue par la caméra
  camUniforms(camera,_db.x,_db.y);
  if(rt){renderer.setRenderTarget(rt);renderer.render(backScene,camera);}
  renderer.setRenderTarget(null);renderer.render(scene,camera);
})();

// ---------- galerie ----------
function card(src,title,sub,removable,id){
  const b=document.createElement('button');b.className='card';b.dataset.src=src;b.type='button';
  b.innerHTML=`<img alt="" src="${src}"><span><span class="t"></span><br><span class="s"></span></span>`;
  b.querySelector('.t').textContent=title;b.querySelector('.s').textContent=sub;
  b.onclick=()=>setLabel(src,title);
  if(removable){const r=document.createElement('span');r.className='rm';r.textContent='Retirer';r.setAttribute('role','button');r.tabIndex=0;
    const del=ev=>{ev.stopPropagation();removeMine(id);};r.onclick=del;r.onkeydown=ev=>{if(ev.key==='Enter')del(ev)};b.querySelector('span').appendChild(document.createElement('br'));b.querySelector('span').appendChild(r);}
  return b;
}
const lib=document.getElementById('lib');
// La liste vient de labels/manifest.json, régénéré à chaque synchro avec le template (artifact Design).
// LIB (en haut) n'est qu'un secours si ce fichier ne se charge pas.
let libList=LIB.map(([s,t,d,k])=>({src:s,title:t,sub:d,key:k})),libSig='';
const keyOf=src=>(libList.find(l=>l.src===src)||{}).key||null;
function renderLib(){lib.innerHTML='';libList.forEach(l=>lib.appendChild(card(l.src,l.title,l.sub,false)));
  lib.querySelectorAll('.card').forEach(c=>c.classList.toggle('on',c.dataset.src===curSrc));}
async function loadManifest(first){
  try{
    const r=await fetch('labels/manifest.json',{cache:'no-store'});if(!r.ok)throw new Error(r.status);
    const m=await r.json(),list=m.labels.map(l=>({src:'labels/'+l.file,title:l.title,sub:l.sub,key:l.key})),sig=JSON.stringify(list);
    const el=document.getElementById('sync');
    if(el&&m.synced)el.textContent='Synchronisé avec le template le '+new Date(m.synced).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+'.';
    if(sig===libSig)return;
    const curKey=keyOf(curSrc);libSig=sig;libList=list;
    const same=list.find(l=>l.key===curKey);
    if(first||(curKey&&!same)){const l=(first&&list.find(l=>l.key===RS_PARAMS.get('label')))||list[0];setLabel(l.src,l.title)}   // au chargement (?label=<clé> choisit laquelle), ou si l'étiquette affichée a été retirée du template
    else if(same&&same.src!==curSrc)setLabel(same.src,same.title);        // l'étiquette affichée a changé dans le template : on la recharge
    renderLib();
  }catch(e){if(first){renderLib();const l=libList.find(l=>l.key===RS_PARAMS.get('label'))||libList[0];setLabel(l.src,l.title)}}
}
renderLib();

// étiquettes déposées : gardées dans ce navigateur (IndexedDB), sinon juste pour la session
let db=null;const mine=[];
function openDB(){return new Promise(res=>{try{const r=indexedDB.open('redsea-labels',1);r.onupgradeneeded=()=>r.result.createObjectStore('l',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}})}
function store(op,val){return new Promise(res=>{try{if(!db)return res(null);const tx=db.transaction('l',op==='get'?'readonly':'readwrite');const st=tx.objectStore('l');const rq=op==='get'?st.getAll():op==='put'?st.put(val):st.delete(val);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>res(null)}catch(e){res(null)}})}
function renderMine(){const box=document.getElementById('mine');box.innerHTML='';
  mine.forEach(m=>box.appendChild(card(m.url,m.name,new Date(m.at).toLocaleDateString('fr-FR'),true,m.id)));
  document.getElementById('mineEmpty').hidden=mine.length>0;}
function addFile(f,select){if(!f||!f.type.startsWith('image/'))return;
  const m={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),name:f.name.replace(/\.[^.]+$/,''),at:Date.now(),blob:f};
  m.url=URL.createObjectURL(f);mine.unshift(m);renderMine();store('put',{id:m.id,name:m.name,at:m.at,blob:f});if(select)setLabel(m.url,m.name);}
function removeMine(id){const i=mine.findIndex(m=>m.id===id);if(i<0)return;URL.revokeObjectURL(mine[i].url);mine.splice(i,1);store('del',id);renderMine();}
openDB().then(async d=>{db=d;const all=(await store('get'))||[];all.sort((a,b)=>b.at-a.at).forEach(r=>mine.push({...r,url:URL.createObjectURL(r.blob)}));renderMine();});

const drop=document.getElementById('drop'),file=document.getElementById('file');
file.onchange=()=>{[...file.files].forEach((f,i)=>addFile(f,i===0));file.value=''};
drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click()}};
['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();if(ev==='drop'||e.target===document.documentElement)drop.classList.remove('over')}));
document.addEventListener('drop',e=>{drop.classList.remove('over');[...(e.dataTransfer?.files||[])].forEach((f,i)=>addFile(f,i===0))});
document.addEventListener('paste',e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(it)addFile(it.getAsFile(),true)});

loadManifest(true);
// Options d'URL (voir aussi ?embed, ?hud et ?label) : ?spin=1 fait tourner la bouteille dès l'arrivée, ?fog=0 coupe la condensation (plus léger).
if(RS_PARAMS.get('spin')==='1')document.getElementById('spin').click();
if(RS_PARAMS.get('fog')==='0'&&fogBtn)fogBtn.click();
// La page qui intègre le simulateur peut changer d'étiquette : iframe.contentWindow.postMessage({type:'redsea:label',key:'momie'},'*')
// Seules les clés du manifest sont acceptées (aucune adresse venue de l'extérieur n'est chargée).
addEventListener('message',e=>{const d=e.data;if(!d||d.type!=='redsea:label')return;const l=libList.find(l=>l.key===d.key);if(l)setLabel(l.src,l.title)});
// le template peut changer pendant que la page est ouverte : on revérifie au retour sur l'onglet et toutes les 3 minutes
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadManifest(false)});
setInterval(()=>{if(!document.hidden)loadManifest(false)},180000);
