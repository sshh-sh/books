/**
 * 읽어용 - Apps Script 백엔드
 * 이 파일을 구글 시트에 연결된 Apps Script 프로젝트(확장 프로그램 > Apps Script)에
 * Code.gs로 붙여넣고 사용합니다.
 */

const SHEETS = {
  BOOKS: 'Books',
  BOOK_LIBRARIES: 'BookLibraries',
  USER_BOOKS: 'UserBooks',
  BRANCHES: 'LibraryBranches'
};

const APP_VERSION = 'v18';

function stripDoseogwan_(name) {
  return (name || '').replace(/도서관$/, '');
}

const YONGIN_REGION_CODE = '31'; // 정보나루 지역코드: 경기도
const YONGIN_DTL_CODE = '31018'; // 정보나루 상세지역코드: 용인시 (실제 값은 정보나루 문서에서 재확인 필요)

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 스프레드시트를 찾을 수 없습니다. Apps Script를 시트의 확장프로그램 메뉴로 열었는지 확인해주세요.');
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    // 탭 이름에 앞뒤 공백이 있는 경우를 대비한 보정 매칭
    sheet = ss.getSheets().find(s => s.getName().trim() === name);
  }
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: "' + name + '". 실제 탭 이름: ' + ss.getSheets().map(s => '"' + s.getName() + '"').join(', '));
  return sheet;
}

/** 진단용: 실행 후 로그(보기 > 로그)에서 실제 탭 이름을 정확히 확인 */
function debugListSheetNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) { Logger.log('연결된 스프레드시트 없음 (바인딩 안 됨)'); return; }
  ss.getSheets().forEach(s => Logger.log('[' + s.getName() + ']'));
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function appendRow_(sheet, obj, headers) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function nextId_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return 1;
  const ids = values.slice(1).map(r => Number(r[0]) || 0);
  return Math.max(0, ...ids) + 1;
}

/* ---------------- 알라딘 검색 ---------------- */

function searchAladin(query) {
  const key = PropertiesService.getScriptProperties().getProperty('ALADIN_KEY');
  if (!key) throw new Error('ALADIN_KEY가 설정되지 않았습니다.');
  const url = 'https://www.aladin.co.kr/ttb/api/ItemSearch.aspx'
    + '?ttbkey=' + encodeURIComponent(key)
    + '&Query=' + encodeURIComponent(query)
    + '&QueryType=Keyword&MaxResults=10&start=1&SearchTarget=Book'
    + '&output=js&Version=20131101';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.item) return [];
  return data.item.map(it => ({
    title: cleanTitle_(it.title),
    author: it.author,
    isbn13: it.isbn13,
    pubDate: it.pubDate,
    cover: it.cover,
    description: it.description,
    category: guessCategory_(it.categoryName),
    country: '' // 알라딘은 국가 정보를 항상 주지 않음 → 없으면 '기타'로 처리
  }));
}

function cleanTitle_(title) {
  return (title || '').replace(/\s*-\s*.*$/, '').trim(); // 부제 정리(필요시 조정)
}

function guessCategory_(categoryName) {
  if (!categoryName) return '기타';
  return categoryName.indexOf('소설') !== -1 ? '소설' : '비소설';
}

/**
 * 복구용: 외부에서 잘못된 인코딩으로 등록된 title/author(깨진 문자, U+FFFD 포함)를
 * ISBN으로 알라딘을 다시 조회해서 덮어씀. 정상인 행은 건드리지 않아 여러 번 실행해도 안전.
 */
function repairBookTitlesByIsbn() {
  const key = PropertiesService.getScriptProperties().getProperty('ALADIN_KEY');
  if (!key) throw new Error('ALADIN_KEY가 설정되지 않았습니다.');
  const sheet = getSheet_(SHEETS.BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxTitle = headers.indexOf('title');
  const idxAuthor = headers.indexOf('author');
  const idxIsbn = headers.indexOf('isbn');
  const idxCategory = headers.indexOf('category');
  const results = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const isbn = row[idxIsbn];
    const title = row[idxTitle] || '';
    const author = row[idxAuthor] || '';
    const category = row[idxCategory] || '';
    if (!isbn) continue;
    if (title.indexOf('�') === -1 && author.indexOf('�') === -1 && category.indexOf('�') === -1) continue;

    const url = 'https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx'
      + '?ttbkey=' + encodeURIComponent(key)
      + '&itemIdType=ISBN13&ItemId=' + encodeURIComponent(isbn)
      + '&output=js&Version=20131101&OptResult=categoryIdList';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    if (data.item && data.item[0]) {
      const it = data.item[0];
      const newTitle = cleanTitle_(it.title);
      const newAuthor = it.author;
      const newCategory = guessCategory_(it.categoryName);
      sheet.getRange(r + 1, idxTitle + 1).setValue(newTitle);
      sheet.getRange(r + 1, idxAuthor + 1).setValue(newAuthor);
      sheet.getRange(r + 1, idxCategory + 1).setValue(newCategory);
      results.push({ isbn: isbn, oldTitle: title, newTitle: newTitle });
    } else {
      results.push({ isbn: isbn, oldTitle: title, newTitle: null, error: 'ISBN 조회 실패' });
    }
    Utilities.sleep(300);
  }
  return results;
}

