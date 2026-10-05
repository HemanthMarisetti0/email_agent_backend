import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";

import { User } from "../generated/prisma/client";
import { AuthService } from "./auth.service";

export interface AuthenticatedRequest extends Request {
  user: User;
  googleAccessToken: string;
}

/**
 * Requires a MailPilot session token (Authorization: Bearer <token>)
 * and attaches the user and a valid Google access token to the request.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const token = request.headers.authorization
      ?.replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      throw new UnauthorizedException("Authorization header is required.");
    }

    request.user = await this.authService.verifySession(token);
    request.googleAccessToken =
      await this.authService.getGoogleAccessToken(request.user);

    return true;
  }
}
