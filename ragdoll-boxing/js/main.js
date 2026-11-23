import { createSim } from './game/Sim.js';
import { Renderer } from './render/Renderer.js';
import { PlayerController } from './fighter/input.js';
import { AIController } from './fighter/ai.js';
import { Hud } from './ui/hud.js';

const load = (n) => fetch(`config/${n}.json`).then((r) => r.json());
const [physics, fighter, match] = await Promise.all(['physics', 'fighter', 'match'].map(load));
const cfg = { physics, fighter, match };

const sim = await createSim(cfg);
const renderer = new Renderer(document.getElementById('view'), sim, cfg);
const hud = new Hud();
const player = new PlayerController(fighter.stats.comboWindow);
const ai = new AIController(match.ai);
const menu = document.getElementById('menu'), end = document.getElementById('end');
let running = false;
let freeze = 0; // 히트스톱: 강한 타격 순간 물리를 아주 잠깐 멈춘다
const feel = match.feel, flash = document.getElementById('flash');

sim.collisions.onHit = (atk, def, part, res) => {
  const pos = def.body.pos('head');
  pos.y += 0.25;
  const p = renderer.toScreen(pos);
  if (res.blocked) {
    hud.popup('BLOCK!', p.x, p.y, 'block');
    renderer.shake(feel.shakeHit * 0.4);
    return;
  }
  renderer.shake(part.kind === 'head' ? feel.shakeHead : feel.shakeHit);
  freeze = Math.max(freeze, res.heavy ? feel.hitStopHeavy : feel.hitStop);
  if (def.index === 0) { flash.classList.add('on'); requestAnimationFrame(() => flash.classList.remove('on')); }
};
const lastState = ['', ''];

function start() {
  menu.hidden = end.hidden = true;
  sim.match.start();
  running = true;
}
document.getElementById('start').onclick = start;
document.getElementById('again').onclick = start;
addEventListener('keydown', (e) => {
  if (e.code === 'F1' || e.code === 'Backquote') { e.preventDefault(); hud.setDebug(renderer.toggleDebug()); }
  if (e.code === 'Enter' && !running) start();
});
sim.match.onRoundStart(); // 메뉴 뒤 배경으로 선수를 세워 둔다

// 고정 주기 물리 + 화면 주기 렌더링 (서로 독립)
const dt = physics.timeStep;
let acc = 0, aiTime = 0, last = performance.now();
document.getElementById('loading').remove();
requestAnimationFrame(function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (freeze > 0) freeze -= elapsed;
  else { acc += elapsed; aiTime += elapsed; }
  let steps = 0;
  const intents = acc >= dt ? [player.intent(sim.time), ai.intent(sim.fighters[1], sim.fighters[0], aiTime)] : [];
  if (acc >= dt) aiTime = 0;
  if (!running) intents[0] = intents[1] = { fwd: 0, side: 0, guard: false, weave: 0, attack: null };
  while (acc >= dt && steps < physics.maxStepsPerFrame) {
    sim.step(intents);
    intents.forEach((it) => (it.attack = null)); // 공격 입력은 첫 스텝에서만
    acc -= dt;
    steps++;
  }
  if (steps === physics.maxStepsPerFrame) acc = 0; // 너무 느린 PC: 따라잡기 포기 (ponytail: 품질 자동 낮춤으로 대체 가능)
  // ponytail: 렌더 보간 없음. 144Hz 모니터에서 끊겨 보이면 이전/현재 물리 상태 보간 추가
  sim.fighters.forEach((f, i) => {
    if (f.s.state !== lastState[i] && (f.s.state === 'Falling' || f.s.state === 'KO')) renderer.shake(feel.shakeDown);
    lastState[i] = f.s.state;
  });
  renderer.render(elapsed);
  if (running) hud.update(sim);
  if (running && sim.match.phase === 'matchEnd') {
    running = false;
    const w = sim.match.winner;
    document.getElementById('result').textContent = w === null ? 'DRAW' : w === 0 ? 'YOU WIN!' : 'YOU LOSE';
    document.getElementById('score').textContent = `${sim.match.wins[0]} : ${sim.match.wins[1]}`;
    end.hidden = false;
  }
  requestAnimationFrame(frame);
});
