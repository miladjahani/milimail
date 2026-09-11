import { parseEmail } from './mime-parser.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default {
  /**
   * 1. Cloudflare Email Routing Worker Handler
   * Triggered whenever an incoming email is delivered via Email Routing.
   */
  async email(message, env, ctx) {
    try {
      const rawRecipient = (message.to || '').toLowerCase().trim();
      if (!rawRecipient) {
        console.warn('No recipient found in email message');
        return;
      }

      const rawContent = await new Response(message.raw).text();
      const parsed = parseEmail(rawContent);

      const messageId = crypto.randomUUID();
      const now = new Date().toISOString();

      const emailRecord = {
        id: messageId,
        from: parsed.from || message.from || 'ناشناس',
        to: rawRecipient,
        subject: parsed.subject || '(بدون عنوان)',
        date: parsed.date || now,
        text: parsed.text || '',
        html: parsed.html || '',
        rawSnippet: (parsed.text || parsed.html || '').replace(/<[^>]*>/g, '').substring(0, 160).trim(),
      };

      const kvKey = `mailbox:${rawRecipient}`;
      const existing = (await env.EMAILS_KV.get(kvKey, { type: 'json' })) || [];

      // Add to front of array, keep max 50 recent messages per inbox
      existing.unshift(emailRecord);
      const trimmedList = existing.slice(0, 50);

      // Save to KV with 24 hours TTL (86400 seconds)
      const ttl = parseInt(env.EXPIRATION_TTL || '86400', 10);
      await env.EMAILS_KV.put(kvKey, JSON.stringify(trimmedList), {
        expirationTtl: ttl,
      });

      console.log(`Successfully stored email ${messageId} for ${rawRecipient}`);
    } catch (error) {
      console.error('Error handling incoming email:', error);
    }
  },

  /**
   * 2. HTTP Fetch Handler (REST API for Frontend)
   */
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/' || path === '/api/health') {
      return jsonResponse({
        status: 'online',
        service: 'Turbo Temp Mail API',
        timestamp: new Date().toISOString(),
      });
    }

    // Configuration / Supported Domain info
    if (path === '/api/config' && request.method === 'GET') {
      const domain = env.MAIL_DOMAIN || 'yourdomain.com';
      const extraDomains = env.EXTRA_DOMAINS ? env.EXTRA_DOMAINS.split(',').map(d => d.trim()) : [];
      return jsonResponse({
        domains: [domain, ...extraDomains],
        expirationHours: Math.round(parseInt(env.EXPIRATION_TTL || '86400', 10) / 3600),
      });
    }

    // Get list of messages for an email address
    // GET /api/messages?email=user@domain.com
    if (path === '/api/messages' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      if (!email) {
        return jsonResponse({ error: 'پارامتر email الزامی است' }, 400);
      }

      const kvKey = `mailbox:${email}`;
      const list = (await env.EMAILS_KV.get(kvKey, { type: 'json' })) || [];

      // Return metadata list without huge html body to save bandwidth
      const summaries = list.map(item => ({
        id: item.id,
        from: item.from,
        to: item.to,
        subject: item.subject,
        date: item.date,
        rawSnippet: item.rawSnippet,
        hasHtml: Boolean(item.html),
      }));

      return jsonResponse({ messages: summaries, count: summaries.length });
    }

    // Get single message detail
    // GET /api/message?email=user@domain.com&id=...
    if (path === '/api/message' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      const id = url.searchParams.get('id');

      if (!email || !id) {
        return jsonResponse({ error: 'پارامترهای email و id الزامی هستند' }, 400);
      }

      const kvKey = `mailbox:${email}`;
      const list = (await env.EMAILS_KV.get(kvKey, { type: 'json' })) || [];
      const found = list.find(m => m.id === id);

      if (!found) {
        return jsonResponse({ error: 'پیام یافت نشد' }, 404);
      }

      return jsonResponse({ message: found });
    }

    // Delete single message
    // DELETE /api/message?email=user@domain.com&id=...
    if (path === '/api/message' && request.method === 'DELETE') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      const id = url.searchParams.get('id');

      if (!email || !id) {
        return jsonResponse({ error: 'پارامترهای email و id الزامی هستند' }, 400);
      }

      const kvKey = `mailbox:${email}`;
      const list = (await env.EMAILS_KV.get(kvKey, { type: 'json' })) || [];
      const updated = list.filter(m => m.id !== id);

      const ttl = parseInt(env.EXPIRATION_TTL || '86400', 10);
      await env.EMAILS_KV.put(kvKey, JSON.stringify(updated), {
        expirationTtl: ttl,
      });

      return jsonResponse({ success: true, remaining: updated.length });
    }

    // Delete entire mailbox
    // DELETE /api/messages?email=user@domain.com
    if (path === '/api/messages' && request.method === 'DELETE') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      if (!email) {
        return jsonResponse({ error: 'پارامتر email الزامی است' }, 400);
      }

      const kvKey = `mailbox:${email}`;
      await env.EMAILS_KV.delete(kvKey);
      return jsonResponse({ success: true, message: 'صندوق با موفقیت پاک شد' });
    }

    return jsonResponse({ error: 'مسیر یافت نشد' }, 404);
  },
};
