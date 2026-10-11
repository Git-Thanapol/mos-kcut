// Email sending. Real Gmail SMTP when SMTP_PASS is set, otherwise MOCK: messages are written to data/outbox/.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const baht = (n) => Number(n).toLocaleString('th-TH');

export function createMailer() {
  const { SMTP_HOST = 'smtp.gmail.com', SMTP_PORT = '465', SMTP_USER, SMTP_PASS } = process.env;
  const shop = process.env.SHOP_NOTIFY_EMAIL || SMTP_USER || 'shop@example.invalid';
  const real = Boolean(SMTP_USER && SMTP_PASS);
  const transport = real ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } }) : null;
  const outbox = path.join(process.env.DATA_DIR || path.resolve('data'), 'outbox');

  async function send({ to, subject, text }) {
    if (!real) {
      fs.mkdirSync(outbox, { recursive: true });
      const file = path.join(outbox, `${Date.now()}-${to.replace(/[^A-Za-z0-9@.-]/g, '_')}.txt`);
      fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
      console.log(`[mail:mock] -> ${to} "${subject}" (${path.basename(file)})`);
      return;
    }
    await transport.sendMail({ from: `KCUT <${SMTP_USER}>`, to, subject, text });
    console.log(`[mail] -> ${to} "${subject}"`);
  }

  const summary = (o) => [
    `เลขที่คำสั่งซื้อ: ${o.id}`,
    `แพ็คเกจ: ${o.packageName} (${baht(o.amount)} บาท)`,
    `ชำระโดย: ${o.payment === 'transfer' ? 'โอนเงิน' : 'เก็บเงินปลายทาง'}`,
    `ผู้สั่งซื้อ: ${o.firstName} ${o.lastName} โทร ${o.phone}`,
    `ที่อยู่จัดส่ง: ${o.address1} ${o.subdistrict} ${o.district} ${o.province} ${o.zip}`,
    o.note ? `หมายเหตุ: ${o.note}` : null,
  ].filter(Boolean).join('\n');

  return {
    name: real ? 'smtp' : 'file (mock)',
    // called when an order becomes paid: customer confirmation (if they gave an email) + shop notification
    async orderPaid(o) {
      const jobs = [send({ to: shop, subject: `[KCUT] ชำระเงินแล้ว ${o.id} - ${baht(o.amount)} บาท`, text: `มีคำสั่งซื้อที่ชำระเงินแล้ว\n\n${summary(o)}` })];
      if (o.email) jobs.push(send({ to: o.email, subject: `KCUT ยืนยันการชำระเงิน ${o.id}`, text: `สวัสดีคุณ ${o.firstName}\n\nเราได้รับการชำระเงินของคุณแล้ว ขอบคุณที่ใช้บริการ KCUT\n\n${summary(o)}\n\nสอบถามเพิ่มเติม LINE: @spgo (https://lin.ee/YmWfY9Kv)` }));
      const results = await Promise.allSettled(jobs);
      results.filter((r) => r.status === 'rejected').forEach((r) => console.error('[mail] failed:', r.reason?.message));
      return results.every((r) => r.status === 'fulfilled');
    },
  };
}

export { esc, baht };
