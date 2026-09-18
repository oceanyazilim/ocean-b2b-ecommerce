export type Selection =
  | { kind: "global" }
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string };
