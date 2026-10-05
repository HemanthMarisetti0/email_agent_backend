import {
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

import { User } from "../generated/prisma/client";
import { AuthenticatedRequest } from "./session.guard";

/**
 * The signed-in user. Requires SessionGuard.
 */
export const CurrentUser =
  createParamDecorator(
    (
      _data: unknown,
      ctx: ExecutionContext,
    ): User =>
      ctx
        .switchToHttp()
        .getRequest<AuthenticatedRequest>()
        .user,
  );
