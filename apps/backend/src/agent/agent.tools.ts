import { FunctionDeclaration, Type } from '@google/genai';

import { EMAIL_OPERATIONS } from '../gmail/gmail-operations';

// Tools that change the mailbox or send mail. Calling one creates an
// approval request; nothing happens until the user approves it.
export const APPROVAL_TOOLS = new Set([
  'modify_emails',
  'send_email',
  'reply_to_email',
]);

export function getAgentTools(): FunctionDeclaration[] {
  return [
    // =====================================================
    // READ TOOLS
    // =====================================================

    {
      name: 'search_emails',
      description:
        'Search Gmail and return short summaries (id, threadId, from, to, subject, date, snippet, labels, unread, starred, attachment count). ' +
        'Use this to find emails, answer questions about the inbox, or get message IDs for specific emails.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              'Gmail search query, e.g. "is:unread newer_than:1d", "from:amazon.in subject:order", "category:promotions older_than:30d". Use "in:inbox" for the inbox, or "" for all mail.',
          },
          maxResults: {
            type: Type.NUMBER,
            description: 'Number of emails to return, 1-25. Default 10.',
          },
        },
        required: ['query'],
      },
    },

    {
      name: 'count_emails',
      description:
        'Count how many emails match a Gmail search query (exact up to 5000). Use for "how many" questions and before proposing bulk actions.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Gmail search query.' },
        },
        required: ['query'],
      },
    },

    {
      name: 'read_email',
      description:
        'Read one email in full (headers, plain-text body, attachment names). Use when you need the content, e.g. to summarise or reply.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          messageId: {
            type: Type.STRING,
            description: 'Message id from search_emails.',
          },
        },
        required: ['messageId'],
      },
    },

    {
      name: 'read_thread',
      description: 'Read a whole conversation (up to its last 10 messages).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          threadId: {
            type: Type.STRING,
            description: 'threadId from search_emails.',
          },
        },
        required: ['threadId'],
      },
    },

    {
      name: 'list_labels',
      description: "List the user's Gmail labels (name and id).",
      parameters: { type: Type.OBJECT, properties: {} },
    },

    // =====================================================
    // APPROVAL TOOLS
    // =====================================================

    {
      name: 'modify_emails',
      description:
        'Change emails: trash, restore from trash, archive, move to inbox, mark read/unread, star/unstar, mark important/not important, add/remove a label, or report spam. ' +
        'Target EITHER specific emails by messageIds (from search_emails) OR every email matching a Gmail query (bulk). ' +
        'For bulk requests like "delete all promotions older than a month" pass a query; the backend finds the matching emails itself. ' +
        'This creates an approval request shown to the user; it does not run until they approve.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          operation: {
            type: Type.STRING,
            enum: [...EMAIL_OPERATIONS],
            description: 'What to do. "trash" is how emails are deleted.',
          },
          messageIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Specific message ids from search_emails (max 100). Omit when using query.',
          },
          query: {
            type: Type.STRING,
            description:
              'Gmail search query selecting every email to change (bulk, up to 5000). Omit when using messageIds. ' +
              'For restore, use a query that includes "in:trash".',
          },
          labelName: {
            type: Type.STRING,
            description:
              'Label name, required for add_label and remove_label. Must be an existing label.',
          },
        },
        required: ['operation'],
      },
    },

    {
      name: 'send_email',
      description:
        'Send a new email to one or more recipients. Set sendSeparately to send each "to" recipient their own individual copy (they will not see each other). ' +
        'Write a complete, well-formatted plain-text body signed with the user\'s name. Creates an approval request; nothing is sent until the user approves.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          to: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Recipient email addresses.',
          },
          cc: { type: Type.ARRAY, items: { type: Type.STRING } },
          bcc: { type: Type.ARRAY, items: { type: Type.STRING } },
          subject: { type: Type.STRING },
          body: { type: Type.STRING, description: 'Plain-text message body.' },
          sendSeparately: {
            type: Type.BOOLEAN,
            description:
              'true = one separate email per "to" recipient (cc/bcc ignored). Default false.',
          },
        },
        required: ['to', 'subject', 'body'],
      },
    },

    {
      name: 'reply_to_email',
      description:
        'Reply to an email in its existing thread. Recipients and "Re:" subject are filled in automatically. Read the email first so the reply is relevant. Creates an approval request.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          messageId: {
            type: Type.STRING,
            description: 'Message id of the email being replied to.',
          },
          body: { type: Type.STRING, description: 'Plain-text reply body.' },
          replyAll: {
            type: Type.BOOLEAN,
            description: 'Also reply to everyone in To/Cc. Default false.',
          },
        },
        required: ['messageId', 'body'],
      },
    },
  ];
}
