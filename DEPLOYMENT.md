# GitHub Pages 배포

대상 저장소: https://github.com/kangdasom/kw.pension.consulting

예상 주소: https://kangdasom.github.io/kw.pension.consulting/

2026-11-11 준비 중 동일 저장소(ID 1317770573)의 이름이 `AI-`에서 `kw.pension.consulting`으로 변경된 것을 확인했다. 기존 `/AI-/` 주소의 리디렉션은 보장하지 않으므로 현재 이름의 주소를 공유한다.

현재 앱은 빌드 없는 HTML/CSS/JavaScript다. 화면·데이터·스타일을 변환하지 않고 실행에 필요한 파일만 `.pages-dist`로 복사해 배포한다. HTML/CSS의 상대경로를 유지하므로 `/AI-/`에서 동작하며 React/Vite 설정은 필요하지 않다. 화면 전환은 한 HTML 안의 탭·팝업 방식이라 SPA fallback도 필요하지 않다.

## GitHub에서 처음 한 번 설정

1. 저장소 Settings → Pages를 연다.
2. Build and deployment → Source를 **GitHub Actions**로 선택한다.
3. Pages 사용이 요금제 때문에 제한되면, 비공개 저장소를 지원하는 GitHub 요금제를 사용하거나 공개 범위를 검토한 뒤 사용자가 직접 저장소를 Public으로 변경한다. 비공개 저장소라고 배포 페이지까지 비공개인 것은 아니다.
4. Settings → Actions → General에서 Actions가 허용되어 있는지 확인한다. 워크플로에는 필요한 최소 권한이 지정되어 있으며 개인 액세스 토큰이나 별도 Secrets 등록은 필요 없다.
5. Actions → Deploy GitHub Pages → Run workflow → main → Run workflow로 최초 배포 또는 실패한 배포를 재실행한다.
6. build와 deploy의 성공을 확인하고 위 주소로 접속한다. Environment 승인 요청이 있으면 배포를 승인한다.
7. Pages의 Enforce HTTPS가 제공되면 활성화한다.

그 이후 `main` 브랜치에 push할 때마다 검사 → 정적 파일 패키징 → 배포가 실행된다. 다른 브랜치의 push는 운영 페이지에 배포하지 않는다. 실패한 검사는 배포를 중단하며 이전 배포를 유지한다.

## 로컬 작업과 검증

`node scripts/prepare-pages.cjs --list`로 배포 파일과 경로 검증을 확인한다. `.pages-dist`는 생성 결과이며 Git에 올리지 않는다. 원본 웹 파일을 수정하고 변경 내역을 확인한 뒤 `git add`, `git commit`, `git push origin main`을 수행한다. `.gitignore`가 엑셀·내부 문서·QA 산출물·환경변수·키 파일을 제외한다. 새 실행 파일을 추가할 때는 상대경로로 참조하고 패키징 결과를 확인한다.

자동 검사는 알려진 인증키 형태와 비밀번호 등 하드코딩 패턴을 검사하며 완전한 보안 감사를 대신하지 않는다. 브라우저에 전달되는 JavaScript에는 비밀을 넣을 수 없다. 향후 서버 자격증명은 서버 측에서만 사용한다.

## 이번 배포의 기능 범위

- 기존 금리·초기 관리설정·화면과 기능을 그대로 배포한다. 이 데이터와 화면은 사이트 방문자가 열람할 수 있다.
- 원본 엑셀·PROJECT_BRIEF/CONTEXT·AGENTS·outputs·과거 대기 금리 파일·브라우저 localStorage는 업로드하지 않는다. 테스트와 fixture는 Git 저장소에만 포함하며 Pages 산출물에는 포함하지 않는다.
- 업로드 금리·제안가능·공지·관리정보 저장은 기존처럼 **기기별 브라우저 한정**이다. 담당자의 수정이 다른 직원에게 자동 공유되지 않는다.
- 기존 로컬 주소의 브라우저 저장값은 GitHub Pages 주소로 자동 이전되지 않는다.
- 로그인·서버 권한 검사는 추가하지 않는다. 직원 전용 인증을 제공하는 배포로 취급하지 않는다.
- 실제 배포 성공은 Actions의 deploy 성공과 실제 URL의 HTTP/화면 확인 후에만 확정한다.
