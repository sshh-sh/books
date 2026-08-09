# 읽어용 — 개발 저장 상태 (다른 컴퓨터에서 이어하기용)

용인시 도서관 연동 독서 기록 앱. **현재 버전: 화면 v1 / 백엔드 v1** (2026-08-09 기준)

> 버전 번호를 v19.12까지 올렸다가 이 시점에 **v1으로 리셋**했습니다.
> 아래 "버전 규칙"을 반드시 지켜주세요.

## 구성
- **화면(프론트엔드)**: `index.html` — GitHub Pages로 서빙됨
  - 배포 주소: https://sshh-sh.github.io/books/
  - push하면 1분 내 자동 재배포 (가끔 CDN 캐시로 더 걸림 → `?nocache=아무값` 붙여 확인)
- **백엔드**: Google Apps Script
  - Apps Script 편집기: https://script.google.com/home/projects/1hB5PE429dgubPXgpwKZTPRF2rvhmDkPfmfqh3CyH6hBsjLcHQ51jmJ8D/edit
  - 배포된 웹앱(API) 주소: `index.html`의 `API_BASE` 상수 참고
  - `backend/Code.js`, `backend/appsscript.json`은 **백업 사본**
- **데이터**: Google Sheets
  - https://docs.google.com/spreadsheets/d/1Ps-E0q3zoxYMkK8S3nfW4_41oWo7z7Ew3uPtFjCuI3c/edit
  - 탭: `Books`, `BookLibraries`, `UserBooks`, `LibraryBranches`

## API 키 (이 저장소엔 없음)
Apps Script 편집기 → 프로젝트 설정(⚙️) → 스크립트 속성에 저장됨
- `ALADIN_KEY` — 알라딘 Open API 키
- `LIBRARY_KEY` — 정보나루(data4library.kr) 인증키

---

## 다른 컴퓨터에서 개발 이어하기

```bash
git clone https://github.com/sshh-sh/books.git
```

- **화면 수정**: `index.html` 편집 → commit/push (GitHub Pages 자동 재배포)
- **백엔드 수정**: 아래 두 방법 중 하나
  - **(A) 브라우저** — 위 Apps Script 편집기 링크에서 직접 수정. 로그인만 하면 컴퓨터 무관. **가장 간단함.**
  - **(B) clasp CLI** — 아래 참고

### clasp 사용법 (현재 3.3.0 기준, 2.x와 명령어가 다름)
```bash
npm install -g @google/clasp
clasp login
```
`.clasp.json`을 만들고 `rootDir`을 `Code.js`가 있는 폴더로 지정합니다.
```json
{ "scriptId": "1hB5PE429dgubPXgpwKZTPRF2rvhmDkPfmfqh3CyH6hBsjLcHQ51jmJ8D",
  "rootDir": "Code.js가 있는 폴더의 절대경로" }
```
`.claspignore`로 다른 파일이 딸려 올라가지 않게 막아둡니다.
```
**/**
!appsscript.json
!Code.js
!Index.html
```
```bash
clasp push --force        # -f 아님. 확인 프롬프트가 떠서 멈추면 stdin을 막아야 함(< /dev/null)
clasp list-deployments    # 2.x의 clasp deployments 아님
clasp deploy -i <배포ID> -d "설명"   # 배포ID = 웹앱 URL의 AKfycbzz... 부분
```
**push만 하면 반영 안 됩니다. 반드시 `deploy`까지 해야 웹앱에 적용됩니다.**
배포 확인: `curl "웹앱주소?action=getVersion"`

---

## ⚠️ 개발 전에 꼭 읽을 것 (같은 실수 반복 방지)

### 1. POST가 411 에러를 내도 **서버에서는 이미 실행된 상태**
Apps Script 웹앱에 POST하면 302 리다이렉트가 걸리는데, **이 시점에 이미 처리가 끝나 있습니다.**
curl이 타임아웃되거나 `411 Length Required`가 떠도 실제로는 성공했을 수 있습니다.

> 실제 사고: 같은 대량 등록 요청을 재시도하다 **각 책이 6중으로 등록**된 적 있음.
> 2026-08-09에도 삭제 요청 6건이 전부 411을 냈지만 **실제로는 전부 정상 삭제**됨.

**절대 재전송하지 말고**, 먼저 `?action=getDoneList` 같은 GET으로 **반영 여부부터 확인**하세요.

### 2. `index.html`은 11MB가 넘습니다 (폰트가 base64로 박혀 있음)
- 통째로 읽지 말고 `grep`으로 필요한 부분만 찾으세요.
- `grep`이 base64 줄에 걸리면: `awk 'length($0) < 600' index.html | grep -n "찾을것"`

### 3. 브라우저 테스트는 `file://`로 하면 안 됩니다
`fetch`가 막혀서 API가 안 붙습니다. 임시 정적 서버를 띄우세요 (포트 8791 등).
테스트가 끝나면 임시 서버 파일은 **커밋되지 않게 지우세요.**

### 4. 여러 곳에서 동시에 작업하면 사이트가 롤백될 수 있습니다
> 실제 사고: 다른 세션이 오래된 `index.html`을 기준으로 push해서 완성된 기능들이 통째로 사라진 적 있음.

