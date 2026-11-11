// 인스타그램·카카오톡 같은 앱 안 브라우저(웹뷰)에서는 구글이 로그인을 막는다. 감지해서 안내한다.
export function inAppBrowser(ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '') {
  if (!/Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|everytimeApp|DaumApps|wv\)/i.test(ua)) return '';
  if (/KAKAOTALK/i.test(ua)) return '카카오톡';
  if (/Instagram/i.test(ua)) return '인스타그램';
  if (/FBAN|FBAV/i.test(ua)) return '페이스북';
  if (/NAVER/i.test(ua)) return '네이버';
  if (/Line\//i.test(ua)) return '라인';
  return '앱';
}

export const inAppText = (name) => `${name} 안의 브라우저에서는 구글 로그인이 막혀 있어요. 오른쪽 위(또는 아래) 메뉴에서 "다른 브라우저로 열기"를 눌러 크롬이나 사파리에서 열어 주세요.`;
