import type { RawMetrics, TokenData } from "../types.ts";
import { analyzeSentenceLengths } from "./sentence_length.ts";
import { analyzeParagraphLengths, analyzeSingleSentParagraphs } from "./paragraph.ts";
import { countSeparators } from "./separator.ts";
import { analyzeDialogues } from "./dialogue.ts";
import { analyzeVocabularyDiversity } from "./vocabulary.ts";
import { analyzeDescriptionDensity } from "./description_density.ts";
import { analyzeTaigendome } from "./taigendome.ts";
import { analyzeEmotionDirectness } from "./emotion_directness.ts";
import { analyzeLogicalConnectives } from "./logical_connective.ts";
import { analyzeParagraphTransitions } from "./paragraph_transition.ts";
import { analyzeSentenceLengthBurstiness } from "./sentence_length_burstiness.ts";

export function analyzeAll(
  text: string,
  tokens: TokenData[],
  tokenizeFn: (s: string) => TokenData[],
): RawMetrics {
  const { sd: sentenceLengthSD } = analyzeSentenceLengths(text);
  const { ratio: singleSentParaRatio } = analyzeSingleSentParagraphs(text);
  const { sd: paragraphLengthSD } = analyzeParagraphLengths(text);
  const sepCount = countSeparators(text);
  const sentences = text.split(/。/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  const { ttr } = analyzeVocabularyDiversity(tokens);
  const { count: dialogueCount, variety: dialogueEndingVariety } = analyzeDialogues(
    text,
    tokenizeFn,
  );
  const { sd: descriptionDensitySD } = analyzeDescriptionDensity(text, tokenizeFn);
  const { entropy: taigendomeEntropy } = analyzeTaigendome(text, tokenizeFn);
  const { ratio: emotionDirectnessRatio } = analyzeEmotionDirectness(
    text,
    tokenizeFn,
  );
  const { density: logicalConnectiveDensity } = analyzeLogicalConnectives(text);
  const { entropy: paragraphTransitionEntropy } = analyzeParagraphTransitions(
    text,
    tokenizeFn,
  );

  return {
    charCount: text.length,
    sentenceCount,
    sentenceLengthSD,
    singleSentParaRatio,
    paragraphLengthSD,
    separatorCount: sepCount,
    separatorFrequency: sentenceCount > 0 ? sepCount / sentenceCount : 0,
    ttr,
    dialogueCount,
    dialogueEndingVariety,
    descriptionDensitySD,
    taigendomeEntropy,
    emotionDirectnessRatio,
    logicalConnectiveDensity,
    paragraphTransitionEntropy,
    sentenceLengthBurstiness: analyzeSentenceLengthBurstiness(text).burstiness,
  };
}

export { analyzeSentenceLengths } from "./sentence_length.ts";
export { analyzeParagraphLengths, analyzeSingleSentParagraphs } from "./paragraph.ts";
export { countSeparators, separatorFrequency } from "./separator.ts";
export { analyzeDialogues } from "./dialogue.ts";
export { analyzeVocabularyDiversity } from "./vocabulary.ts";
export { analyzeDescriptionDensity } from "./description_density.ts";
export { analyzeTaigendome } from "./taigendome.ts";
export { analyzeEmotionDirectness } from "./emotion_directness.ts";
export { analyzeLogicalConnectives } from "./logical_connective.ts";
export { analyzeParagraphTransitions } from "./paragraph_transition.ts";
export { analyzeSentenceLengthBurstiness } from "./sentence_length_burstiness.ts";
