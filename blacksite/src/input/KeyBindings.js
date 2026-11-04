// 키 바인딩: 행동 이름 → KeyboardEvent.code (마우스는 'Mouse0' 좌, 'Mouse2' 우).
// 설정 메뉴에서 재지정하고, 저장 데이터(settings.keyBindings)에 보관해요. ESC(일시정지)는 고정.
export const ACTIONS = [
  { id: 'forward', label: '앞으로', en: 'MOVE FORWARD' },
  { id: 'back', label: '뒤로', en: 'MOVE BACK' },
  { id: 'left', label: '왼쪽', en: 'STRAFE LEFT' },
  { id: 'right', label: '오른쪽', en: 'STRAFE RIGHT' },
  { id: 'fire', label: '사격', en: 'FIRE' },
  { id: 'aim', label: '조준 (유지)', en: 'AIM' },
  { id: 'sprint', label: '달리기', en: 'SPRINT' },
  { id: 'crouch', label: '앉기/일어서기', en: 'CROUCH' },
  { id: 'jump', label: '점프', en: 'JUMP' },
  { id: 'leanLeft', label: '왼쪽 기울이기', en: 'LEAN LEFT' },
  { id: 'leanRight', label: '오른쪽 기울이기', en: 'LEAN RIGHT' },
  { id: 'reload', label: '재장전', en: 'RELOAD' },
  { id: 'interact', label: '상호작용', en: 'INTERACT' },
];

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  fire: 'Mouse0', aim: 'Mouse2', sprint: 'ShiftLeft', crouch: 'ControlLeft',
  jump: 'Space', leanLeft: 'KeyQ', leanRight: 'KeyE', reload: 'KeyR', interact: 'KeyF',
};

const NAMES = {
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'MB4', Mouse4: 'MB5',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', Space: 'SPACE', Tab: 'TAB', CapsLock: 'CAPS',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Enter: 'ENTER',
};
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

export class KeyBindings {
  constructor(saved) { this.map = { ...DEFAULT_BINDINGS, ...(saved || {}) }; }
  get(action) { return this.map[action]; }
  set(action, code) { this.map[action] = code; }
  reset() { this.map = { ...DEFAULT_BINDINGS }; }
  // 같은 키를 쓰는 다른 행동 목록 (중복 경고용)
  conflicts(action, code) {
    return Object.keys(this.map).filter((a) => a !== action && this.map[a] === code);
  }
  duplicates() {
    const seen = {};
    const dup = new Set();
    for (const [a, c] of Object.entries(this.map)) {
      if (seen[c]) { dup.add(a); dup.add(seen[c]); } else seen[c] = a;
    }
    return dup;
  }
  toJSON() { return { ...this.map }; }
}
