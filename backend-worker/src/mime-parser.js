/**
 * Standalone RFC 822 / MIME Parser for Cloudflare Workers
 * No external dependencies required.
 */

function decodeQuotedPrintable(str) {
  if (!str) return '';
  return str
    .replace(/=[\r\n]+/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return match;
      }
    });
}

function decodeBase64(str) {
  if (!str) return '';
  try {
    const clean = str.replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, m => m.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    try {
      return atob(str.replace(/\s+/g, ''));
    } catch (err) {
      return str;
    }
  }
}

function decodeMimeHeader(text) {
  if (!text) return '';
  // Match =?charset?encoding?encoded_text?=
  return text.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (match, charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const binary = atob(data);
        const bytes = Uint8Array.from(binary, m => m.charCodeAt(0));
        return new TextDecoder(charset || 'utf-8').decode(bytes);
      } else if (encoding.toUpperCase() === 'Q') {
        const qp = data.replace(/_/g, ' ');
        return decodeQuotedPrintable(qp);
      }
    } catch (e) {
      return match;
    }
    return match;
  });
}

function parseHeaders(headerBlock) {
  const headers = {};
  const lines = headerBlock.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    if (/^\s+/.test(line) && currentKey) {
      // Continuation line (folding)
      headers[currentKey] += ' ' + line.trim();
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1].toLowerCase().trim();
        headers[currentKey] = match[2].trim();
      } else {
        currentKey = null;
      }
    }
  }
  return headers;
}

function decodeBody(rawBody, encoding) {
  const enc = (encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    return decodeBase64(rawBody);
  } else if (enc === 'quoted-printable') {
    return decodeQuotedPrintable(rawBody);
  }
  return rawBody;
}

export function parseEmail(rawEmail) {
  const separatorMatch = rawEmail.match(/\r?\n\r?\n/);
  if (!separatorMatch) {
    return {
      headers: {},
      subject: '(بدون موضوع)',
      from: '',
      to: '',
      date: new Date().toISOString(),
      text: rawEmail,
      html: '',
    };
  }

  const headerIndex = separatorMatch.index;
  const headerBlock = rawEmail.slice(0, headerIndex);
  const bodyBlock = rawEmail.slice(headerIndex + separatorMatch[0].length);

  const headers = parseHeaders(headerBlock);
  const subject = decodeMimeHeader(headers['subject'] || '(بدون موضوع)');
  const from = decodeMimeHeader(headers['from'] || '');
  const to = decodeMimeHeader(headers['to'] || '');
  const date = headers['date'] || new Date().toISOString();
  const contentType = headers['content-type'] || 'text/plain';

  let text = '';
  let html = '';

  if (contentType.toLowerCase().includes('multipart/')) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const parts = bodyBlock.split(new RegExp(`--${boundary}(?:--)?`));

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed === '--') continue;

        const pSep = trimmed.match(/\r?\n\r?\n/);
        if (!pSep) continue;

        const pHeaderBlock = trimmed.slice(0, pSep.index);
        const pBodyBlock = trimmed.slice(pSep.index + pSep[0].length);
        const pHeaders = parseHeaders(pHeaderBlock);
        const pContentType = (pHeaders['content-type'] || 'text/plain').toLowerCase();
        const pEncoding = pHeaders['content-transfer-encoding'] || '';

        const decoded = decodeBody(pBodyBlock, pEncoding);

        if (pContentType.includes('text/html')) {
          html = decoded;
        } else if (pContentType.includes('text/plain')) {
          text = decoded;
        } else if (pContentType.includes('multipart/')) {
          // Nested multipart support
          const nested = parseEmail(trimmed);
          if (nested.html && !html) html = nested.html;
          if (nested.text && !text) text = nested.text;
        }
      }
    }
  } else {
    const encoding = headers['content-transfer-encoding'] || '';
    const decoded = decodeBody(bodyBlock, encoding);
    if (contentType.toLowerCase().includes('text/html')) {
      html = decoded;
    } else {
      text = decoded;
    }
  }

  return {
    headers,
    subject,
    from,
    to,
    date,
    text: text.trim(),
    html: html.trim(),
  };
}
