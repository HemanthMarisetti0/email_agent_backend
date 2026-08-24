import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { GmailModule } from "./gmail/gmail.module";
import { AIModule } from "./ai/ai.module";
import { AgentModule } from "./agent/agent.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    AuthModule,
    GmailModule,
    AIModule,
    AgentModule,
  ],
})
export class AppModule {}