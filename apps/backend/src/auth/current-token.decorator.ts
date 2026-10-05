import {
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

import { AuthenticatedRequest } from "./session.guard";

/**
 * The signed-in user's Google access token. Requires SessionGuard.
 */
export const CurrentToken =
  createParamDecorator(
    (
      _data: unknown,
      ctx: ExecutionContext,
    ): string =>
      ctx
        .switchToHttp()
        .getRequest<AuthenticatedRequest>()
        .googleAccessToken,
  );