/* ---------------- 정보나루: 지점 목록 ---------------- */

function fetchYonginBranches_() {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key) throw new Error('LIBRARY_KEY가 설정되지 않았습니다.');
  // dtl_region 코드가 불확실해서, 경기도 전체를 받아 주소에 "용인시"가 들어간 곳만 걸러냄
  const url = 'http://data4library.kr/api/libSrch'
    + '?authKey=' + encodeURIComponent(key)
    + '&region=' + YONGIN_REGION_CODE
    + '&pageSize=500&format=json';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  const allLibs = (data.response && data.response.libs) || [];
  const libs = allLibs.filter(l => (l.lib.address || '').indexOf('용인시') !== -1);
  return libs.map(l => l.lib);
}

/** 최초 1회 또는 필요할 때 실행: 지점 목록을 LibraryBranches 시트에 채워넣음 */
function syncLibraryBranches() {
  const sheet = getSheet_(SHEETS.BRANCHES);
  const existing = sheetToObjects_(sheet);
  if (existing.length > 0) return; // 이미 있으면 건드리지 않음(순서 보존)
  const libs = fetchYonginBranches_();
  libs.forEach((lib, i) => {
    sheet.appendRow([stripDoseogwan_(lib.libName), i + 1]);
  });
}

function getLibraryBranches() {
  return sheetToObjects_(getSheet_(SHEETS.BRANCHES))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function updateBranchOrder(orderedNames) {
  const sheet = getSheet_(SHEETS.BRANCHES);
  const rows = sheetToObjects_(sheet);
  const byName = {};
  rows.forEach(r => byName[r.branch_name] = r);
  const out = orderedNames.map((name, i) => [name, i + 1]);
  sheet.getRange(2, 1, Math.max(out.length, 1), 2).clearContent();
  if (out.length) sheet.getRange(2, 1, out.length, 2).setValues(out);
}

/* ---------------- 정보나루: 도서 소장/대출 여부 ---------------- */

const PRIORITY_BRANCH_NAMES = ['남사', '용인중앙'];

/**
 * 남사/용인중앙 지점의 libCode를 최초 1회만 조회해서 스크립트 속성에 영구 캐싱.
 * (지점 코드는 바뀌지 않으므로 매번 API를 부를 필요가 없음)
 */
function getPriorityLibCodes_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('PRIORITY_LIB_CODES');
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Object.keys(parsed).length > 0) return parsed; // 빈 값으로 캐시된 적이 있어서 그 경우엔 재조회
  }

  const libs = fetchYonginBranches_(); // libSrch API 1회 호출
  const codes = {};
  libs.forEach(l => {
    const name = stripDoseogwan_(l.libName);
    if (PRIORITY_BRANCH_NAMES.indexOf(name) !== -1) codes[name] = l.libCode;
  });
  if (Object.keys(codes).length > 0) props.setProperty('PRIORITY_LIB_CODES', JSON.stringify(codes));
  return codes;
}

/** bookExist 1건 호출: 해당 지점이 이 책을 보유하는지(hasBook)와 대출가능 여부(loanAvailable)를 함께 반환 */
function checkLibraryHasBook_(key, isbn13, libCode) {
  const url = 'http://data4library.kr/api/bookExist'
    + '?authKey=' + encodeURIComponent(key)
    + '&isbn13=' + encodeURIComponent(isbn13)
    + '&libCode=' + encodeURIComponent(libCode)
    + '&format=json';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  const result = data.response && data.response.result;
  return {
    hasBook: !!result && result.hasBook === 'Y',
    available: !!result && result.loanAvailable === 'Y'
  };
}

/**
 * 도서관 보유/대출가능 여부 조회.
 * 정보나루 하루 500건 할당량을 아끼기 위해, 먼저 남사·용인중앙 2곳만 bookExist로 직접 확인(최대 2건).
 * 둘 다 없으면(=hasBook이 둘 다 N이면) 그때만 용인시 전체 지점을 대상으로 한 기존 방식(최대 22건)으로 폴백.
 */
