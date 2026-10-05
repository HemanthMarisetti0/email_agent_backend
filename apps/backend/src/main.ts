import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import {
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { GmailExceptionFilter } from "./gmail/gmail-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(
    new GmailExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  });

  const config = new DocumentBuilder()
    .setTitle("MailPilot API")
    .setDescription("AI-powered Gmail management agent")
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      "access-token",
    )
    .build();

  const document = SwaggerModule.createDocument(
    app,
    config,
  );

  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();