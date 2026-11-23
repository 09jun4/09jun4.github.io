// 화면 표시만 담당. 게임 상태를 읽어 DOM을 갱신한다.
const $ = (id) => document.getElementById(id);
const NAMES = ['YOU', 'CPU'];

export class Hud {
  constructor() {
    this.el = { msg: $('msg'), round: $('round'), clock: $('clock'), debug: $('debug') };
    this.bars = [0, 1].map((i) => ({ hp: $('hp' + i), st: $('st' + i), dots: $('dots' + i) }));
    this.lastMsg = '';
  }

  message(text) {
    if (text === this.lastMsg) return;
    this.lastMsg = text;
    this.el.msg.textContent = text;
    this.el.msg.classList.toggle('show', !!text);
  }

  update(sim) {
    const m = sim.match;
    sim.fighters.forEach((f, i) => {
      const b = this.bars[i];
      b.hp.style.width = (f.s.health / f.s.maxHealth) * 100 + '%';
      b.st.style.width = (f.s.stamina / f.s.maxStamina) * 100 + '%';
      b.dots.textContent = Array.from({ length: m.cfg.roundsToWin }, (_, k) => (k < m.wins[i] ? '●' : '○')).join('');
    });
    this.el.round.textContent = 'ROUND ' + m.round;
    this.el.clock.textContent = Math.ceil(m.clock);
    const r = m.result;
    this.message(
      m.phase === 'intro' ? (m.time < m.cfg.introTime - 0.6 ? 'ROUND ' + m.round : 'FIGHT!')
      : m.phase === 'roundEnd' ? (r.reason === 'KO' ? 'K.O.' : 'TIME') + (r.winner === null ? ' · DRAW' : ' · ' + NAMES[r.winner] + ' WIN')
      : m.phase === 'fight' ? sim.fighters.some((f) => f.s.state === 'Knockdown') ? 'DOWN!' : ''
      : '');
    if (this.debugOn) {
      this.el.debug.textContent = sim.fighters.map((f, i) => {
        const s = f.s;
        return `${NAMES[i]}  ${s.state} (${s.stateTime.toFixed(1)}s)\n` +
          `HP ${s.health.toFixed(0)}  ST ${s.stamina.toFixed(0)}  BAL ${s.balance.toFixed(0)}\n` +
          `assist ${s.stability.toFixed(2)}  muscle ${f.body.muscle.toFixed(2)}  tilt ${f.sensors.tilt.toFixed(0)}°\n` +
          `action ${s.action ?? '-'}  pose ${s.posture}  down ${s.knockdowns}\n` +
          `feet ${s.groundContact.feet ? 'on' : 'off'}  body-ground ${s.groundContact.body ? 'yes' : 'no'}\n` +
          `thrown ${s.round.thrown}  landed ${s.round.landed}  dmg ${s.round.damage.toFixed(0)}`;
      }).join('\n\n');
    }
  }

  // 화면 위치(x, y)에 떠올랐다 사라지는 글자
  popup(text, x, y, cls) {
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.append(el);
    el.addEventListener('animationend', () => el.remove());
  }

  setDebug(on) { this.debugOn = on; this.el.debug.hidden = !on; }
}
