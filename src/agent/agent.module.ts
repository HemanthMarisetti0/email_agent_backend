import { Module } from '@nestjs/common';

import { GmailModule } from '../gmail/gmail.module';

import { AgentService } from './agent.service';

import { AgentApprovalService } from './agent.approval.service';

import { AgentActionService } from './agent.action.service';

import { AgentReadService } from './agent.read.service';
import { BulkActionService } from './bulk/bulk-action.service';

@Module({
  imports: [
    GmailModule,
  ],

  providers: [
    AgentService,

    AgentApprovalService,

    AgentActionService,

    AgentReadService,
    BulkActionService
  ],

  exports: [
    AgentService,
  ],
})
export class AgentModule {}