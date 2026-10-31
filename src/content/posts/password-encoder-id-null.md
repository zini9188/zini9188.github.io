---
title: "PasswordEncoder의 id null 오류 원인과 해결"
description: "비밀번호 비교 순서와 저장 형식 점검"
pubDate: 2026-11-01
category: development
tags: [Java, Spring Security, Security, Troubleshooting]
draft: false
---

Spring Security로 로그인을 구현하던 중 다음 오류를 만났다. 한 번 해결했다고 생각했는데 회원 수정 기능을 만든 뒤 같은 오류가 다시 발생했다.

```text
There is no PasswordEncoder mapped for the id "null"
```

첫 번째는 비밀번호 비교 메서드의 인자 순서가 문제였고, 두 번째는 수정된 비밀번호를 평문으로 저장한 것이 문제였다. 메시지는 같았지만 확인해야 할 경로는 달랐다.

## 오류의 id는 회원 ID가 아니다

`PasswordEncoder`는 비밀번호를 저장할 때 인코딩하고, 로그인 시 입력값과 저장값을 비교하는 인터페이스다. 비밀번호 저장에는 보통 단방향 해시 기반 방식을 사용한다. 복호화해서 원문을 꺼내 비교하는 구조가 아니다.

`DelegatingPasswordEncoder`는 저장값 앞의 식별자로 사용할 인코더를 고른다. 형식은 `{id}encodedPassword`이며, 예를 들어 `{bcrypt}` 뒤에 BCrypt 해시가 붙는다. 식별자가 없으면 `id`가 null이 될 수 있고, 기본 동작에서는 매핑된 인코더를 찾지 못해 예외가 발생한다. [DelegatingPasswordEncoder API](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/crypto/password/DelegatingPasswordEncoder.html)

| 저장값의 형태 | 구분 |
| --- | --- |
| `{bcrypt}` + BCrypt 해시 | DelegatingPasswordEncoder가 bcrypt 식별자로 인코더 선택 |
| `$2a$…` 또는 `$2b$…` 등 | BCrypt 해시일 수 있지만 위임 인코더의 식별자는 없는 형태 |
| 평문 문자열 | 해시 저장이 되지 않은 값 |

따라서 이 오류가 반드시 “비밀번호를 평문으로 저장했다”는 뜻은 아니다. BCrypt로 해시했어도 현재 사용하는 인코더가 기대하는 형식과 다르면 발생할 수 있다. 반대로 모든 `PasswordEncoder`가 `{id}` 형식을 요구하는 것도 아니다. `BCryptPasswordEncoder`를 직접 쓰는 경우와 위임 인코더를 쓰는 경우를 구별해야 한다.

## 첫 번째 원인: matches 인자를 반대로 전달했다

회원가입 후 로그인하는 과정에서 비밀번호 비교를 직접 호출하고 있었다. 메서드 정의는 다음과 같다.

```java
boolean matches(CharSequence rawPassword, String encodedPassword);
```

첫 번째는 사용자가 입력한 원문, 두 번째는 DB에서 가져온 저장값이다. 순서를 반대로 전달하면 위임 인코더가 입력 비밀번호에서 저장 형식의 식별자를 찾으려 하므로 오류가 날 수 있다.

```java
// 잘못된 순서
passwordEncoder.matches(member.getPassword(), request.getPassword());

// 올바른 순서
passwordEncoder.matches(request.getPassword(), member.getPassword());
```

당시에는 저장값에 문제가 있다고 생각했지만, 인자 순서를 바꾸는 것으로 이 경로의 오류를 해결했다. 입력값을 다시 `encode()`한 뒤 저장 문자열과 직접 비교하는 방식도 사용하지 않는다. 같은 원문을 인코딩해도 솔트 때문에 결과가 달라질 수 있으므로 `matches()`로 검증한다. [Spring Security의 비밀번호 저장 설명](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html)

## 두 번째 원인: 비밀번호 수정 경로를 놓쳤다

이후 DB에 저장된 회원으로 로그인을 시험하다가 같은 오류를 다시 만났다. 이번에는 `AuthenticationManager`에 인증을 맡기는 경로를 디버깅했다.