function getBookAvailability(isbn13) {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key) throw new Error('LIBRARY_KEY가 설정되지 않았습니다.');

  // 1) 남사/용인중앙 우선 확인
  const priorityCodes = getPriorityLibCodes_();
  const priorityLibs = [];
  Object.keys(priorityCodes).forEach(name => {
    try {
      const r = checkLibraryHasBook_(key, isbn13, priorityCodes[name]);
      if (r.hasBook) priorityLibs.push({ libraryName: name, available: r.available, libCode: priorityCodes[name] });
    } catch (err) { /* 개별 조회 실패는 무시하고 아래 전체검색으로 폴백 */ }
  });
  if (priorityLibs.length > 0) return priorityLibs;

  // 2) 둘 다 없으면 전체 지점 검색으로 폴백 (기존 방식)
  const srchUrl = 'http://data4library.kr/api/libSrchByBook'
    + '?authKey=' + encodeURIComponent(key)
    + '&isbn=' + encodeURIComponent(isbn13)
    + '&region=' + YONGIN_REGION_CODE
    + '&pageSize=500&format=json';
  const srchRes = UrlFetchApp.fetch(srchUrl, { muteHttpExceptions: true });
  const srchData = JSON.parse(srchRes.getContentText());
  if (srchData.response && srchData.response.errCode) {
    throw new Error('정보나루 API 오류: ' + srchData.response.error);
  }
  const allLibs = (srchData.response && srchData.response.libs) || [];
  const yonginLibs = allLibs
    .map(l => l.lib)
    .filter(l => (l.address || '').indexOf('용인시') !== -1);

  return yonginLibs.map(l => {
    let available = false;
    try {
      const r = checkLibraryHasBook_(key, isbn13, l.libCode);
      available = r.available;
    } catch (err) { /* 개별 조회 실패는 무시하고 대출불가로 처리 */ }
    return { libraryName: stripDoseogwan_(l.libName), available: available, libCode: l.libCode };
  });
}

/**
 * 대표 청구기호 조회. 정보나루 itemSrch를 isbn13 파라미터(keyword가 아님)로 호출해야
 * 실제로 그 ISBN만 필터링됨. startDt/endDt(기간)는 필수이고, 서버가 내부적으로 최근 약 10년으로
 * 제한하기 때문에 그보다 오래전에 등록된 소장본은 이 API로 못 찾을 수 있음(그 경우 빈 값 반환).
 * class_no(분류기호, 예: "813.6")와 callNumbers[0].callNumber.book_code(도서기호, 예: "케68ㅈ")를
 * 합쳐서 실제 서가 청구기호 형태로 반환.
 */
function fetchRepresentativeCallNo_(isbn13, libCode) {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key || !libCode) return '';
  try {
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const url = 'http://data4library.kr/api/itemSrch'
      + '?authKey=' + encodeURIComponent(key)
      + '&libCode=' + encodeURIComponent(libCode)
      + '&isbn13=' + encodeURIComponent(isbn13)
      + '&startDt=2000-01-01&endDt=' + today
      + '&format=json';
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const docs = (data.response && data.response.docs) || [];
    if (docs.length && docs[0].doc) {
      const doc = docs[0].doc;
      const classNo = doc.class_no || '';
      const cn = doc.callNumbers && doc.callNumbers[0] && doc.callNumbers[0].callNumber;
      const bookCode = (cn && cn.book_code) || '';
      return [classNo, bookCode].filter(Boolean).join(' ');
    }
  } catch (err) { /* 실패하면 그냥 빈 값 */ }
  return '';
}

/**
 * 보유도서관 목록을 조회하면서, 그중 남사/용인중앙 지점은 각각의 청구기호도 함께 채워서 반환.
 * (다른 지점은 청구기호를 조회하지 않음 — API 호출량을 아끼기 위해 우선 지점만)
 */
function getBookAvailabilityWithCallNo_(isbn13) {
  const libs = getBookAvailability(isbn13);
  const enriched = libs.map(l => {
    let callno = '';
    if (PRIORITY_BRANCH_NAMES.indexOf(l.libraryName) !== -1 && l.libCode) {
      callno = fetchRepresentativeCallNo_(isbn13, l.libCode);
    }
    return { libraryName: l.libraryName, available: l.available, callno: callno };
  });
  return { libs: enriched };
}

const AVAIL_CACHE_DAYS = 365;
const AVAIL_ERROR_CACHE_HOURS = 6; // 정보나루 API 실패(할당량 등) 시, 이 시간 동안은 재시도하지 않고 빈 결과를 바로 반환
const AVAIL_ERROR_MARKER = 'ERROR';

function ensureBooksAvailColumns_(sheet) {
  ['avail_json', 'avail_checked_at', 'callno'].forEach(h => {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    }
  });
}

/**
 * 도서관 보유/대출가능 여부를 book_id 기준으로 캐싱해서 반환.
 * 성공한 조회는 AVAIL_CACHE_DAYS(1년) 동안 캐시를 재사용.
 * 정보나루 API가 실패(할당량 초과 등으로 예외 발생)하면, 그 실패 자체를 AVAIL_ERROR_CACHE_HOURS 동안
 * 캐시해서 화면을 열 때마다 매번 느린 API 재시도를 반복하지 않도록 함(실패 전엔 이 캐싱이 빠져 있어서
 * 할당량이 막힌 책은 매번 재시도하느라 느렸던 문제를 고침).
 */
