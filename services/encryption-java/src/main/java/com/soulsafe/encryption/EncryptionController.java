package com.soulsafe.encryption;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/encryption")
public class EncryptionController {

    @PostMapping("/encrypt")
    public Map<String, String> encrypt(@RequestBody Map<String, String> payload) {
        String plaintext = payload.getOrDefault("plaintext", "");
        String cipher = Base64.getEncoder().encodeToString(plaintext.getBytes(StandardCharsets.UTF_8));
        return Map.of("ciphertext", cipher, "algorithm", "base64-demo-only");
    }

    @PostMapping("/decrypt")
    public Map<String, String> decrypt(@RequestBody Map<String, String> payload) {
        String ciphertext = payload.getOrDefault("ciphertext", "");
        String plaintext = new String(Base64.getDecoder().decode(ciphertext), StandardCharsets.UTF_8);
        return Map.of("plaintext", plaintext);
    }
}
