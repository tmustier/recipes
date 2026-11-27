// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStatus, applyChange, emptyBoard } from "../recipes/board.js";

test("what a tap does to each kind of item", () => {
  const cases = [
    // current, action, cupboard/kit?, result
    [undefined, "sorted", false, "bought"], ["bought", "not_sorted", false, null],
    [undefined, "sorted", true, "have"], ["have", "not_sorted", true, null],
    [undefined, "need_to_buy", true, "need"], ["need", "sorted", true, "bought"], ["bought", "not_sorted", true, "need"],
  ];
  for (const [current, action, check, want] of cases) assert.equal(nextStatus(current, action, check), want, `${current} ${action} ${check}`);
});

test("every change can be sent twice, as a phone does when a reply is lost", () => {
  const changes = [
    { kind: "item", id: "mustard", action: "need_to_buy", check: true, by: "A", at: 1 },
    { kind: "item", id: "mustard", action: "sorted", check: true, by: "A", at: 2 },
    { kind: "item", id: "eggs", action: "sorted", check: false, by: "A", at: 3 },
    { kind: "claim", key: "shop:market", on: true, by: "A" },
    { kind: "add", id: "added-x-1234", text: "Candles", by: "A" },
  ];
  const once = changes.reduce(applyChange, emptyBoard());
  const twice = changes.flatMap(c => [c, c]).reduce(applyChange, emptyBoard());
  assert.deepEqual(twice, once);
});
