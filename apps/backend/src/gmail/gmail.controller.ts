import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";


import { GmailService } from "./gmail.service";

import {
  describeOperation,
  EMAIL_OPERATIONS,
  isEmailOperation,
} from "./gmail-operations";
import {
  BulkEmailDto,
  ComposeEmailOptions,
} from "./gmail.types";
import { CurrentToken } from "../auth/current-token.decorator";
import { SessionGuard } from "../auth/session.guard";

@ApiTags("Gmail")
@ApiBearerAuth("access-token")
@UseGuards(SessionGuard)
@Controller("gmail")
export class GmailController {
  constructor(
    private readonly gmailService: GmailService,
  ) {}

  // ==============================
  // EMAILS
  // ==============================

  @Get("emails")
  @ApiOperation({
    summary: "Get Gmail emails",
  })
  @ApiQuery({
    name: "query",
    required: false,
    example: "is:unread",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    example: 20,
  })
  @ApiQuery({
    name: "pageToken",
    required: false,
  })
  async getEmails(
    @CurrentToken()
    accessToken: string,
    @Query("query")
    query?: string,
    @Query("maxResults")
    maxResults?: number,
    @Query("pageToken")
    pageToken?: string,
  ) {
    return this.gmailService.getEmails(
      accessToken,
      {
        query,
        maxResults: maxResults
          ? Number(maxResults)
          : 20,
        pageToken,
      },
    );
  }

  // ==============================
  // GET EMAIL
  // ==============================

  @Get("emails/:id")
  @ApiOperation({
    summary: "Get a single email",
  })
  @ApiParam({
    name: "id",
    example: "18c123abc",
  })
  async getEmail(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    return this.gmailService.getEmail(
      accessToken,
      id,
    );
  }

  // ==============================
  // SEARCH
  // ==============================

  @Get("search")
  @ApiOperation({
    summary: "Search Gmail",
  })
  @ApiQuery({
    name: "q",
    example: "from:amazon.in",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    example: 20,
  })
  async search(
    @CurrentToken()
    accessToken: string,
    @Query("q") query: string,
    @Query("maxResults")
    maxResults?: number,
  ) {
    return this.gmailService.searchEmails(
      accessToken,
      query,
      maxResults
        ? Number(maxResults)
        : 20,
    );
  }

  // ==============================
  // THREAD
  // ==============================

  @Get("threads/:id")
  @ApiOperation({
    summary: "Get email thread",
  })
  async getThread(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    return this.gmailService.getThread(
      accessToken,
      id,
    );
  }

  // ==============================
  // READ
  // ==============================

  @Patch("emails/:id/read")
  @ApiOperation({
    summary: "Mark email as read",
  })
  async markRead(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.markAsRead(
      accessToken,
      id,
    );

    return {
      success: true,
      message: "Email marked as read",
    };
  }

  // ==============================
  // UNREAD
  // ==============================

  @Patch("emails/:id/unread")
  @ApiOperation({
    summary: "Mark email as unread",
  })
  async markUnread(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.markAsUnread(
      accessToken,
      id,
    );

    return {
      success: true,
      message:
        "Email marked as unread",
    };
  }

  // ==============================
  // STAR
  // ==============================

  @Patch("emails/:id/star")
  @ApiOperation({
    summary: "Star email",
  })
  async star(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.starEmail(
      accessToken,
      id,
    );

    return {
      success: true,
      message: "Email starred",
    };
  }

  // ==============================
  // UNSTAR
  // ==============================

  @Patch("emails/:id/unstar")
  @ApiOperation({
    summary: "Unstar email",
  })
  async unstar(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.unstarEmail(
      accessToken,
      id,
    );

    return {
      success: true,
      message: "Email unstarred",
    };
  }

  // ==============================
  // ARCHIVE
  // ==============================

  @Post("emails/:id/archive")
  @ApiOperation({
    summary: "Archive email",
  })
  async archive(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.archiveEmail(
      accessToken,
      id,
    );

    return {
      success: true,
      message: "Email archived",
    };
  }

  // ==============================
  // TRASH
  // ==============================

  @Post("emails/:id/trash")
  @ApiOperation({
    summary: "Move email to trash",
  })
  async trash(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.trashEmail(
      accessToken,
      id,
    );

    return {
      success: true,
      message: "Email moved to trash",
    };
  }

  // ==============================
  // RESTORE
  // ==============================

  @Post("emails/:id/restore")
  @ApiOperation({
    summary: "Restore email from trash",
  })
  async restore(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.restoreEmail(
      accessToken,
      id,
    );

    return {
      success: true,
      message:
        "Email restored from trash",
    };
  }

