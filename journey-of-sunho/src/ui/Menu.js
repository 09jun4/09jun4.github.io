// Menu — 시작 화면 / 챕터 선택 / 조작법 / 챕터 브리핑(무작위 난이도·예보) / 일시정지 / 계정(구글 로그인·닉네임)
import { WEATHER_ICON } from './HUD.js';
import { inAppBrowser } from '../systems/Cloud.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WNAME = { rain: '비', snow: '눈', wind: '강풍', fog: '안개', clear: '맑음' };

export class Menu {
  constructor(root, game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'menu';
    root.appendChild(this.root);
    this.screen = null;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this._act(b.dataset.act, b.dataset);
    });
    const inApp = inAppBrowser();
    if (inApp) {
      const n = document.createElement('div');
      n.className = 'inapp';
      n.innerHTML = `${inApp} 안에서 열었어요. 구글 로그인을 하려면 메뉴에서 <b>"다른 브라우저로 열기"</b>를 눌러 크롬·사파리로 열어 주세요. (로그인 없이도 플레이할 수 있어요)<button>닫기</button>`;
      n.querySelector('button').onclick = () => n.remove();
      root.appendChild(n);
    }
  }

  _act(act, d) {
    const g = this.game;
    switch (act) {
      case 'continue': g.startChapter(g.nextChapterId()); break;
      case 'chapters': this.showChapters(); break;
      case 'howto': this.showHowto(); break;
      case 'title': g.toTitle(); break;
      case 'play': g.startChapter(d.id); break;
      case 'go': this._onStart && this._onStart(); break;
      case 'reroll': g.startChapter(this._briefCh.id); break;
      case 'resume': g.resume(); break;
      case 'restart': g.restartChapter(); break;
      case 'login': g.cloud.signIn(); break;
      case 'logout': g.cloud.signOut(); break;
      case 'nick': {
        const v = this.root.querySelector('.nick-input')?.value;
        g.cloud.setNickname(v).then(() => this.renderAccount(), () => { const m = this.root.querySelector('.nick-msg'); if (m) m.textContent = '2~12자, 특수문자 < > " \' ` \\ 는 쓸 수 없어요.'; });
        break;
      }
      case 'ranking': this.showRanking(d.id); break;
      case 'back': if (g.state === 'paused') this.showPause(); else this.showTitle(); break;
    }
  }

  _set(html, cls) {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.root.classList.add('on');
    this.screen = cls;
  }
  hide() { this.root.classList.remove('on'); this.root.innerHTML = ''; this.screen = null; }

  _accountHtml() {
    const c = this.game.cloud, s = this.game.save;
    if (!c.enabled) return `<div class="account"><span class="muted">브라우저에 저장 중 · 온라인 기능 준비 중</span></div>`;
    if (c.state === 'out') return `<div class="account"><button class="btn small" data-act="login">구글 로그인</button><span class="muted">로그인하면 진행이 계정에 저장되고 랭킹에 올라가요</span>${c.error ? `<div class="err">${esc(c.error)}</div>` : ''}</div>`;
    if (c.state === 'pending') return `<div class="account"><span class="muted">계정 불러오는 중…</span></div>`;
    return `<div class="account in">
      <span><b>${esc(c.displayName())}</b>${c.isAdmin ? ' <em class="admin">관리자</em>' : ''} · <span class="muted">${s.status === 'synced' ? '계정에 저장됨' : s.status === 'error' ? '저장 오류' : '저장 중…'}</span></span>
      <span class="nick"><input class="nick-input" maxlength="12" placeholder="랭킹 닉네임 (2~12자)" value="${esc(c.nickname)}"><button class="btn small" data-act="nick">저장</button></span>
      <button class="btn small ghost" data-act="logout">로그아웃</button>
      <div class="nick-msg muted"></div>${c.error ? `<div class="err">${esc(c.error)}</div>` : ''}</div>`;
  }
  renderAccount() {
    const a = this.root.querySelector('.account');
    if (a) a.outerHTML = this._accountHtml();
  }

  showTitle() {
    const g = this.game;
    const next = g.chapters.get(g.nextChapterId());
    const any = g.save.data.totals.plays > 0;
    this._set(`
      <div class="title-wrap">
        <div class="logo"><small>The Journey of Sunho</small><h1>선호의 여정</h1><p>학원 끝! 오늘도 자전거로 무사히 집까지.</p></div>
        <div class="menu-buttons">
          <button class="btn primary" data-act="continue">${any ? '이어하기' : '시작하기'} <small>${esc(next ? `CH.${next.no} ${next.title}` : '')}</small></button>
          <button class="btn" data-act="chapters">챕터 선택</button>
          <button class="btn" data-act="howto">조작법 · 게임 방법</button>
        </div>
        ${this._accountHtml()}
        <div class="foot"><a href="/feedback/?work=/journey-of-sunho/" target="_blank" rel="noopener">의견 남기기</a> · <a href="/">작품 목록</a></div>
      </div>`, 'title');
  }

  showChapters() {
    const g = this.game, save = g.save.data;
    const unlockedAll = g.cloud.isAdmin;
    const cards = g.chapters.list.map((c) => {
      const rec = save.chapters[c.id];
      const locked = !unlockedAll && c.no > save.unlocked;
      return `<div class="ch-card ${locked ? 'locked' : ''}">
        <div class="ch-no">CHAPTER ${c.no}</div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.summary)}</p>
        <div class="ch-meta">${rec ? `최고 <b>${rec.best}</b>점 · 등급 <b class="grade g-${rec.grade}">${rec.grade}</b>` : locked ? '이전 챕터를 마치면 열려요' : '아직 기록 없음'}</div>
        <div class="ch-actions">
          <button class="btn small ${locked ? 'disabled' : 'primary'}" ${locked ? 'disabled' : ''} data-act="play" data-id="${c.id}">플레이</button>
          ${g.cloud.enabled ? `<button class="btn small ghost" data-act="ranking" data-id="${c.id}">랭킹</button>` : ''}
        </div>
      </div>`;
    }).join('');
    this._set(`<h2>챕터 선택</h2><div class="ch-grid">${cards}</div><button class="btn ghost" data-act="back">뒤로</button>`, 'chapters');
  }

  showHowto() {
    this._set(`<h2>조작법 · 게임 방법</h2>
      <div class="howto">
        <div class="keys">
          <div><kbd>↑</kbd> 페달 밟기 (가속)</div><div><kbd>↓</kbd> 감속</div>
          <div><kbd>←</kbd><kbd>→</kbd> 조향</div><div><kbd>Space</kbd> 브레이크</div>
          <div><kbd>Esc</kbd> 일시정지</div><div><kbd>Enter</kbd> 연출 건너뛰기</div>
        </div>
        <ul>
          <li><b>체온</b> — 비·눈·바람·젖은 옷에 떨어지고, 페달을 밟으면 올라가요. 너무 낮으면 힘이 빠지고 <b>감기</b>에 걸려요.</li>
          <li><b>피로도</b> — 페달을 세게, 특히 오르막에서 쌓여요. 내리막·정지 때 회복돼요.</li>
          <li><b>균형</b> — 급조향·미끄러운 길·급브레이크·연석·옆바람·충돌로 줄어요. 0이 되면 넘어져요.</li>
          <li><b>청결도</b> — 새똥, 물웅덩이, 빗길 물 튀김(흙받이 없음!)으로 더러워져요.</li>
          <li>빗길·눈길은 미끄러워서 제동 거리가 길어지고 급하게 꺾으면 미끄러져요. 비가 그쳐도 길은 천천히 말라요.</li>
          <li>새 그림자(동그란 표시)가 보이면 속도를 바꿔 피하세요. 길 위의 핫초코·붕어빵은 몸을 녹여줘요.</li>
          <li>날씨·이벤트·난이도는 매번 무작위예요. 집(초록 빛기둥)에 도착하면 종합 평가!</li>
        </ul>
      </div>
      <button class="btn ghost" data-act="back">뒤로</button>`, 'howto');
  }

  showBriefing(ch, roll, onStart) {
    this._onStart = onStart;
    this._briefCh = ch;
    const stars = '★★★★★'.slice(0, roll.stars) + '☆☆☆☆☆'.slice(0, 5 - roll.stars);
    const fc = roll.forecast.slice(0, 3).map((f) => `<span class="fc">${WEATHER_ICON[f.t]}<b>${WNAME[f.t]}</b> ${Math.round(f.p * 100)}%</span>`).join('');
    this._set(`
      <div class="brief">
        <div class="ch-no">CHAPTER ${ch.no}</div>
        <h2>${esc(ch.title)}</h2>
        <p class="sum">${esc(ch.summary)}</p>
        <div class="brief-grid">
          <div><label>오늘의 난이도</label><div class="stars">${stars}</div></div>
          <div><label>출발 기온</label><div class="big">${roll.baseTemp.toFixed(1)}°C</div></div>
          <div><label>돌발 상황</label><div class="big">${roll.eventRate > 1.15 ? '많음' : roll.eventRate < 0.85 ? '적음' : '보통'}</div></div>
          <div><label>악천후</label><div class="big">${roll.longChance > 0.42 ? '오래 감' : '금방 바뀜'}</div></div>
        </div>
        <div class="forecast"><label>날씨 예보</label>${fc}</div>
        <div class="menu-buttons row">
          <button class="btn primary" data-act="go">출발!</button>
          <button class="btn ghost" data-act="reroll">조건 다시 뽑기</button>
          <button class="btn ghost" data-act="title">타이틀로</button>
        </div>
      </div>`, 'briefing');
  }

  showPause() {
    this._set(`<div class="pause"><h2>일시정지</h2>
      <div class="menu-buttons">
        <button class="btn primary" data-act="resume">계속하기</button>
        <button class="btn" data-act="restart">챕터 다시 시작</button>
        <button class="btn" data-act="howto">조작법</button>
        <button class="btn ghost" data-act="title">타이틀로</button>
      </div></div>`, 'pause');
  }

  showRanking(chId) {
    const g = this.game, ch = g.chapters.get(chId);
    this._set(`<h2>랭킹 · CH.${ch.no} ${esc(ch.title)}</h2><div class="rank-box">불러오는 중…</div><button class="btn ghost" data-act="chapters">뒤로</button>`, 'ranking');
    g.cloud.ranking(chId, true).then((r) => {
      const box = this.root.querySelector('.rank-box');
      if (!box) return;
      box.innerHTML = rankTable(r, g.cloud);
    }, () => { const box = this.root.querySelector('.rank-box'); if (box) box.textContent = '랭킹을 불러오지 못했어요.'; });
  }
}

export function rankTable(r, cloud) {
  if (!r || !r.top.length) return '<p class="muted">아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!</p>';
  const me = cloud.user?.uid;
  return `<table class="rank"><thead><tr><th>#</th><th>닉네임</th><th>점수</th><th>등급</th><th>시간</th></tr></thead><tbody>${
    r.top.map((x, i) => `<tr class="${x.uid === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.name)}</td><td>${x.score}</td><td>${esc(x.grade)}</td><td>${fmtTime(x.time)}</td></tr>`).join('')
  }</tbody></table>${r.me ? `<p class="muted">내 순위: ${r.me.rank}위 (${r.me.score}점)</p>` : ''}`;
}
export function fmtTime(t) { t = Number(t) || 0; return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }
