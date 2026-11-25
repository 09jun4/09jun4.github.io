import { parseKey } from '../js/logic/math.js';
// 위에서 내려다본 층별 지도: # 바닥  P 플레이어  B 블록  S 스위치  D 문  K 열쇠  M 거울  L 광원  R 수신기  E 출구  ^ 계단
export function ascii(sim) {
  const levels = new Map();
  for (const k of sim.res.top.keys()) { const [x, y, z] = parseKey(k); if (!levels.has(y)) levels.set(y, []); levels.get(y).push([x, z]); }
  const sym = { block: 'B', switch: 'S', door: 'D', key: 'K', mirror: 'M', source: 'L', receptor: 'R', exit: 'E', stairs: '^' };
  const out = [];
  for (const y of [...levels.keys()].sort((a, b) => b - a)) {
    const pts = levels.get(y), xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    out.push(`level ${y}  (x ${x0}..${x1}, z ${z0}..${z1})`);
    for (let z = z0; z <= z1; z++) {
      let row = '';
      for (let x = x0; x <= x1; x++) {
        const k = x + ',' + y + ',' + z;
        let c = sim.res.top.has(k) ? '#' : ' ';
        const o = sim.objs.find(i => i.upright && i.cubeKey === k);
        if (o) c = sym[o.o.type].toLowerCase() === sym[o.o.type] ? sym[o.o.type] : (o.functional ? sym[o.o.type] : sym[o.o.type].toLowerCase());
        if (sim.state.player.join(',') === k) c = 'P';
        row += c;
      }
      out.push('  ' + row);
    }
  }
  return out.join('\n');
}

