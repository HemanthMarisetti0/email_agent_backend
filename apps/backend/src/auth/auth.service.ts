import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { google } from "googleapis";

import { User } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TokenCryptoService } from "./token-crypto.service";

export interface SessionPayload {
  sub: string;
  email: string;
}

// Refresh the Google access token a little before it actually expires.
const EXPIRY_MARGIN_MS = 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  // A fresh client per call: setCredentials() mutates the client,
  // so sharing one across concurrent users would mix their tokens.
  private createOAuthClient() {
    return new google.auth.OAuth2(
      this.configService.get<string>("GOOGLE_CLIENT_ID"),
      this.configService.get<string>("GOOGLE_CLIENT_SECRET"),
      this.configService.get<string>("GOOGLE_REDIRECT_URI"),
    );
  }

  getGoogleAuthUrl(): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
  }

  /**
   * Exchanges the OAuth code, creates or updates the user,
   * and returns a session token for the frontend.
   */
  async signIn(code: string): Promise<string> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.id_token || !tokens.access_token) {
      throw new UnauthorizedException(
        "Google did not return the expected tokens.",
      );
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.configService.get<string>("GOOGLE_CLIENT_ID"),
    });
    const profile = ticket.getPayload();

    if (!profile?.sub || !profile.email) {
      throw new UnauthorizedException(
        "Google account has no email address.",
      );
    }

    const accessTokenFields = {
      accessToken: this.tokenCrypto.encrypt(tokens.access_token),
      accessTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    };

    const existing = await this.prisma.user.findUnique({
      where: { googleId: profile.sub },
    });

    // Google only sends a refresh token with a consent prompt;
    // keep the stored one if it is missing.
    const refreshToken = tokens.refresh_token
      ? this.tokenCrypto.encrypt(tokens.refresh_token)
      : existing?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException(
        "Google did not return a refresh token. Remove MailPilot's access in your Google account settings and sign in again.",
      );
    }

    const user = await this.prisma.user.upsert({
      where: { googleId: profile.sub },
      create: {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name,
        refreshToken,
        ...accessTokenFields,
      },
      update: {
        email: profile.email,
        name: profile.name,
        refreshToken,
        ...accessTokenFields,
      },
    });

    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
    };

    return this.jwtService.signAsync(payload);
  }

  async verifySession(token: string): Promise<User> {
    let payload: SessionPayload;

    try {
      payload = await this.jwtService.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException("Session is invalid or expired.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }

    return user;
  }

  /**
   * Returns a valid Google access token for the user,
   * refreshing it with the stored refresh token when needed.
   */
  async getGoogleAccessToken(user: User): Promise<string> {
    const stillValid =
      user.accessToken &&
      user.accessTokenExpiresAt &&
      user.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now();

    if (stillValid) {
      return this.tokenCrypto.decrypt(user.accessToken);
    }

    const client = this.createOAuthClient();
    client.setCredentials({
      refresh_token: this.tokenCrypto.decrypt(user.refreshToken),
    });

    let credentials;

    try {
      ({ credentials } = await client.refreshAccessToken());
    } catch {
      // Typically invalid_grant: the user revoked access or the token expired.
      throw new UnauthorizedException(
        "Google access was revoked or expired. Please sign in again.",
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        accessToken: this.tokenCrypto.encrypt(credentials.access_token),
        accessTokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null,
      },
    });

    return credentials.access_token;
  }
}
