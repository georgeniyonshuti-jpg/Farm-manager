import { randomBytes } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

function rfc5322Date(date = new Date()) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

function fromHeader(from) {
  const raw = String(from || "").trim();
  if (raw.includes("<")) return raw;
  return `Clevafarm <${raw}>`;
}

function messageIdFor(from) {
  const domain = String(from).split("@").pop()?.replace(/[<>]/g, "").trim() || "clevagroup.africa";
  return `<${Date.now()}.${randomBytes(8).toString("hex")}@${domain}>`;
}

/**
 * Minimal STARTTLS / SSL SMTP sender for Mailcow.
 * @param {{ host: string, port?: number, user: string, password: string, from: string, secure?: boolean }} cfg
 * @param {{ to: string, subject: string, text: string, html?: string }} mail
 */
export async function sendMail(cfg, mail) {
  if (!cfg?.host || !cfg?.user || !cfg?.password || !cfg?.from) {
    throw new Error("SMTP is not configured");
  }
  const port = Number(cfg.port || 587);
  const useImplicitTls = cfg.secure === true || port === 465;

  const connectPlain = () =>
    new Promise((resolve, reject) => {
      const s = net.connect({ host: cfg.host, port }, () => resolve(s));
      s.once("error", reject);
    });

  const connectTls = (socket) =>
    new Promise((resolve, reject) => {
      const s = tls.connect(
        {
          host: cfg.host,
          port: useImplicitTls ? port : undefined,
          socket,
          servername: cfg.host,
        },
        () => resolve(s),
      );
      s.once("error", reject);
    });

  function readResponse(socket) {
    return new Promise((resolve, reject) => {
      let buf = "";
      const onData = (chunk) => {
        buf += chunk.toString("utf8");
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() ?? "";
        const complete = parts.filter((l) => l.length > 0);
        if (!complete.length) return;
        const last = complete[complete.length - 1];
        if (/^\d{3}-/.test(last)) return;
        const m = /^(\d{3})[ -]/.exec(last);
        if (!m) return;
        socket.off("data", onData);
        socket.off("error", onError);
        resolve({ code: Number(m[1]), lines: complete });
      };
      const onError = (err) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.on("data", onData);
      socket.once("error", onError);
    });
  }

  async function expect(socket, ok, command) {
    if (command !== undefined) socket.write(command.endsWith("\r\n") ? command : `${command}\r\n`);
    const res = await readResponse(socket);
    const allowed = Array.isArray(ok) ? ok : [ok];
    if (!allowed.includes(res.code)) {
      throw new Error(`SMTP ${res.code}: ${res.lines.join(" | ")}`);
    }
    return res;
  }

  const encodeLogin = (value) => Buffer.from(value, "utf8").toString("base64");

  let socket = useImplicitTls ? await connectTls() : await connectPlain();
  try {
    const ehloHost = String(cfg.host).trim();
    await expect(socket, 220);
    await expect(socket, 250, `EHLO ${ehloHost}`);
    if (!useImplicitTls) {
      await expect(socket, 220, "STARTTLS");
      socket = await connectTls(socket);
      await expect(socket, 250, `EHLO ${ehloHost}`);
    }
    await expect(socket, 334, "AUTH LOGIN");
    await expect(socket, 334, encodeLogin(cfg.user));
    await expect(socket, 235, encodeLogin(cfg.password));
    await expect(socket, 250, `MAIL FROM:<${cfg.from}>`);
    await expect(socket, 250, `RCPT TO:<${mail.to}>`);
    await expect(socket, 354, "DATA");
    const boundary = `cleva_${Date.now()}`;
    const headers = [
      `From: ${fromHeader(cfg.from)}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      `Date: ${rfc5322Date()}`,
      `Message-ID: ${messageIdFor(cfg.from)}`,
      "Auto-Submitted: auto-generated",
      "MIME-Version: 1.0",
      mail.html
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : "Content-Type: text/plain; charset=utf-8",
      "",
    ];
    let body;
    if (mail.html) {
      body = [
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        mail.text,
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        mail.html,
        `--${boundary}--`,
        "",
      ].join("\r\n");
    } else {
      body = `${mail.text}\r\n`;
    }
    const data = `${headers.join("\r\n")}${body}`.replace(/^\./gm, "..");
    socket.write(`${data}\r\n.\r\n`);
    await expect(socket, 250);
    await expect(socket, 221, "QUIT");
  } finally {
    socket.destroy();
  }
}

export function smtpConfigFromEnv() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const password = String(process.env.SMTP_PASSWORD || "").trim();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_MAIL_FROM || user).trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  if (!host || !user || !password || !from) return null;
  return { host, port, user, password, from, secure };
}
