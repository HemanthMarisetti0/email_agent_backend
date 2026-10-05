import { Module } from '@nestjs/common';

import { GmailModule } from '../gmail/gmail.module';

import { AgentController } from './agent.controller';

import { AgentService } from './agent.service';

import { AgentApprovalService } from './agent.approval.service';

import { AgentActionService } from './agent.action.service';

import { AgentReadService } from './agent.read.service';

@Module({
  imports: [
    GmailModule,
  ],

  controllers: [
    AgentController,
  ],

  providers: [
    AgentService,

    AgentApprovalService,

    AgentActionService,

    AgentReadService,
  ],

  exports: [
    AgentService,
  ],
})
export class AgentModule {}