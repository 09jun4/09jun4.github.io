// 온라인 기능 묶음(로그인·계정 저장·랭킹). 마일스톤 10에서 채운다. 지금은 오프라인 동작만.
export function createOnline({ toast }) {
  return {
    mount() {},
    openRanking() { toast('랭킹은 온라인 기능이 연결되면 볼 수 있어요.'); },
    submitResult() {},
    closeTop() { return false; },
  };
}