function getBookAvailabilityCached(isbn13, bookId) {
  const sheet = getSheet_(SHEETS.BOOKS);
  ensureBooksAvailColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxId = headers.indexOf('id');
  const idxJson = headers.indexOf('avail_json');
  const idxChecked = headers.indexOf('avail_checked_at');
  const idxCallno = headers.indexOf('callno');

  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][idxId]) !== Number(bookId)) continue;

    const checkedAt = values[r][idxChecked];
    const cachedJson = values[r][idxJson];
    const isErrorCache = cachedJson === AVAIL_ERROR_MARKER;
    const ttlMs = (isErrorCache ? AVAIL_ERROR_CACHE_HOURS * 60 * 60 * 1000 : AVAIL_CACHE_DAYS * 24 * 60 * 60 * 1000);
    const isFresh = checkedAt && cachedJson && (new Date() - new Date(checkedAt)) < ttlMs;
    if (isFresh) {
      if (isErrorCache) return [];
      try { return JSON.parse(cachedJson); } catch (e) { /* 캐시 파싱 실패 시 새로 조회 */ }
    }

    try {
      const fresh = getBookAvailabilityWithCallNo_(isbn13);
      sheet.getRange(r + 1, idxJson + 1).setValue(JSON.stringify(fresh.libs));
      sheet.getRange(r + 1, idxChecked + 1).setValue(new Date());
      return fresh.libs;
    } catch (err) {
      sheet.getRange(r + 1, idxJson + 1).setValue(AVAIL_ERROR_MARKER);
      sheet.getRange(r + 1, idxChecked + 1).setValue(new Date());
      return [];
    }
  }
  try {
    return getBookAvailabilityWithCallNo_(isbn13).libs;
  } catch (err) {
    return [];
  }
}

/**
 * 정보나루 API를 호출하지 않고, 이미 알고 있는 대출가능 정보를 그대로 캐시에 저장.
 * (API 일일 한도가 막혔을 때, 다른 경로로 이미 확인한 데이터를 수동으로 채워넣는 용도)
 * libs: [{ libraryName, available }, ...]
 */
function seedKnownAvailability(isbn13, libs, callno) {
  const sheet = getSheet_(SHEETS.BOOKS);
  ensureBooksAvailColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxIsbn = headers.indexOf('isbn');
  const idxJson = headers.indexOf('avail_json');
  const idxChecked = headers.indexOf('avail_checked_at');
  const idxCallno = headers.indexOf('callno');

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idxIsbn]) !== String(isbn13)) continue;
    sheet.getRange(r + 1, idxJson + 1).setValue(JSON.stringify(libs));
    sheet.getRange(r + 1, idxChecked + 1).setValue(new Date());
    if (callno) sheet.getRange(r + 1, idxCallno + 1).setValue(callno);
    return { ok: true, bookId: values[r][headers.indexOf('id')] };
  }
  return { ok: false, error: 'ISBN을 가진 책을 Books 시트에서 찾을 수 없습니다: ' + isbn13 };
}

/** 아직 캐시가 없는 책들만 골라서 한 번에 채워넣음 (일괄 등록 직후 등에 1회 실행용) */
function populateAvailabilityCacheForAll() {
  const sheet = getSheet_(SHEETS.BOOKS);
  ensureBooksAvailColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxId = headers.indexOf('id');
  const idxIsbn = headers.indexOf('isbn');
  const idxJson = headers.indexOf('avail_json');
  const idxChecked = headers.indexOf('avail_checked_at');
  let count = 0;

  for (let r = 1; r < values.length; r++) {
    if (values[r][idxJson] && values[r][idxChecked]) continue; // 이미 캐시 있음
    const isbn = values[r][idxIsbn];
    if (!isbn) continue;
    try {
      const fresh = getBookAvailabilityWithCallNo_(isbn);
      sheet.getRange(r + 1, idxJson + 1).setValue(JSON.stringify(fresh.libs));
      sheet.getRange(r + 1, idxChecked + 1).setValue(new Date());
      count++;
    } catch (err) {
      return { done: count, stoppedAt: values[r][idxId], error: err.message };
    }
    Utilities.sleep(200);
  }
  return { done: count, stoppedAt: null, error: null };
}

/**
 * 읽을래용(읽고싶음 상태) 책들만 대상으로 남사/용인중앙 청구기호를 채움.
 * avail_json 캐시가 이미 있으면 재사용(가용성 재조회 안 함)하고, 그 지점을 보유한 경우에만
 * itemSrch로 청구기호 1건씩 추가 조회. 하루 500건 한도를 지키기 위해 480건 근처에서 자동 중단하고,
 * 이미 처리된(callno 필드가 채워진) 책은 건너뛰므로 다시 실행하면 이어서 처리됨.
 */
