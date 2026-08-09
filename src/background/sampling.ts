import type { OpeningFormat } from "../domain/types.ts";
import { MAX_SAMPLED_EPISODES } from "../shared/constants.ts";
import { classifyOpeningFormat, selectSamplingTarget } from "../domain/analyzer/opening_format.ts";
import type { SampledEpisode } from "../domain/analyzer/opening_format.ts";
import type { FetchedEpisode } from "./fetchers/kakuyomu.ts";

export interface Sampling {
  targetText: string;
  openingType: OpeningFormat;
  sampledCount: number;
  targetEpisodeIndex: number;
  episodeUrl: string;
}

export type FetchNextEpisode = (prev: FetchedEpisode) => Promise<FetchedEpisode | null>;

export async function sampleEpisodes(
  first: FetchedEpisode,
  fetchNext: FetchNextEpisode,
): Promise<Sampling> {
  const episodes: FetchedEpisode[] = [first];

  for (let i = 0; i < MAX_SAMPLED_EPISODES; i++) {
    if (selectSamplingTarget(toSampled(episodes)).done) break;

    const next = await fetchNextEpisodeOrNull(episodes[episodes.length - 1], fetchNext);
    if (next === null) break;
    episodes.push(next);
  }

  const decision = selectSamplingTarget(toSampled(episodes));
  return {
    targetText: decision.targetText,
    openingType: decision.openingType,
    sampledCount: decision.sampledCount,
    targetEpisodeIndex: decision.targetEpisodeIndex,
    episodeUrl: episodes[decision.targetEpisodeIndex].episodeUrl,
  };
}

async function fetchNextEpisodeOrNull(
  prev: FetchedEpisode,
  fetchNext: FetchNextEpisode,
): Promise<FetchedEpisode | null> {
  try {
    return await fetchNext(prev);
  } catch (err) {
    // 取得失敗（削除済み・非公開・アクセス制限）は終端として扱う
    console.warn(`[NQF] Next episode fetch failed:`, err);
    return null;
  }
}

function toSampled(episodes: FetchedEpisode[]): SampledEpisode[] {
  return episodes.map((ep) => ({
    text: ep.text,
    format: classifyOpeningFormat(ep.text, ep.episodeTitle),
  }));
}
