import { defaults, type Content } from './defaults';

// Stage 2 will overlay Sanity data here; until then the page renders the defaults.
export async function getContent(): Promise<Content> {
  return defaults;
}
