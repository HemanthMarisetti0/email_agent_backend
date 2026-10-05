import {
  ArgumentsHost,
  Catch,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

import {
  gmailRateLimitException,
  isGmailRateLimit,
} from "./gmail-rate-limit";

/**
 * Turns Gmail quota errors into a 429 with a readable message
 * instead of a 500 and a full stack trace.
 */
@Catch()
export class GmailExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger("Gmail");

  catch(exception: unknown, host: ArgumentsHost) {
    if (isGmailRateLimit(exception)) {
      this.logger.warn("Gmail rate limit hit");
      return super.catch(gmailRateLimitException(), host);
    }

    // Google rejected the access token (revoked or invalid).
    if ((exception as { status?: number })?.status === 401) {
      return super.catch(
        new UnauthorizedException(
          "Google access has expired or was revoked. Please sign in again.",
        ),
        host,
      );
    }

    return super.catch(exception, host);
  }
}
