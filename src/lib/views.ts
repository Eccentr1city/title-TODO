// The main pane shows one view: the inbox (null), a list (its id), or one of these.
export type View = string | null;

export const VIEW = {
  inbox: null,
  completed: "__completed__",
  search: "__search__",
  refactor: "__refactor__",
} as const;

export const isListView = (v: View): v is string => !!v && !v.startsWith("__");
