# mousekm 배포 체크리스트

정적 사이트(빌드 없음). `mousekm.ws-qf.com`에 배포.

## 1. 방명록(Firebase) 활성화 — 커뮤니티 쓰기에 필요
방명록은 기존 Firebase 프로젝트 `wsqf-44950`을 재사용합니다. 읽기는 바로 되지만, **글쓰기**는 아래 2가지가 되어야 동작합니다. (미완료 시에도 사이트는 정상, 방명록은 "읽기만 가능" 모드)

1. **익명 로그인 켜기**: Firebase 콘솔 → Authentication → Sign-in method → **익명(Anonymous)** 사용 설정.
2. **Firestore 규칙 배포**: `mousekm_wall` 컬렉션 규칙을 이미 `wsqf/wsqf/firestore.rules`에 추가해 두었습니다. wsqf 프로젝트에서 배포하세요.
   ```bash
   cd /Users/j2sign/Coding/wsqf/wsqf
   npx firebase deploy --only firestore:rules
   ```
3. 프로덕션 배포 시 Firebase 콘솔 → Authentication → Settings → **승인된 도메인**에 `mousekm.ws-qf.com` 추가.

## 2. AdSense
- 게시자 ID `ca-pub-8501673409971666` (head에 자동광고 스크립트 삽입 완료).
- `ads.txt` 생성 완료 (루트에 위치해야 함).
- AdSense 콘솔에서 `mousekm.ws-qf.com` 사이트 추가 → 자동 광고 켜기 → 승인 대기.

## 3. SEO
- `sitemap.xml`, `robots.txt` 생성 완료. Google Search Console에 사이트 등록 후 sitemap 제출.
- canonical/OG/JSON-LD(WebApplication + FAQ) 삽입 완료.
- **`og.png` 이미지 필요**: 1200×630 대표 이미지를 루트에 `og.png`로 추가하면 SNS 미리보기가 표시됩니다. (없어도 사이트는 정상)

## 4. Shutress 인라인 임베드 (선택)
Shutress를 mousekm 페이지 안(iframe)에서 열려면 Shutress의 프레이밍 허용이 필요합니다. 이미 `bbusyeo/netlify.toml`을 아래처럼 바꿔 두었습니다(X-Frame-Options 제거 → `Content-Security-Policy: frame-ancestors 'self' https://mousekm.ws-qf.com`). **Shutress를 재배포해야 적용됩니다.**
```bash
cd /Users/j2sign/Coding/bbusyeo
git add netlify.toml && git commit -m "allow framing from mousekm" && git push
```
- 적용 후: **배포된 mousekm.ws-qf.com에서만** Shutress가 인라인으로 열립니다(다른 사이트·localhost는 계속 차단). 재배포 전 또는 로컬(localhost)에서는 8초 후 "새 창에서 열기" 폴백이 뜹니다.
- Mist·Yamy·ws-qf는 헤더가 없어 별도 작업 없이 인라인으로 열립니다.

## 5. 호스팅
기존 서브사이트와 동일하게 Netlify(ws-qf.com 서브도메인) 또는 정적 호스팅에 업로드.

## 로컬 확인
```bash
cd /Users/j2sign/Coding/mousekm
python3 -m http.server 8934   # → http://localhost:8934
```
