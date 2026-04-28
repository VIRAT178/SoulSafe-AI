"""Message enhancement service using tone-based templates and text processing."""

import re
from app.models import MessageSuggestion, MessageEnhancementRequest


class MessageEnhancer:
    """Generates enhanced message suggestions in different tones."""

    OPENING_TEMPLATES = {
        "friendly": [
            "Hey {name}! ",
            "Hi {name}! ",
            "Hey there, {name}! ",
            "Wishing you an amazing day, {name}! ",
        ],
        "emotional": [
            "{name}, on this special day, ",
            "Dear {name}, ",
            "{name}, I want you to know ",
            "To my wonderful {name}, ",
        ],
        "formal": [
            "Dear {name}, ",
            "To {name}, ",
            "Warmest regards to {name}. ",
            "On this occasion, I wish to express my sentiments to {name}. ",
        ],
    }

    OCCASION_TEMPLATES = {
        "birthday": {
            "friendly": [
                "Happy birthday! Hope you're having the time of your life. ",
                "It's your special day! Make it absolutely amazing. ",
                "Another year older, another year wiser! Enjoy every moment. ",
                "Celebrating you today and all the joy you bring! ",
            ],
            "emotional": [
                "On this day, I celebrate not just your birthday, but the incredible person you are. ",
                "Your birthday is a reminder of how grateful I am for you in my life. ",
                "Wishing you a year filled with growth, love, and beautiful moments. ",
                "You deserve all the happiness in the world on your special day. ",
            ],
            "formal": [
                "Please accept my warmest wishes on your birthday. ",
                "I extend my sincere wishes for your continued success and happiness. ",
                "Wishing you a wonderful birthday celebration. ",
                "On the occasion of your birthday, I wish you health and prosperity. ",
            ],
        },
        "anniversary": {
            "friendly": [
                "Happy anniversary! Here's to more laughs, memories, and love. ",
                "Celebrating the amazing bond you two share! ",
                "Another year of love and adventure together! ",
                "So grateful for your beautiful relationship. ",
            ],
            "emotional": [
                "Your love story is truly inspiring. Wishing you both endless joy and togetherness. ",
                "Here's to the love that grows stronger with every passing year. ",
                "May your anniversary be filled with the same warmth and affection you share every day. ",
                "Celebrating a love that is both rare and beautiful. ",
            ],
            "formal": [
                "Wishing you both a joyful anniversary celebration. ",
                "May this anniversary mark another year of happiness together. ",
                "Warmest wishes for you both on this special occasion. ",
                "Please accept my sincere wishes for your anniversary. ",
            ],
        },
        "graduation": {
            "friendly": [
                "Congratulations, graduate! You did it! ",
                "So proud of you for reaching this amazing milestone! ",
                "Here's to new adventures and endless possibilities! ",
                "You crushed it! Excited to see what you do next. ",
            ],
            "emotional": [
                "Your dedication and hard work have led you to this incredible achievement. ",
                "Watching you reach this milestone fills my heart with pride. ",
                "This is just the beginning of your remarkable journey. ",
                "May your future be filled with success and fulfillment. ",
            ],
            "formal": [
                "Congratulations on your graduation achievement. ",
                "Wishing you continued success in your future endeavors. ",
                "This milestone represents your dedication and excellence. ",
                "May this graduation open doors to extraordinary opportunities. ",
            ],
        },
        "custom": {
            "friendly": [
                "Sending you thoughts of joy and happiness. ",
                "Wishing you all the best on this special occasion. ",
                "You deserve wonderful things coming your way. ",
                "Here's to celebrating you and your happiness. ",
            ],
            "emotional": [
                "On this occasion, I want to remind you how special you are. ",
                "Your presence makes a difference in the lives around you. ",
                "Wishing you a day filled with love and meaningful moments. ",
                "You bring so much light to those who know you. ",
            ],
            "formal": [
                "Warmest wishes to you on this occasion. ",
                "I extend my best wishes for your happiness and success. ",
                "May this day bring you joy and fulfillment. ",
                "Please accept my sincere wishes for your well-being. ",
            ],
        },
    }

    CLOSING_TEMPLATES = {
        "friendly": [
            "Have the best day ever! ",
            "Enjoy every moment! ",
            "You've got this! ",
            "Cheers to you! ",
        ],
        "emotional": [
            "With all my love and best wishes. ",
            "Thinking of you with warmth and affection. ",
            "With heartfelt wishes for your happiness. ",
            "Sending you love and encouragement. ",
        ],
        "formal": [
            "With sincere wishes for your well-being. ",
            "Thank you for your presence in my life. ",
            "With utmost respect and best wishes. ",
            "Warmest regards and best wishes for the future. ",
        ],
    }

    SUBJECT_TEMPLATES = {
        "birthday": {
            "friendly": "Happy birthday, {name}! 🎉",
            "emotional": "Celebrating you on your special day",
            "formal": "Birthday wishes for {name}",
        },
        "anniversary": {
            "friendly": "Happy anniversary! 💕",
            "emotional": "A heartfelt anniversary celebration",
            "formal": "Anniversary wishes",
        },
        "graduation": {
            "friendly": "Congrats on graduating, {name}! 🎓",
            "emotional": "Celebrating your remarkable achievement",
            "formal": "Graduation congratulations",
        },
        "custom": {
            "friendly": "Special wishes for {name}",
            "emotional": "A message from my heart",
            "formal": "Warm wishes and best regards",
        },
    }

    @staticmethod
    def clean_original_message(message: str) -> str:
        """Extract the core content from user's original message."""
        # Remove common greetings and repetitive phrases
        cleaned = re.sub(
            r"^(hi|hey|hello|greetings)[\s,!]*",
            "",
            message,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    @staticmethod
    def _pick_from_template(templates: list[str], index: int) -> str:
        """Pick a template based on index, cycling through list."""
        return templates[index % len(templates)]

    @staticmethod
    def _generate_subject(
        tone: str, occasion_type: str, recipient_name: str
    ) -> str:
        """Generate a subject line based on tone and occasion."""
        subjects = MessageEnhancer.SUBJECT_TEMPLATES.get(
            occasion_type, MessageEnhancer.SUBJECT_TEMPLATES["custom"]
        )
        subject = subjects.get(tone, subjects["friendly"])
        return subject.format(name=recipient_name)

    @staticmethod
    def _generate_body(
        tone: str, occasion_type: str, recipient_name: str, original_message: str
    ) -> str:
        """Generate enhanced message body."""
        opening_idx = hash(tone) % len(MessageEnhancer.OPENING_TEMPLATES[tone])
        occasion_idx = (
            hash(occasion_type + tone)
            % len(
                MessageEnhancer.OCCASION_TEMPLATES.get(
                    occasion_type, MessageEnhancer.OCCASION_TEMPLATES["custom"]
                )[tone]
            )
        )
        closing_idx = (
            hash(tone + recipient_name) % len(MessageEnhancer.CLOSING_TEMPLATES[tone])
        )

        opening = MessageEnhancer._pick_from_template(
            MessageEnhancer.OPENING_TEMPLATES[tone], opening_idx
        ).format(name=recipient_name)

        occasion = MessageEnhancer._pick_from_template(
            MessageEnhancer.OCCASION_TEMPLATES.get(
                occasion_type, MessageEnhancer.OCCASION_TEMPLATES["custom"]
            )[tone],
            occasion_idx,
        )

        closing = MessageEnhancer._pick_from_template(
            MessageEnhancer.CLOSING_TEMPLATES[tone], closing_idx
        )

        cleaned_original = MessageEnhancer.clean_original_message(original_message)

        # Build the body
        body = f"{opening}{occasion}{cleaned_original} {closing}"
        body = re.sub(r"\s+", " ", body).strip()

        # Trim to reasonable length (80-150 words)
        words = body.split()
        if len(words) > 150:
            words = words[:150]
            body = " ".join(words) + "."

        return body

    @staticmethod
    def enhance_message(request: MessageEnhancementRequest) -> list[MessageSuggestion]:
        """Generate 3 enhanced message suggestions in different tones."""
        suggestions = []

        for tone in ["friendly", "emotional", "formal"]:
            subject = MessageEnhancer._generate_subject(
                tone, request.occasion_type, request.recipient_name
            )
            body = MessageEnhancer._generate_body(
                tone, request.occasion_type, request.recipient_name, request.message
            )

            suggestions.append(
                MessageSuggestion(tone=tone, subject=subject, body=body)
            )

        return suggestions
