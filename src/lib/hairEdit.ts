// hairEdit.ts
// The pure edits the Manage "Hair options" screen makes to a HairConfig (add, rename, reorder,
// hide, delete, set the call flag, change the picture). Each returns a NEW config and never
// changes its input, so the screen can keep an undo-able draft and the edits are unit-tested.
// Ids are made once, when an item is added, and never change (answers refer to them).

import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_QUESTIONS_PER_SECTION,
  slugId,
  type HairConfig,
  type HairOption,
  type HairQuestion,
  type HairSectionId,
  type HairVisual,
} from "./hairProfile";

/** Moves list[index] by delta places (-1 up, +1 down), staying inside the list. */
export const moveItem = <T>(list: readonly T[], index: number, delta: -1 | 1): T[] => {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

const mapSection = (c: HairConfig, id: HairSectionId, f: (qs: HairQuestion[]) => HairQuestion[]): HairConfig => ({
  sections: c.sections.map((s) => (s.id === id ? { ...s, questions: f(s.questions) } : s)),
});

const mapQuestion = (c: HairConfig, section: HairSectionId, qid: string, f: (q: HairQuestion) => HairQuestion): HairConfig =>
  mapSection(c, section, (qs) => qs.map((q) => (q.id === qid ? f(q) : q)));

const mapOption = (c: HairConfig, section: HairSectionId, qid: string, oid: string, f: (o: HairOption) => HairOption): HairConfig =>
  mapQuestion(c, section, qid, (q) => ({ ...q, options: q.options.map((o) => (o.id === oid ? f(o) : o)) }));

const idsOfQuestions = (c: HairConfig) => c.sections.flatMap((s) => s.questions.map((q) => q.id));

export const renameSection = (c: HairConfig, id: HairSectionId, title: string): HairConfig => ({
  sections: c.sections.map((s) => (s.id === id ? { ...s, title } : s)),
});

export const addQuestion = (c: HairConfig, section: HairSectionId, label: string): HairConfig => {
  const target = c.sections.find((s) => s.id === section);
  if (!target || target.questions.length >= MAX_QUESTIONS_PER_SECTION || !label.trim()) return c;
  const q: HairQuestion = { id: slugId(label, idsOfQuestions(c)), label: label.trim(), options: [] };
  return mapSection(c, section, (qs) => [...qs, q]);
};

export const updateQuestion = (
  c: HairConfig, section: HairSectionId, qid: string, patch: Partial<Pick<HairQuestion, "label" | "multi" | "required" | "hidden">>,
): HairConfig => mapQuestion(c, section, qid, (q) => ({ ...q, ...patch }));

export const removeQuestion = (c: HairConfig, section: HairSectionId, qid: string): HairConfig =>
  mapSection(c, section, (qs) => qs.filter((q) => q.id !== qid));

export const moveQuestion = (c: HairConfig, section: HairSectionId, qid: string, delta: -1 | 1): HairConfig =>
  mapSection(c, section, (qs) => moveItem(qs, qs.findIndex((q) => q.id === qid), delta));

export const addOption = (c: HairConfig, section: HairSectionId, qid: string, label: string): HairConfig => {
  const q = c.sections.find((s) => s.id === section)?.questions.find((x) => x.id === qid);
  if (!q || q.options.length >= MAX_OPTIONS_PER_QUESTION || !label.trim()) return c;
  // option ids only need to be unique inside the question
  const option: HairOption = {
    id: slugId(label, q.options.map((o) => o.id)),
    label: label.trim(),
    visual: { kind: "text", text: label.trim().slice(0, 20) },
  };
  return mapQuestion(c, section, qid, (x) => ({ ...x, options: [...x.options, option] }));
};

export const updateOption = (
  c: HairConfig, section: HairSectionId, qid: string, oid: string,
  patch: Partial<Pick<HairOption, "label" | "hidden" | "callFlag" | "visual">>,
): HairConfig =>
  mapOption(c, section, qid, oid, (o) => {
    const next = { ...o, ...patch };
    // an unticked flag or a shown option is the default: don't store it
    if (next.callFlag === false) delete next.callFlag;
    if (next.hidden === false) delete next.hidden;
    return next;
  });

export const setVisual = (c: HairConfig, section: HairSectionId, qid: string, oid: string, visual: HairVisual): HairConfig =>
  updateOption(c, section, qid, oid, { visual });

export const removeOption = (c: HairConfig, section: HairSectionId, qid: string, oid: string): HairConfig =>
  mapQuestion(c, section, qid, (q) => ({ ...q, options: q.options.filter((o) => o.id !== oid) }));

export const moveOption = (c: HairConfig, section: HairSectionId, qid: string, oid: string, delta: -1 | 1): HairConfig =>
  mapQuestion(c, section, qid, (q) => ({ ...q, options: moveItem(q.options, q.options.findIndex((o) => o.id === oid), delta) }));
