# YEONJI ARCHIVE · tripleS S12

곽연지 개인 아카이브. SHION ARCHIVE의 UI/컴포넌트를 계승하여 별도 저장소로 운영합니다. 원본 SHION ARCHIVE에는 영향이 없습니다.

- `public/images/yeonji-home.jpg`: 사용자 제공 커버 사진
- `public/data/yeonji.json`: 프로필/별명/취향/유닛 참고 데이터
- `public/data/yeonji-activities.json`: 연지 주요 활동 타임라인 (선별 목록)
- `public/data/photos.json`: 연지 사진 (현재 커버 1장만 포함; Fandom 연동을 실행해야 추가됨)
- `public/data/films.json`: 확인된 S12 영상
- `public/data/objekt.json`: S12 오브젝트 (Actions 배포 시 WAV ARCHIVE에서 수집)

## 배포

GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정한 후 `Deploy YEONJI ARCHIVE`를 실행하세요. 먼저 Actions 권한을 확인하세요.

## 사진 갱신

`Sync YEONJI SNS Gallery` → Run workflow. Fandom API/이미지 정보가 실패하면 기존 목록을 유지하며 실패 상태를 표시합니다. 원본 게시일과 Fandom 분류 날짜는 다를 수 있으며, 외부 사진의 재게시 권리는 별도 확인이 필요합니다.

## 로컬 확인

`npm install` 후 `npm run build`. 소스에서 특정 멤버의 데이터가 직접 들어가지 않도록 하는 회귀 점검: `node scripts/audit-yeonji.mjs`.

**제작:** @bbangshion · 비공식 팬 프로젝트 / MODHAUS 무관
