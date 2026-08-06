export const courseColors = ["#7A2E2E", "#A9822E", "#4B6355", "#5B6B7A", "#9C4A45"];

export function formatWeight(weight) {
  return `${Number(weight || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
