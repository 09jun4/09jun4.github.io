// 짧은 알림(화면 아래). 전투 중 알림은 HUD가 맡고, 이건 메뉴·저장·로그인 안내용이다.
let timer = 0;
export function toast(message, ms = 3600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('on'), ms);
}
