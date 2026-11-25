// 핵심 시스템 단위 테스트: 회전 수학, 접기 후 연결·충돌·물체 갱신, 되돌리기, 저장 복구.
import { rotMat, mulMV, rotAbout, apply } from '../js/logic/math.js';
import { parseStage } from '../js/logic/StageLoader.js';
import { Sim } from '../js/logic/Sim.js';
import { computeConnections } from '../js/logic/Connection.js';
import { pathTo } from '../js/logic/Collision.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function unitTests() {
  let fail = 0;
  const check = (name, cond) => { if (!cond) { console.log('✗ unit:', name); fail++; } };

  // 회전: +z 축 90° 는 x→y, 네 번이면 제자리
  check('rot z90', eq(mulMV(rotMat([0, 0, 1], 1), [1, 0, 0]), [0, 1, 0]));
  check('rot x-90', eq(mulMV(rotMat([1, 0, 0], -1), [0, 1, 0]), [0, 0, -1]));
  check('rot 4x', eq(rotMat([0, 1, 0], 4), [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  check('rotAbout', eq(apply(rotAbout([3, 0, 0], [0, 0, 1], -1), [3, 2, 0.5]), [5, 0, 0.5]));

  // 작은 시험 스테이지: 바닥 A, 세워진 날개 W (A 동쪽), 떨어진 바닥 G
  const st = parseStage({
    id: 't', faces: [
      { id: 'A', o: [0, 0, 0], u: '+x', v: '+z', w: 3, h: 3 },
      { id: 'W', o: [3, 0, 1], u: '+y', v: '+z', w: 2, h: 1 },
      { id: 'G', o: [5, 0, 0], u: '+x', v: '+z', w: 2, h: 3 },
    ],
    creases: [{ id: 'c', parent: 'A', child: 'W', a: [3, 0, 1], b: [3, 0, 2] }],
    objects: [{ id: 'e', type: 'exit', at: [6, 0, 1] }, { id: 'b', type: 'block', at: [1, 0, 0] }],
    player: { at: [0, 0, 1] },
  });
  const sim = new Sim(st);
  check('initially no path', !pathTo(sim, sim.state.player, '6,0,1'));
  check('wall blocks edge', sim.res.walls.has('x3,0,1'));
  check('no connection A-G', !computeConnections(sim).some(c => c.a === 'A' && c.b === 'G'));
  const r = sim.fold('c', -1);
  check('fold ok', r.ok);
  check('bridge cells', sim.res.top.get('3,0,1') === 'W' && sim.res.top.get('4,0,1') === 'W');
  check('connection A-W-G', computeConnections(sim).some(c => c.a === 'A' && c.b === 'W') && computeConnections(sim).some(c => c.a === 'G' && c.b === 'W'));
  check('path after fold', !!pathTo(sim, sim.state.player, '6,0,1'));
  // 플레이어가 날개 위에 있으면 접기 거부
  sim.enterNode([3, 0, 1]);
  check('refuse fold under player', !sim.fold('c', 1).ok);
  sim.enterNode([1, 0, 1]);
  // 반대로 180° → A 위에 겹침 (위로 넘어왔으니 위에 쌓임)
  const r2 = sim.fold('c', 2);
  check('fold 180 ok', r2.ok && r2.fx.over);
  check('stacked on top', sim.res.top.get('2,0,1') === 'W' && sim.res.top.get('1,0,1') === 'W');
  // 블록 밀기
  const n = sim.neighbor([1, 0, 1], 3);
  check('push block', n && n.kind === 'push' && !n.ok); // 북쪽은 끝이라 못 밀어요
  // 되돌리기 두 번 → 처음
  sim.undo(); sim.undo();
  check('undo restores', sim.state.angles.c === 0 && sim.res.walls.has('x3,0,1'));
  sim.reset();
  check('reset', sim.state.folds === 0 && eq(sim.state.player, [0, 0, 1]));
  return fail;
}
