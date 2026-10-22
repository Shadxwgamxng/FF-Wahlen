/** Textdateien als Zeichenkette einbinden (Vite: "datei.csv?raw", funktioniert auch in Vitest) */
declare module '*?raw' {
  const content: string;
  export default content;
}
