---
title: "[우아콘] QueryDSL 정리"
description: "우아콘 발표를 바탕으로 정리한 QueryDSL 활용법"
pubDate: 2026-11-01
category: development
tags: [Java, JPA, QueryDSL]
draft: false
---

우아콘의 QueryDSL 발표 내용을 바탕으로 정리한 글이다. 설정과 동적 쿼리 작성, 성능 개선을 중심으로 정리하고, 코드 예시와 주의사항은 공식 문서를 참고해 보완했다.

## QueryDSL을 사용하는 이유

문자열 JPQL은 조건이 많아질수록 조합과 수정이 번거롭다. QueryDSL은 자바 코드와 Q 클래스로 쿼리를 표현하므로 필드명과 타입을 확인하면서 작성할 수 있고, IDE 자동완성도 활용할 수 있다.

Q 클래스는 엔티티의 속성과 구조를 표현하는 쿼리용 메타데이터다. 예를 들어 `Member` 엔티티에 대응하는 `QMember`를 이용해 `member.name.eq(name)`처럼 조건을 만든다.

타입 검사가 데이터베이스의 제약 조건이나 실행 계획까지 보장하는 것은 아니다. 컴파일 단계에서 확인할 부분과 실제 SQL로 검증할 부분을 나눠 봐야 한다.

## 환경 설정과 Q 클래스 생성

예시 환경은 Spring Boot 3.2.1, QueryDSL 5.0.0, Gradle 8.5다. Spring Boot 3에서 사용하는 Jakarta Persistence에 맞춰 QueryDSL의 `jakarta` 분류자를 사용한다. 아래 의존성은 Spring Boot 플러그인과 의존성 관리가 적용된 Gradle 프로젝트를 전제로 한다.

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'

    implementation 'com.querydsl:querydsl-jpa:5.0.0:jakarta'
    annotationProcessor 'com.querydsl:querydsl-apt:5.0.0:jakarta'
    annotationProcessor 'jakarta.annotation:jakarta.annotation-api'
    annotationProcessor 'jakarta.persistence:jakarta.persistence-api'
}
```

JPA 모듈과 어노테이션 프로세서의 버전을 맞춘다. `querydsl-apt`가 엔티티를 처리해 Q 클래스를 생성하므로, 설정을 바꾼 뒤에는 `./gradlew clean compileJava`로 생성 여부를 확인한다. Gradle Java 플러그인의 기본 생성 경로는 `build/generated/sources/annotationProcessor/java/main`이다. 생성 파일을 직접 수정하지 않고 엔티티와 빌드 설정을 수정한 뒤 다시 생성한다.

QueryDSL 5.0의 Jakarta 지원은 [공식 릴리스 설명](https://github.com/querydsl/querydsl/releases/tag/QUERYDSL_5_0_0)에서 확인할 수 있다.

### JPAQueryFactory 빈 등록

여러 조회 클래스에서 사용할 수 있도록 `JPAQueryFactory`를 Spring 빈으로 등록한다. Persistence 관련 타입은 `jakarta.persistence` 패키지를 사용한다.

```java
@Configuration
public class QueryDslConfig {

    @PersistenceContext
    private EntityManager entityManager;

    @Bean
    public JPAQueryFactory jpaQueryFactory() {
        return new JPAQueryFactory(entityManager);
    }
}
```

## 저장소 구조는 필요한 만큼만

QueryDSL을 사용하기 위해 매번 커스텀 인터페이스와 구현체를 만들 필요는 없다. 읽기 전용 쿼리를 모으는 일반 Spring 빈에 `JPAQueryFactory`를 주입하는 방식도 가능하다.

반대로 기존 Spring Data 저장소에 기능을 합치고 싶다면 저장소 프래그먼트를 사용할 수 있다. 기본 구현 접미사가 `Impl`인 것은 이 조합 방식의 규칙이며, 모든 QueryDSL 클래스가 반드시 따라야 하는 규칙은 아니다. [Spring Data JPA의 커스텀 저장소 설명](https://docs.spring.io/spring-data/jpa/reference/repositories/custom-implementations.html)

```java
public interface MemberRepositoryCustom {
    List<Member> findByName(String name);
}

public class MemberRepositoryCustomImpl implements MemberRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    public MemberRepositoryCustomImpl(JPAQueryFactory queryFactory) {
        this.queryFactory = queryFactory;
    }

    @Override
    public List<Member> findByName(String name) {
        return queryFactory.selectFrom(member)
                .where(member.name.eq(name))
                .fetch();
    }
}

public interface MemberRepository
        extends JpaRepository<Member, Long>, MemberRepositoryCustom {
}
```

예시의 `member`는 `QMember.member`를 정적 임포트한 것이다. 구현체는 저장소 프래그먼트 검색 범위 안에 둔다. 이 방식은 CRUD 저장소와 커스텀 조회를 하나의 인터페이스로 사용하고 싶을 때 선택한다. 조회 기능을 별도 빈으로 분리해도 충분한 경우에는 불필요하게 인터페이스를 늘릴 필요가 없다.

## 동적 조건은 메서드로 분리하기

`BooleanBuilder`가 잘못된 방식은 아니다. 다만 조건이 늘어날 때 쿼리의 의도를 읽기 쉽도록, 개별 조건을 `BooleanExpression`을 반환하는 메서드로 분리할 수 있다.

```java
BooleanBuilder builder = new BooleanBuilder();

