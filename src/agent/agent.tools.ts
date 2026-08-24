import { FunctionDeclaration, Type } from '@google/genai';

export function getAgentTools(): FunctionDeclaration[] {
  return [
    // =====================================================
    // SEARCH EMAILS
    // =====================================================

    {
      name: 'search_emails',

      description:
        "Search the user's Gmail messages using Gmail search syntax.",

      parameters: {
        type: Type.OBJECT,

        properties: {
          query: {
            type: Type.STRING,

            description:
              'Gmail search query such as is:unread, from:john@example.com, subject:invoice, newer_than:7d.',
          },

          maxResults: {
            type: Type.NUMBER,

            description: 'Maximum number of results. Maximum 50.',
          },
        },

        required: ['query'],
      },
    },

    // =====================================================
    // GET EMAIL
    // =====================================================

    {
      name: 'get_email',

      description: 'Get the complete contents of a Gmail message.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // GET THREAD
    // =====================================================

    {
      name: 'get_thread',

      description: 'Get all messages in a Gmail conversation.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          threadId: {
            type: Type.STRING,

            description: 'Actual Gmail thread ID.',
          },
        },

        required: ['threadId'],
      },
    },

    // =====================================================
    // MARK AS READ
    // =====================================================

    {
      name: 'mark_as_read',

      description: 'Mark one Gmail message as read. Requires user approval.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // MARK AS UNREAD
    // =====================================================

    {
      name: 'mark_as_unread',

      description: 'Mark one Gmail message as unread. Requires user approval.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // STAR
    // =====================================================

    {
      name: 'star_email',

      description: 'Star one Gmail message. Requires user approval.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // ARCHIVE
    // =====================================================

    {
      name: 'archive_email',

      description:
        'Archive one Gmail message by removing it from the inbox. Requires user approval.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // TRASH SINGLE EMAIL
    // =====================================================

    {
      name: 'trash_email',

      description:
        'Move one Gmail message to the trash. Requires user approval.',

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageId: {
            type: Type.STRING,

            description: 'Actual Gmail message ID.',
          },
        },

        required: ['messageId'],
      },
    },

    // =====================================================
    // FIND EMAILS FOR BULK ACTION
    // =====================================================

    {
      name: 'find_emails_for_bulk_action',

      description: `
Find Gmail messages matching a Gmail search query
for a future bulk operation.

Use this tool BEFORE bulk operations.

Examples:

"Delete promotional emails older than 30 days"

query:
category:promotions older_than:30d

"Archive newsletters"

query:
category:updates

"Mark all unread emails from John as read"

query:
from:john is:unread

IMPORTANT:
- Never invent Gmail message IDs.
- The backend returns real Gmail message IDs.
- Do not perform the modification yourself.
`,

      parameters: {
        type: Type.OBJECT,

        properties: {
          query: {
            type: Type.STRING,

            description: 'Valid Gmail search query.',
          },

          maxMessages: {
            type: Type.NUMBER,

            description: 'Maximum number of matching messages. Maximum 5000.',
          },
        },

        required: ['query'],
      },
    },

    // =====================================================
    // TRASH MULTIPLE EMAILS
    // =====================================================

    {
      name: 'trash_emails',

      description: `
Move multiple Gmail messages to the trash.

IMPORTANT:

1. This tool requires user approval.

2. Only use actual Gmail message IDs returned by
find_emails_for_bulk_action or search_emails.

3. Never invent message IDs.

4. Never use this tool before finding the emails.

5. Maximum 5000 message IDs.

Example:

find_emails_for_bulk_action
        ↓
get actual message IDs
        ↓
trash_emails
`,

      parameters: {
        type: Type.OBJECT,

        properties: {
          messageIds: {
            type: Type.ARRAY,

            items: {
              type: Type.STRING,
            },

            description:
              'Actual Gmail message IDs returned by a previous Gmail search.',
          },
        },

        required: ['messageIds'],
      },
    },
  ];
}