```java
Authentication authentication = authenticationManager.authenticate(
    new UsernamePasswordAuthenticationToken(
        request.getEmail(),
        request.getPassword()
    )
);
```

일반적인 DAO 기반 인증에서는 `ProviderManager`가 처리 가능한 공급자를 찾고, `DaoAuthenticationProvider`가 `UserDetailsService`로 회원을 조회한 뒤 `PasswordEncoder`로 비밀번호를 비교한다. 토큰 타입만으로 공급자가 무조건 결정되는 것은 아니며, 등록된 공급자와 `supports()` 결과에 따라 처리된다. [인증 구조](https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html), [DaoAuthenticationProvider의 동작](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/dao-authentication-provider.html)

비교 직전 `UserDetails.getPassword()`에 전달되는 값을 확인하다가, 회원가입 때는 해시했지만 **회원 수정 때 변경한 비밀번호는 그대로 저장하고 있었다는 점**을 발견했다. 가입 로직만 확인해서는 찾기 어려운 문제였다.

다음은 저장 경로를 나누어 보는 예시다. 엔티티와 요청 객체의 세부 코드는 생략했다.

```java
@Bean
PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
}

// 회원가입: 입력 원문을 인코딩해 저장한다.
String encoded = passwordEncoder.encode(request.getPassword());
Member member = new Member(request.getEmail(), encoded);
memberRepository.save(member);

// 비밀번호 변경: 새 비밀번호도 동일한 인코더로 처리한다.
String changed = passwordEncoder.encode(request.getNewPassword());
member.changePassword(changed);
```

실제 변경 기능에는 본인 확인과 변경 권한 검사가 필요하다. 비밀번호 변경이 없는 일반 프로필 수정에서는 기존 저장값을 그대로 유지해야 한다. 기존 해시를 다시 인코딩해도 원래 비밀번호로 로그인할 수 없게 된다.

## 값을 노출하지 않고 확인하기

문제를 찾을 때 회원가입 응답에 비밀번호 값을 넣어 확인한 적이 있다. 이 방법은 사용하지 않아야 한다. 평문뿐 아니라 해시도 API 응답, 로그, 화면 캡처에 남기지 않는 편이 맞다.

대신 외부로 전달하지 않는 테스트 데이터로 가입과 변경 후 로그인을 검증한다. 저장값과 원문이 다르다는 검사만으로 끝내지 말고, 기대한 인코더로 비교가 성공하는지까지 확인해야 한다.

```java
String raw = "test-only-password";
String stored = passwordEncoder.encode(raw);

assertNotEquals(raw, stored);
assertTrue(passwordEncoder.matches(raw, stored));
assertFalse(passwordEncoder.matches("wrong-test-password", stored));
```

실제 서비스 테스트에서는 가입 후 로그인, 비밀번호 변경 후 새 비밀번호 로그인, 이전 비밀번호 실패까지 확인한다. 비밀번호와 무관한 프로필 수정 뒤에도 로그인이 유지되는지 확인하면 저장 경로의 실수를 찾는 데 도움이 된다.

## 이미 저장된 값이 있다면

접두사가 없는 기존 BCrypt 해시와 평문 비밀번호를 같은 방식으로 다뤄서는 안 된다. 먼저 데이터 형식과 실제 인증 설정을 확인해야 한다. 검증된 기존 BCrypt 해시에는 식별자를 붙이는 마이그레이션을 검토할 수 있지만, 평문 앞에 `{bcrypt}`만 붙인다고 해시로 바뀌지는 않는다.

기존 값이 잘못 저장됐다면 정상적인 비밀번호 재설정이나 검증된 전환 절차로 복구해야 한다. 로그인 예외를 없애려고 평문 비교를 기본 처리로 추가하면 저장 문제를 감출 수 있다.

이번 문제를 통해 비밀번호 처리는 로그인 메서드 하나가 아니라 **가입·변경·재설정·기존 데이터까지 연결해서 확인해야 하는 기능**이라는 점을 배웠다. 같은 오류가 다시 나타났을 때도 메시지만 보고 이전 해결책을 반복하기보다, 저장부터 인증까지 값이 이동하는 경로를 다시 보는 것이 필요했다.
