/** 數字與「年／月／日」之間的空白改為不換行空白，避免「12」與「月」被拆到兩行。 */
export function keepDateTogether(text: string) {
  return text.replace(/(\d) (?=[年月日])/g, "$1\u00a0");
}
