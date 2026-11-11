// 프리셋별 비주얼 조립·교체. 프리셋(tier)이 바뀌면 모델·재질·텍스처를 dispose하고 새로 만든다(LOD 없음, 통째 교체).
//   낮음: 기존 로우폴리 모델·조종석 그대로
//   높음·최고: 하이폴리 모델(같은 생성 함수에 detail만 다르게), 절차 텍스처, 환경맵
import * as THREE from 'three';
import { createKF21 } from '../entities/kf21-model.js';
import { KF21_POINTS } from '../entities/kf21-shape.js';
import { createCockpit } from '../entities/cockpit.js';
import { createGear } from '../entities/gear.js';
import { createKF21Hi } from '../entities/hi/kf21-hi.js';
import { createPilot } from '../entities/hi/pilot.js';
import { createCockpitHi } from '../entities/hi/cockpit-hi.js';
import { createFlame } from '../entities/hi/flame.js';
import { NOZZLE, Z } from '../entities/kf21-shape.js';
import { FX } from '../data/fx.js';
import { fillEnemyVisual } from '../entities/enemy-model.js';
import { addEnemyHiMeshes, disposeEnemyHi, ENEMY_NOZZLE_Z } from '../entities/hi/enemy-hi.js';
import { createAircraftTextures, PAINT_SCHEMES } from '../entities/hi/textures.js';
import { PALETTE } from '../data/palette.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Visuals {
  constructor({ renderer, scene, world, player, settings, tuning }) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.settings = settings;
    this.tuning = tuning;
    this.tier = null;
    this.current = null; // { model, cockpit, textures, pilot, extras[] }
    this.env = null;
    this.buildMs = 0;
    this.listeners = [];
    this.enemies = null; // 적기 풀(세션이 만든 뒤 main이 넣어 준다)
    this.enemyFlames = [];
  }

  /** 적기 불꽃 일렁임(최고 프리셋) */
  animate(time, dt) {
    for (const f of this.enemyFlames) f.set(0.8, 0.55, time, dt);
  }

  /** 모델이 바뀐 뒤 불린다(세션이 총구 섬광 등을 다시 붙인다). */
  onRebuild(fn) {
    this.listeners.push(fn);
  }

  get triangles() {
    return this.current ? this.current.model.triangles : 0;
  }

  /** 하늘을 큐브맵으로 구워 기체에 비치게 한다(높음·최고). */
  _buildEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = this.world.sky.clone();
    envScene.add(sky);
    const rt = pmrem.fromScene(envScene, 0, 1, 80000);
    pmrem.dispose();
    return rt;
  }

  _disposeCurrent() {
    const c = this.current;
    if (!c) return;
    this.player.setModel(null, null);
    c.model.dispose();
    if (c.cockpit && c.cockpit.dispose) c.cockpit.dispose();
    if (c.textures) c.textures.dispose();
    if (c.pilot) c.pilot.dispose();
    for (const d of c.extras) d.dispose();
    this.current = null;
    if (this.env) { this.env.dispose(); this.env = null; }
    this.scene.environment = null;
  }

  /**
   * @param {object} cfg data/quality.js 의 프리셋
   * @param {(f:number, step:string)=>void} [onProgress]
   */
  async build(cfg, onProgress) {
    const t0 = performance.now();
    const step = async (f, text) => { if (onProgress) { onProgress(f, text); await nextFrame(); } };
    this._disposeCurrent();
    this.tier = cfg.tier;
    const paint = this.settings.get('paint');
    if (cfg.tier === 'low') {
      const model = createKF21(this.tuning.model);
      // 낮음에도 이륙 연출용 랜딩기어를 단다(같은 생성 코드, 분할만 적게)
      const metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, flatShading: true });
      const tire = new THREE.MeshLambertMaterial({ color: 0x1b1d20, flatShading: true });
      const gear = createGear({ sides: 6, metal, tire, door: model.materials.bodyMat });
      model.exterior.add(gear.group);
      model.gear = gear;
      model.setState = (o) => gear.setDown(o.gear);
      model.materials.bodyMat.color.setHex(PAINT_SCHEMES[paint].tint);
      const cockpit = createCockpit(KF21_POINTS.eye);
      this.current = { model, cockpit, textures: null, pilot: null, extras: [gear, { dispose() { metal.dispose(); tire.dispose(); } }] };
    } else {
      await step(0.05, '도색·패널 라인 텍스처를 그리는 중');
      const textures = createAircraftTextures(cfg.textureSize, paint, Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
      await step(0.35, '하늘 반사 환경맵을 굽는 중');
      this.env = this._buildEnv();
      this.scene.environment = this.env.texture;
      await step(0.45, '기체 외형을 만드는 중');
      const pilot = createPilot(cfg.detail);
      const model = createKF21Hi({ detail: cfg.detail, tuning: this.tuning.model, textures, pilot });
      const flame = createFlame({ nozzles: [[-NOZZLE.x, NOZZLE.y], [NOZZLE.x, NOZZLE.y]], z: Z(NOZZLE.s1), radius: NOZZLE.r, segments: cfg.detail >= 2 ? 28 : 18, cfg: FX.flame, colors: FX.flameColors.player });
      model.attachFlame(flame);
      await step(0.8, '조종석을 만드는 중');
      const cockpit = createCockpitHi(KF21_POINTS.eye, cfg.detail);
      this.current = { model, cockpit, textures, pilot, extras: [flame] };
    }
    // 적기: 프리셋에 맞는 모델로 교체. 최고에서만 플레이어 수준의 불꽃을 단다(색은 붉은 계열)
    await step(0.9, '적기를 만드는 중');
    for (const f of this.enemyFlames) { if (f.mesh.parent) f.mesh.parent.remove(f.mesh); f.dispose(); }
    this.enemyFlames = [];
    disposeEnemyHi(cfg.enemyDetail);
    if (this.enemies) {
      this.enemies.rebuildVisuals((group) => {
        const tris = fillEnemyVisual(group, cfg.enemyDetail, addEnemyHiMeshes);
        if (cfg.enemyFlames) {
          const flame = createFlame({ nozzles: [[0, 0]], z: ENEMY_NOZZLE_Z, radius: 0.42, segments: 14, cfg: FX.flame, colors: FX.flameColors.enemy });
          flame.set(0.8, 0.55, 0, 10);
          group.add(flame.mesh);
          this.enemyFlames.push(flame);
        }
        return tris;
      });
    }
    this.player.setModel(this.current.model, this.current.cockpit);
    for (const fn of this.listeners) fn(this.current, cfg);
    await step(1, '준비 완료');
    this.buildMs = performance.now() - t0;
    return this.current;
  }

  /** 도색 변경: 메인 메뉴 기체에 바로 반영된다. */
  setPaint(id) {
    const c = this.current;
    if (!c) return;
    if (c.textures) c.textures.setPaint(id);
    else c.model.materials.bodyMat.color.setHex(PAINT_SCHEMES[id].tint);
  }
}

export { PALETTE };
