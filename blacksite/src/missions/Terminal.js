// 데이터 터미널 화면 (캔버스 텍스처): 대기 → 다운로드 진행 → 완료.
export class TerminalScreen {
  constructor(screen) {
    this.s = screen; // { canvas, ctx, tex, led }
    this.mode = '';
    this.p = -1;
    this.t = 0;
    this.draw('idle', 0);
  }
  draw(mode, p) {
    const pp = Math.floor(p * 50);
    const blink = Math.floor(this.t * 2) % 2;
    const key = mode + pp + (mode === 'idle' ? blink : '');
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas, tex } = this.s;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#03080d'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,160,255,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.fillStyle = '#5fb0ff'; ctx.font = '700 18px "Share Tech Mono", monospace';
    ctx.fillText('NODE-03 // MAIN', 16, 30);
    ctx.fillStyle = '#7d93a8'; ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillText('K-7 RESEARCH ARCHIVE', 16, 50);
    if (mode === 'idle') {
      ctx.fillStyle = '#ffb347'; ctx.font = '700 16px "Share Tech Mono", monospace';
      ctx.fillText('PROTECTED DATA FOUND', 16, 88);
      if (blink) { ctx.fillStyle = '#e8f2ff'; ctx.fillText('> AWAITING TRANSFER_', 16, 116); }
    } else if (mode === 'download') {
      ctx.fillStyle = '#e8f2ff'; ctx.font = '700 16px "Share Tech Mono", monospace';
      ctx.fillText('TRANSFERRING...', 16, 88);
      ctx.strokeStyle = '#5fb0ff'; ctx.strokeRect(16, 104, W - 32, 18);
      ctx.fillStyle = '#5fb0ff'; ctx.fillRect(19, 107, (W - 38) * p, 12);
      ctx.fillStyle = '#7d93a8'; ctx.font = '13px "Share Tech Mono", monospace';
      ctx.fillText(Math.floor(p * 100) + '%  ' + (p * 4.7).toFixed(2) + ' / 4.70 GB', 16, 144);
    } else {
      ctx.fillStyle = '#4dff9a'; ctx.font = '700 18px "Share Tech Mono", monospace';
      ctx.fillText('TRANSFER COMPLETE', 16, 92);
      ctx.fillStyle = '#7d93a8'; ctx.font = '13px "Share Tech Mono", monospace';
      ctx.fillText('ACCESS LOGGED // 04:02:45', 16, 118);
    }
    tex.needsUpdate = true;
  }
  update(dt, mode, p) { this.t += dt; this.draw(mode, p); }
}
