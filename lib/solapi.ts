// Server-only — never import from client components.
// Honors SOLAPI_MOCK=true → fake success, no real HTTP call.

export type SolapiChannel = "alimtalk" | "sms" | "email";

export interface ChannelCreds {
  apiKey: string;       // decrypted per-owner key
  senderId?: string;    // from send_channels.sender_number
  kakaoChannelId?: string;
}

export interface SendOneParams {
  channel: SolapiChannel;
  to: string;            // phone (E.164 or 01x) for sms/alimtalk, email addr for email
  content: string;
  templateId?: string;
  channelCreds: ChannelCreds;
}

export interface SendOneResult {
  ok: boolean;
  provider_msg_id: string;
  error?: string;
}

function mockMsgId(): string {
  return "mock_" + Math.random().toString(36).slice(2, 10);
}

export async function sendOne(params: SendOneParams): Promise<SendOneResult> {
  if (process.env.SOLAPI_MOCK === "true") {
    return { ok: true, provider_msg_id: mockMsgId() };
  }

  const { channel, to, content, templateId, channelCreds } = params;

  // Solapi REST endpoint
  const endpoint = "https://api.solapi.com/messages/v4/send";

  const body: Record<string, unknown> = {
    message: {
      to,
      from: channelCreds.senderId ?? "",
      text: content,
    },
  };

  if (channel === "alimtalk" && channelCreds.kakaoChannelId && templateId) {
    body.message = {
      ...(body.message as Record<string, unknown>),
      type: "ATA",
      kakaoOptions: {
        pfId: channelCreds.kakaoChannelId,
        templateId,
      },
    };
  } else if (channel === "sms") {
    (body.message as Record<string, unknown>).type = "SMS";
  }

  // Solapi HMAC-MD5 date-based auth
  const date = new Date().toISOString();
  const salt = Math.random().toString(36).slice(2, 12);
  const hmacData = date + salt;
  const { createHmac } = await import("crypto");
  const signature = createHmac("md5", channelCreds.apiKey)
    .update(hmacData)
    .digest("hex");

  const authHeader = `HMAC-MD5 apiKey=${channelCreds.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return { ok: false, provider_msg_id: "", error: `HTTP ${resp.status}: ${errText}` };
  }

  const json = (await resp.json()) as { messageId?: string; groupId?: string };
  const msgId = json.messageId ?? json.groupId ?? "";
  return { ok: true, provider_msg_id: msgId };
}
