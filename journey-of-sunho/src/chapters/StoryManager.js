// StoryManager — 스토리 연출.
// · 시작 연출: 학원 외관 → 선호가 학원에서 나옴 → 자전거까지 걸어감 → 탑승 → 페달 밟으며 출발 → 후방 카메라로 전환 → 조작권
// · 주행 중 혼잣말(진행률에 따라), 도착 연출(집 앞), 대사 상자(레터박스)
// · Enter / Space / Esc 또는 '건너뛰기' 버튼으로 연출을 건너뛸 수 있어요.
import * as THREE from '../lib/three.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/utils.js';

export class StoryManager {
  constructor(game, uiRoot) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'story hidden';
    this.el.innerHTML = `
      <div class="lb top"></div><div class="lb bottom"></div>
      <div class="story-title"><small></small><b></b></div>
      <div class="story-box"><span class="who"></span><p class="line"></p></div>
      <button class="story-skip">건너뛰기 ▸ Enter</button>`;
    uiRoot.appendChild(this.el);
    this.el.querySelector('.story-skip').addEventListener('click', () => this.skip());
    this.active = false;
    this.lines = [];
    this.lineT = 0;
  }

  _show(on) { this.el.classList.toggle('hidden', !on); }
  _title(no, title) {
    const t = this.el.querySelector('.story-title');
    t.querySelector('small').textContent = no ? `CHAPTER ${no}` : '';
    t.querySelector('b').textContent = title || '';
    t.classList.toggle('on', !!title);
  }
  _line(l) {
    const box = this.el.querySelector('.story-box');
    if (!l) { box.classList.remove('on'); return; }
    box.querySelector('.who').textContent = l.who || '';
    box.querySelector('.who').style.display = l.who ? '' : 'none';
    box.querySelector('.line').textContent = l.text;
    box.classList.add('on');
  }

  // ------------------------------------------------------------ 시작 연출
  playIntro(chapter, onDone) {
    const g = this.game, env = g.world.env, P = g.player;
    const ac = env.landmarks.academy, rack = env.landmarks.bikeRack;
    this.chapter = chapter;
    this.onDone = onDone;
    this.active = true;
    this.mode = 'intro';
    this._show(true);
    this.el.classList.remove('outro');
    this._title(chapter.no, chapter.title);
    this.lines = [...(chapter.intro || [])];
    this.lineIdx = -1; this.lineT = 0;
    this.t = 0;
    const roads = g.world.roads;
    const gy = (x, z) => roads.query(x, z, {}).height;
    // 위치 계산
    const h = rack.rot;
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = fz, lz = -fx; // 자전거 기준 왼쪽 (학원 쪽)
    this.bikePose = { x: rack.x, z: rack.z, y: gy(rack.x, rack.z), heading: h };
    this.standPos = { x: rack.x + lx * 0.55 - fx * 0.15, z: rack.z + lz * 0.55 - fz * 0.15 };
    this.door = { x: ac.x + ac.faceX * 0.6, z: ac.z + ac.faceZ * 0.6 };
    this.walkDist = Math.hypot(this.standPos.x - this.door.x, this.standPos.z - this.door.z);
    this.walkTime = this.walkDist / 1.3;
    this.T = { establish: 3.4, exit: 3.4 + this.walkTime + 0.4, mount: 3.4 + this.walkTime + 0.4 + 1.1 };
    this.T.depart = this.T.mount + 3.4;
    P.mode = 'cutscene';
    P.character.root.visible = true;
    this.face = { x: ac.faceX, z: ac.faceZ };
    g.cam.setShot(this._shotEstablish(), 0);
    g.input.enabled = false;
  }

  _shotEstablish() {
    const ac = this.game.world.env.landmarks.academy;
    const c = ac.center;
    const fx = this.face.x, fz = this.face.z;
    const tx = -fz, tz = fx;
    return {
      pos: new THREE.Vector3(ac.x + fx * 24 + tx * 9, 4.2, ac.z + fz * 24 + tz * 9),
      look: new THREE.Vector3(c.x, 6.5, c.z),
      fov: 55,
    };
  }

  _introUpdate(dt) {
    const g = this.game, P = g.player, T = this.T;
    this.t += dt;
    const t = this.t;
    // 대사 진행
    this.lineT -= dt;
    if (this.lineT <= 0 && this.lineIdx < this.lines.length - 1) {
      this.lineIdx++; this._line(this.lines[this.lineIdx]); this.lineT = 2.9;
    }
    if (t > 3) this._title(null, null);
    const bp = this.bikePose;
    const gy = this.bikePose.y;
    if (t < T.exit) {
      // 학원 문에서 나와 자전거로 걸어감
      const k = clamp((t - T.establish + 0.4) / this.walkTime, 0, 1);
      const x = lerp(this.door.x, this.standPos.x, k), z = lerp(this.door.z, this.standPos.z, k);
      const heading = k < 1 ? Math.atan2(this.standPos.x - this.door.x, this.standPos.z - this.door.z) : bp.heading;
      const walking = t > T.establish - 0.4 && k < 1;
      P.character.root.visible = t > T.establish - 0.6;
      P.cutscene = { mode: walking ? 'walk' : 'stand', stand: { x, y: g.world.roads.query(x, z, {}).height, z, heading }, walkPhase: t * 6.8, bikePose: bp, kickstand: true };
      if (t > T.establish - 0.2) {
        // 걸어가는 선호를 비스듬히 따라가는 카메라
        const fx = this.face.x, fz = this.face.z, tx = -fz, tz = fx;
        g.cam.setShot({ pos: new THREE.Vector3(x + fx * 5.5 + tx * 3.5, gy + 2.3, z + fz * 5.5 + tz * 3.5), look: new THREE.Vector3(x, gy + 1.2, z), fov: 50 }, t < T.establish + 0.4 ? 0.8 : 0);
      }
    } else if (t < T.mount) {
      const k = (t - T.exit) / (T.mount - T.exit);
      P.cutscene = { mode: 'mount', t: k, stand: { ...this.standPos, y: gy, heading: bp.heading }, bikePose: bp, kickstand: k < 0.7 };
      const fx = Math.sin(bp.heading), fz = Math.cos(bp.heading);
      g.cam.setShot({ pos: new THREE.Vector3(bp.x - fx * 3.8 + fz * 2.6, gy + 1.9, bp.z - fz * 3.8 - fx * 2.6), look: new THREE.Vector3(bp.x, gy + 1.1, bp.z), fov: 52 }, 0.6);
    } else if (!this.departing) {
      // 출발: 실제 물리로 주행하면서 차도 오른쪽 차선으로
      this.departing = true;
      P.placeAt(bp.x, bp.z, bp.heading);
      P.mode = 'ride';
      P.cutscene = null;
      g.cam.setShot(null, 2.6);
      this._line(null);
    }
    if (this.departing) {
      const v = g.input.virtual;
      const Pp = P.physics;
      const pr = g.route.project(Pp.x, Pp.z);
      const p = g.route.pointAt(pr.s + 7);
      const lane = g.laneOffset();
      const want = Math.atan2(p.x - p.tz * lane - Pp.x, p.z + p.tx * lane - Pp.z);
      const s = clamp(-wrapAngle(want - Pp.heading) * 2, -1, 1);
      v.up = Pp.v < 4 ? 1 : 0; v.right = Math.max(0, s); v.left = Math.max(0, -s);
      if (t > T.depart) this.finishIntro();
    }
  }

  finishIntro() {
    const g = this.game;
    if (!this.active) return;
    this.active = false;
    this.departing = false;
    Object.assign(g.input.virtual, { up: 0, down: 0, left: 0, right: 0, brake: 0 });
    g.input.enabled = true;
    g.player.cutscene = null;
    if (g.player.mode === 'cutscene') g.player.mode = 'ride';
    g.cam.setShot(null, 0.8);
    this._show(false);
    this._line(null);
    this._title(null, null);
    const cb = this.onDone; this.onDone = null;
    cb && cb();
  }

  skip() {
    if (!this.active) return;
    const g = this.game;
    if (this.mode === 'intro') {
      g.placeOnRoute(g.startS(), g.laneOffset());
      g.player.physics.v = 2.5;
      this.finishIntro();
    } else if (this.mode === 'outro') this.finishOutro();
  }

  // ------------------------------------------------------------ 주행 중 혼잣말
  startRide(chapter) { this.rideLines = [...(chapter.ride || [])].sort((a, b) => a.at - b.at); }
  rideUpdate(progress) {
    if (!this.rideLines || !this.rideLines.length) return;
    if (progress >= this.rideLines[0].at) this.game.hud.say(this.rideLines.shift().text, 4);
  }

  // ------------------------------------------------------------ 도착 연출
  playOutro(chapter, onDone) {
    const g = this.game;
    this.mode = 'outro';
    this.active = true;
    this.onDone = onDone;
    this.t = 0;
    this._show(true);
    this.el.classList.add('outro');
    this._title(null, null);
    this._line({ who: '', text: chapter.outro || '집에 도착했다!' });
    g.input.enabled = false;
    Object.assign(g.input.virtual, { up: 0, brake: 1, left: 0, right: 0 });
    const home = g.world.env.landmarks.home;
    this.home = home;
    this.orbit0 = Math.atan2(g.sm.camera.position.x - home.x, g.sm.camera.position.z - home.z);
  }
  _outroUpdate(dt) {
    const g = this.game, P = g.player.physics;
    this.t += dt;
    const a = this.orbit0 + this.t * 0.35;
    const r = lerp(6, 9, smoothstep(0, 3, this.t));
    g.cam.setShot({ pos: new THREE.Vector3(P.x + Math.sin(a) * r, P.y + 2.6, P.z + Math.cos(a) * r), look: new THREE.Vector3(P.x, P.y + 1.2, P.z), fov: 55 }, this.t < 0.1 ? 1.2 : 0);
    if (this.t > 4.2) this.finishOutro();
  }
  finishOutro() {
    if (!this.active) return;
    this.active = false;
    const g = this.game;
    g.input.virtual.brake = 0;
    this._show(false);
    this.el.classList.remove('outro');
    const cb = this.onDone; this.onDone = null;
    cb && cb();
  }

  update(dt) {
    if (!this.active) return;
    if (this.game.input.wasPressed('Enter', 'Escape') || (this.mode === 'intro' && this.game.input.wasPressed('Space'))) { this.skip(); return; }
    if (this.mode === 'intro') this._introUpdate(dt);
    else if (this.mode === 'outro') this._outroUpdate(dt);
  }

  hide() { this.active = false; this._show(false); }
}
