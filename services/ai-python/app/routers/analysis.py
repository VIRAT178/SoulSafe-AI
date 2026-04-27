import math
import re
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


POSITIVE_WORDS = {
    "love",
    "grateful",
    "happy",
    "joy",
    "hope",
    "peace",
    "proud",
    "excited",
    "blessed",
    "calm",
    "relief",
    "thankful",
    "support",
    "laugh",
    "smile",
    "beautiful",
    "strong",
    "safe",
    "better",
    "healed",
    "confidence",
    "confident",
    "prepared",
    "ready",
    "capable",
    "optimistic",
    "optimism",
    "motivated",
    "motivation",
    "focused",
    "determined",
    "resilient",
    "brave",
    "courage",
    "courageous",
    "progress",
    "improving",
    "improvement",
    "achieve",
    "achievement",
    "succeed",
    "success",
    "successful",
    "pass",
    "win",
    "winning",
    "faith",
    "trust",
    "uplifted",
    "encouraged",
    "inspired",
    "inspiring",
    "stability",
    "stable",
    "secure",
    "peaceful",
    "hopeful",
    "relaxed",
    "relax",
    "recover",
    "recovered",
    "healing",
    "calmer",
    "clarity",
    "confidently",
    "preparedness",
    "strength",
}

NEGATIVE_WORDS = {
    "sad",
    "grief",
    "loss",
    "afraid",
    "anxious",
    "angry",
    "guilt",
    "regret",
    "hurt",
    "pain",
    "lonely",
    "empty",
    "tired",
    "stress",
    "panic",
    "cry",
    "broken",
    "breakup",
    "heartbreak",
    "heartbroken",
    "betrayed",
    "fear",
    "miss",
    "sorry",
    "scared",
    "nervous",
    "terrified",
    "overwhelmed",
    "unprepared",
    "examstress",
    "worry",
    "worried",
    "worries",
    "worrying",
    "doubt",
    "doubts",
    "doubtful",
    "failure",
    "failed",
    "failing",
    "fail",
    "weak",
    "helpless",
    "hopeless",
    "stuck",
    "confused",
    "confusion",
    "frustrated",
    "frustration",
    "depressed",
    "depression",
    "demotivated",
    "burnout",
    "burnedout",
    "exhausted",
    "exhaustion",
    "sleepless",
    "insomnia",
    "pressure",
    "pressured",
    "trauma",
    "traumatic",
    "insecure",
    "unstable",
    "chaotic",
    "shattered",
    "devastated",
    "miserable",
    "terrible",
    "horrible",
    "awful",
    "shame",
    "ashamed",
    "guilty",
    "betrayal",
    "abandoned",
}

POSITIVE_ROOTS = {
    "confiden",
    "optim",
    "motiv",
    "courage",
    "resilien",
    "prepare",
    "improv",
    "progress",
    "achiev",
    "succeed",
    "heal",
    "calm",
    "relax",
    "hope",
    "grate",
    "inspir",
    "focus",
    "determin",
}

NEGATIVE_ROOTS = {
    "anxi",
    "stress",
    "panic",
    "worr",
    "scare",
    "fear",
    "doubt",
    "fail",
    "frustr",
    "depress",
    "exhaust",
    "overwhelm",
    "regret",
    "guilt",
    "hurt",
    "lonel",
    "trauma",
    "insecur",
    "chaos",
}

PHRASE_SENTIMENT_CUES: list[tuple[str, float]] = [
    (r"\bnot\s+(?:prepared|ready|confident)\b", -1.6),
    (r"\bcan'?t\s+(?:focus|study|sleep|handle)\b", -1.2),
    (r"\bpanic\s+attack\b", -1.6),
    (r"\b(?:very|extremely|really)\s+(?:scared|anxious|worried)\b", -1.2),
    (r"\b(?:full\s+confidence|i\s+will\s+do\s+it|i\s+can\s+do\s+it|believe\s+in\s+me|believe\s+in\s+myself)\b", 1.3),
    (r"\b(?:i\s+am|i'm)\s+(?:ready|prepared|confident)\b", 1.0),
    (r"\bkeep\s+going\b", 0.9),
    (r"\bstay\s+strong\b", 1.0),
    (r"\bone\s+step\s+at\s+a\s+time\b", 0.8),
]

NEGATION_WORDS = {"not", "never", "no", "none", "hardly", "rarely", "without"}
INTENSIFIERS = {"very", "deeply", "extremely", "really", "so", "too", "super", "highly"}