function populateWantListCallNos() {
  const key = PropertiesService.getScriptProperties().getProperty('LIBRARY_KEY');
  if (!key) throw new Error('LIBRARY_KEY가 설정되지 않았습니다.');

  const sheet = getSheet_(SHEETS.BOOKS);
  ensureBooksAvailColumns_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxId = headers.indexOf('id');
  const idxIsbn = headers.indexOf('isbn');
  const idxJson = headers.indexOf('avail_json');
  const idxChecked = headers.indexOf('avail_checked_at');

  const wantBookIds = {};
  sheetToObjects_(getSheet_(SHEETS.USER_BOOKS))
    .filter(ub => ub.status === '읽고싶음')
    .forEach(ub => { wantBookIds[Number(ub.book_id)] = true; });

  const priorityCodes = getPriorityLibCodes_();
  let done = 0, apiCalls = 0;

  for (let r = 1; r < values.length; r++) {
    if (apiCalls >= 480) {
      return { done: done, apiCalls: apiCalls, stoppedAt: values[r][idxId], note: '480건 근처에서 안전하게 중단. 다시 실행하면 이어서 처리됩니다.' };
    }

    const id = Number(values[r][idxId]);
    if (!wantBookIds[id]) continue;
    const isbn = values[r][idxIsbn];
    if (!isbn) continue;

    let libs = null;
    const cachedJson = values[r][idxJson];
    if (cachedJson && cachedJson !== AVAIL_ERROR_MARKER) {
      try { libs = JSON.parse(cachedJson); } catch (e) { libs = null; }
    }

    const alreadyDone = !!libs && PRIORITY_BRANCH_NAMES.every(name => {
      const entry = libs.find(l => l.libraryName === name);
      return !entry || !!entry.callno;
    });
    if (alreadyDone) continue;

    try {
      if (!libs) {
        libs = getBookAvailability(isbn).map(l => ({ libraryName: l.libraryName, available: l.available }));
        apiCalls += 2;
      }
      libs = libs.map(l => {
        if (PRIORITY_BRANCH_NAMES.indexOf(l.libraryName) !== -1 && !l.callno) {
          const libCode = priorityCodes[l.libraryName];
          const callno = libCode ? fetchRepresentativeCallNo_(isbn, libCode) : '';
          apiCalls++;
          return Object.assign({}, l, { callno: callno });
        }
        return l;
      });
      sheet.getRange(r + 1, idxJson + 1).setValue(JSON.stringify(libs));
      sheet.getRange(r + 1, idxChecked + 1).setValue(new Date());
      done++;
    } catch (err) {
      return { done: done, apiCalls: apiCalls, stoppedAt: id, error: err.message };
    }
    Utilities.sleep(150);
  }
  return { done: done, apiCalls: apiCalls, stoppedAt: null };
}

/** UserBooks에서 Books에 더 이상 존재하지 않는 book_id를 가리키는 유령 행 삭제 */
function removeOrphanedUserBooks() {
  const bookIds = sheetToObjects_(getSheet_(SHEETS.BOOKS)).map(b => Number(b.id));
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxBookId = headers.indexOf('book_id');
  const idxId = headers.indexOf('id');
  const removed = [];
  for (let r = 1; r < values.length; r++) {
    if (bookIds.indexOf(Number(values[r][idxBookId])) === -1) {
      removed.push({ row: r + 1, id: values[r][idxId] });
    }
  }
  removed.sort((a, b) => b.row - a.row).forEach(x => sheet.deleteRow(x.row));
  return removed.map(x => x.id);
}

/* ---------------- Books / BookLibraries ---------------- */

function findOrCreateBook_(bookData) {
  const sheet = getSheet_(SHEETS.BOOKS);
  const books = sheetToObjects_(sheet);
  const existing = books.find(b => String(b.isbn) === String(bookData.isbn13));
  if (existing) return existing.id;

  const id = nextId_(sheet);
  sheet.appendRow([
    id, bookData.title, bookData.author, bookData.isbn13,
    bookData.category || '기타', bookData.country || '기타',
    bookData.cover || '', bookData.series_name || '',
    bookData.series_total || '', bookData.series_order || ''
  ]);
  return id;
}

/**
 * 복구용: (과거 isbn 타입 불일치 버그로) 같은 ISBN을 가진 Books 행이 여러 개 생긴 것을 병합.
 * 가장 작은 id를 남기고, UserBooks/BookLibraries의 book_id 참조를 남긴 id로 바꾼 뒤 나머지 Books 행은 삭제.
 */
