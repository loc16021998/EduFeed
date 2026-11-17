export interface QrScannerProps {
  /** Called with the decoded text (the same code at most every ~2.5 s). */
  onCode: (code: string) => void;
  /** Stop decoding (e.g. while a result is being saved). */
  paused?: boolean;
}
