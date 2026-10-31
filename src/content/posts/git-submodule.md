---
title: "Git Submodule 사용법과 오류 해결"
description: "서브모듈 연결·갱신과 인증 오류 해결"
pubDate: 2026-11-01
category: development
tags: [Git, Submodule, Deployment, Troubleshooting]
draft: false
---

배포 설정 파일을 애플리케이션 코드와 분리하려고 private 저장소를 만들고 Submodule로 연결했다. 로컬에서는 파일이 보였지만, 팀원이 클론하거나 배포 과정에서 가져올 때 인증 오류와 커밋 참조 오류를 만났다.

이때 가장 먼저 이해했어야 할 것은 부모 저장소가 서브모듈의 “최신 파일”을 저장하는 것이 아니라 **특정 커밋을 가리킨다**는 점이었다.

## Submodule이 기록하는 것

Submodule은 별도 이력을 가진 저장소를 다른 저장소의 작업 디렉터리 안에 연결하는 기능이다. 부모 저장소에는 `.gitmodules`의 경로·URL 정보와 서브모듈에서 사용할 커밋을 가리키는 gitlink가 남는다. [Git의 서브모듈 구조 설명](https://git-scm.com/docs/gitsubmodules)

```text
application/
├── .gitmodules
├── src/
└── security/       # 독립적인 저장소, 부모는 특정 커밋을 기록
```

private 저장소로 분리하면 그 저장소의 접근 권한을 따로 관리할 수 있다. 다만 Submodule 자체가 비밀 정보를 암호화하거나 배포 산출물에서 숨겨 주는 기능은 아니다. 파일을 JAR에 복사하면 그 값은 산출물에도 포함된다.

실제 비밀번호·키는 환경 변수나 별도 비밀 관리 수단으로 주입하고, 저장소에는 민감 값이 없는 설정 템플릿을 두는 방향이 관리하기 쉽다. 이미 공개된 값은 파일을 옮기는 것만으로 노출이 취소되지 않는다.

## 추가하고 부모 저장소에 기록하기

다음 URL은 예시다. GitHub 주소의 `ORG`는 저장소를 소유한 계정이나 조직이지, 부모 저장소 이름이 아니다.

```bash
git submodule add git@github.com:ORG/security.git security
git status
git add .gitmodules security
git commit -m "chore: 설정 저장소를 서브모듈로 연결"
git push origin main
```

`.gitmodules`에는 다음과 같은 정보가 생긴다.

```ini
[submodule "security"]
    path = security
    url = git@github.com:ORG/security.git
```

서브모듈 내부 파일을 부모 저장소에 다시 추가하는 것이 아니다. 부모에서는 연결 정보와 사용할 커밋을 기록한다.

## 팀원이 같은 버전을 가져오는 방법

처음 클론할 때는 다음 명령으로 서브모듈까지 가져올 수 있다.

```bash
git clone --recurse-submodules git@github.com:ORG/application.git
```

이미 클론했다면 부모 저장소에서 실행한다.

```bash
git submodule update --init --recursive
```

부모 저장소의 새 커밋을 받은 뒤에도 같은 명령으로 부모가 기록한 서브모듈 커밋에 맞춘다. `--init`을 다시 붙여도 이미 초기화된 서브모듈에는 불필요한 초기화를 반복하지 않는다.

```bash
git pull --ff-only
git submodule update --init --recursive
```

작업 중인 변경은 먼저 `git status`로 확인한다. 위 명령과 `git submodule update --remote`는 목적이 다르다. 전자는 부모가 지정한 버전, 후자는 원격 추적 브랜치의 커밋을 가져오는 용도다. `foreach git pull`을 항상 덧붙일 필요는 없다. [git-submodule 명령 설명](https://git-scm.com/docs/git-submodule)

## 서브모듈을 직접 수정할 때의 순서

기본 업데이트 후에는 서브모듈이 detached HEAD 상태일 수 있다. 특정 커밋을 재현하기 위한 정상 동작이다. 여기서 새 작업을 하려면 브랜치를 만든 뒤 커밋한다. 다음은 `main`에 병합한 결과를 부모 저장소에 반영하는 예시다.

```bash
# 서브모듈 내부: 작업 브랜치 생성 후 수정·커밋·push
git -C security switch -c chore/update-config
git -C security add application-template.yml
git -C security commit -m "chore: 배포 설정 템플릿 보완"
git -C security push -u origin chore/update-config
```

서브모듈 저장소에서 해당 변경을 검토·병합한 다음 부모에서 반영할 커밋을 선택한다.

```bash
git -C security fetch origin
git -C security switch --detach origin/main
git diff --submodule=log
git add security
git commit -m "chore: 설정 저장소 참조 갱신"
git push origin main
```

핵심은 **서브모듈 커밋을 원격에 먼저 올린 뒤 부모의 참조를 올리는 것**이다. [Git 공식 책의 서브모듈 변경 흐름](https://git-scm.com/book/en/v2/Git-Tools-Submodules) 원격 추적 브랜치를 자동으로 따라갈 필요가 있다면 아래 방법도 가능하지만, 바뀐 커밋은 확인하고 부모에서 별도로 커밋해야 한다.

```bash
git submodule set-branch --branch main security
git submodule update --remote security
git diff --submodule=log
git add .gitmodules security
git commit -m "chore: 설정 저장소 추적 브랜치와 참조 갱신"
```

## not our ref는 detached HEAD 때문일까

당시 다음 오류를 보고 detached HEAD가 원인이라고 생각했다.

```text
remote error: upload-pack: not our ref <commit>
```

하지만 detached HEAD 자체는 오류가 아니다. 이 메시지를 만나면 **부모가 요구한 커밋을 해당 원격에서 제공할 수 있는지** 확인해야 한다. 서브모듈 커밋을 push하지 않았거나, 이력을 바꿨거나, 다른 저장소 URL을 가리키는 경우 등을 살펴본다. 서버의 커밋 제공 정책이나 제한된 fetch 조건도 영향을 줄 수 있다.

```bash
git ls-tree HEAD security
git -C security remote -v
git -C security log -1 --oneline
git -C security fetch origin
```

부모가 가리키는 커밋과 서브모듈 원격에 올라간 이력을 대조한다. 단순히 서브모듈을 `main`으로 바꾸면 부모의 참조와 다른 상태가 될 뿐, 다른 팀원도 같은 커밋을 가져올 수 있다는 보장은 없다.

## Repository not found와 인증 확인

private 서브모듈을 클론할 때는 다음 오류도 발생했다.

```text
remote: Repository not found.
```

당시에는 SSH 인증을 설정한 뒤 접근할 수 있었다. 다만 이 오류는 URL 오류나 저장소 접근 권한 부족으로도 발생할 수 있다. HTTPS에서 SSH로 바꾸는 것만으로 권한이 생기지는 않는다. SSH 키가 연결된 계정에도 저장소 읽기 권한이 있어야 한다. [GitHub의 Repository not found 점검 안내](https://docs.github.com/en/repositories/creating-and-managing-repositories/troubleshooting-cloning-errors#repository-not-found)

```bash
ssh -T git@github.com
git ls-remote git@github.com:ORG/security.git
```

첫 명령은 GitHub 계정 인증을, 두 번째는 대상 저장소 접근을 확인하는 데 쓴다. GitHub의 SSH 인증 성공 메시지가 나와도 셸 접근을 제공하지 않는다는 문구와 함께 종료 코드 1이 반환될 수 있다. [GitHub의 SSH 연결 테스트](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)

공유 URL을 바꿨다면 `.gitmodules`를 수정해 커밋하고 로컬 설정도 동기화한다.

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

## Gradle에서 설정 파일을 포함해야 한다면

애플리케이션에 포함해도 되는 설정 템플릿은 `src/main/resources`에 복사해 소스 트리를 변경하기보다 리소스 처리 작업의 입력으로 지정할 수 있다. 다음은 Gradle Groovy DSL 예시다.

```groovy
tasks.named('processResources') {
    from('security') {
        include 'application-template.yml'
    }
}
```

이 파일은 빌드 결과물에 포함된다. 같은 경로에 기존 파일이 있다면 중복 처리도 확인해야 한다. 런타임에 주입할 실제 비밀 값은 이 복사 대상과 구분한다. [Gradle의 파일 복사와 입력 구성](https://docs.gradle.org/current/userguide/working_with_files.html)

## GitHub Actions에서 private 서브모듈 가져오기

체크아웃 단계에도 서브모듈 접근 권한이 필요하다. 아래는 공식 문서에서 확인한 `actions/checkout@v7`을 이용한 예시다. 자체 호스팅 러너를 쓴다면 해당 버전의 러너 요구사항도 확인해야 한다.

```yaml
permissions:
  contents: read

steps:
  - name: Checkout with submodules
    uses: actions/checkout@v7
    with:
      submodules: recursive
      token: ${{ secrets.SUBMODULE_READ_TOKEN }}
      persist-credentials: false
```

일반적인 `GITHUB_TOKEN`은 현재 저장소 범위이므로 별도 private 저장소 읽기에 충분하지 않을 수 있다. 예시의 토큰에는 부모와 서브모듈 저장소를 읽을 수 있는 범위를 부여해야 한다. GitHub App 설치 토큰 등 조직에서 사용하는 인증 방식을 선택할 수도 있다. `submodules: true`는 직접 서브모듈을, `recursive`는 중첩된 서브모듈까지 가져온다. [actions/checkout의 인증·서브모듈 옵션](https://github.com/actions/checkout)

이번에 겪은 오류는 “폴더 안에 저장소가 있다”는 수준으로 이해했을 때 구분하기 어려웠다. **누가 접근할 수 있는가, 어느 원격인가, 어떤 커밋을 요구하는가**를 나눠 보면 인증 문제와 버전 참조 문제를 따로 추적할 수 있다.