if (StringUtils.hasText(name)) {
    builder.and(member.name.eq(name));
}
if (StringUtils.hasText(address)) {
    builder.and(member.address.eq(address));
}

return queryFactory.selectFrom(member)
        .where(builder)
        .orderBy(member.id.desc())
        .limit(100)
        .fetch();
```

조건이 적을 때는 위 코드도 충분히 읽기 쉽다. 여러 조회에서 같은 조건을 사용한다면 다음처럼 조건 메서드를 분리해 재사용할 수 있다. 예시의 `StringUtils`는 Spring의 `org.springframework.util.StringUtils`다.

아래는 `Member`와 생성된 `QMember`, 주입된 `queryFactory`가 있다는 전제의 메서드 예시다.

```java
public List<Member> search(String name, String address) {
    return queryFactory
            .selectFrom(member)
            .where(nameEq(name), addressEq(address))
            .orderBy(member.id.desc())
            .limit(100)
            .fetch();
}

private BooleanExpression nameEq(String name) {
    return StringUtils.hasText(name)
            ? member.name.eq(name)
            : null;
}

private BooleanExpression addressEq(String address) {
    return StringUtils.hasText(address)
            ? member.address.eq(address)
            : null;
}
```

QueryDSL 5.0.0의 `where`는 null 인자를 건너뛴다. 따라서 모든 조건이 null이면 검색 조건이 사라질 수 있다. 위 예시는 조회량을 100건으로 제한했지만, 조건 없는 검색을 허용할지는 서비스 요구사항에 맞게 정해야 한다. [QueryBase 5.0.0 구현](https://github.com/querydsl/querydsl/blob/QUERYDSL_5_0_0/querydsl-core/src/main/java/com/querydsl/core/support/QueryBase.java)

## 존재 여부만 필요하면 한 건만 조회하기

전체 개수가 필요하지 않다면 존재 여부를 확인하기 위한 조회를 따로 작성할 수 있다.

```java
public boolean existsMember(Long memberId) {
    Integer result = queryFactory
            .selectOne()
            .from(member)
            .where(member.id.eq(memberId))
            .fetchFirst();

    return result != null;
}
```

QueryDSL 5.0.0의 `fetchFirst()`는 `limit(1).fetchOne()`으로 구현돼 있다. 위 코드는 한 건 조회 결과의 유무를 확인하는 방식이다. [FetchableQueryBase 5.0.0 구현](https://github.com/querydsl/querydsl/blob/QUERYDSL_5_0_0/querydsl-core/src/main/java/com/querydsl/core/support/FetchableQueryBase.java)

다만 이 예시만으로 모든 `exists()` API가 COUNT로 동작한다고 결론 내리면 안 된다. 사용하는 API와 라이브러리 버전의 구현, 생성된 SQL을 구분해서 확인해야 한다.

## 조회 성능은 생성된 SQL로 확인하기

### 조인과 DTO 조회

묵시적 조인을 무조건 CROSS JOIN이라고 설명하면 환경에 따라 맞지 않을 수 있다. Hibernate 6.4 문서는 묵시적 연관 조인을 내부 조인으로 설명한다. 조회 의도를 드러내도록 명시적 조인을 작성하고, 실제 생성된 SQL과 실행 계획에서 조인 조건을 확인하는 편이 좋다. [Hibernate 6.4 HQL 가이드](https://docs.hibernate.org/orm/6.4/querylanguage/html_single/)

엔티티 상태를 변경해야 하는 작업과 화면에 필요한 값만 읽는 작업도 구분한다. DTO 조회는 필요한 컬럼만 가져오는 방법이지만, 엔티티 조회 자체를 항상 피해야 한다는 뜻은 아니다. 실제 사용하는 필드와 연관 관계 접근에서 발생하는 쿼리를 함께 확인한다.

```java
public record MemberSummary(Long id, String name) {}

