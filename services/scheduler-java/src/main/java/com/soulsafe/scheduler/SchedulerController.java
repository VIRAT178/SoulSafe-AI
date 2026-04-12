package com.soulsafe.scheduler;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/scheduler")
public class SchedulerController {

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
}