function mergeDuplicateBooksByIsbn() {
  const booksSheet = getSheet_(SHEETS.BOOKS);
  const books = sheetToObjects_(booksSheet);
  const byIsbn = {};
  books.forEach(b => {
    const key = String(b.isbn);
    if (!byIsbn[key]) byIsbn[key] = [];
    byIsbn[key].push(b);
  });

  const idRemap = {}; // 지워질 book_id -> 남길 book_id
  const rowsToDelete = []; // Books 시트에서 지울 id 목록
  Object.keys(byIsbn).forEach(isbn => {
    const group = byIsbn[isbn];
    if (group.length < 2) return;
    group.sort((a, b) => Number(a.id) - Number(b.id));
    const keep = group[0];
    group.slice(1).forEach(dup => {
      idRemap[dup.id] = keep.id;
      rowsToDelete.push(dup.id);
    });
  });

  if (rowsToDelete.length === 0) return { remapped: 0, deleted: 0 };

  // UserBooks의 book_id 참조 갱신
  const ubSheet = getSheet_(SHEETS.USER_BOOKS);
  const ubValues = ubSheet.getDataRange().getValues();
  const ubHeaders = ubValues[0];
  const idxBookId = ubHeaders.indexOf('book_id');
  for (let r = 1; r < ubValues.length; r++) {
    const bookId = ubValues[r][idxBookId];
    if (idRemap[bookId] !== undefined) {
      ubSheet.getRange(r + 1, idxBookId + 1).setValue(idRemap[bookId]);
    }
  }

  // BookLibraries의 book_id 참조 갱신
  const blSheet = getSheet_(SHEETS.BOOK_LIBRARIES);
  const blValues = blSheet.getDataRange().getValues();
  if (blValues.length > 1) {
    const blHeaders = blValues[0];
    const idxBlBookId = blHeaders.indexOf('book_id');
    for (let r = 1; r < blValues.length; r++) {
      const bookId = blValues[r][idxBlBookId];
      if (idRemap[bookId] !== undefined) {
        blSheet.getRange(r + 1, idxBlBookId + 1).setValue(idRemap[bookId]);
      }
    }
  }

  // 중복 Books 행 삭제 (뒤에서부터)
  const booksValues = booksSheet.getDataRange().getValues();
  const booksHeaders = booksValues[0];
  const idxId = booksHeaders.indexOf('id');
  const rowsBySheetIndex = [];
  for (let r = 1; r < booksValues.length; r++) {
    if (rowsToDelete.indexOf(booksValues[r][idxId]) !== -1) {
      rowsBySheetIndex.push(r + 1);
    }
  }
  rowsBySheetIndex.sort((a, b) => b - a).forEach(sheetRow => booksSheet.deleteRow(sheetRow));

  return { remapped: Object.keys(idRemap).length, deleted: rowsToDelete.length };
}

/* ---------------- 과거 독서기록 일괄 등록 ---------------- */

function itemLookupAladin_(isbn13) {
  const key = PropertiesService.getScriptProperties().getProperty('ALADIN_KEY');
  if (!key) throw new Error('ALADIN_KEY가 설정되지 않았습니다.');
  const url = 'https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx'
    + '?ttbkey=' + encodeURIComponent(key)
    + '&itemIdType=ISBN13&ItemId=' + encodeURIComponent(isbn13)
    + '&output=js&Version=20131101';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.item || !data.item[0]) return null;
  const it = data.item[0];
  return {
    title: cleanTitle_(it.title),
    author: it.author,
    isbn13: it.isbn13,
    cover: it.cover,
    category: guessCategory_(it.categoryName),
    country: ''
  };
}

/**
 * 과거 독서기록(2024~2026 이미지에서 추출한 목록)을 읽었어용에 일괄 등록.
 * items: [{ title, author, isbn(선택), readDate: 'YYYY-MM-DD', note }]
 * isbn이 있으면 ItemLookUp으로 정확히 매칭, 없으면 title+author로 검색해 첫 결과 사용.
 */
function bulkImportReadBooks(items) {
  const results = [];
  (items || []).forEach(item => {
    try {
      let bookData = null;
      if (item.isbn) {
        try { bookData = itemLookupAladin_(item.isbn); } catch (e) { bookData = null; }
      }
      if (!bookData) {
        const found = searchAladin(((item.title || '') + ' ' + (item.author || '')).trim());
        if (found && found.length) bookData = found[0];
      }
      if (!bookData) {
        results.push({ title: item.title, ok: false, error: '알라딘에서 못 찾음' });
        return;
      }
      const userBookId = addToReadingList(bookData, item.note || '', '독서기록가져오기');
      markFinished(userBookId, item.readDate);
      results.push({ title: bookData.title, ok: true, userBookId: userBookId, isbn: bookData.isbn13, requestedTitle: item.title });
    } catch (err) {
      results.push({ title: item.title, ok: false, error: err.message });
    }
    Utilities.sleep(150);
  });
  return results;
}

/* ---------------- UserBooks (읽을래용/읽는중이용/읽었어용) ---------------- */

