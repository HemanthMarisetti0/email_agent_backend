import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GoogleGenAI,
} from "@google/genai";

import {
  AnalyzeEmailInput,
  EmailAnalysis,
} from "./ai.types";

@Injectable()
export class AIService {
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const apiKey =
      this.configService.get<string>(
        "GEMINI_API_KEY",
      );

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured",
      );
    }

    this.ai = new GoogleGenAI({
      apiKey,
    });
  }

  // ============================================
  // ANALYZE EMAIL
  // ============================================

  async analyzeEmail(
    input: AnalyzeEmailInput,
  ): Promise<EmailAnalysis> {
    const prompt = `
You are an advanced email intelligence AI.

Analyze the following email and return ONLY valid JSON.

EMAIL:

From:
${input.from}

To:
${input.to ?? ""}

Subject:
${input.subject}

Body:
${input.body}

Return JSON using exactly this structure:

{
  "summary": "Short summary of the email",
  "category": "WORK",
  "priority": "LOW",
  "sentiment": "NEUTRAL",
  "requiresReply": false,
  "actionItems": [],
  "deadlines": [],
  "senderName": "",
  "senderCompany": "",
  "importantPoints": []
}

Rules:

category must be exactly one of:
WORK
PERSONAL
FINANCE
SHOPPING
NEWSLETTER
SOCIAL
TRAVEL
PROMOTION
OTHER

priority must be exactly one of:
LOW
MEDIUM
HIGH
URGENT

sentiment must be exactly one of:
POSITIVE
NEUTRAL
NEGATIVE

actionItems must contain concrete things the recipient needs to do.

deadlines must contain important dates or deadlines.

Each deadline must look like:

{
  "description": "Submit project report",
  "date": "2026-08-30"
}

If the email does not contain a deadline, return:

"deadlines": []

If there is no action required, return:

"actionItems": []

If the email does not require a response, set:

"requiresReply": false

Do not include markdown.
Do not include \`\`\`json.
Return only JSON.
`;

    try {
      const response =
        await this.ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType:
              "application/json",
          },
        });

      const text =
        response.text?.trim();

      if (!text) {
        throw new Error(
          "Gemini returned an empty response",
        );
      }

      return this.parseJsonResponse(
        text,
      );
    } catch (error) {
      console.error(
        "Gemini email analysis failed:",
        error,
      );

      throw new InternalServerErrorException(
        "Failed to analyze email",
      );
    }
  }

  // ============================================
  // PARSE GEMINI JSON
  // ============================================

  private parseJsonResponse(
    text: string,
  ): EmailAnalysis {
    try {
      const parsed =
        JSON.parse(text);

      return {
        summary:
          parsed.summary ?? "",

        category:
          parsed.category ?? "OTHER",

        priority:
          parsed.priority ?? "MEDIUM",

        sentiment:
          parsed.sentiment ?? "NEUTRAL",

        requiresReply:
          Boolean(
            parsed.requiresReply,
          ),

        actionItems:
          Array.isArray(
            parsed.actionItems,
          )
            ? parsed.actionItems
            : [],

        deadlines:
          Array.isArray(
            parsed.deadlines,
          )
            ? parsed.deadlines
            : [],

        senderName:
          parsed.senderName ?? "",

        senderCompany:
          parsed.senderCompany ?? "",

        importantPoints:
          Array.isArray(
            parsed.importantPoints,
          )
            ? parsed.importantPoints
            : [],
      };
    } catch {
      throw new InternalServerErrorException(
        "Gemini returned invalid JSON",
      );
    }
  }
}