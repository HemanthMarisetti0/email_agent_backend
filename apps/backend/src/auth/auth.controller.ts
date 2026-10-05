import {
  Controller,
  Get,
  Logger,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Response } from "express";

import { User } from "../generated/prisma/client";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { SessionGuard } from "./session.guard";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get("google")
  googleLogin(@Res() res: Response) {
    const authUrl = this.authService.getGoogleAuthUrl();

    return res.redirect(authUrl);
  }

  // Redirects back to the frontend with the result in the URL fragment,
  // so the session token never reaches the frontend host's server logs.
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string,
    @Query("error") googleError: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ??
      "http://localhost:5173";
    const redirect = (params: Record<string, string>) =>
      res.redirect(
        `${frontendUrl}/auth/callback#${new URLSearchParams(params)}`,
      );

    if (!code) {
      return redirect({
        error: googleError ?? "Authorization code not received",
      });
    }

    try {
      const token = await this.authService.signIn(code);

      return redirect({ token });
    } catch (error) {
      this.logger.error("Google sign-in failed", error);

      return redirect({
        error:
          error instanceof Error ? error.message : "Sign-in failed",
      });
    }
  }

  @Get("me")
  @ApiBearerAuth("access-token")
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
