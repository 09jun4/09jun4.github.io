// 데이터 로그(스토리): 구역당 1개. F로 열면 전용 터미널 화면(타이핑 효과), 열람 중 게임 일시정지. 진행에는 영향 없음.
import { bus } from '../core/EventBus.js';

export class DataLogs {
  constructor(session, logsCfg) {
    this.s = session;
    this.logs = Object.fromEntries((logsCfg.logs || []).map((l) => [l.id, l]));
    this.readThisRun = new Set();
    this.terminals = session.facility.interactables.filter((i) => i.kind === 'log' && this.logs[i.id]);
    for (const t of this.terminals) if (session.game.save.readLogs.includes(t.id)) this.dim(t);
    session.interaction.add({
      find: (it) => {
        let best = null, bd = this.s.cfg.game.interact.distance;
        for (const t of this.terminals) {
          const d = it.aimDistance(t.box, bd);
          if (d !== null && d < bd) { bd = d; best = t; }
        }
        if (!best) return null;
        const read = this.s.game.save.readLogs.includes(best.id);
        return { priority: 60, label: read ? 'READ LOG (열람함)' : 'READ LOG', action: () => this.open(best) };
      },
    });
  }
  dim(t) {
    const m = t.prop.screenMat;
    if (m) { m.emissive.set(0x1d5a3a); m.emissiveIntensity = 0.6; }
  }
  open(t) {
    const log = this.logs[t.id];
    if (!this.readThisRun.has(t.id)) { this.readThisRun.add(t.id); this.s.stats.logsRead = this.readThisRun.size; }
    const first = this.s.game.save.markLogRead(t.id);
    this.dim(t);
    bus.emit('log:open', { log, first });
    this.s.game.ui.openLog(log, { index: Object.keys(this.logs).indexOf(t.id) + 1, total: Object.keys(this.logs).length });
  }
}
