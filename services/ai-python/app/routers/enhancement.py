from fastapi import APIRouter
from app.models import MessageEnhancementRequest, MessageEnhancementResponse
from app.services.message_enhancer import MessageEnhancer

router = APIRouter()


@router.post("/enhance-message")
def enhance_message(request: MessageEnhancementRequest) -> MessageEnhancementResponse:
    """Generate 3 enhanced message suggestions in different tones."""
    suggestions = MessageEnhancer.enhance_message(request)
    return MessageEnhancementResponse(suggestions=suggestions)
