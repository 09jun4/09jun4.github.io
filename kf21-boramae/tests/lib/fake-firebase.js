// 자동 테스트용 가짜 Firebase SDK(브라우저에 주입). 실제 서버 없이 로그인·계정 저장·닉네임·랭킹 흐름을 확인한다.
// 보안 규칙은 흉내 내지 않는다(규칙은 firestore.rules 를 실제 프로젝트에 게시해야 적용된다).
// 사용: context.addInitScript({ path: 'tests/lib/fake-firebase.js' }) + ?debug=1
(() => {
  const KEY = '__kf21_fake_fs';
  const USER_KEY = '__kf21_fake_user';
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const docs = new Map(Object.entries(read(KEY, {})));
  const persist = () => localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(docs)));
  const fake = window.__KF21_FAKE = { calls: [], failRead: false, failWrite: false, nextUser: { uid: 'user-a', email: 'pilot@example.com', emailVerified: true, displayName: '홍길동' }, docs };
  const listeners = [];
  let current = read(USER_KEY, null);
  const setUser = (u) => { current = u; if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); for (const fn of listeners) fn(u); };
  const denied = () => Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const snap = (path) => ({ exists: () => docs.has(path), data: () => JSON.parse(JSON.stringify(docs.get(path))) });
  const stamp = { __ts: true };
  const clean = (data) => JSON.parse(JSON.stringify(data, (k, v) => (v && v.__ts ? Date.now() : v)));
  const setDoc = async (ref, data, opts) => {
    fake.calls.push(['set', ref.path]);
    if (fake.failWrite) throw denied();
    docs.set(ref.path, opts && opts.merge ? { ...(docs.get(ref.path) || {}), ...clean(data) } : clean(data));
    persist();
  };
  class GoogleAuthProvider { setCustomParameters() {} }
  const lock = (name, value) => Object.defineProperty(window, name, { get: () => value, set: () => {}, configurable: true });
  lock('KF21_FIREBASE_CONFIG', { apiKey: 'fake', authDomain: 'fake.firebaseapp.com', projectId: 'fake', appId: 'fake' });
  window.__KF21_FAKE_SDK = {
    initializeApp: (cfg) => ({ cfg }),
    getAuth: () => ({ fake: true }),
    getFirestore: () => ({ fake: true }),
    GoogleAuthProvider,
    signInWithPopup: async () => { if (fake.popupError) throw Object.assign(new Error('x'), { code: fake.popupError }); setUser(fake.nextUser); return { user: fake.nextUser }; },
    signInWithRedirect: async () => { fake.calls.push(['redirect']); },
    getRedirectResult: async () => null,
    signOut: async () => setUser(null),
    onAuthStateChanged: (auth, fn) => { listeners.push(fn); setTimeout(() => fn(current), 0); },
    doc: (db, ...parts) => ({ path: parts.join('/') }),
    collection: (db, ...parts) => ({ path: parts.join('/'), col: true }),
    getDoc: async (ref) => { fake.calls.push(['get', ref.path]); if (fake.failRead) throw denied(); return snap(ref.path); },
    setDoc,
    deleteDoc: async (ref) => { fake.calls.push(['delete', ref.path]); if (fake.failWrite) throw denied(); docs.delete(ref.path); persist(); },
    query: (col, ...mods) => ({ ...col, mods }),
    orderBy: (field, dir) => ({ orderBy: field, dir }),
    limit: (n) => ({ limit: n }),
    getDocs: async (q) => {
      if (fake.failRead) throw denied();
      let rows = [...docs.entries()].filter(([p]) => p.startsWith(q.path + '/') && !p.slice(q.path.length + 1).includes('/')).map(([, v]) => v);
      for (const m of q.mods || []) {
        if (m.orderBy) rows.sort((a, b) => (m.dir === 'desc' ? b[m.orderBy] - a[m.orderBy] : a[m.orderBy] - b[m.orderBy]));
        if (m.limit) rows = rows.slice(0, m.limit);
      }
      return { forEach: (fn) => rows.forEach((r) => fn({ data: () => JSON.parse(JSON.stringify(r)) })) };
    },
    serverTimestamp: () => stamp,
    runTransaction: async (db, fn) => {
      if (fake.failWrite) throw denied();
      const ops = [];
      await fn({ get: async (ref) => snap(ref.path), set: (ref, data, opts) => ops.push(() => setDoc(ref, data, opts)), delete: (ref) => ops.push(async () => { docs.delete(ref.path); persist(); }) });
      for (const op of ops) await op();
    },
  };
})();
