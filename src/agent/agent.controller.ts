import {
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AgentService } from './agent.service';

import {
  AgentResponse,
} from './agent.types';

interface AgentRequestDto {
  message: string;
}

interface ApprovalRequestDto {
  approvalId: string;
}

@ApiTags('MailPilot Agent')
@ApiBearerAuth('access-token')
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
  ) {}

  // =========================================================
  // RUN AI AGENT
  // =========================================================

  @Post()
  @ApiOperation({
    summary: 'Send a message to MailPilot AI agent',
    description:
      'Ask MailPilot to search, read, or manage Gmail. Gmail modification actions require approval.',
  })
  @ApiBody({
    schema: {
      example: {
        message:
          'Find my unread emails from today',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Agent response',
  })
  async runAgent(
    @Headers('authorization')
    authorization: string,

    @Body()
    body: AgentRequestDto,
  ): Promise<AgentResponse> {
    const accessToken =
      this.extractAccessToken(
        authorization,
      );

    return this.agentService.run(
      accessToken,
      body.message,
    );
  }

  // =========================================================
  // APPROVE ACTION
  // =========================================================

  @Post('approve')
  @ApiOperation({
    summary: 'Approve a pending Gmail action',
    description:
      'Approve an action previously requested by MailPilot.',
  })
  @ApiBody({
    schema: {
      example: {
        approvalId:
          '8f6c4d0e-8d0d-4c7f-9c7c-example',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Approved action executed',
  })
  async approve(
    @Headers('authorization')
    authorization: string,

    @Body()
    body: ApprovalRequestDto,
  ) {
    const accessToken =
      this.extractAccessToken(
        authorization,
      );

    return this.agentService.approve(
      accessToken,
      body.approvalId,
    );
  }

  // =========================================================
  // REJECT ACTION
  // =========================================================

  @Post('reject')
  @ApiOperation({
    summary: 'Reject a pending Gmail action',
    description:
      'Reject an action previously requested by MailPilot.',
  })
  @ApiBody({
    schema: {
      example: {
        approvalId:
          '8f6c4d0e-8d0d-4c7f-9c7c-example',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Action rejected',
  })
  async reject(
    @Body()
    body: ApprovalRequestDto,
  ) {
    return this.agentService.reject(
      body.approvalId,
    );
  }

  // =========================================================
  // ACCESS TOKEN
  // =========================================================

  private extractAccessToken(
    authorization: string,
  ): string {
    if (!authorization) {
      throw new Error(
        'Authorization header is required.',
      );
    }

    if (
      !authorization.startsWith(
        'Bearer ',
      )
    ) {
      throw new Error(
        'Authorization must use Bearer token.',
      );
    }

    const accessToken =
      authorization
        .substring(7)
        .trim();

    if (!accessToken) {
      throw new Error(
        'Access token is required.',
      );
    }

    return accessToken;
  }
}