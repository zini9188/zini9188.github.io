# 기술 기반과 글 작성

## 기술 구성

- Astro: 마크다운을 정적 HTML로 빌드
- TypeScript: 코드와 글 메타데이터 확인
- Markdown: 개발 기록·독서 정리 원본 관리
- GitHub Actions: PR 검사와 주간 외부 링크 검사

글 목록과 본문에 공통 레이아웃을 사용합니다. 목록에서 분류·태그·검색을 제공하고, 사이드바 접기와 밝은 화면·어두운 화면 전환 상태를 브라우저에 저장합니다. 제목 아래 부제는 표시하지 않으며 목록에 짧은 설명을 사용합니다. 자동 배포는 별도 구성합니다.

## 글 작성

`templates/`의 양식을 `src/content/posts/`로 복사하고 파일 이름·날짜·내용을 수정합니다. 파일 이름은 `/posts/파일이름/` 주소가 됩니다.

- 필수 정보: `title`, `description`, `pubDate`, `category`
- 분류: `development` 또는 `reading`
- 선택 정보: `tags`, `book.title`, `book.author`
- 공개하려면 `draft: false`를 명시합니다. 기본값과 `draft: true`는 사이트에서 제외됩니다.

공개 저장소의 초안 원본은 GitHub에서 누구나 볼 수 있습니다.

## 로컬 실행과 검사

Node.js 24와 [lychee 0.24.2](https://github.com/lycheeverse/lychee/releases/tag/lychee-v0.24.2)를 설치합니다. 실행 파일이 PATH에 없다면 `LYCHEE_BIN` 환경 변수에 절대 경로를 지정합니다.

```sh
npm ci
npm run dev
npm run verify
```

전체 검사는 마크다운 → 타입 → 오류 탐지 회귀 검사 → 최종 빌드 → 내부 링크 순서입니다. 회귀 검사에 사용하는 임시 글은 검사 후 제거되며 최종 빌드에 포함되지 않습니다.

개별 명령은 `lint:md`, `check`, `test:quality`, `build`, `check:links`입니다. 링크 검사는 빌드된 글과 저장소 문서의 파일·앵커를 확인합니다. 내부 검사는 네트워크를 사용하지 않습니다.

외부 HTTP 링크는 매주 월요일 한국 시간 오전 10시에 별도 워크플로로 검사하며, PR 필수 검사에는 포함하지 않습니다. 수동 실행도 가능합니다.
