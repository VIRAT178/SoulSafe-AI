FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src

COPY pom.xml ./
COPY src ./src

RUN mvn -DskipTests package \
    && JAR_FILE=$(ls target/*.jar | grep -v '\.original$' | head -n 1) \
    && cp "$JAR_FILE" /tmp/app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /tmp/app.jar /app/app.jar

EXPOSE 8082
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT:-8082} -jar /app/app.jar"]
