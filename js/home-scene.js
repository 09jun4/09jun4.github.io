// 메인 3D 장면: 액체 크롬 조형물 + 입자. 스크롤 진행률(p)의 함수라서 역방향으로도 정확히 되돌아가요.
// 구조: 블롭 → 늘어남(캡슐) → 입자로 분해 → 입자가 링(서킷)으로 재조립 → 표면 색이 블루로 변함
(function () {
  'use strict';
  var THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var LX = 1.9, TUBE = .34, PI = Math.PI;
  var loading = null;

  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return loading || (loading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = THREE_SRC; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    }));
  }
  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }

  var SNOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}',
    'vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);',
    ' vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
    ' float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    ' vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    ' p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    ' vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;',
    ' return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  // 크롬 덩어리: 단위 구 방향(d)을 가시·비틀린 캡슐·링으로 변형하고, 유한 차분으로 부드러운 법선을 구해요
  var MESH_VERT = SNOISE + '\n' + [
    'uniform float uTime,uStretch,uBend,uNoise,uEnergy,uSpike,uTwist,uPtrAmt; uniform vec3 uPtr;',
    'varying vec3 vN; varying vec3 vW; varying float vNz;',
    'const float PI=3.14159265; const float LX=' + LX.toFixed(3) + '; const float TUBE=' + TUBE.toFixed(3) + ';',
    'vec2 rot(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}',
    'vec3 shape(vec3 d, out float nz){',
    ' float t=uTime*(.55+uEnergy*1.6);',
    ' float a=clamp(d.x*1.05,-1.,1.)*PI; float tw=a*uTwist+uTime*.5;',
    ' vec3 cap=vec3(0.),ring=vec3(0.); nz=0.;',
    ' if(uBend<.999){',
    '  float n1=snoise(d*1.35+vec3(0.,t,t*.5)); float n2=snoise(d*2.9-vec3(t*.8,t*.3,0.));',
    '  float spk=pow(max(snoise(d*3.4+vec3(t*.6,0.,t*.3)),0.),2.)*uSpike;',
    '  float rip=(sin(dot(d,vec3(.9,.6,.3))*7.-uTime*2.2)*.045+sin(uTime*1.4+d.y*3.)*.045)*(1.+uEnergy*2.);',
    '  float disp=(n1*.36+n2*.10+rip)*uNoise+spk*.5; nz=n1;',
    '  vec2 es=mix(vec2(1.),vec2(.78,.42),uStretch); vec2 sec=rot(d.yz*es,tw);',
    '  cap=vec3(d.x*mix(1.,LX,uStretch),sec)*(1.+disp);',
    ' }',
    ' if(uBend>.001){',
    '  float w=max(sqrt(max(1.-d.x*d.x,0.)),1e-3);',
    '  float R=(LX/PI)*(1.+.16*cos(2.*a+uTime*.7)+.08*sin(3.*a+1.-uTime*.9)); vec2 rad=vec2(cos(a),sin(a));',
    '  vec2 yz=d.yz/w; float rn=snoise(vec3(rad*1.1,yz.y*.9+yz.x*.4+t*.5));',
    '  float rt=TUBE*(1.+rn*.26*uNoise+sin(a*3.-uTime*1.6)*.07*(1.+uEnergy*2.));',
    '  vec2 sec=rot(yz*vec2(1.25,.8)*rt,tw);',
    '  ring=vec3(R*rad,0.)+sec.x*vec3(rad,0.)+sec.y*vec3(0.,0.,1.);',
    '  if(uBend>=.999) nz=rn;',
    ' }',
    ' return mix(cap,ring,uBend);',
    '}',
    'void main(){',
    ' vec3 d=normalize(position); float nz,n1,n2;',
    ' vec3 ref=abs(d.y)>.9?vec3(1.,0.,0.):vec3(0.,1.,0.);',
    ' vec3 t1=normalize(cross(d,ref)); vec3 t2=cross(d,t1); float e=.012;',
    ' vec3 p0=shape(d,nz); vec3 p1=shape(normalize(d+t1*e),n1); vec3 p2=shape(normalize(d+t2*e),n2);',
    ' vec3 n=normalize(cross(p1-p0,p2-p0)); if(uBend>.5) n=-n;',
    ' vNz=nz; vN=normalize(mat3(modelMatrix)*n); vec4 wp=modelMatrix*vec4(p0,1.);',
    ' vec2 dp=wp.xy-uPtr.xy; wp.xyz+=vN*exp(-dot(dp,dp)*1.4)*uPtrAmt;',
    ' vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp;',
    '}'
  ].join('\n');

  var MESH_FRAG = [
    'uniform float uDissolve,uWhite,uDark,uRim,uShift,uTime,uPhase;',
    'uniform vec3 uEnvLow,uEnvHigh,uBlue,uTint,uBand;',
    'varying vec3 vN; varying vec3 vW; varying float vNz;',
    'vec3 env(vec3 r){',
    ' vec3 c=mix(uEnvLow,uEnvHigh,smoothstep(-.6,1.,r.y));',
    ' c+=uBand*exp(-pow((r.y-.04)*5.5,2.));',
    ' float a1=smoothstep(.80,.96,dot(r,normalize(vec3(.85,.30,.45)))); c+=uBlue*a1*(2.1+uShift*1.4);',
    ' float a2=smoothstep(.84,.97,dot(r,normalize(vec3(-.75,.45,.35)))); c+=vec3(1.)*a2*uWhite;',
    ' float a3=smoothstep(.88,.985,r.y); c+=vec3(1.)*a3*(uWhite*.9);',
    ' float a4=smoothstep(.9,.985,dot(r,normalize(vec3(-.2,-.5,.8)))); c+=uBlue*.9*a4;',
    ' float st=smoothstep(.94,.99,sin(atan(r.z,r.x)*3.+1.))*smoothstep(-.2,.5,r.y); c+=uBlue*.55*st;',
    ' float dk=smoothstep(.9,.97,dot(r,normalize(vec3(.1,-.15,-1.)))); c*=1.-uDark*dk;',
    ' float dk2=smoothstep(.93,.985,dot(r,normalize(vec3(-.9,-.1,-.3)))); c*=1.-uDark*.8*dk2;',
    ' return c;',
    '}',
    'void main(){',
    ' float nv=vNz*.5+.5; float dis=mix(-.12,1.12,uDissolve);',
    ' if(nv<dis) discard;',
    ' vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vW); if(dot(N,V)<0.) N=-N;',
    ' vec3 R=reflect(-V,N); float ea=uTime*.24+uPhase; R=vec3(cos(ea)*R.x+sin(ea)*R.z,R.y,-sin(ea)*R.x+cos(ea)*R.z);',
    ' vec3 tint=mix(uTint,uTint*vec3(.55,.74,1.25),uShift);',
    ' vec3 col=env(R)*tint;',
    ' float fr=pow(1.-max(dot(N,V),0.),3.); col+=uBlue*fr*uRim*(1.+uShift);',
    ' float edge=1.-smoothstep(dis,dis+.07,nv); col+=uBlue*edge*2.6*step(.001,uDissolve);',
    ' col=col/(1.+col*.12);',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  var PART_VERT = [
    'attribute vec3 aMid,aEnd,aR;',
    'uniform float uE1,uE2,uTime,uPix,uAlpha;',
    'varying float vA; varying float vC;',
    'float ease(float x){x=clamp(x,0.,1.);return x*x*(3.-2.*x);}',
    'void main(){',
    ' float e1=ease((uE1-aR.x*.4)/.6); float e2=ease((uE2-aR.y*.4)/.6);',
    ' vec3 p=mix(position,aMid,e1); p=mix(p,aEnd,e2);',
    ' float life=e1*(1.-e2);',
    ' float sw=uTime*.8*life*(.4+aR.x); p.xz=mat2(cos(sw),-sin(sw),sin(sw),cos(sw))*p.xz;',
    ' p+=vec3(sin(uTime*.9+aR.z*40.),cos(uTime*.7+aR.x*30.),sin(uTime*.8+aR.y*35.))*.07*(.25+life);',
    ' vec4 mv=modelViewMatrix*vec4(p,1.);',
    ' gl_Position=projectionMatrix*mv;',
    ' gl_PointSize=(1.3+aR.z*2.2)*uPix*(4.8/-mv.z)*(.5+life*.7);',
    ' vA=smoothstep(0.,.06,e1)*(1.-smoothstep(.92,1.,e2))*uAlpha*.8; vC=aR.z;',
    '}'
  ].join('\n');
  var PART_FRAG = [
    'uniform vec3 uBlue,uSilver;',
    'varying float vA; varying float vC;',
    'void main(){',
    ' vec2 q=gl_PointCoord-.5; float r=length(q); if(r>.5) discard;',
    ' float a=smoothstep(.5,.05,r)*vA;',
    ' gl_FragColor=vec4(mix(uSilver,uBlue,step(.55,vC)),a);',
    '}'
  ].join('\n');

  var DUST_VERT = [
    'attribute vec3 aR;',
    'uniform float uTime,uPix,uAlpha,uEnergy;',
    'varying float vA;',
    'void main(){',
    ' float r=length(position.xz); float ang=atan(position.z,position.x)+uTime*(.10+.22*aR.x)*(1.+uEnergy*3.)/(.5+r*.35);',
    ' vec3 p=vec3(cos(ang)*r,position.y+sin(uTime*.6+aR.z*20.)*.22*(1.+uEnergy),sin(ang)*r);',
    ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;',
    ' gl_PointSize=(1.2+aR.z*2.6)*uPix*(5./-mv.z); vA=uAlpha*(.4+.6*aR.x);',
    '}'
  ].join('\n');
  var DUST_FRAG = 'uniform vec3 uBlue,uSilver; varying float vA; void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;gl_FragColor=vec4(mix(uSilver,uBlue,.45),smoothstep(.5,.05,r)*vA);}';

  function rnd(seedObj) { seedObj.s = (seedObj.s * 1664525 + 1013904223) >>> 0; return seedObj.s / 4294967296; }
  function unit(sd) { var z = rnd(sd) * 2 - 1, a = rnd(sd) * PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), r * Math.sin(a), z]; }
  // 셰이더와 같은 식 (CPU쪽): 캡슐 표면, 링(서킷) 표면
  function capPos(d) { return [d[0] * LX, d[1] * .6, d[2] * .6]; }
  function ringPos(d) {
    var w = Math.max(Math.sqrt(Math.max(1 - d[0] * d[0], 0)), 1e-3), a = Math.max(-1, Math.min(1, d[0] * 1.05)) * PI;
    var R = (LX / PI) * (1 + .16 * Math.cos(2 * a) + .08 * Math.sin(3 * a + 1)), cx = Math.cos(a), cy = Math.sin(a);
    var y = d[1] / w, z = d[2] / w;
    return [(R + TUBE * y) * cx, (R + TUBE * y) * cy, TUBE * z];
  }

  var THEMES = {
    dark: { envLow: [.012, .014, .024], envHigh: [.16, .18, .24], band: [.50, .53, .60], blue: [.157, .49, 1], white: 1.7, dark: .0, tint: [.92, .95, 1], rim: .55, particle: [.78, .84, .95], add: 1 },
    light: { envLow: [.50, .54, .60], envHigh: [1, 1, 1], band: [.0, .0, .0], blue: [.12, .42, .94], white: .9, dark: .78, tint: [.86, .9, .97], rim: .35, particle: [.16, .26, .46], add: 0 }
  };

  function create(opts) {
    // opts: canvas, mobile, reduce, onFail, getTheme
    var canvas = opts.canvas;
    if (!hasWebGL()) { opts.onFail(); return null; }
    var api = { ready: false, state: { dissolve: 0, stretch: 0, bend: 0, shift: 0, e1: 0, e2: 0, canvasOpacity: 1 } };
    loadThree().then(function () { try { init(); } catch (e) { console.warn('scene', e); opts.onFail(); } }, function () { opts.onFail(); });

    function init() {
      var T = window.THREE;
      var mobile = opts.mobile;
      var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
      var dprMax = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2), dpr = dprMax;
      renderer.setPixelRatio(dpr);
      var scene = new T.Scene();
      var camera = new T.PerspectiveCamera(38, 1, .1, 60); camera.position.set(0, 0, 4.8);
      var grp = new T.Group(); scene.add(grp);

      var detail = mobile ? 24 : 40;
      var mat = new T.ShaderMaterial({
        vertexShader: MESH_VERT, fragmentShader: MESH_FRAG, side: T.DoubleSide,
        uniforms: {
          uTime: { value: 0 }, uStretch: { value: 0 }, uBend: { value: 0 }, uNoise: { value: 1 }, uDissolve: { value: 0 }, uShift: { value: 0 },
          uEnergy: { value: 0 }, uSpike: { value: 0 }, uTwist: { value: 0 }, uPhase: { value: 0 }, uPtrAmt: { value: 0 }, uPtr: { value: new T.Vector3() },
          uWhite: { value: 1.7 }, uDark: { value: 0 }, uRim: { value: .5 },
          uEnvLow: { value: new T.Vector3() }, uEnvHigh: { value: new T.Vector3() }, uBlue: { value: new T.Vector3() }, uTint: { value: new T.Vector3() }, uBand: { value: new T.Vector3() }
        }
      });
      var mesh = new T.Mesh(new T.IcosahedronGeometry(1, detail), mat);
      mesh.frustumCulled = false; grp.add(mesh);

      // 분해·재조립 입자
      var N = mobile ? 4200 : 9000, sd = { s: 20251108 };
      var start = new Float32Array(N * 3), mid = new Float32Array(N * 3), end = new Float32Array(N * 3), rr = new Float32Array(N * 3);
      for (var i = 0; i < N; i++) {
        var s = capPos(unit(sd)), e = ringPos(unit(sd)), m = unit(sd), mr = 1.2 + Math.pow(rnd(sd), .8) * 1.5;
        start.set(s, i * 3); end.set(e, i * 3); mid.set([m[0] * mr * 1.15, m[1] * mr * .8, m[2] * mr * .8], i * 3); rr.set([rnd(sd), rnd(sd), rnd(sd)], i * 3);
      }
      var pg = new T.BufferGeometry();
      pg.setAttribute('position', new T.BufferAttribute(start, 3)); pg.setAttribute('aMid', new T.BufferAttribute(mid, 3));
      pg.setAttribute('aEnd', new T.BufferAttribute(end, 3)); pg.setAttribute('aR', new T.BufferAttribute(rr, 3));
      var pmat = new T.ShaderMaterial({
        vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        uniforms: { uE1: { value: 0 }, uE2: { value: 0 }, uTime: { value: 0 }, uPix: { value: dpr }, uAlpha: { value: 1 }, uBlue: { value: new T.Vector3() }, uSilver: { value: new T.Vector3() } }
      });
      var pts = new T.Points(pg, pmat); pts.frustumCulled = false; grp.add(pts);

      // 주변의 미세한 먼지 입자
      var DN = mobile ? 700 : 1500, dp = new Float32Array(DN * 3), dr = new Float32Array(DN * 3);
      for (i = 0; i < DN; i++) { var u = unit(sd), rd = 1.7 + rnd(sd) * 3.3; dp.set([u[0] * rd * 1.2, u[1] * rd * .5, u[2] * rd * .8 - .3], i * 3); dr.set([rnd(sd), rnd(sd), rnd(sd)], i * 3); }
      var dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(dp, 3)); dg.setAttribute('aR', new T.BufferAttribute(dr, 3));
      var dmat = new T.ShaderMaterial({
        vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uPix: { value: dpr }, uAlpha: { value: .5 }, uBlue: { value: new T.Vector3() }, uSilver: { value: new T.Vector3() } }
      });
      var dust = new T.Points(dg, dmat); dust.frustumCulled = false; scene.add(dust);

      // 테마(색) 값은 목표로 부드럽게 따라가요
      var cur = JSON.parse(JSON.stringify(THEMES.dark)), tgtName = 'dark';
      function themeColors(name) { return THEMES[name] || THEMES.dark; }
      function lerpArr(a, b, k) { for (var j = 0; j < a.length; j++) a[j] += (b[j] - a[j]) * k; }
      function applyTheme(k) {
        var t = themeColors(tgtName);
        ['envLow', 'envHigh', 'band', 'blue', 'tint', 'particle'].forEach(function (key) { lerpArr(cur[key], t[key], k); });
        ['white', 'dark', 'rim'].forEach(function (key) { cur[key] += (t[key] - cur[key]) * k; });
        var u = mat.uniforms;
        u.uEnvLow.value.set.apply(u.uEnvLow.value, cur.envLow); u.uEnvHigh.value.set.apply(u.uEnvHigh.value, cur.envHigh);
        u.uBand.value.set.apply(u.uBand.value, cur.band); u.uBlue.value.set.apply(u.uBlue.value, cur.blue); u.uTint.value.set.apply(u.uTint.value, cur.tint);
        u.uWhite.value = cur.white; u.uDark.value = cur.dark; u.uRim.value = cur.rim;
        [pmat, dmat].forEach(function (m) { m.uniforms.uBlue.value.set.apply(m.uniforms.uBlue.value, cur.blue); m.uniforms.uSilver.value.set.apply(m.uniforms.uSilver.value, cur.particle); });
        var blend = t.add ? T.AdditiveBlending : T.NormalBlending;
        if (pmat.blending !== blend) { pmat.blending = blend; dmat.blending = blend; pmat.needsUpdate = true; dmat.needsUpdate = true; }
      }
      applyTheme(1);
      api.setTheme = function (name) { tgtName = name; if (opts.reduce) applyTheme(1); };

      function resize() {
        var w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
        renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        api.fit = Math.max(.42, Math.min(1.12, camera.aspect * .95));
        pmat.uniforms.uPix.value = dpr; dmat.uniforms.uPix.value = dpr;
      }
      api.resize = resize; api.fit = 1; resize();

      // 프레임 시간으로 품질 자동 조절 (저사양 기기: 해상도를 낮춰요)
      var ema = 16, frames = 0;
      function adapt(dt) {
        ema += (dt * 1000 - ema) * .05; frames++;
        if (frames % 90 === 0 && ema > 30 && dpr > .75) { dpr = Math.max(.75, dpr - .25); resize(); }
      }

      var pointer = { x: 0, y: 0, tx: 0, ty: 0 }, rot = { yaw: 0 };
      api.pointer = function (nx, ny) { pointer.tx = nx; pointer.ty = ny; };
      var S = api.state;

      // p: 프로젝트 구간 진행률(0~1), vis: 캔버스 투명도, energy: 스크롤·포인터 속도(0~1), dirv: 스크롤 방향(-1~1)
      var yawX = 0, KX = [[0, 0], [.14, 0], [.245, .95], [.45, -.95], [.65, .95], [.835, -.95], [1, 0]];
      function kx(p) {
        for (var q = 1; q < KX.length; q++) if (p <= KX[q][0]) { var a = KX[q - 1], b = KX[q], f = (p - a[0]) / (b[0] - a[0]); f = f * f * (3 - 2 * f); return a[1] + (b[1] - a[1]) * f; }
        return 0;
      }
      api.render = function (p, vis, time, dt, energy, dirv, ptrOn) {
        function ss(a, b, x) { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); }
        energy = energy || 0; dirv = dirv || 0;
        S.stretch = ss(.14, .36, p);
        S.dissolve = ss(.36, .52, p) * (1 - ss(.66, .82, p));
        S.e1 = ss(.36, .54, p);
        S.e2 = ss(.56, .78, p);
        S.bend = ss(.53, .57, p);
        S.shift = ss(.78, .95, p);
        S.spike = ss(.08, .2, p) * (1 - ss(.3, .4, p));
        S.twist = 2.5 * ss(.14, .34, p) - 1.5 * ss(.34, .5, p); // 링이 될 때는 정수(1)로 맞춰서 이음새가 닫혀요
        S.energy = energy; S.canvasOpacity = vis;
        var u = mat.uniforms;
        u.uTime.value = time; u.uStretch.value = S.stretch; u.uBend.value = S.bend; u.uDissolve.value = S.dissolve; u.uShift.value = S.shift;
        u.uEnergy.value = energy; u.uSpike.value = S.spike + energy * .35 * (1 - S.bend); u.uTwist.value = S.twist; u.uPhase.value = p * PI * 3;
        u.uNoise.value = (1 - .5 * S.stretch + .3 * S.bend) * (1 + energy * .9);
        pmat.uniforms.uTime.value = time; pmat.uniforms.uE1.value = S.e1; pmat.uniforms.uE2.value = S.e2;
        dmat.uniforms.uTime.value = time; dmat.uniforms.uEnergy.value = energy;
        applyTheme(1 - Math.exp(-dt * 5));
        var k = 1 - Math.exp(-dt * 6);
        pointer.x += (pointer.tx - pointer.x) * k; pointer.y += (pointer.ty - pointer.y) * k;
        u.uPtr.value.set(pointer.x * 2.2, -pointer.y * 1.3, 1); u.uPtrAmt.value = ptrOn ? .28 * (1 - S.dissolve) : 0;
        // 회전: 계속 돌고, 스크롤하면 그 방향으로 휙 돌아요. 링이 되면 제자리에서 돌며 흔들려요
        yawX += dirv * energy * dt * 7; yawX *= Math.exp(-dt * .9);
        var spin = opts.reduce ? 0 : time * .28, sway = opts.reduce ? 0 : Math.sin(time * .45) * .8;
        var ringness = S.bend;
        grp.rotation.set(pointer.y * .35 - .55 * ringness + (opts.reduce ? 0 : Math.sin(time * .6) * .12),
          spin * (1 - ringness) + sway * ringness + pointer.x * .6 + yawX,
          -.4 * S.stretch * (1 - ringness) + pointer.x * .05 + (opts.reduce ? 0 : time * .22 * ringness));
        var sc = api.fit * (1.08 - .1 * ss(.1, .4, p) - .2 * S.spike) * (1 + (opts.reduce ? 0 : Math.sin(time * 1.3) * .035) + energy * .12);
        grp.scale.setScalar(sc);
        // 패널 반대편으로 흘러 다녀요 (데스크톱)
        var ox = opts.mobile ? 0 : kx(p) * Math.min(1, api.fit / .95);
        grp.position.x += (ox - grp.position.x) * (1 - Math.exp(-dt * 4));
        grp.position.y = (opts.mobile ? .42 * ss(0, .08, p) : 0) + (opts.reduce ? 0 : Math.sin(time * .9) * .06);
        // 카메라가 스크롤에 따라 천천히 공전해요
        var cph = p * 1.4 + pointer.x * .25;
        camera.position.set(Math.sin(cph) * .55 + pointer.x * .25, Math.sin(p * 5) * .2 - pointer.y * .15, 4.8 - .45 * Math.sin(p * PI) - energy * .12);
        camera.lookAt(0, 0, 0);
        dust.rotation.y = time * .02 + pointer.x * .12; dust.rotation.x = pointer.y * .06; dust.position.x = grp.position.x * .5;
        dmat.uniforms.uAlpha.value = (.6 + energy * .3) * vis;
        pmat.uniforms.uAlpha.value = vis;
        if (vis > .003) renderer.render(scene, camera);
        adapt(dt);
      };
      api.ready = true;
      opts.onReady && opts.onReady();
    }
    return api;
  }
  window.HomeScene = { create: create };
})();
