import {
  Body,
  Controller,
  Post,
} from "@nestjs/common";

import {
  ApiBody,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { AIService } from "./ai.service";

import {
  AnalyzeEmailInput,
} from "./ai.types";

@ApiTags("AI")
@Controller("ai")
export class AIController {
  constructor(
    private readonly aiService: AIService,
  ) {}

  @Post("analyze-email")
  @ApiOperation({
    summary: "Analyze an email using Gemini",
  })
  @ApiBody({
    schema: {
      example: {
        from:
          "manager@company.com",

        to:
          "hemanth@example.com",

        subject:
          "Project report due Friday",

        body:
          "Hi Hemanth, please submit the project report by Friday 5 PM. Also make sure the API documentation is updated.",
      },
    },
  })
  async analyzeEmail(
    @Body()
    body: AnalyzeEmailInput,
  ) {
    return this.aiService.analyzeEmail(
      body,
    );
  }
}