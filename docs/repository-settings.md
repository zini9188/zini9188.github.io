# 저장소 보호 설정

## 적용 상태

2026-11-01 기준 실제 저장소 설정을 확인했습니다.

| 항목 | 설정 |
| --- | --- |
| Ruleset | `protect-main` / Active |
| 대상 | 기본 브랜치 `main` |
| 변경 경로 | PR 필수 |
| 필수 검사 | GitHub Actions의 `title`, `Content quality` |
| 승인 리뷰 | 0명 — 1인 운영 |
| 강제 푸시·대상 브랜치 삭제 | 차단 |
| 병합 방식 | Rebase·Merge 허용, Squash 비활성화 |
| 병합한 작업 브랜치 | 자동 삭제 |
| 규칙 우회 대상 | 없음 |

외부 링크 검사는 주간 워크플로로 실행하며 필수 병합 검사에는 포함하지 않습니다. 보호 대상이 `main`이므로 일반 작업 브랜치는 병합 후 자동 삭제할 수 있습니다.

## 확인 근거

- [Ruleset 실제 설정](https://github.com/zini9188/zini9188.github.io/rules/26278139)
- GitHub API로 Active 상태, 대상 브랜치, 필수 검사와 출처, 병합 옵션, 자동 삭제 설정 확인
- 필수 검사를 통과한 PR #6이 보호 규칙 아래에서 Rebase 병합된 것을 확인

## 변경 방법

저장소의 Settings → Rulesets 및 General → Pull Requests에서 관리합니다. 이 문서를 수정하는 것만으로 GitHub 설정이 바뀌지는 않습니다. 설정을 바꾸면 실제 적용값을 확인하고 문서도 갱신합니다.