public List<MemberSummary> findSummaries() {
    return queryFactory
            .select(Projections.constructor(
                    MemberSummary.class,
                    member.id,
                    member.name))
            .from(member)
            .orderBy(member.id.desc())
            .limit(100)
            .fetch();
}
```

조회 결과에 필요한 `id`, `name`만 선택하는 예시다. `Projections.constructor`를 사용할 때는 DTO 생성자의 인자 순서와 타입이 조회식과 맞아야 한다. `bean`, `fields` 방식은 각각 프로퍼티와 필드에 값을 채우는 방식이다. [QueryDSL 5.0.0 Projections 구현](https://github.com/querydsl/querydsl/blob/QUERYDSL_5_0_0/querydsl-core/src/main/java/com/querydsl/core/types/Projections.java)

요청에서 이미 알고 있는 값은 데이터베이스에서 다시 읽어야 하는지 먼저 살펴본다. 반환 DTO에만 필요한 값이라면 조회 후 애플리케이션에서 조합할 수 있다. `.as()`는 별칭을 부여하는 표현이므로, 사용했다는 이유만으로 SELECT 항목이 사라지는 것은 아니다.

엔티티를 DTO 안에 그대로 넣으면 연관 객체 접근으로 추가 조회가 발생할 여지도 남는다. 단순 값 조회가 목적이면 필요한 값이나 식별자를 선택한다. `distinct`도 어떤 SELECT 항목을 기준으로 중복을 제거하는지와 실제 SQL을 함께 확인한다.

### OneToOne과 N+1

`@OneToOne`이면 무조건 N+1이 발생하는 것은 아니다. 연관 관계의 방향과 소유 측, 조회 전략, Hibernate 설정에 따라 동작이 달라진다. Hibernate 문서에서도 양방향 관계의 부모 측 지연 로딩에서 추가 조회가 생길 수 있다는 점과 바이트코드 향상 설정을 구분해 설명한다. [Hibernate OneToOne 가이드](https://docs.hibernate.org/orm/current/userguide/html_single/#associations-one-to-one)

### MySQL의 GROUP BY 정렬

`ORDER BY NULL` 최적화는 데이터베이스 버전과 함께 봐야 한다. MySQL 8.0에서는 GROUP BY의 암묵적 정렬이 제거됐으므로, 이를 억제하려고 `ORDER BY NULL`을 덧붙일 필요가 없다. 특정 순서가 필요하다면 ORDER BY를 명시한다. 실제 filesort 여부는 쿼리와 인덱스에 따른 실행 계획으로 확인한다. [MySQL 8.0 정렬 최적화 문서](https://dev.mysql.com/doc/refman/8.0/en/order-by-optimization.html)

결과가 작다는 이유만으로 항상 애플리케이션에서 정렬하는 것도 적절하지 않다. 이미 조회한 작은 결과를 후처리하는 상황인지, 전체 결과에서 정렬된 상위 N개를 가져와야 하는 상황인지 구분한다. 특히 페이지 조회는 정렬 기준과 페이지 범위를 함께 결정해야 하므로, 일부 결과만 가져온 뒤 정렬하는 방식과 같은 결과라고 볼 수 없다.

## 벌크 업데이트와 영속성 컨텍스트

대량 변경에 벌크 업데이트를 사용하면 엔티티를 하나씩 조회하고 수정하는 과정을 줄일 수 있다. 대신 데이터베이스 변경 결과가 이미 관리 중인 엔티티 상태에 자동으로 반영되지는 않는다.

같은 영속성 컨텍스트에서 수행하는 간단한 예시는 다음과 같다.

```java
@Transactional
public long renameMembers(Long lastId, String name) {
    entityManager.flush();

    long updated = queryFactory.update(member)
            .set(member.name, name)
            .where(member.id.loe(lastId))
            .execute();

    entityManager.clear();
    return updated;
}
```

먼저 보류된 변경을 반영한 뒤 벌크 쿼리를 수행하고, 이후에는 오래된 엔티티 상태를 재사용하지 않도록 컨텍스트를 비우는 방식이다. `clear()`는 해당 컨텍스트의 모든 관리 엔티티를 분리하므로 트랜잭션 범위와 후속 로직까지 고려해야 한다. 벌크 변경은 낙관적 잠금 검사를 우회하므로 버전 관리가 필요하면 별도로 설계한다. [Jakarta Persistence 3.1 명세](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html)

반면 엔티티 단건의 비즈니스 규칙을 처리하고 변경 감지를 활용해야 한다면, 엔티티를 조회한 뒤 상태를 변경하는 방식이 더 자연스러울 수 있다. 벌크 처리를 선택할 때는 속도뿐 아니라 생략되는 엔티티 처리 과정도 고려한다.

## 대량 INSERT는 별도로 설계하기

JPA의 `persist()`는 새로운 엔티티를 영속화하는 용도이고, `merge()`는 전달된 상태를 관리 엔티티에 복사하는 동작이다. 따라서 `merge()`를 단순한 빠른 INSERT 수단으로 취급하지 않는다. 두 메서드의 동작은 [Jakarta Persistence 명세](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html)에서 구분하고 있다.

대량 입력이 주된 목적이라면 JDBC 배치와 `JdbcTemplate` 같은 방법도 비교할 수 있다. 다음 조건을 함께 측정한다.

- 한 번에 처리하는 데이터량과 배치 크기
- 식별자 생성 전략과 실제 JDBC 배치 적용 여부
- 트랜잭션 범위와 실패 시 재처리 방법
- JPA 사용 시 영속성 컨텍스트가 차지하는 메모리

JDBC로 직접 SQL을 작성하면 테이블명과 컬럼명, 파라미터 매핑도 직접 관리해야 한다. QueryDSL JPA로 쿼리를 작성할 때와 같은 수준의 타입 검사를 기대하기 어렵다는 점을 함께 고려한다. 성능 차이를 고정된 배수로 단정하기보다 같은 환경과 데이터로 비교한다.
