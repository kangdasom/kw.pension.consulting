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
- 업로드 금리·제안가능·관리정보 저장은 **기기별 브라우저 한정**이다. 공지는 아래의 GitHub 게시 방식으로 전체 방문자에게 공유한다.
- 기존 로컬 주소의 브라우저 저장값은 GitHub Pages 주소로 자동 이전되지 않는다.
- 로그인·서버 권한 검사는 추가하지 않는다. 직원 전용 인증을 제공하는 배포로 취급하지 않는다.
- 실제 배포 성공은 Actions의 deploy 성공과 실제 URL의 HTTP/화면 확인 후에만 확정한다.

## 공지 작성 → 저장·자동 배포

공지는 `notice.json` 파일로 보관하며, 두 번째 탭의 `공지 저장·배포`가 GitHub Contents API를 통해 main의 이 파일만 수정한다. 기존 main push 워크플로가 검사 후 사이트 전체를 배포한다. 방문자는 배포된 notice.json을 읽으며 브라우저별 이전 공지가 공용 공지를 덮어쓰지 않는다. 작성한 공지와 수정 이력은 공개 저장소에 남는다.

게시 담당자는 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 만료일을 정하고, Resource owner=kangdasom, Only select repositories=kw.pension.consulting, Repository permissions의 Contents=Read and write로 생성한다. 이 권한은 파일 한 개로 제한되지 않고 해당 저장소 내용에 적용되므로 담당자가 보관한다. Actions·Workflows 쓰기 권한은 필요 없다. Branch protection이 직접 수정을 금지하면 정책에 따라 게시가 거절된다.

공식 HTTPS 사이트의 두 번째 탭 → 공지 작성 → 게시 인증 설정에 키 입력 → 공지 저장·배포 순으로 사용한다. 키는 사이트 코드·Git·localStorage·sessionStorage에 저장하지 않고 요청 시작 시 입력창에서도 지운다. GitHub API에 Authorization 헤더로만 보낸다. 이 방식은 GitHub 권한으로 게시를 인증하며 별도의 직원 로그인 기능을 구현한 것은 아니다. 키를 채팅으로 전달하지 않는다.

`GitHub에 저장`은 배포 완료와 다르다. 화면은 최대 약 10분 동안 배포 파일의 revision을 확인하고 실제 게시 내용을 읽었을 때만 완료로 표시한다. 검사 실패·배포 승인 대기·통신 문제는 `배포 내역`에서 확인한다. 확인 시간 내 완료하지 못하면 GitHub 저장은 유지되며 같은 내용으로 재저장하면 중복 커밋 없이 다시 확인한다. 실패한 워크플로는 GitHub에서 재실행한다. 빈 내용 게시도 동일한 배포 과정을 거쳐 공지를 내린다.

기존 브라우저 공지는 `이 브라우저의 이전 공지 불러오기`로 편집기에 가져와 명시적으로 게시한다. 기존 로컬 값을 자동 게시하거나 삭제하지 않는다. 새 접속·공지 팝업 열기·다시 창으로 돌아왔을 때 공지를 새로 읽는다. 이미 열려 있는 화면 전체의 실시간 동기화는 아니다.

동시 수정은 최신 파일 SHA와 읽었던 revision으로 검사한다. 충돌하면 초안을 유지하고 최신 게시본을 확인하도록 안내한다. 저장 요청의 통신이 끊긴 경우 실제 저장 여부가 불명확하므로 최신 게시본·배포 내역을 먼저 확인한다.

검사: `node scripts/check-notice-publish.cjs` (자동 배포 필수), `RATE_STATUS_PLAYWRIGHT`를 지정한 `node scripts/check-notice-ui.cjs` (격리 Edge, API 저장 모사). 실제 키 발급과 사용자의 첫 공지 게시 검증은 별도다.
