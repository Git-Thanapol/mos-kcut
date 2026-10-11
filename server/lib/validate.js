import crypto from 'node:crypto';

// Prices live on the server: the browser only sends the package key, never the amount.
export const PACKAGES = {
  '390': 'แพ็คเกจ 1 เดือน',
  '3990': 'แพ็คเกจ 1 ปี',
  '5990': 'แพ็คเกจ ตลอดชีพ',
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MAGIC = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

// returns { error } (Thai message) or { order, slip }
export function parseOrder(body) {
  if (!body || typeof body !== 'object') return { error: 'ข้อมูลไม่ถูกต้อง' };
  const pkgKey = String(body.package);
  if (!PACKAGES[pkgKey]) return { error: 'กรุณาเลือกแพ็คเกจ' };
  const payment = body.payment === 'cod' ? 'cod' : body.payment === 'transfer' ? 'transfer' : null;
  if (!payment) return { error: 'กรุณาเลือกวิธีชำระเงิน' };

  const o = {
    firstName: str(body.firstName, 60), lastName: str(body.lastName, 60),
    phone: str(body.phone, 10), email: str(body.email, 120),
    address1: str(body.address1, 200), subdistrict: str(body.subdistrict, 80),
    district: str(body.district, 80), province: str(body.province, 80),
    zip: str(body.zip, 5), note: str(body.note, 300),
  };
  if (!o.firstName || !o.lastName) return { error: 'กรุณากรอกชื่อและนามสกุล' };
  if (!/^0\d{8,9}$/.test(o.phone)) return { error: 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)' };
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return { error: 'อีเมลไม่ถูกต้อง' };
  if (!o.address1) return { error: 'กรุณากรอกที่อยู่จัดส่ง' };
  if (!o.subdistrict || !o.district || !o.province || !/^\d{5}$/.test(o.zip)) return { error: 'กรุณาเลือกตำบล อำเภอ จังหวัด และรหัสไปรษณีย์' };

  const id = `KC-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  let slip = null;
  if (payment === 'transfer') {
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.slip?.dataUrl || '');
    if (!m) return { error: 'กรุณาแนบสลิปการโอนเงิน (JPG, PNG หรือ WebP)' };
    const data = Buffer.from(m[1], 'base64');
    if (data.length > 5 * 1024 * 1024) return { error: 'ไฟล์สลิปใหญ่เกิน 5 MB' };
    const type = MAGIC.find((t) => t.test(data));
    if (!type) return { error: 'ไฟล์สลิปไม่ใช่รูปภาพที่รองรับ' };
    slip = { file: `${id}.${type.ext}`, contentType: type.mime, data };
  }

  return {
    order: { id, status: 'pending', createdAt: new Date().toISOString(), package: pkgKey, packageName: PACKAGES[pkgKey], amount: Number(pkgKey), payment, ...o },
    slip,
  };
}
