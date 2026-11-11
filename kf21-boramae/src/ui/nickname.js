// 닉네임 설정 창: 첫 로그인 때 자동으로 뜨고, 메뉴에서 다시 바꿀 수 있다. 랭킹에는 실명 대신 이 이름이 나온다.
import { el, esc } from './dom.js';
import { checkNickname } from '../auth/nickname-rules.js';
import { NICKNAME } from '../data/online.js';

/** @param {{submit:(name:string)=>Promise<void>}} actions */
export function createNicknameDialog(actions) {
  const root = el(`
    <div class="modal nick" hidden>
      <form class="panel dialog" role="dialog" aria-modal="true" aria-labelledby="nick-title">
        <h2 id="nick-title">닉네임 정하기</h2>
        <p class="hint" data-lead></p>
        <div class="field">
          <label for="nick-input">닉네임 <output>${NICKNAME.min}~${NICKNAME.max}자</output></label>
          <input id="nick-input" type="text" maxlength="${NICKNAME.max}" autocomplete="off" spellcheck="false" placeholder="예: 보라매조종사">
          <p class="form-error" role="alert"></p>
        </div>
        <div class="card-actions">
          <button class="btn primary" type="submit">저장</button>
          <button class="btn ghost" type="button" data-act="later"></button>
        </div>
      </form>
    </div>`);
  const input = root.querySelector('input');
  const error = root.querySelector('.form-error');
  const submit = root.querySelector('[type="submit"]');
  const later = root.querySelector('[data-act="later"]');
  const close = () => { root.hidden = true; };
  later.addEventListener('click', close);
  root.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = checkNickname(input.value);
    if (!c.ok) { error.textContent = c.reason; return; }
    submit.disabled = true;
    error.textContent = '';
    try {
      await actions.submit(c.name);
      close();
    } catch (err) {
      error.textContent = (err && (err.code === 'taken' || err.code === 'invalid') && err.message) || '저장하지 못했어요. 잠시 뒤에 다시 해 주세요.';
    } finally {
      submit.disabled = false;
    }
  });
  return {
    el: root,
    /** @param {{current:string, fallback:string, first:boolean}} o */
    open(o) {
      root.querySelector('[data-lead]').innerHTML = o.first
        ? `랭킹에는 구글 계정 이름 대신 직접 정한 닉네임이 표시돼요. 지금 정하지 않으면 <b>${esc(o.fallback)}</b>(으)로 표시돼요.`
        : '랭킹에 표시되는 이름이에요. 한글, 영문, 숫자, _ , - 를 쓸 수 있어요.';
      later.textContent = o.first ? '나중에' : '취소';
      input.value = o.current || '';
      error.textContent = '';
      root.hidden = false;
      input.focus();
    },
    close,
    get isOpen() { return !root.hidden; },
  };
}
