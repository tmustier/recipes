// The rules for changing a menu's shared board, used by the server (worker.js) and by every phone (menu.js),
// so the two can't disagree about what a tap means.
//
// Each shopping item is in one of these states:
//   (none)  shop item: still to buy. Cupboard or kitchen kit item: not checked yet.
//   have    cupboard or kit: we have it.
//   need    cupboard or kit: missing, so it's on the supermarket list.
//   bought  sorted. For a cupboard or kit item: it was missing and is now bought.
//
// People don't set a state. They say what happened, and nextStatus works it out from the current state:
//   sorted        none -> bought (shop item) or have (cupboard/kit); need -> bought
//   not_sorted    bought -> none (shop item) or need (cupboard/kit); have -> none
//   need_to_buy   cupboard/kit only: -> need
// Every change gives the same result when repeated, so a phone can resend one that may not have arrived.

export const ACTIONS = ["sorted", "not_sorted", "need_to_buy"];

export const emptyBoard = () => ({ items: {}, claims: {}, added: [], v: 0 });

export function nextStatus(current, action, check) {
  if (action === "sorted") return check && current !== "need" && current !== "bought" ? "have" : "bought";
  if (action === "not_sorted") return check && (current === "need" || current === "bought") ? "need" : null;
  return "need";
}

// change: { kind: "item", id, action, check } | { kind: "claim", key, on } | { kind: "add", id, text } | { kind: "remove", id },
// each with `by` (a first name) and `at` (ms). Changes the board in place and returns it.
export function applyChange(board, c) {
  if (c.kind === "item") {
    const status = nextStatus(board.items[c.id]?.status, c.action, c.check);
    if (status) board.items[c.id] = { status, by: c.by, at: c.at };
    else delete board.items[c.id];
  } else if (c.kind === "claim") {
    const names = new Set(board.claims[c.key] ?? []);
    c.on ? names.add(c.by) : names.delete(c.by);
    board.claims[c.key] = [...names];
  } else if (c.kind === "add") {
    if (!board.added.some(a => a.id === c.id)) board.added.push({ id: c.id, text: c.text, by: c.by });
  } else if (c.kind === "remove") {
    board.added = board.added.filter(a => a.id !== c.id);
    delete board.items[c.id];
  }
  return board;
}

export const newExtraId = () => `added-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const EXTRA_ID = /^added-[a-z0-9]+-[a-z0-9]{4,8}$/;
