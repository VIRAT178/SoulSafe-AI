export interface EnhancementRequest {
  recipientName: string;
  occasionType: string;
  message: string;
}

export interface EnhancementSuggestion {
  tone: "friendly" | "emotional" | "formal";
  subject: string;
  body: string;
}

export interface EnhancementResponse {
  suggestions: EnhancementSuggestion[];
}

const PYTHON_SERVICE_URL =
  process.env.PYTHON_AI_SERVICE_URL ||
  process.env.AI_SERVICE_URL ||
  "http://localhost:8000";

export async function enhanceWishMessage(
  request: EnhancementRequest
): Promise<EnhancementResponse> {
  const pythonServiceUrl = `${PYTHON_SERVICE_URL}/ai/enhance-message`;

  try {
    const response = await fetch(pythonServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient_name: request.recipientName,
        occasion_type: request.occasionType,
        message: request.message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Python service error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as EnhancementResponse;
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to enhance message: ${error.message}`);
    }
    throw new Error("Failed to enhance message: Unknown error");
  }
}
