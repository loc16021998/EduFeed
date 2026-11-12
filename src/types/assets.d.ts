// Image imports: Metro returns an asset id (number), Vite returns a URL (string).
declare module '*.png' {
  const source: number | string;
  export default source;
}