  // ==============================
  // IMPORTANT
  // ==============================

  @Patch("emails/:id/important")
  @ApiOperation({
    summary: "Mark email important",
  })
  async important(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService.markImportant(
      accessToken,
      id,
    );

    return {
      success: true,
      message:
        "Email marked important",
    };
  }

  @Patch("emails/:id/not-important")
  @ApiOperation({
    summary:
      "Remove important status",
  })
  async notImportant(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
  ) {
    await this.gmailService
      .markNotImportant(
        accessToken,
        id,
      );

    return {
      success: true,
      message:
        "Important status removed",
    };
  }

  // ==============================
  // LABELS
  // ==============================

  @Get("labels")
  @ApiOperation({
    summary: "Get Gmail labels",
  })
  async labels(
    @CurrentToken()
    accessToken: string,
  ) {
    return this.gmailService.getLabels(
      accessToken,
    );
  }

  // ==============================
  // ADD LABEL
  // ==============================

  @Post("emails/:id/labels/:labelId")
  @ApiOperation({
    summary: "Add label to email",
  })
  async addLabel(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
    @Param("labelId")
    labelId: string,
  ) {
    await this.gmailService.addLabel(
      accessToken,
      id,
      labelId,
    );

    return {
      success: true,
      message: "Label added",
    };
  }

  // ==============================
  // REMOVE LABEL
  // ==============================

  @Delete(
    "emails/:id/labels/:labelId",
  )
  @ApiOperation({
    summary: "Remove label from email",
  })
  async removeLabel(
    @CurrentToken()
    accessToken: string,
    @Param("id") id: string,
    @Param("labelId")
    labelId: string,
  ) {
    await this.gmailService
      .removeLabel(
        accessToken,
        id,
        labelId,
      );

    return {
      success: true,
      message: "Label removed",
    };
  }

  // ==============================
  // DRAFTS
  // ==============================

  @Get("drafts")
  @ApiOperation({
    summary: "Get Gmail drafts",
  })
  async drafts(
    @CurrentToken()
    accessToken: string,
  ) {
    return this.gmailService.getDrafts(
      accessToken,
    );
  }

  // ==============================
  // SEND EMAIL
  // ==============================

  @Post("send")
  @ApiOperation({
    summary: "Send email",
  })
  @ApiBody({
    schema: {
      example: {
        to: ["someone@example.com", "another@example.com"],
        cc: [],
        subject: "Hello",
        textBody:
          "Hello from MailPilot!",
        sendSeparately: false,
        replyToMessageId: null,
      },
    },
  })
  async send(
    @CurrentToken()
    accessToken: string,
    @Body()
    body: ComposeEmailOptions,
  ) {
    const result =
      await this.gmailService.composeEmail(
        accessToken,
        body,
      );

    return {
      success: true,
      message:
        result.sent.length === 1
          ? "Email sent"
          : `${result.sent.length} emails sent`,
      data: result,
    };
  }

  // ==============================
  // BATCH OPERATION
  // ==============================

  @Post("emails/batch")
  @ApiOperation({
    summary: "Apply an operation to many emails",
    description: `Operations: ${EMAIL_OPERATIONS.join(", ")}`,
  })
  @ApiBody({
    schema: {
      example: {
        messageIds: ["18abc123", "18abc456"],
        operation: "archive",
      },
    },
  })
  async batch(
    @CurrentToken()
    accessToken: string,
    @Body()
    body: { messageIds: string[]; operation: string; labelId?: string },
  ) {
    if (!isEmailOperation(body.operation)) {
      throw new BadRequestException(
        `operation must be one of: ${EMAIL_OPERATIONS.join(", ")}`,
      );
    }

    if (!Array.isArray(body.messageIds) || body.messageIds.length > 1000) {
      throw new BadRequestException(
        "messageIds must be an array of at most 1000 IDs.",
      );
    }

    const { count } = await this.gmailService.modifyEmails(
      accessToken,
      body.messageIds,
      body.operation,
      body.labelId,
    );

    return {
      success: true,
      count,
      message: describeOperation(body.operation, count),
    };
  }

  @Delete('emails/bulk')
@ApiOperation({
  summary: 'Move multiple emails to trash',
})
@ApiBody({
  schema: {
    example: {
      messageIds: [
        '18abc123',
        '18abc456',
        '18abc789',
      ],
    },
  },
})
async bulkTrash(
  @CurrentToken()
  accessToken: string,

  @Body()
  body: BulkEmailDto,
) {
  return this.gmailService.trashEmails(
    accessToken,
    body.messageIds,
  );
}
}