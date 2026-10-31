---
title: "JPA 송신자·수신자 매핑의 중복 컬럼 오류"
description: "송신자·수신자 외래키 매핑과 컬럼명 구분"
pubDate: 2026-11-01
category: development
tags: [Java, JPA, Hibernate, Troubleshooting]
draft: false
---

메시지 엔티티에 송신자와 수신자를 추가하다가 매핑 오류를 만났다. 두 필드는 모두 `Member`를 참조하지만, 메시지 안에서는 서로 다른 역할을 가진다.

```text
Repeated column in mapping for entity: message.Message column: member_id
(should be mapped with insert="false" update="false")
```

당시 두 연관 관계를 다음과 같이 선언했다.

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "member_id")
private Member sender;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "member_id")
private Member receiver;
```

두 필드가 같은 엔티티를 참조하는 것 자체는 문제가 아니다. 문제는 둘 다 `Message` 테이블의 **같은 외래키 컬럼을 쓰도록 지정했다는 점**이다. 송신자와 수신자를 각각 저장하려면 컬럼도 구분해야 한다.

## 어느 테이블의 컬럼을 지정하는가

이 글의 `ManyToOne` 매핑에서 두 속성은 다음과 같이 읽으면 된다.

| 속성 | 의미 | 예시 |
| --- | --- | --- |
| name | 현재 엔티티 테이블에 있는 외래키 컬럼 | message.sender_id |
| referencedColumnName | 대상 엔티티 테이블에서 참조할 컬럼 | member.member_id |

여기서 `name`은 외래키 **제약조건의 이름**이 아니라 외래키 **컬럼명**이다. `referencedColumnName`도 “자바 ID 필드명”이라는 뜻은 아니다. 단일 조인 컬럼에서 생략하면 대상 테이블의 기본키 컬럼을 참조한다. [Jakarta Persistence의 JoinColumn 정의](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/JoinColumn.html)

송신자와 수신자 모두 Member의 단일 기본키를 참조하므로 우선 다음처럼 간결하게 매핑할 수 있다.

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "sender_id", nullable = false)
private Member sender;

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "receiver_id", nullable = false)
private Member receiver;
```

이제 관계는 각각 `message.sender_id → member의 PK`, `message.receiver_id → member의 PK`가 된다. 실제 DB에도 두 컬럼과 필요한 제약조건이 있어야 한다. 이미 운영 중인 테이블이라면 어노테이션 변경과 별도로 스키마 변경을 준비해야 한다.

## referencedColumnName을 명시하자 생긴 두 번째 오류

당시에는 참조할 기본키를 명확하게 적으려고 `referencedColumnName = "member_id"`를 넣었다. 그러자 다른 오류가 발생했다.

```text
Unable to find column with logical name: member_id
in org.hibernate.mapping.Table(member)
```

Member의 ID는 다음과 같이 선언되어 있었다.

```java
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long memberId;
```

`referencedColumnName`을 생략하면 동작했고, 당시 환경에서는 `member_id` 대신 `memberId`를 넣어도 동작했다. 처음에는 이 결과를 보고 해당 속성이 DB 컬럼명이 아니라 자바 필드명을 받는다고 생각했다. 그러나 그 결론을 다른 환경에도 적용하면 잘못된 설명이 된다.

## 논리 이름과 물리 이름을 구별하기

Hibernate에는 매핑에서 쓰는 논리 이름과 실제 DB 식별자로 변환하는 물리 이름이 있다. 명시적 컬럼 선언이 없으면 속성에서 논리 이름이 정해지고, 물리 네이밍 전략이 이를 변환할 수 있다. 예를 들어 `memberId`라는 논리 이름이 DB에서는 `member_id`가 되는 식이다. [Hibernate의 네이밍 전략 설명](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#naming)

오류에 `logical name`이 들어 있다는 점은 이름 해석 과정을 확인할 단서다. 다만 당시 Hibernate 버전과 네이밍 설정이 남아 있지 않아 어느 단계에서 불일치했는지까지 확정할 수는 없다. **특정 환경에서 memberId로 동작했다는 관찰과 속성의 일반적인 의미는 구분해야 한다.**

기본키를 참조한다면 `referencedColumnName`을 생략해 불필요한 이름 중복을 줄일 수 있다. 명시가 필요하다면 대상 ID의 컬럼 매핑과 네이밍 전략을 함께 확인한다. 다음은 컬럼 이름을 명시해 의도를 드러내는 예시다.

```java
// Member
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
@Column(name = "member_id")
private Long memberId;

// Message
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(
    name = "sender_id",
    referencedColumnName = "member_id",
    nullable = false
)
private Member sender;
```

이 예시도 프로젝트의 네이밍 전략과 실제 생성 SQL을 확인하며 적용해야 한다. 컬럼 이름을 적었다는 이유만으로 모든 네이밍 전략의 변환이 무효가 되는 것은 아니다.

## insertable=false, updatable=false가 답은 아닌 이유

오류 메시지에 나온 설정은 같은 컬럼을 여러 속성으로 매핑하되 쓰기 책임을 한쪽에만 둘 때 검토할 수 있다. 같은 외래키를 ID 값과 연관 객체 양쪽으로 읽는 경우가 그 예다.

하지만 송신자와 수신자는 서로 다른 값을 가져야 한다. 한쪽을 읽기 전용으로 만들어 오류만 없애면 의도한 두 관계를 저장하지 못한다. 이번 경우에는 **서로 다른 외래키 컬럼을 지정하는 것**이 먼저다.

## 매핑을 확인할 기준

같은 Member를 송신자와 수신자에 넣는 경우만 보면 컬럼이 잘못 연결돼도 놓치기 쉽다. 서로 다른 회원 A·B로 메시지를 저장하고, 영속성 컨텍스트를 비운 뒤 다시 조회해 역할이 유지되는지 확인하는 편이 좋다. 생성된 INSERT와 DB의 두 컬럼도 함께 살펴본다.

이번에 혼동했던 것은 “어떤 엔티티를 참조하는가”와 “어느 컬럼에 값을 저장하는가”였다. 참조 대상이 같아도 관계의 역할이 다르면 저장 위치를 각각 설계해야 한다.
