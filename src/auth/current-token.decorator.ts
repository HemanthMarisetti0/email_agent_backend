import {
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

export const CurrentToken =
  createParamDecorator(
    (
      _data: unknown,
      ctx: ExecutionContext,
    ): string | undefined => {
      const request =
        ctx.switchToHttp().getRequest();

      const authorization =
        request.headers.authorization;

      if (!authorization) {
        return undefined;
      }

      return authorization.replace(
        /^Bearer\s+/i,
        "",
      );
    },
  );