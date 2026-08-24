import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { google } from "googleapis";

@Injectable()
export class AuthService {
  private readonly oauth2Client;

  constructor(private readonly configService: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>("GOOGLE_CLIENT_ID"),
      this.configService.get<string>("GOOGLE_CLIENT_SECRET"),
      this.configService.get<string>("GOOGLE_REDIRECT_URI"),
    );
  }

  getGoogleAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
       scope: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    });
  }

  async getGoogleTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);

    return tokens;
  }
}