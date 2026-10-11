import { defaults, type Content } from './defaults';

// Content source. MOCK by default: the page renders `defaults` (the current landing page).
// Set SANITY_PROJECT_ID (and optionally SANITY_DATASET) at build time to overlay live content from Sanity.
// Any field missing in Sanity falls back to the default at the same position, so a half-filled CMS never breaks the page.
const PROJECT = import.meta.env.SANITY_PROJECT_ID as string | undefined;
const DATASET = (import.meta.env.SANITY_DATASET as string | undefined) || 'production';

const QUERY = `{
  "hero": *[_type=="hero"][0]{ "image": image.asset->url, "video": video.asset->url, "poster": poster.asset->url },
  "features": *[_type=="feature"]|order(order asc){ title, desc, "video": video.asset->url },
  "clips": *[_type=="clip"]|order(order asc){ views, title, subtitle, "cover": cover.asset->url },
  "reviews": *[_type=="review"]|order(order asc){ rating, headline, name, body, "image": image.asset->url }
}`;

// Sanity serves images through an image CDN: ask for web-friendly size/format (GIFs and videos are left untouched).
const img = (url?: string, w = 1280) => (url && !/\.(gif|mp4|webm)$/i.test(url) ? `${url}?w=${w}&auto=format&q=80` : url);
const pick = <T>(v: T | null | undefined, fallback: T): T => (v === null || v === undefined || v === '' ? fallback : v);

function merge(base: Content, r: any): Content {
  const list = <T extends object>(src: T[], remote: any[] | undefined, map: (d: T, x: any) => T) =>
    src.map((d, i) => (remote?.[i] ? map(d, remote[i]) : d));
  return {
    hero: {
      image: pick(img(r.hero?.image), base.hero.image),
      video: pick(r.hero?.video, base.hero.video),
      poster: pick(img(r.hero?.poster), base.hero.poster),
    },
    features: list(base.features, r.features, (d, x) => ({ title: pick(x.title, d.title), desc: pick(x.desc, d.desc), video: pick(x.video, d.video) })),
    clips: list(base.clips, r.clips, (d, x) => ({ views: pick(x.views, d.views), title: pick(x.title, d.title), subtitle: pick(x.subtitle, d.subtitle), cover: pick(img(x.cover, 600), d.cover) })),
    reviews: list(base.reviews, r.reviews, (d, x) => ({
      rating: Math.min(5, Math.max(1, Number(pick(x.rating, d.rating)))), headline: pick(x.headline, d.headline),
      name: pick(x.name, d.name), body: pick(x.body, d.body), image: pick(img(x.image, 1000), d.image),
    })),
  };
}

export async function getContent(): Promise<Content> {
  if (!PROJECT) return defaults;
  try {
    const url = `https://${PROJECT}.apicdn.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(QUERY)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return merge(defaults, (await res.json()).result ?? {});
  } catch (err) {
    console.warn(`[content] Sanity unavailable (${(err as Error).message}); using defaults`);
    return defaults;
  }
}
