// Minimap — 진행 방향이 위쪽인 회전 미니맵 (캔버스).
// 표시: 도로, 남은 코스(밝은 선)/지나온 코스(흐린 선), 주요 교차로, 집, 선호 위치·방향, 주변 이벤트.
// 3D 좌표(x, z)를 그대로 써서 화면 위치와 정확히 맞아요. 맵에 실제 지도 이미지가 있으면 배경으로 깔아요.
export class Minimap {
  constructor(slot, size = 196) {
    this.size = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size * dpr;
    this.canvas.style.width = this.canvas.style.height = size + 'px';
    this.canvas.className = 'minimap';
    this.dpr = dpr;
    this.ctx = this.canvas.getContext('2d');
    slot.appendChild(this.canvas);
    this.scale = 0.78; // px per m
  }

  setWorld(world, route) {
    this.world = world;
    this.route = route;
    this.map = world.map;
  }

  draw(player, events) {
    if (!this.world) return;
    const g = this.ctx, S = this.size, d = this.dpr, sc = this.scale;
    const P = player.physics;
    const h = player.bike.root.rotation.y;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(20,28,24,0.82)'; g.fillRect(0, 0, S, S);
    // 월드 → 미니맵: 진행 방향이 위쪽. 화면 오른쪽 = 진행 방향의 오른쪽
    g.translate(S / 2, S / 2 + 22);
    // 진행 방향 f=(sin h, cos h) → 화면 위, 오른쪽 r=(-cos h, sin h) → 화면 오른쪽
    const ca = Math.cos(h), sa = Math.sin(h);
    const A = -sc * ca, B = -sc * sa, C = sc * sa, Dm = -sc * ca;
    g.transform(A, B, C, Dm, -(A * P.x + C * P.z), -(B * P.x + Dm * P.z));
    const m = this.map;
    if (m._image && m.imageBounds) {
      const b = m.imageBounds;
      g.globalAlpha = 0.55;
      g.drawImage(m._image, b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      g.globalAlpha = 1;
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 도로
    for (const r of this.world.roads.roads) {
      g.strokeStyle = 'rgba(160,166,175,0.55)';
      g.lineWidth = (r.halfW + r.sidewalk) * 2;
      g.beginPath();
      r.samples.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.stroke();
      g.strokeStyle = 'rgba(70,74,82,0.95)';
      g.lineWidth = r.halfW * 2;
      g.stroke();
    }
    // 코스
    const R = this.route, ps = R.project(P.x, P.z, R._last).s;
    const pts = R.points;
    g.lineWidth = 3.2 / sc;
    g.strokeStyle = 'rgba(105,219,124,0.35)';
    g.beginPath();
    let started = false;
    for (const p of pts) { if (p.s > ps) break; if (!started) { g.moveTo(p.x, p.z); started = true; } else g.lineTo(p.x, p.z); }
    g.stroke();
    g.strokeStyle = '#8ce99a';
    g.lineWidth = 4.2 / sc;
    g.setLineDash([9 / sc, 5 / sc]);
    g.beginPath();
    started = false;
    for (const p of pts) { if (p.s < ps) continue; if (!started) { g.moveTo(p.x, p.z); started = true; } else g.lineTo(p.x, p.z); }
    g.stroke();
    g.setLineDash([]);
    // 교차로
    for (const t of R.turns) {
      g.fillStyle = t.s > ps ? '#ffe066' : 'rgba(255,224,102,0.35)';
      g.beginPath(); g.arc(t.isect.x, t.isect.z, 3.6 / sc, 0, Math.PI * 2); g.fill();
    }
    for (const f of this.world.roads.intersections) {
      if (R.turns.some((t) => t.isect === f)) continue;
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.arc(f.x, f.z, 2.4 / sc, 0, Math.PI * 2); g.fill();
    }
    // 이벤트 (자동차·행인 등 움직이는 것만 작게)
    if (events) for (const e of events.active) for (const c of e.colliders) {
      if (!c.active || !['car', 'person', 'cat', 'dog'].includes(c.tag)) continue;
      g.fillStyle = c.tag === 'car' ? '#ff6b6b' : '#ffd8a8';
      g.beginPath(); g.arc(c.x, c.z, (c.tag === 'car' ? 2.6 : 1.8) / sc, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // 집 (회전과 무관하게 아이콘은 똑바로)
    const home = this.world.env.landmarks.home;
    if (home) {
      const [hx, hy] = this.toScreen(home.x, home.z, P, h);
      const R2 = S / 2 - 12, cx = S / 2, cy = S / 2;
      let x = hx, y = hy, edge = false;
      const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy);
      if (dist > R2) { x = cx + (dx / dist) * R2; y = cy + (dy / dist) * R2; edge = true; }
      this._house(g, x, y, edge);
    }
    // 선호
    const cx = S / 2, cy = S / 2 + 22;
    g.fillStyle = '#ffd43b'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy + 7); g.lineTo(cx, cy + 3); g.lineTo(cx - 7, cy + 7); g.closePath();
    g.fill(); g.stroke();
    // 테두리 + 북쪽 표시
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
    const [nx, ny] = this.toScreen(P.x, P.z - 1000, P, h);
    const na = Math.atan2(ny - cy, nx - cx);
    g.fillStyle = '#ff8787'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', S / 2 + Math.cos(na) * (S / 2 - 10), S / 2 + Math.sin(na) * (S / 2 - 10));
  }

  // 월드 좌표 → 미니맵 화면 좌표 (draw의 변환과 같은 식)
  toScreen(x, z, P, h) {
    const S = this.size, sc = this.scale;
    const dx = x - P.x, dz = z - P.z;
    const rx = -Math.cos(h) * dx + Math.sin(h) * dz, ry = -Math.sin(h) * dx - Math.cos(h) * dz;
    return [S / 2 + rx * sc, S / 2 + 22 + ry * sc];
  }

  _house(g, x, y, edge) {
    g.save();
    g.translate(x, y);
    g.fillStyle = edge ? 'rgba(64,192,87,0.85)' : '#40c057';
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(8, -2); g.lineTo(6, -2); g.lineTo(6, 7); g.lineTo(-6, 7); g.lineTo(-6, -2); g.lineTo(-8, -2); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
}
