/**
 * Kopiert die Laufzeitdateien der Sprachausgabe (Phonemizer und ONNX-Runtime) aus node_modules nach
 * public/piper/, damit das Spiel sie ohne Internet laden kann. Läuft vor "dev" und "build".
 * Die Stimmen selbst (große .onnx-Dateien) liegen in public/voices/ und werden nicht ins Repo eingecheckt.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'piper');
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js', 'piper_phonemize.js'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm', 'piper_phonemize.wasm'],
  ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data', 'piper_phonemize.data'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
];
for (const [src, name] of files) {
  const from = join(root, src);
  const to = join(out, name);
  if (!existsSync(from)) {
    console.warn(`Sprachausgabe: ${src} fehlt – "npm install" ausführen.`);
    continue;
  }
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
}
