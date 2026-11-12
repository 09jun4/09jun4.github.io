// 열린 모서리 검사: node tests/open-edges.cjs [low,high,ultra]
// 플레이어 기체 외형의 불투명 메시를 재질별로 모아, 정점을 위치 양자화(1mm)로 합친 뒤
// "삼각형 하나에만 속한 에지"(열린 경계)를 센다. 허용 목록(의도된 개구) 밖의 열린 에지가 0이어야 통과.
const { startServer, launch, openGame } = require('./lib/harness.cjs');
// 의도된 개구: 기체 좌표(눈 기준 아님, 모델 좌표 m) 상자. 이름은 보고용
const ALLOW = require('./open-edges.allow.json');
(async () => {
  const presets = (process.argv[2] || 'low,high,ultra').split(',');
  const { server, origin } = await startServer();
  const browser = await launch();
  let fail = 0;
  for (const preset of presets) {
    const { page, context, errors } = await openGame(browser, origin, { width: 640, height: 360, settings: { quality: preset } });
    const r = await page.evaluate((allow) => {
      const v = window.__debug.visuals().current;
      const root = v.model.exterior || v.model.group;
      root.updateMatrixWorld(true);
      const inv = root.matrixWorld.clone().invert();
      const Q = 1000; // 1mm
      const out = [];
      const P = new (root.position.constructor)();
      root.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.visible) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.every((m) => m.transparent || m.side === 2 /* DoubleSide: 얇은 판 허용 */)) return;
        let hidden = false; for (let p = o; p && p !== root; p = p.parent) if (!p.visible) hidden = true;
        if (hidden) return;
        const g = o.geometry, pos = g.attributes.position, idx = g.index;
        const m = o.matrixWorld.clone().premultiply(inv);
        const key = new Int32Array(pos.count), ids = new Map(), pts = [];
        for (let i = 0; i < pos.count; i++) { P.fromBufferAttribute(pos, i).applyMatrix4(m); const k = `${Math.round(P.x * Q + 0.137)},${Math.round(P.y * Q + 0.137)},${Math.round(P.z * Q + 0.137)}`; let id = ids.get(k); if (id === undefined) { id = pts.length; ids.set(k, id); pts.push([P.x, P.y, P.z]); } key[i] = id; }
        const edges = new Map();
        const n = idx ? idx.count : pos.count;
        const at = (i) => key[idx ? idx.getX(i) : i];
        for (let t = 0; t < n; t += 3) { const a = at(t), b = at(t + 1), c = at(t + 2); if (a === b || b === c || a === c) continue; for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x < y ? x * 1e7 + y : y * 1e7 + x; edges.set(k, (edges.get(k) || 0) + 1); } }
        let open = 0; const where = {};
        for (const [k, c] of edges) { if (c !== 1) continue; const a = pts[Math.floor(k / 1e7)], b = pts[k % 1e7]; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
          const ok = allow.find((w) => (!w.mesh || w.mesh === (o.name || '')) && mid[0] >= w.min[0] && mid[0] <= w.max[0] && mid[1] >= w.min[1] && mid[1] <= w.max[1] && mid[2] >= w.min[2] && mid[2] <= w.max[2]);
          if (ok) continue; open++;
          const cell = `${Math.round(Math.abs(mid[0]) * 2) / 2},${Math.round(mid[1] * 2) / 2},${Math.round(mid[2])}`; where[cell] = (where[cell] || 0) + 1; }
        if (open) out.push({ name: o.name || o.parent.name || '?', tris: n / 3, open, where: Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 8) });
      });
      return out;
    }, ALLOW);
    const total = r.reduce((a, b) => a + b.open, 0);
    console.log(`${preset}: 허용 밖 열린 에지 ${total}개` + (errors.length ? ` · 콘솔 오류 ${errors.length}` : ''));
    for (const m of r) console.log(`  ${m.name} (${m.tris} tris) open ${m.open}  위치(|x|,y,z): ${m.where.map(([k, c]) => `${k}×${c}`).join('  ')}`);
    if (total || errors.length) fail++;
    await context.close();
  }
  await browser.close(); server.close();
  console.log(fail ? '실패' : '통과');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
