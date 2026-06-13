// Difficulty is shown as a color on a green -> yellow -> red scale (easy -> hard).
// Pokes are shown as a number. The two are independent visual channels.

export const DIFFICULTY_LABELS = ['Easy', 'Manageable', 'Moderate', 'Hard', 'Very hard']

const GREEN: [number, number, number] = [34, 197, 94]
const YELLOW: [number, number, number] = [234, 179, 8]
const RED: [number, number, number] = [220, 38, 38]

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

// difficulty 1..5 -> rgb across green/yellow/red
export function difficultyRgb(difficulty: number): [number, number, number] {
  const d = Math.max(1, Math.min(5, difficulty))
  const t = (d - 1) / 4
  return t < 0.5 ? mix(GREEN, YELLOW, t / 0.5) : mix(YELLOW, RED, (t - 0.5) / 0.5)
}

export function difficultyColor(difficulty: number, alpha = 1): string {
  const [r, g, b] = difficultyRgb(difficulty)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// A readable text color (dark) drawn from the same family, for labels on the
// light difficulty tint.
export function difficultyTextColor(difficulty: number): string {
  const [r, g, b] = mix(difficultyRgb(difficulty), [0, 0, 0], 0.35)
  return `rgb(${r}, ${g}, ${b})`
}

export function difficultyLabel(difficulty: number): string {
  return DIFFICULTY_LABELS[Math.max(1, Math.min(5, difficulty)) - 1]
}
