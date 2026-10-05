import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * Encrypts Google OAuth tokens before they are stored in the database.
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 */
@Injectable()
export class TokenCryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    this.key = Buffer.from(
      configService.getOrThrow<string>("TOKEN_ENCRYPTION_KEY"),
      "base64",
    );

    if (this.key.length !== 32) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.",
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString("base64"))
      .join(".");
  }

  decrypt(payload: string): string {
    const [iv, authTag, ciphertext] = payload
      .split(".")
      .map((part) => Buffer.from(part, "base64"));

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
