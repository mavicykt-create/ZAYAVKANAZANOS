export function getCarryStep(name = '') {
  return /\b1\/\d+\b/.test(name) ? 5 : 1;
}
