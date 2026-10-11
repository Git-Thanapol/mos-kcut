# Sanity Studio (not connected yet)

The site works without Sanity: `site/src/data/defaults.ts` is used until `SANITY_PROJECT_ID` is set.

## Connect it later
1. `npm create sanity@latest` (choose "Clean project", dataset `production`, TypeScript) and copy
   `schemaTypes/index.ts` from this folder over the generated `schemaTypes`.
2. In the Studio, create 1 `hero`, 10 `feature`, 6 `clip`, 3 `review` documents (set `order` 1..N).
   Anything left empty keeps the default from `defaults.ts`.
3. Make the dataset public-read (the page only reads published content), then build the site with
   `SANITY_PROJECT_ID=<id> SANITY_DATASET=production npm run build`.
4. In Sanity -> API -> Webhooks, call your rebuild hook on publish (see docs/DEPLOY-UBUNTU.md, step 7).

Status: the schema and the GROQ query in `site/src/data/content.ts` are written but untested against a real project.
Videos are served as uploaded (Sanity does not transcode them) — upload compressed MP4s.
