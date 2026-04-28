from pydantic import BaseModel


class MessageEnhancementRequest(BaseModel):
    recipient_name: str
    occasion_type: str
    message: str


class MessageSuggestion(BaseModel):
    tone: str
    subject: str
    body: str


class MessageEnhancementResponse(BaseModel):
    suggestions: list[MessageSuggestion]
