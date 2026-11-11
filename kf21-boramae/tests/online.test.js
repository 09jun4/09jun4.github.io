import { describe, it, expect } from 'vitest';
import { checkNickname, defaultNickname, nicknameKey } from '../src/auth/nickname-rules.js';
import { inAppBrowser } from '../src/auth/inapp-browser.js';
import { isAdminUser, sha256Hex } from '../src/auth/admin.js';
import { ADMIN_EMAIL_SHA256 } from '../src/data/online.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('닉네임 규칙', () => {
  it('2~12자, 공백·특수문자·금칙어 거르기', () => {
    expect(checkNickname('보라매조종사')).toMatchObject({ ok: true, name: '보라매조종사' });
    expect(checkNickname('  Ace_01  ')).toMatchObject({ ok: true, name: 'Ace_01', key: 'ace_01' });
    expect(checkNickname('a').ok).toBe(false);
    expect(checkNickname('1234567890123').ok).toBe(false);
    expect(checkNickname('가 나').ok).toBe(false);
    expect(checkNickname('<b>x</b>').ok).toBe(false);
    expect(checkNickname('a/b').ok).toBe(false);
    expect(checkNickname('관리자1').ok).toBe(false);
    expect(checkNickname('ADMIN').ok).toBe(false);
    expect(checkNickname('').ok).toBe(false);
  });
  it('중복 판정 키는 대소문자·전각 문자를 같게 본다', () => {
    expect(nicknameKey('Pilot')).toBe(nicknameKey('pilot'));
    expect(checkNickname('ＡＢＣ').key).toBe('abc');
  });
  it('기본 이름은 계정마다 고정이고 규칙을 통과한다', () => {
    expect(defaultNickname('uid-1')).toBe(defaultNickname('uid-1'));
    expect(defaultNickname('uid-1')).toMatch(/^보라매\d{4}$/);
    expect(checkNickname(defaultNickname('abc')).ok).toBe(true);
  });
});

describe('앱 안 브라우저 감지', () => {
  it('카카오톡·인스타그램은 감지, 일반 크롬은 통과', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KAKAOTALK 10.4.5')).toBe('카카오톡');
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0')).toBe('인스타그램');
    expect(inAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36')).toBe('');
  });
});

describe('관리자', () => {
  it('해시가 맞고 이메일 인증된 계정만 관리자', async () => {
    expect(await isAdminUser({ email: 'someone@example.com', emailVerified: true })).toBe(false);
    expect(await isAdminUser(null)).toBe(false);
    expect((await sha256Hex('a')).length).toBe(64);
    expect(ADMIN_EMAIL_SHA256[0]).toMatch(/^[0-9a-f]{64}$/);
  });
  it('저장소 파일 어디에도 이메일 주소가 없다(해시만)', () => {
    const root = join(__dirname, '..');
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === 'shots' || name === 'vendor') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p); else if (/\.(js|cjs|mjs|html|css|md|rules|json)$/.test(name) && name !== 'package-lock.json') files.push(p);
      }
    };
    walk(root);
    const hits = files.filter((f) => /[a-z0-9._-]+@gmail\.com/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('규칙 파일의 관리자 해시와 코드의 해시가 같다', () => {
    const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');
    expect(rules.includes(ADMIN_EMAIL_SHA256[0])).toBe(true);
  });
});
