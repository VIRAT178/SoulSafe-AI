package com.soulsafe.scheduler;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/scheduler")
public class SchedulerController {

    private final Set<String> processedEventKeys = ConcurrentHashMap.newKeySet();

    record EventMetadata(String personName, String eventName) {
    }

    record EventRule(String type, String date, EventMetadata metadata) {
    }

    record EvaluateEventRequest(String capsuleId, String now, EventRule rule) {
    }

    record EvaluateEventResponse(
            String capsuleId,
            boolean triggered,
            String triggerType,
            String eventName,
            String decisionReason,
            String idempotencyKey,
            String evaluatedAt) {
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "scheduler-java");
    }

    @PostMapping("/simulate-unlock")
    public Map<String, Object> simulateUnlock(@RequestBody Map<String, String> payload) {
        return Map.of(
            "capsuleId", payload.get("capsuleId"),
            "simulatedAt", Instant.now().toString(),
            "event", "unlock-ready"
        );
    }

    @PostMapping("/evaluate-event")
    public EvaluateEventResponse evaluateEvent(@RequestBody EvaluateEventRequest payload) {
        Instant now = parseInstant(payload.now(), Instant.now());
        EventRule rule = payload.rule();

        if (rule == null || rule.type() == null || rule.type().isBlank()) {
            return new EvaluateEventResponse(
                    payload.capsuleId(),
                    false,
                    "none",
                    null,
                    "No event rule configured",
                    null,
                    now.toString());
        }

        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate eventDate = parseDate(rule.date(), today);
        String ruleType = rule.type().toLowerCase(Locale.ROOT);
        boolean triggered;

        if ("birthday".equals(ruleType)) {
            triggered = today.getMonthValue() == eventDate.getMonthValue() && today.getDayOfMonth() == eventDate.getDayOfMonth();
        } else {
            triggered = !today.isBefore(eventDate);
        }

        String eventName = rule.metadata() != null && rule.metadata().eventName() != null && !rule.metadata().eventName().isBlank()
                ? rule.metadata().eventName()
                : capitalizeRuleType(ruleType);

        String idempotencyKey = payload.capsuleId() + ":" + ruleType + ":" + today;
        if (triggered && !processedEventKeys.add(idempotencyKey)) {
            triggered = false;
        }

        String reason = triggered
                ? "Triggered by saved event: " + eventName
                : "Event condition not matched yet";

        return new EvaluateEventResponse(
                payload.capsuleId(),
                triggered,
                triggered ? "event" : "none",
                eventName,
                reason,
                idempotencyKey,
                now.toString());
    }

    private static Instant parseInstant(String value, Instant fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private static LocalDate parseDate(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }

        try {
            return Instant.parse(value).atZone(ZoneOffset.UTC).toLocalDate();
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private static String capitalizeRuleType(String value) {
        if (value == null || value.isBlank()) {
            return "Event";
        }

        return Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }
}
