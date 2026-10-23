/** Une plage d'un son source utilisée sur la timeline, en secondes dans la source. */
export interface SourceRange { buffer: AudioBuffer; start: number; duration: number }

const BLOCK_SECONDS = 0.4;
// Recouvrement de 75 % : pas = un quart de bloc
const HOP_DIVISOR = 4;
// Puissances moyennes équivalentes à -70 dB et -10 dB relatifs
const ABSOLUTE_GATE_MS = 10 ** (-70 / 10);
const RELATIVE_GATE_RATIO = 10 ** (-10 / 10);
const MAX_GAIN = 2;

// Approximation : le filtre K de BS.1770 est omis, ce qui suffit pour égaliser des pistes entre elles.

const clampIndex = (index: number, max: number): number => Math.min(Math.max(index, 0), max);

/** Puissance moyenne de toutes les voies entre from (inclus) et to (exclu). */
function meanSquare(channels: Float32Array[], from: number, to: number): number {
  let sum = 0;
  for (let c = 0; c < channels.length; c++) {
    const data = channels[c];
    for (let i = from; i < to; i++) {
      const v = data[i];
      sum += v * v;
    }
  }
  return sum / (channels.length * (to - from));
}

/**
 * Niveau sonore perçu (en dB, proche des LUFS intégrés) de l'ensemble des plages, ou null si tout est silencieux.
 * Blocs de 400 ms avec recouvrement de 75 % ; porte absolue à -70 dB ; porte relative à -10 dB sous la moyenne des blocs retenus.
 */
export function measureLoudness(ranges: SourceRange[]): number | null {
  // Puissances moyennes des blocs de toutes les plages
  const blocks: number[] = [];

  for (const { buffer, start, duration } of ranges) {
    const channelCount = buffer.numberOfChannels;
    if (channelCount === 0) continue;

    const first = clampIndex(Math.floor(start * buffer.sampleRate), buffer.length);
    const end = clampIndex(Math.floor((start + duration) * buffer.sampleRate), buffer.length);
    const sampleCount = end - first;
    if (sampleCount <= 0) continue;

    const channels: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) channels.push(buffer.getChannelData(c));

    const blockSize = Math.max(1, Math.round(BLOCK_SECONDS * buffer.sampleRate));
    if (sampleCount < blockSize) {
      // Plage plus courte qu'un bloc : un seul bloc couvrant toute la plage
      blocks.push(meanSquare(channels, first, end));
      continue;
    }

    const hop = Math.max(1, Math.round(blockSize / HOP_DIVISOR));
    for (let s = first; s + blockSize <= end; s += hop) {
      blocks.push(meanSquare(channels, s, s + blockSize));
    }
  }

  // Porte absolue : écarte aussi les blocs de puissance nulle (silence)
  let keptSum = 0;
  let keptCount = 0;
  for (const ms of blocks) {
    if (ms > ABSOLUTE_GATE_MS) {
      keptSum += ms;
      keptCount++;
    }
  }
  if (keptCount === 0) return null;

  // Porte relative : 10 dB sous la moyenne des blocs retenus
  const relativeGate = (keptSum / keptCount) * RELATIVE_GATE_RATIO;
  let finalSum = 0;
  let finalCount = 0;
  for (const ms of blocks) {
    if (ms > ABSOLUTE_GATE_MS && ms > relativeGate) {
      finalSum += ms;
      finalCount++;
    }
  }
  if (finalCount === 0) return null;

  return 10 * Math.log10(finalSum / finalCount);
}

/**
 * Volumes (0..2) qui amènent chaque piste mesurée au même niveau : la médiane des niveaux mesurés.
 * Une piste à null (silencieuse) n'est pas dans le résultat (on ne touche pas à son volume).
 * Le gain est arrondi à 0,01 près et plafonné à 2.
 */
export function normalizationGains(levels: Map<string, number | null>): Map<string, number> {
  const measured: number[] = [];
  for (const level of levels.values()) {
    if (level !== null) measured.push(level);
  }

  const gains = new Map<string, number>();
  if (measured.length === 0) return gains;

  measured.sort((a, b) => a - b);
  const mid = measured.length >> 1;
  const target = measured.length % 2 === 1 ? measured[mid] : (measured[mid - 1] + measured[mid]) / 2;

  for (const [id, level] of levels) {
    if (level === null) continue;
    const gain = 10 ** ((target - level) / 20);
    const clamped = Math.min(Math.max(gain, 0), MAX_GAIN);
    gains.set(id, Math.round(clamped * 100) / 100);
  }
  return gains;
}
