package com.soulsafe.recommendation;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/recommendation")
public class RecommendationController {

    private static List<String> asStringList(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }

        return items.stream().map(String::valueOf).toList();
    }

    @PostMapping("/decide")
    public Map<String, Object> decide(@RequestBody Map<String, Object> payload) {
        String triggerType = String.valueOf(payload.getOrDefault("triggerType", "date")).toLowerCase(Locale.ROOT);
        String eventName = payload.get("eventName") == null ? null : String.valueOf(payload.get("eventName"));
        double sentimentScore = payload.get("sentimentScore") instanceof Number n ? n.doubleValue() : 0;
        double emotionSimilarityScore = payload.get("emotionSimilarityScore") instanceof Number n ? n.doubleValue() : 0;
        List<String> contextTags = asStringList(payload.get("contextTags"));

        String action = "unlock-now";
        String decisionReason;
        String reason;
        int priorityScore;

        if ("event".equals(triggerType)) {
            String safeEventName = (eventName == null || eventName.isBlank()) ? "your saved event" : eventName;
            decisionReason = "Triggered by your saved event: " + safeEventName;
            reason = "event-trigger-priority";
            priorityScore = 100;
        } else if (emotionSimilarityScore >= 0.72 || contextTags.stream().anyMatch(tag -> tag.toLowerCase(Locale.ROOT).contains("mood"))) {
            decisionReason = "Your recent mood matches this memory";
            reason = "emotion-similarity-match";
            priorityScore = 85;
        } else {
            decisionReason = "Reached your scheduled unlock date";
            reason = "date-trigger-default";
            priorityScore = 70;
        }

        if (sentimentScore <= -0.55 && !"event".equals(triggerType)) {
            action = "delay-24h";
            reason = "negative-sentiment-delay";
            decisionReason = "Your recent mood indicates emotional strain; unlock delayed by 24h";
            priorityScore = 40;
        }

        return Map.of(
            "action", action,
            "reason", reason,
            "decisionReason", decisionReason,
            "priorityScore", priorityScore,
            "input", payload
        );
    }
}
