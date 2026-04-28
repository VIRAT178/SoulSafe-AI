package com.soulsafe.scheduler;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class WishCapsulePoller {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${soulsafe.api-base-url:http://localhost:4000}")
    private String apiBaseUrl;

    @Scheduled(fixedDelayString = "${wish.scheduler.poll-ms:60000}")
    public void processDueWishCapsules() {
        try {
            String baseUrl = normalizeBaseUrl(apiBaseUrl);
            WishCapsuleSummary[] capsules = restTemplate.getForObject(baseUrl + "/internal/wish-capsules/due", WishCapsuleSummary[].class);
            if (capsules == null || capsules.length == 0) {
                return;
            }

            for (WishCapsuleSummary capsule : capsules) {
                if (capsule == null || capsule.id() == null || capsule.id().isBlank()) {
                    continue;
                }

                if ("manual_approval".equals(capsule.deliveryMode())) {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.APPLICATION_JSON);
                    HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(
                            "reason", "Wish capsule reached its scheduled time and is awaiting approval"), headers);
                    restTemplate.postForEntity(baseUrl + "/internal/wish-capsules/" + capsule.id() + "/request-approval", entity, Map.class);
                } else {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.APPLICATION_JSON);
                    HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(
                            "capsuleId", capsule.id(),
                            "source", "scheduler"), headers);
                    restTemplate.postForEntity(baseUrl + "/internal/send-wish", entity, Map.class);
                }
            }
        } catch (Exception error) {
            System.out.println("Wish capsule poller failed: " + error.getMessage());
        }
    }

    private static String normalizeBaseUrl(String url) {
        if (url == null) {
            return "http://localhost:4000";
        }

        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    record WishCapsuleSummary(
            String id,
            String userId,
            String type,
            String title,
            String status,
            String deliveryMode,
            String scheduledAt,
            Map<String, Object> recipient,
            String occasionType,
            String emailTemplateId) {
    }
}