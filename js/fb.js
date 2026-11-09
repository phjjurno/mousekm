// Firebase 공용 초기화 (wsqf-44950 재사용) — 방명록·모두의 여행이 같은 연결을 쓴다.
// 웹 API 키는 공개용 클라이언트 키다(보안 규칙으로 보호). 도메인 허용목록으로도 제한할 것.
const FB_CONFIG = {
  apiKey: 'AIzaSyDeS2DReru5lct240dtQCR3tDGGvSrRRJg',
  authDomain: 'wsqf-44950.firebaseapp.com',
  projectId: 'wsqf-44950',
  storageBucket: 'wsqf-44950.firebasestorage.app',
  messagingSenderId: '1008642348586',
  appId: '1:1008642348586:web:ed068034113a8fa8b35553',
};

// 익명 로그인이 콘솔에서 꺼져 있으면 매번 400 오류가 나므로, 실패하면 하루 동안 재시도하지 않는다
const ANON_OFF_KEY = 'mousekm.fb.anonOffAt';
const DAY_MS = 86_400_000;

let pending = null;

export function getFirebase() {
  if (pending) return pending;
  pending = (async () => {
    if (typeof firebase === 'undefined' || !firebase.firestore) throw new Error('firebase-unavailable');
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    const db = firebase.firestore();

    let uid = null;
    let offAt = 0;
    try { offAt = Number(localStorage.getItem(ANON_OFF_KEY) || 0); } catch { /* noop */ }
    if (Date.now() - offAt > DAY_MS) {
      try {
        const cred = await firebase.auth().signInAnonymously();
        uid = cred.user?.uid || null;
        try { localStorage.removeItem(ANON_OFF_KEY); } catch { /* noop */ }
      } catch {
        try { localStorage.setItem(ANON_OFF_KEY, String(Date.now())); } catch { /* noop */ }
      }
    }
    return { db, uid, FieldValue: firebase.firestore.FieldValue };
  })();
  return pending;
}

// 기기별 익명 식별값 (로그인 없이 "내가 누른 공감" 등을 기억하는 용도, 서버로 보내지 않음)
export function localSet(key) {
  const read = () => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  };
  return {
    has: (v) => read().has(v),
    add: (v) => {
      const s = read(); s.add(v);
      try { localStorage.setItem(key, JSON.stringify([...s].slice(-500))); } catch { /* noop */ }
    },
  };
}