function addToWantList(bookData, reasonNote) {
  const bookId = findOrCreateBook_(bookData);
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const id = nextId_(sheet);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([id, bookId, '읽고싶음', '도서관', today, '', false, reasonNote || '']);
  return id;
}

function addToReadingList(bookData, reasonNote, source) {
  const bookId = findOrCreateBook_(bookData);
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const id = nextId_(sheet);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([id, bookId, '읽는중', source || '도서관외', today, '', false, reasonNote || '']);
  return id;
}

/**
 * 검색으로 고른 책을 곧바로 읽었어용(다 읽은 상태)으로 등록.
 * appendRow(읽는중으로 추가) 후 updateUserBookField_를 2번(상태, 날짜) 더 호출하던 이전 방식은
 * 매번 UserBooks 시트 전체를 다시 읽고 셀을 하나씩 쓰는 왕복이 3번 발생해서 느렸음.
 * 처음부터 최종 상태(읽음+날짜)로 한 줄만 추가하도록 바꿔서 왕복 횟수를 1번으로 줄임.
 */
function addFinishedBookDirect(bookData, note, readDate) {
  const bookId = findOrCreateBook_(bookData);
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const id = nextId_(sheet);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.appendRow([id, bookId, '읽음', '도서관외', today, readDate, false, note || '']);
  return id;
}

function markBorrowed_toReading(userBookId) {
  updateUserBookField_(userBookId, 'status', '읽는중');
}

function markFinished(userBookId, readDate) {
  updateUserBookField_(userBookId, 'status', '읽음');
  updateUserBookField_(userBookId, 'read_date', readDate);
}

function markDropped(userBookId) {
  updateUserBookField_(userBookId, 'status', '읽음');
  updateUserBookField_(userBookId, 'dropped', true);
}

function updateReasonNote(userBookId, note) {
  updateUserBookField_(userBookId, 'reason_note', note || '');
}

/** 카드 ⋯메뉴의 "수정"에서 제목/저자 고치기. bookId는 Books 시트 기준(여러 UserBooks가 같은 book을 공유할 수 있음) */
function updateBookInfo(bookId, title, author) {
  const sheet = getSheet_(SHEETS.BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxId = headers.indexOf('id');
  const idxTitle = headers.indexOf('title');
  const idxAuthor = headers.indexOf('author');
  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][idxId]) === Number(bookId)) {
      sheet.getRange(r + 1, idxTitle + 1).setValue(title || '');
      sheet.getRange(r + 1, idxAuthor + 1).setValue(author || '');
      return;
    }
  }
  throw new Error('Books id를 찾을 수 없습니다: ' + bookId);
}

/** 읽었어용 카드 ⋯메뉴의 "수정"에서 읽은 날짜 고치기 */
function updateReadDate(userBookId, readDate) {
  updateUserBookField_(userBookId, 'read_date', readDate);
}

function removeUserBook(userBookId) {
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][0]) === Number(userBookId)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  throw new Error('UserBooks id를 찾을 수 없습니다: ' + userBookId);
}

/**
 * 복구용: 같은 book_id로 여러 번 등록된 UserBooks 행 중 가장 먼저 추가된 것만 남기고 나머지는 삭제.
 * status가 서로 다르면(예: 읽고싶음 vs 읽는중) 건드리지 않고, 완전히 같은 book_id+status 조합의 중복만 정리.
 */
function dedupeUserBooks() {
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idxId = headers.indexOf('id');
  const idxBookId = headers.indexOf('book_id');
  const idxStatus = headers.indexOf('status');
  const idxAdded = headers.indexOf('added_date');

  const rows = values.slice(1).map((row, i) => ({ row, sheetRow: i + 2 }));
  const seen = {};
  const toDelete = [];
  rows
    .slice()
    .sort((a, b) => new Date(a.row[idxAdded]) - new Date(b.row[idxAdded]))
    .forEach(r => {
      const key = r.row[idxBookId] + '|' + r.row[idxStatus];
      if (seen[key]) {
        toDelete.push({ id: r.row[idxId], sheetRow: r.sheetRow });
      } else {
        seen[key] = true;
      }
    });

  toDelete
    .sort((a, b) => b.sheetRow - a.sheetRow) // 뒤에서부터 지워야 행 번호가 안 밀림
    .forEach(d => sheet.deleteRow(d.sheetRow));

  return toDelete.map(d => d.id);
}

function updateUserBookField_(userBookId, field, value) {
  const sheet = getSheet_(SHEETS.USER_BOOKS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIndex = headers.indexOf(field);
  if (colIndex === -1) throw new Error('알 수 없는 필드: ' + field);
  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][0]) === Number(userBookId)) {
      sheet.getRange(r + 1, colIndex + 1).setValue(value);
      return;
    }
  }
  throw new Error('UserBooks id를 찾을 수 없습니다: ' + userBookId);
}

