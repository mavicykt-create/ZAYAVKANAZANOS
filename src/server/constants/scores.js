export const ACTION_SCORES = {
  login: 1,
  increment: 1,
  decrement: 1,
  complete_category: 10,
  toggle_problem: 1,
  toggle_price: 1,
  print: 2,
  complete_order: 10,
  issue: -5,
};

export function scoreFor(action) {
  return Number(ACTION_SCORES[action] || 0);
}