git 작업 전 **항상** `git fetch` + `git log origin/main`으로 원격이 갈라지지 않았는지 확인하세요.

### 5. 버전 규칙
- 화면 하단 버전은 **`index.html`에 하드코딩된 문자열**입니다 (`<span id="app-version">`). 백엔드 API를 쓰지 않습니다.
- **`index.html`을 고쳐서 배포할 때마다 커밋 메시지의 버전과 이 문자열을 똑같이 올리세요.**
- 백엔드만 고쳤으면 `Code.js`의 `APP_VERSION`만 올리면 됩니다 (화면 버전과 별개).

### 6. 백엔드 파일 두 벌 동기화
clasp는 `rootDir`의 `Code.js`를 올립니다. `backend/Code.js`(저장소 사본)와 **양쪽을 항상 맞춰서 커밋**하세요.
과거에 한쪽만 최신이라 헷갈린 적이 있습니다.

---

## 현재 기능

**탭 4개** — 읽을래용(읽고 싶은 책) / 읽는중이용 / 읽었어용 / 종합해용

- **검색·담기**: 알라딘 API 검색 → 3개 탭 어디서든 담기(팝업 공용). 책 카드 클릭 시 상세 모달
- **바코드 스캔**: 책 뒷면 바코드로 바로 담기 (카메라 선택/줌/플래시/탭 초점 지원)
- **도서관 연동**: 용인시 21개 지점 소장 여부·대출 가능 여부·청구기호 조회
  - 남사·용인중앙을 먼저 확인하고, 없을 때만 전체 지점 조회 (API 할당량 절약)
  - 결과는 `Books.avail_json`에 캐싱(성공 1년 / 실패 6시간)
- **읽을래용**: 지점 필터, 정렬 6가지(추가순·제목순·청구기호순 각 오름/내림)
- **읽었어용**: 연도별 보기, 월별 구분선, 감상 메모
- **종합해용**: 올해 읽은 책 / 읽고 싶은 책 / 분야별 비율 + **월별 독서량 히트맵**(연도×월, 맨 오른쪽에 연도별 합계 '계' 열)
- 중복 등록 방지, 카드 ⋯메뉴로 수정·삭제, 감상 메모 저장

## 최근에 해결한 큰 문제 (재발 시 참고)

### 바코드 인식 (해결됨)
카메라는 켜지는데 흐릿해서 인식이 안 되던 문제. 디코더를 여러 번 바꿔도(zxing 재시도 → 네이티브 `BarcodeDetector`) 해결되지 않았는데,
**진짜 원인은 브라우저가 초광각(고정초점) 카메라를 고르고 있었던 것**이었습니다.
초광각 렌즈는 AF 모터가 없어 근접 촬영에서 절대 선명해지지 않고, 탭 투 포커스도 무시됩니다.

→ 기기 목록을 열거해 근접 촬영에 맞는 카메라를 자동 선택 + 사용자가 고르는 드롭다운 제공으로 해결.
줌·플래시·진단 패널도 같이 넣었습니다. **카메라/초점 문제가 또 생기면 이 사례를 먼저 의심하세요.**

- 진단 패널(모달 안)에 실제 선택된 카메라·해상도·초점 지원 여부가 표시됩니다. 문제 생기면 여기부터 확인.
- 폰 기본 카메라 앱으로 찍어 인식하는 경로도 남아 있습니다(가장 확실한 대안).

### 같은 책 중복 등록 (해결됨)
중복 검사 자체는 정상이었지만, **거의 동시에 들어온 두 요청이 둘 다 "중복 없음"을 읽고 둘 다 저장**되는 경쟁 상태가 있었습니다
(등록 id가 연속인 게 특징).

→ 백엔드 `withUserBookLock_`(LockService)로 "확인 후 추가"를 한 번에 하나씩만 실행, 프론트 `runAddOnce_`로 연타 차단.

### 중복 데이터 정리 방법
- 진단: `getWantList`/`getReadingList`/`getDoneList`를 GET으로 받아 **book id별로 묶으면** 바로 보입니다.
  (응답의 `id`는 book id, 등록 정보는 `.userBook` 안에 있음)
- 정리: **`dedupeUserBooks`는 먼저 담은 것만 남겨서 나중에 쓴 메모를 날릴 수 있습니다.**
  메모를 지키려면 `removeUserBook`으로 지울 대상을 직접 골라 삭제하세요.

## 알려진 제약 / 남은 일
- **정보나루(data4library) API 하루 500건 한도.** 공유 IP 대역이라 막히는 날이 있음.
  풀렸을 때 `populateAvailabilityCacheForAll`을 한 번 호출하면 전체 책의 도서관 정보가 채워짐.
- 청구기호(`callno`) 캡처 로직은 아직 실데이터로 충분히 검증되지 않았음.
- 의도적으로 안 만들기로 한 것: 모바일 터치 드래그로 지점 순서 변경(더보기로 충분), 도서관 정보 자동 재시도.

## 저장소 밖에 있는 것
원본 폰트(.ttf/.otf), 공룡 이미지, 과거 독서기록 이미지 폴더, 일괄등록용 JSON은
저장소 상위 폴더(`독서앱/`)에 있고 git으로 관리되지 않습니다.