/* ---------------- 목록 조회 (화면용) ---------------- */

function getListByStatus_(status) {
  const userBooks = sheetToObjects_(getSheet_(SHEETS.USER_BOOKS))
    .filter(ub => ub.status === status);
  const books = sheetToObjects_(getSheet_(SHEETS.BOOKS));
  const bookById = {};
  books.forEach(b => bookById[b.id] = b);

  return userBooks
    .sort((a, b) => new Date(a.added_date) - new Date(b.added_date))
    .map(ub => Object.assign({}, bookById[ub.book_id], { userBook: ub }));
}

function getWantList() { return getListByStatus_('읽고싶음'); }
function getReadingList() { return getListByStatus_('읽는중'); }
function getDoneList() { return getListByStatus_('읽음'); }

/* ---------------- 통계 ---------------- */

function getStats() {
  const userBooks = sheetToObjects_(getSheet_(SHEETS.USER_BOOKS));
  const books = sheetToObjects_(getSheet_(SHEETS.BOOKS));
  const bookById = {};
  books.forEach(b => bookById[b.id] = b);
  const thisYear = new Date().getFullYear();

  const doneThisYear = userBooks.filter(ub =>
    ub.status === '읽음' && !ub.dropped && ub.read_date &&
    new Date(ub.read_date).getFullYear() === thisYear
  );
  const want = userBooks.filter(ub => ub.status === '읽고싶음');

  const categoryCounts = { '소설': 0, '비소설': 0 };
  doneThisYear.forEach(ub => {
    const cat = (bookById[ub.book_id] || {}).category;
    if (cat === '소설') categoryCounts['소설']++;
    else categoryCounts['비소설']++;
  });

  return {
    doneThisYear: doneThisYear.length,
    wantCount: want.length,
    categoryCounts: categoryCounts
  };
}

/* ---------------- 웹앱 진입점 ---------------- */

/* ---------------- JSON API (깃허브 페이지에서 fetch로 호출) ---------------- */

const API_ACTIONS = {
  searchAladin: (p) => searchAladin(p.query),
  getWantList: () => getWantList(),
  getReadingList: () => getReadingList(),
  getDoneList: () => getDoneList(),
  getStats: () => getStats(),
  getLibraryBranches: () => getLibraryBranches(),
  getBookAvailability: (p) => getBookAvailability(p.isbn13),
  getBookAvailabilityCached: (p) => getBookAvailabilityCached(p.isbn13, p.bookId),
  seedKnownAvailability: (p) => seedKnownAvailability(p.isbn13, p.libs, p.callno),
  populateWantListCallNos: () => populateWantListCallNos(),
  populateAvailabilityCacheForAll: () => populateAvailabilityCacheForAll(),
  removeOrphanedUserBooks: () => removeOrphanedUserBooks(),
  bulkImportReadBooks: (p) => bulkImportReadBooks(p.items),
  addToWantList: (p) => addToWantList(p.bookData, p.reasonNote),
  addToReadingList: (p) => addToReadingList(p.bookData, p.reasonNote, p.source),
  addFinishedBookDirect: (p) => addFinishedBookDirect(p.bookData, p.note, p.readDate),
  markBorrowed_toReading: (p) => markBorrowed_toReading(p.userBookId),
  markFinished: (p) => markFinished(p.userBookId, p.readDate),
  markDropped: (p) => markDropped(p.userBookId),
  updateReasonNote: (p) => updateReasonNote(p.userBookId, p.note),
  updateBookInfo: (p) => updateBookInfo(p.bookId, p.title, p.author),
  updateReadDate: (p) => updateReadDate(p.userBookId, p.readDate),
  removeUserBook: (p) => removeUserBook(p.userBookId),
  dedupeUserBooks: () => dedupeUserBooks(),
  mergeDuplicateBooksByIsbn: () => mergeDuplicateBooksByIsbn(),
  updateBranchOrder: (p) => updateBranchOrder(p.orderedNames),
  syncLibraryBranches: () => syncLibraryBranches(),
  repairBookTitlesByIsbn: () => repairBookTitlesByIsbn(),
  getVersion: () => APP_VERSION
};

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(action, params) {
  try {
    const fn = API_ACTIONS[action];
    if (!fn) return jsonOutput_({ ok: false, error: '알 수 없는 action: ' + action });
    const result = fn(params || {});
    return jsonOutput_({ ok: true, data: result });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

/** 읽기 전용 호출: GET ?action=xxx&query=... 형태 */
function doGet(e) {
  const action = e.parameter.action;
  if (!action) return jsonOutput_({ ok: false, error: 'action 파라미터가 필요합니다.' });
  return handleApi_(action, e.parameter);
}

/** 쓰기 호출: POST body(JSON) = { action, ...payload } — CORS 프리플라이트 피하려고 text/plain으로 보냄 */
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return handleApi_(body.action, body);
}
