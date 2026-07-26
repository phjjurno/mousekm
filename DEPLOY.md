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

## 5. 크롬 확장프로그램 (extension/)
크롬 안 모든 탭에서 측정하는 MV3 확장. mousekm 사이트 방문 시 확장 기록이 여행 지도에 자동 합산됩니다(브리지). 사이트 자체는 확장이 측정하지 않아 이중 합산 없음.

**개발자 모드 설치(지금 바로 사용):**
1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드** → `/Users/j2sign/Coding/mousekm/extension` 폴더 선택
4. 툴바의 mousekm 아이콘 클릭 → 오늘 기록·여행 확인, 일시정지/재개

**웹스토어 등록(선택):** [Chrome Web Store 개발자 콘솔](https://chrome.google.com/webstore/devconsole)에서 1회 등록비 $5 결제 후 extension 폴더를 zip으로 업로드 → 심사(수일). 등록되면 사이트의 "Chrome에 추가" 버튼을 실제 스토어 링크로 교체.

**참고:** 확장은 크롬 내부만 측정합니다. 크롬 밖(Word·카카오톡 등 OS 전체)은 데스크톱 앱(3차 계획)이 필요합니다. 팝업의 거리 환산은 24인치 기본 가정이며, 정밀 환산은 사이트의 모니터 설정을 따릅니다.

## 6. 호스팅
기존 서브사이트와 동일하게 Netlify(ws-qf.com 서브도메인) 또는 정적 호스팅에 업로드.

## 로컬 확인
```bash
cd /Users/j2sign/Coding/mousekm
python3 -m http.server 8934   # → http://localhost:8934
```
