import { Cortext } from "../../src/index.js";
import type { Media, ProcessOptions } from "../../src/index.js";

declare const engine: Cortext;
declare const bytes: Uint8Array;
declare const media: Media;
declare const options: ProcessOptions;

// Media objects use the fourth argument for ProcessOptions.
engine.processTextWithMediaJson("text", "source", media, options);
engine.processTextWithMedia("text", "source", media, options);

// Byte media uses an explicit MIME string and the final options argument.
engine.processTextWithMediaJson(
  "text",
  "source",
  bytes,
  "image/png",
  options
);
engine.processTextWithMedia("text", "source", bytes, null, options);
engine.processTextWithMediaJson("text", "source", bytes);

// @ts-expect-error ProcessOptions belongs in the final slot for Uint8Array media.
engine.processTextWithMediaJson("text", "source", bytes, options);
// @ts-expect-error ProcessOptions belongs in the final slot for Uint8Array media.
engine.processTextWithMedia("text", "source", bytes, options);
