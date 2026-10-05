import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentToken } from '../auth/current-token.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { User } from '../generated/prisma/client';

import { AgentService } from './agent.service';

import {
  AgentResponse,
  ChatTurn,
} from './agent.types';

interface AgentRequestDto {
  message: string;

  // Previous turns, oldest first, so follow-ups like "delete it" work.
  history?: ChatTurn[];

  // IANA zone such as "Asia/Kolkata", for "today" / "this week".
  timeZone?: string;
}

interface ApprovalRequestDto {
  approvalId: string;
}

@ApiTags('MailPilot Agent')
@ApiBearerAuth('access-token')
@UseGuards(SessionGuard)
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
        history: [],
        timeZone: 'Asia/Kolkata',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Agent response',
  })
  async runAgent(
    @CurrentUser()
    user: User,

    @CurrentToken()
    accessToken: string,

    @Body()
    body: AgentRequestDto,
  ): Promise<AgentResponse> {
    if (typeof body?.message !== 'string' || !body.message.trim()) {
      throw new BadRequestException('message is required.');
    }

    return this.agentService.run(
      user,
      accessToken,
      body.message,
      body.history,
      body.timeZone,
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
    @CurrentUser()
    user: User,

    @CurrentToken()
    accessToken: string,

    @Body()
    body: ApprovalRequestDto,
  ) {
    return this.agentService.approve(
      user.id,
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
    @CurrentUser()
    user: User,

    @Body()
    body: ApprovalRequestDto,
  ) {
    return this.agentService.reject(
      user.id,
      body.approvalId,
    );
  }
}
