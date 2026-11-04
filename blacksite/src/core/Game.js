// 게임 본체: 렌더러, 설정, 입력, 저장, 오디오, 화면 상태 머신을 묶는다.
import * as THREE from 'three';
import { bus } from './EventBus.js';
import { loadConfigs } from './ConfigLoader.js';
import { StateMachine } from './StateMachine.js';
import { Loop } from './Loop.js';
import { InputManager } from '../input/InputManager.js';
import { KeyBindings } from '../input/KeyBindings.js';
import { SaveManager } from '../save/SaveManager.js';
import { createMaterials } from '../environments/Materials.js';
import { PlayState } from './states/PlayState.js';
import { MenuState } from './states/MenuState.js';
import { BriefingState } from './states/BriefingState.js';
import { ResultsState } from './states/ResultsState.js';
import { FailureState } from './states/FailureState.js';
import { UI } from '../ui/UI.js';

// 설정 파일 목록 (시스템별 JSON)
const CONFIGS = {
  game: 'game.json',
  player: 'player.json',
  pistol: 'weapons/pistol.json',
  guard: 'enemies/guard.json',
  mission: 'missions/mission01.json',
  map: 'maps/facility01.json',
  audio: 'audio.json',
  logs: 'logs/mission01_logs.json',
};

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.bus = bus;
    this.save = new SaveManager();
    this.isAdmin = false;
    this.debug = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]debug\b/.test(location.search);
    // AI 자동 플레이(관전) 모드: ?autoplay 또는 window.BLACKSITE_AUTOPLAY
    this.autoplay = !!window.BLACKSITE_AUTOPLAY || /[?&]autoplay\b/.test(location.search);
    this.timeScale = 1;
  }

  async init() {
    this.cfg = await loadConfigs(CONFIGS);
    const s = this.save.settings;
    this.preset = this.cfg.game.graphicsPresets[s.graphics.preset] || this.cfg.game.graphicsPresets.medium;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !!this.preset.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x050607, 1);
    this.M = createMaterials();

    this.bindings = new KeyBindings(s.keyBindings);
    this.input = new InputManager(this.canvas, this.bindings);

    // 오디오·계정은 있으면 연결 (모듈 단위로 교체 가능)
    try {
      const { AudioManager } = await import('../audio/AudioManager.js');
      this.audio = new AudioManager(this.cfg.audio);
    } catch (e) { console.warn('[Game] audio unavailable', e); this.audio = null; }

    this.ui = new UI(this);
    this.fsm = new StateMachine(bus)
      .add('menu', new MenuState(this))
      .add('briefing', new BriefingState(this))
      .add('playing', new PlayState(this))
      .add('results', new ResultsState(this))
      .add('failure', new FailureState(this));

    this.applySettings();
    bus.on('settings:changed', () => this.applySettings());
    addEventListener('resize', () => this.resize());
    this.resize();

    try {
      const { AuthManager } = await import('../save/AuthManager.js');
      this.auth = new AuthManager(this);
      this.auth.init();
    } catch (e) { console.warn('[Game] auth unavailable', e); }

    if (this.autoplay) {
      document.body.classList.add('autoplay');
      const { Director } = await import('../autoplay/Director.js');
      const m = /[?&]difficulty=(easy|normal|hard)/.exec(location.search);
      this.director = new Director(this, { difficulty: m ? m[1] : 'normal' });
    }
    this.loop = new Loop((dt, t) => this.frame(dt, t));
    await this.fsm.change('menu');
    this.loop.start();
    document.getElementById('boot')?.classList.add('done');
    setTimeout(() => document.getElementById('boot')?.remove(), 800);
    if (this.debug) this.enableAdminTools();
  }

  frame(dt, t) {
    this.M.update(t);
    this.fsm.update(dt, t);
    this.director?.update(dt);
    this.ui.update(dt);
    this.input.endFrame();
  }

  // --- 설정 적용 --------------------------------------------------------------
  applySettings() {
    const s = this.save.settings;
    this.preset = this.cfg.game.graphicsPresets[s.graphics.preset] || this.preset;
    this.bindings.map = { ...this.bindings.map, ...s.keyBindings };
    const shadows = !!s.graphics.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.session?.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    }
    this.session?.facility?.lighting.setShadows(shadows);
    this.audio?.setVolumes(s.audio);
    this.session?.applySettings(s);
    this.resize();
  }

  get pixelRatio() {
    const s = this.save.settings.graphics;
    return Math.min(window.devicePixelRatio || 1, 1.25) * (s.resolutionScale || 1);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    bus.emit('resize', { w, h });
  }

  // 관리자 계정이면 디버그 패널(FPS·AI 상태·웨이포인트, 무적) 사용 가능
  setAdmin(on) {
    this.isAdmin = on;
    if (on) this.enableAdminTools();
    else if (!this.debug) this.debugPanel?.setAvailable(false);
  }

  enableAdminTools() {
    if (this.debugPanel) { this.debugPanel.setAvailable(true); return; }
    if (this._adminLoaded) return;
    this._adminLoaded = true;
    // 관리자 기능은 필요할 때만 불러온다
    import('../admin/DebugPanel.js').then(({ DebugPanel }) => { this.debugPanel = new DebugPanel(this); })
      .catch((e) => console.warn('[Game] debug panel', e));
  }
}
