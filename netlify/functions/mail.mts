import type { Context, Config } from "@netlify/functions";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const IMAP_HOST = "mail.securemail.pro";
const IMAP_PORT = 993;
const ALLOWED_ACCOUNT = "geral@vitalveg.pt";
const FETCH_LIMIT_PER_FOLDER = 20;
const FINAL_MESSAGE_LIMIT = 20;

function cleanAddress(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(cleanAddress).filter(Boolean).join(", ");
  if (value.address) return value.name ? `${value.name} <${value.address}>` : value.address;
  if (value.value && Array.isArray(value.value)) {
    return value.value.map((x: any) => x.name ? `${x.name} <${x.address}>` : x.address).join(", ");
  }
  return String(value);
}

async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const tree: any = await client.list();
  const flat = Array.isArray(tree) ? tree : [];
  const special = flat.find((x: any) => String(x.specialUse || "").toLowerCase() === "\\sent");
  if (special?.path) return special.path;
  const byName = flat.find((x: any) => /(^|\/)(sent|sent items|sent messages|enviados|enviadas)$/i.test(String(x.path || x.name || "")));
  return byName?.path || null;
}

async function fetchFolder(client: ImapFlow, folder: string, limit: number, direction: "in" | "out") {
  const out: any[] = [];
  const lock = await client.getMailboxLock(folder);
  try {
    const total = Number(client.mailbox?.exists || 0);
    if (!total) return out;
    const start = Math.max(1, total - limit + 1);
    for await (const msg of client.fetch(`${start}:*`, { uid: true, envelope: true, source: true, flags: true })) {
      try {
        const parsed: any = await simpleParser(msg.source as Buffer);
        const envelope: any = msg.envelope || {};
        out.push({
          id: `${folder}:${msg.uid}`,
          uid: msg.uid,
          folder,
          direction,
          date: (parsed.date || envelope.date || new Date()).toISOString(),
          from: cleanAddress(parsed.from || envelope.from),
          to: cleanAddress(parsed.to || envelope.to),
          subject: String(parsed.subject || envelope.subject || "(sem assunto)"),
          messageId: String(parsed.messageId || envelope.messageId || ""),
          inReplyTo: String(parsed.inReplyTo || ""),
          references: Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : []),
          text: String(parsed.text || "").trim(),
          html: "",
          flags: Array.from(msg.flags || []).map(String)
        });
      } catch {
        // Uma mensagem malformada não deve bloquear a sincronização inteira.
      }
    }
  } finally {
    lock.release();
  }
  return out;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Método não permitido" }, { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const user = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!user || !password) {
    return Response.json({ error: "Email e palavra-passe são obrigatórios" }, { status: 400 });
  }
  if (user !== ALLOWED_ACCOUNT) {
    return Response.json({ error: "Esta central está limitada ao email VitalVeg configurado." }, { status: 403 });
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user, pass: password },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  try {
    await client.connect();

    const inbox = await fetchFolder(client, "INBOX", FETCH_LIMIT_PER_FOLDER, "in");
    let sentFolder: string | null = null;
    let sent: any[] = [];
    let sentWarning = "";

    try {
      sentFolder = await findSentFolder(client);
      if (sentFolder) sent = await fetchFolder(client, sentFolder, FETCH_LIMIT_PER_FOLDER, "out");
    } catch (error: any) {
      sentWarning = String(error?.message || "Não foi possível ler a pasta Enviados");
    }

    const messages = [...inbox, ...sent]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, FINAL_MESSAGE_LIMIT);

    return Response.json({
      ok: true,
      account: user,
      sentFolder,
      sentWarning,
      fetchedAt: new Date().toISOString(),
      limits: { inbox: FETCH_LIMIT_PER_FOLDER, sent: FETCH_LIMIT_PER_FOLDER, returned: FINAL_MESSAGE_LIMIT },
      messages
    });
  } catch (error: any) {
    const authFailed = Boolean(error?.authenticationFailed) || /auth|login|password|credentials/i.test(String(error?.message || ""));
    const text = authFailed
      ? "Falha de autenticação no email. Confirma a palavra-passe da caixa geral@vitalveg.pt."
      : `Erro IMAP: ${String(error?.message || "Não foi possível ligar ao servidor de email")}`;
    return Response.json({ error: text }, { status: authFailed ? 401 : 502 });
  } finally {
    try { await client.logout(); } catch {}
  }
};

export const config: Config = {
  path: "/api/mail"
};
