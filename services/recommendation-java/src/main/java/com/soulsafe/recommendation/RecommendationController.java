package com.soulsafe.recommendation;

import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/recommendation")
public class RecommendationController {

    @PostMapping("/decide")
    public Map<String, Object> decide(@RequestBody Map<String, Object> payload) {
        String sentiment = String.valueOf(payload.getOrDefault("sentiment", "neutral"));
        String action = "unlock-now";

        if ("sad".equalsIgnoreCase(sentiment) || "grief".equalsIgnoreCase(sentiment)) {
            action = "delay-24h";
        }

        return Map.of(
            "action", action,
            "reason", "rule-based recommendation v1",
            "input", payload
        );
    }
}
