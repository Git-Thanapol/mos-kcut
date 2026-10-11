// Sanity Studio schema for the KCUT landing page. NOT yet connected to a real project (see README in this folder).
// Fixed-size lists: create exactly 10 `feature`, 6 `clip`, 3 `review` documents and set `order` 1..N.
import { defineField, defineType } from 'sanity';

const order = defineField({ name: 'order', title: 'ลำดับ', type: 'number', validation: (r) => r.required().integer().min(1) });
const image = (name: string, title: string) => defineField({ name, title, type: 'image', options: { hotspot: false } });
const video = (name: string, title: string) =>
  defineField({ name, title, type: 'file', options: { accept: 'video/mp4' }, description: 'อัปโหลด MP4 ที่บีบอัดแล้ว (แนะนำ 720p ไม่เกิน ~5 MB) เพื่อให้เว็บโหลดเร็ว' });

export const hero = defineType({
  name: 'hero', title: 'ส่วนบนสุด (Hero)', type: 'document',
  fields: [image('image', 'รูป Hero'), video('video', 'วิดีโอสาธิต'), image('poster', 'รูปปกวิดีโอ (แสดงก่อนกดเล่น)')],
});

export const feature = defineType({
  name: 'feature', title: 'ฟีเจอร์ (10 ข้อ)', type: 'document', orderings: [{ title: 'ลำดับ', name: 'o', by: [{ field: 'order', direction: 'asc' }] }],
  fields: [order, defineField({ name: 'title', title: 'หัวข้อ', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'desc', title: 'คำอธิบาย', type: 'text', rows: 3, validation: (r) => r.required() }), video('video', 'วิดีโอ Pop-up')],
  preview: { select: { title: 'title', subtitle: 'order' } },
});

export const clip = defineType({
  name: 'clip', title: 'ผลงาน (6 คลิป)', type: 'document', orderings: [{ title: 'ลำดับ', name: 'o', by: [{ field: 'order', direction: 'asc' }] }],
  fields: [order, defineField({ name: 'title', title: 'ชื่อคลิป', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'subtitle', title: 'คำอธิบายสั้น', type: 'string' }),
    defineField({ name: 'views', title: 'ยอดวิว (ข้อความ เช่น 840,000)', type: 'string', validation: (r) => r.required() }), image('cover', 'รูปปก (สัดส่วน 3:4)')],
  preview: { select: { title: 'title', subtitle: 'views' } },
});

export const review = defineType({
  name: 'review', title: 'รีวิว (3 กล่อง)', type: 'document', orderings: [{ title: 'ลำดับ', name: 'o', by: [{ field: 'order', direction: 'asc' }] }],
  fields: [order, defineField({ name: 'headline', title: 'หัวข้อรีวิว (ขึ้นบรรทัดใหม่ได้)', type: 'text', rows: 2, validation: (r) => r.required() }),
    defineField({ name: 'name', title: 'ชื่อลูกค้า', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'body', title: 'ข้อความรีวิว', type: 'text', rows: 4 }),
    defineField({ name: 'rating', title: 'ดาว (1-5)', type: 'number', initialValue: 5, validation: (r) => r.required().integer().min(1).max(5) }), image('image', 'รูปแชทลูกค้า')],
  preview: { select: { title: 'name', subtitle: 'headline' } },
});

export const schemaTypes = [hero, feature, clip, review];
