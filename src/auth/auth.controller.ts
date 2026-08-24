import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";

import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Get("google")
  googleLogin(@Res() res: Response) {
    const authUrl = this.authService.getGoogleAuthUrl();

    return res.redirect(authUrl);
  }

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string,
  ) {
    if (!code) {
      return {
        success: false,
        message: "Authorization code not received",
      };
    }

    const tokens =
      await this.authService.getGoogleTokens(code);

    return {
      success: true,
      message: "Google authentication successful",
      tokens,
    };
  }
}