EMOTION_LEXICONS: dict[str, set[str]] = {
    "joy": {
        "joy", "happy", "laugh", "smile", "celebrate", "excited", "delight", "relief",
        "uplifted", "cheerful", "positive", "light", "content",
    },
    "love": {"love", "dear", "beloved", "care", "cherish", "adore", "hug", "affection", "support"},
    "gratitude": {"grateful", "thankful", "appreciate", "blessed", "thanks", "gratitude"},
    "sadness": {
        "sad", "grief", "cry", "tears", "hurt", "empty", "lonely", "loss", "down", "depressed", "hopeless",
    },
    "fear": {
        "fear", "afraid", "anxious", "panic", "worried", "uncertain", "scared", "nervous", "terrified", "overwhelmed", "pressure",
    },
    "anger": {"angry", "mad", "furious", "upset", "frustrated", "resent", "irritated", "annoyed"},
    "nostalgia": {"remember", "memory", "back then", "used to", "old days", "childhood", "throwback"},
    "hope": {
        "hope", "future", "someday", "believe", "dream", "heal", "confidence", "confident", "prepared", "ready", "i will do it", "i can do it", "faith",
    },
    "regret": {"regret", "sorry", "wish", "if only", "should have", "could have", "guilt", "ashamed"},
}

CONTEXT_PATTERNS: dict[str, tuple[str, ...]] = {
    "life-event:birth": ("born", "newborn", "baby", "pregnant", "delivery"),
    "life-event:marriage": ("married", "wedding", "wife", "husband", "engaged", "fiance"),
    "life-event:graduation": ("graduation", "graduated", "degree", "university", "college"),
    "life-event:exam": ("exam", "semester", "sem", "midterm", "final", "test", "result"),
    "life-event:career": ("job", "promotion", "office", "career", "business", "startup"),
    "life-event:health": ("hospital", "surgery", "diagnosis", "recovery", "therapy", "treatment"),
    "life-event:loss": ("passed away", "funeral", "loss", "grief", "mourning"),
    "relationship:family": ("mom", "mother", "dad", "father", "sister", "brother", "family"),
    "relationship:partner": ("partner", "wife", "husband", "girlfriend", "boyfriend", "spouse"),
    "relationship:friend": ("friend", "bestie", "buddy", "classmate"),
    "relationship:self": ("myself", "future me", "dear me", "to myself"),
    "intent:reflection": ("reflect", "learned", "realized", "lesson", "meaning"),
    "intent:apology": ("sorry", "apologize", "forgive me", "my fault"),
    "intent:encouragement": ("you can", "stay strong", "keep going", "believe in you"),
    "intent:legacy": ("remember me", "legacy", "for my children", "after i am gone"),
}

EMOTION_VALENCE: dict[str, float] = {
    "joy": 0.9,
    "love": 0.7,
    "gratitude": 0.85,
    "hope": 0.55,
    "nostalgia": 0.05,
    "sadness": -0.85,
    "fear": -0.75,
    "anger": -0.9,
    "regret": -0.6,
    "neutral": 0.0,
}


class AnalysisRequest(BaseModel):
    capsuleId: str
    text: str
    sourceType: str = Field(default="text", description="text|voice-transcript")
    retrievalDocuments: list[str] = Field(default_factory=list)
    includeRecommendationSummary: bool = False


class AnalysisResponse(BaseModel):
    capsuleId: str
    sentimentScore: float
    emotionLabels: list[str]
    contextTags: list[str]
    recommendationHints: list[str]
    sentimentTrendScore: float
    dominantEmotion: str
    emotionSimilarityScore: float
    analyzedAt: str
    transcriptDetected: bool
    recommendationSummary: str | None = None


