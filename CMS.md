# Task: Convert a static landing page into a full-stack site with an admin CMS

## Context
I have an existing landing page built with HTML + Tailwind CSS (attached / in the repo).
I want non-technical staff to update the site's content as easily as posting on Facebook:
pick a file, type some text, press Save. No code edits ever.

Keep the current design and layout exactly as they are. Only replace hard-coded content
with data loaded from the database.

## Recommended stack (use this unless you see a strong reason not to; explain if you deviate)
- Next.js (App Router, TypeScript) + Tailwind CSS, reusing the existing markup
- Supabase: PostgreSQL (database), Auth (admin login), Storage (images/videos/GIFs)
- Deploy target: Vercel + Supabase cloud

## Part 1: Editable content (Admin Dashboard)
Every media field must accept **images, videos, and GIFs**.

1. **Hero section**: main hero video and hero image
2. **Features (10 items)**: title, description, and a pop-up video for each
3. **Portfolio (6 clips)**: cover image, view count, clip title
4. **Reviews (3 cards)**: review text, star rating (1–5), customer name, chat screenshot image

Admin UX requirements:
- Secure login page; only authenticated admins can reach `/admin`
- One clear form per section, with live preview of uploaded media before saving
- Drag-and-drop or click-to-upload; show upload progress; replace or remove existing media
- Validate file type and size; show friendly error messages (Thai-language UI preferred)
- Changes appear on the public landing page right after saving (use on-demand revalidation)
- Mobile-friendly admin, since staff may update content from a phone

## Part 2: Additional features
1. **Thai address autofill from postal code**
   - On the order/checkout form, typing a 5-digit postal code auto-fills
     province (จังหวัด) and district (อำเภอ)
   - One postal code can map to several sub-districts (ตำบล), so show a dropdown to pick one
   - Use an open Thai address dataset bundled locally (no paid API)

2. **Order record + email after payment**
   - Save each order (customer info, address, items, amount, payment status, timestamps)
     in the database
   - When an order is marked paid, send a confirmation email to the customer
     and a notification email to the shop
   - Sender account: spmarketgo@gmail.com via Gmail SMTP, using an App Password
   - Read all credentials from environment variables. Never hard-code secrets,
     never commit them, never log them.
   - Admin dashboard page to view orders and their payment status
   - ASK ME which payment method to support (e.g. bank transfer + slip upload,
     PromptPay QR, Omise, Stripe) before building the payment step.
     Until then, build it so an admin can manually mark an order as paid.

3. **LINE contact**
   - LINE ID: @spgo, link: https://lin.ee/YmWfY9Kv
   - Add a visible "Contact us on LINE" button (floating button on mobile)

## Environment variables (create `.env.example` with placeholders only)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=spmarketgo@gmail.com
SMTP_PASS=            # Gmail App Password, filled in by me
SHOP_NOTIFY_EMAIL=spmarketgo@gmail.com
LINE_URL=https://lin.ee/YmWfY9Kv

## Deliverables
1. Folder structure and full initial codebase
2. SQL migration for all tables, plus Row Level Security policies
   (public can read content; only admins can write; orders are private)
3. Supabase Storage bucket setup, with a note on file-size limits for videos
4. Seed script that loads the current landing page's content into the database
5. README in plain language: local setup, creating the first admin account,
   deploying, and how staff use the dashboard

## Acceptance criteria
- Landing page looks identical to the original but renders from the database
- Logged-out users cannot open any /admin route or write data
- Editing any of the 4 content sections updates the live page without a redeploy
- Postal code autofill works and handles multiple sub-districts
- Marking an order as paid sends both emails successfully
- No secrets appear anywhere in the code or git history

## Working style
- Before coding, give me a short plan and list any questions or assumptions
- Build in stages: (1) database + auth, (2) admin content editing, (3) landing page wiring,
  (4) address autofill, (5) orders + email, (6) LINE button + polish
- Summarize what was done at the end of each stage