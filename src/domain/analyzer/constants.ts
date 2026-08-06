export const NON_CONTENT_POS = ["記号", "空白", "BOS/EOS"];
export const SEPARATOR_PATTERN = /^[\s]*(---|＊＊＊|\*\*\*|───|——|━━)[\s]*$/;
export const SEPARATOR_PATTERN_GLOBAL = new RegExp(SEPARATOR_PATTERN.source, "gm");