def _normalize_text(text: str) -> str:
    normalized = text.replace("\r", "\n")
    normalized = re.sub(r"\[(?:\d{1,2}:)?\d{1,2}:\d{2}\]", " ", normalized)
    normalized = re.sub(r"\b(?:speaker|spk|host|guest)\s*\d*\s*:\s*", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _split_sentences(text: str) -> list[str]:
    raw = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [segment.strip() for segment in raw if segment.strip()]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def _token_forms(token: str) -> set[str]:
    forms = {token}

    if token.endswith("ies") and len(token) > 4:
        forms.add(f"{token[:-3]}y")

    suffixes = (
        "ing",
        "ed",
        "ly",
        "ness",
        "ment",
        "tion",
        "sion",
        "able",
        "ible",
        "ers",
        "er",
        "es",
        "s",
    )

    for suffix in suffixes:
        if token.endswith(suffix) and len(token) > len(suffix) + 2:
            forms.add(token[: -len(suffix)])

    return forms


def _has_vocab_match(token: str, vocabulary: set[str], roots: set[str]) -> bool:
    forms = _token_forms(token)
    if any(form in vocabulary for form in forms):
        return True

    return any(any(form.startswith(root) for root in roots) for form in forms if len(form) >= 4)


def _sentence_sentiment(sentence: str) -> float:
    tokens = _tokenize(sentence)
    if not tokens:
        return 0.0

    score = 0.0
    for index, token in enumerate(tokens):
        window = tokens[max(0, index - 3):index]
        has_negation = any(item in NEGATION_WORDS for item in window)
        intensity = 1.35 if any(item in INTENSIFIERS for item in window) else 1.0

        positive_match = _has_vocab_match(token, POSITIVE_WORDS, POSITIVE_ROOTS)
        negative_match = _has_vocab_match(token, NEGATIVE_WORDS, NEGATIVE_ROOTS)

        if positive_match and not negative_match:
            score += (-1.0 if has_negation else 1.0) * intensity
        elif negative_match and not positive_match:
            score += (1.0 if has_negation else -1.0) * intensity

    lowered = sentence.lower()

    # Phrase-level cues capture intent that token matching often misses.
    for pattern, weight in PHRASE_SENTIMENT_CUES:
        if re.search(pattern, lowered):
            score += weight

    if "exam" in lowered and re.search(r"\b(?:scared|afraid|anxious|nervous|panic)\b", lowered):
        score -= 1.1

    normalized = score / max(1.0, math.sqrt(len(tokens)))
    return max(-1.0, min(1.0, normalized))


def _emotion_scores(text: str) -> dict[str, float]:
    lowered = text.lower()
    tokens = _tokenize(lowered)
    token_set = set(tokens)
    scores: dict[str, float] = {}

    for emotion, lexicon in EMOTION_LEXICONS.items():
        single_hits = sum(1 for word in lexicon if " " not in word and word in token_set)
        phrase_hits = sum(1 for word in lexicon if " " in word and word in lowered)
        scores[emotion] = single_hits + phrase_hits * 1.5

    return scores


def _context_tags(text: str) -> list[str]:
    lowered = text.lower()
    tags: list[str] = ["time-capsule", "memory"]

    for tag, patterns in CONTEXT_PATTERNS.items():
        if any(pattern in lowered for pattern in patterns):
            tags.append(tag)

    if re.search(r"\b(?:today|yesterday|tomorrow|next year|in \d+ years)\b", lowered):
        tags.append("timeline:temporal-reference")

    if re.search(r"\b(?:because|therefore|so that|in order to)\b", lowered):
        tags.append("intent:reasoning")

    return sorted(set(tags))


def _sentiment_trend(sentence_scores: list[float]) -> float:
    if len(sentence_scores) < 2:
        return 0.0

    split = max(1, len(sentence_scores) // 2)
    early = sum(sentence_scores[:split]) / split
    late_count = len(sentence_scores) - split
    late = sum(sentence_scores[split:]) / max(1, late_count)
    trend = late - early
    return max(-1.0, min(1.0, trend))


def _extractive_summary(text: str, context_tags: list[str], retrieval_documents: list[str]) -> str:
    sentences = _split_sentences(text)
    if not sentences:
        return "No summary available."

    ranked: list[tuple[float, str]] = []
    context_keywords = [tag.split(":")[-1] for tag in context_tags if ":" in tag]
    retrieval_blob = " ".join(retrieval_documents).lower()

    for sentence in sentences:
        lowered = sentence.lower()
        emotion_weight = sum(value for key, value in _emotion_scores(sentence).items() if key in {"sadness", "love", "hope", "nostalgia"})
        context_weight = sum(1.0 for keyword in context_keywords if keyword and keyword in lowered)
        retrieval_weight = sum(1.0 for word in _tokenize(sentence) if word and word in retrieval_blob)
        ranked.append((emotion_weight + context_weight + retrieval_weight * 0.35, sentence))

    ranked.sort(key=lambda item: item[0], reverse=True)
    top_sentences = [sentence for _, sentence in ranked[:3]]
    return " ".join(top_sentences)


def _recommendation_hints(sentiment: float, trend: float, emotion_labels: list[str], context_tags: list[str]) -> list[str]:
    hints: list[str] = []
    context_set = set(context_tags)

    if sentiment <= -0.35 or "sadness" in emotion_labels or "fear" in emotion_labels:
        hints.append("delay-if-triggered")
        hints.append("require-user-confirmation-before-release")
    elif sentiment >= 0.45 and ("joy" in emotion_labels or "gratitude" in emotion_labels):
        hints.append("prefer-event-window")
        hints.append("allow-celebration-trigger")
    else:
        hints.append("unlock-default-window")

    if trend >= 0.2:
        hints.append("mood-improving-trend")
    elif trend <= -0.2:
        hints.append("mood-declining-trend")

    if "life-event:loss" in context_set:
        hints.append("soft-release-with-support-copy")
    if "intent:legacy" in context_set:
        hints.append("recommend-family-share-window")
    if "relationship:self" in context_set:
        hints.append("personal-reflection-window")

    return sorted(set(hints))


def _emotion_similarity_score(emotions: dict[str, float], dominant_emotion: str) -> float:
    total = sum(max(0.0, score) for score in emotions.values())
    if total <= 0:
        return 0.0

    dominant_score = max(0.0, emotions.get(dominant_emotion, 0.0))
    return max(0.0, min(1.0, dominant_score / total))


def _emotion_weighted_valence(emotions: dict[str, float]) -> float:
    weighted_sum = 0.0
    total_weight = 0.0

    for emotion, raw_score in emotions.items():
        score = max(0.0, raw_score)
        if score <= 0:
            continue
        weighted_sum += EMOTION_VALENCE.get(emotion, 0.0) * score
        total_weight += score

    if total_weight <= 0:
        return 0.0

    return max(-1.0, min(1.0, weighted_sum / total_weight))


def _blend_sentiment_with_emotions(base_sentiment: float, emotions: dict[str, float], dominant_emotion: str) -> float:
    emotion_valence = _emotion_weighted_valence(emotions)
    emotion_strength = sum(max(0.0, score) for score in emotions.values())

    if emotion_strength <= 0:
        return base_sentiment

    # Keep lexical sentiment primary, but let emotion evidence steer tie/cancel cases.
    blended = (0.7 * base_sentiment) + (0.3 * emotion_valence)

    # If near-neutral despite clear non-neutral dominant emotion, nudge out of 0.00.
    if abs(blended) < 0.05:
        dominant_valence = EMOTION_VALENCE.get(dominant_emotion, 0.0)
        if dominant_valence >= 0.35:
            blended = max(blended, 0.12)
        elif dominant_valence <= -0.35:
            blended = min(blended, -0.12)

    return max(-1.0, min(1.0, blended))


@router.post("/analyze", response_model=AnalysisResponse)
def analyze(payload: AnalysisRequest) -> AnalysisResponse:
    normalized_text = _normalize_text(payload.text)
    lowered = normalized_text.lower()

    sentences = _split_sentences(normalized_text)
    sentence_scores = [_sentence_sentiment(sentence) for sentence in sentences]
    sentiment_score = sum(sentence_scores) / max(1, len(sentence_scores))
    sentiment_score = max(-1.0, min(1.0, sentiment_score))

    emotions = _emotion_scores(normalized_text)
    sorted_emotions = sorted(emotions.items(), key=lambda item: item[1], reverse=True)

    emotion_labels = [emotion for emotion, score in sorted_emotions if score > 0][:3]
    if not emotion_labels:
        if sentiment_score > 0.2:
            emotion_labels = ["joy"]
        elif sentiment_score < -0.2:
            emotion_labels = ["sadness"]
        else:
            emotion_labels = ["neutral"]

    context_tags = _context_tags(normalized_text)
    dominant_emotion = emotion_labels[0] if emotion_labels else "neutral"
    sentiment_score = _blend_sentiment_with_emotions(sentiment_score, emotions, dominant_emotion)
    trend_score = _sentiment_trend(sentence_scores)
    hints = _recommendation_hints(sentiment_score, trend_score, emotion_labels, context_tags)

    transcript_detected = payload.sourceType == "voice-transcript" or bool(
        re.search(r"\b(?:speaker\s*\d*|transcript|inaudible|pause|um|uh)\b", lowered)
    )

    summary: str | None = None
    if payload.includeRecommendationSummary:
        summary = _extractive_summary(normalized_text, context_tags, payload.retrievalDocuments)

    emotion_similarity_score = _emotion_similarity_score(emotions, dominant_emotion)
    analyzed_at = datetime.now(timezone.utc).isoformat()

    return AnalysisResponse(
        capsuleId=payload.capsuleId,
        sentimentScore=round(sentiment_score, 4),
        emotionLabels=emotion_labels,
        contextTags=context_tags,
        recommendationHints=hints,
        sentimentTrendScore=round(trend_score, 4),
        dominantEmotion=dominant_emotion,
        emotionSimilarityScore=round(emotion_similarity_score, 4),
        analyzedAt=analyzed_at,
        transcriptDetected=transcript_detected,
        recommendationSummary=summary,
    )
