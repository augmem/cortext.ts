import { loadNative } from "./load-native.js";
import { ensureDefaultAistModelPathSync } from "./model-bootstrap.js";
import type {
  ConsolidationState,
  CortextConfig,
  CortextContext,
  Media,
  NativeCortext,
  NativeCortextConstructor,
  ProcessOptions,
} from "./types.js";

function normalizeMedia(
  media: Media | Uint8Array | null | undefined,
  mediaMimeType: string | ProcessOptions | null | undefined,
  options: ProcessOptions | null | undefined
): [Uint8Array | null | undefined, string | null | undefined, ProcessOptions | null | undefined] {
  if (
    media &&
    typeof media === "object" &&
    "data" in media &&
    "mimetype" in media
  ) {
    const resolvedOptions =
      options === undefined &&
      mediaMimeType !== null &&
      mediaMimeType !== undefined &&
      typeof mediaMimeType === "object"
        ? mediaMimeType
        : options;
    return [media.data, media.mimetype, resolvedOptions];
  }
  if (
    mediaMimeType !== null &&
    mediaMimeType !== undefined &&
    typeof mediaMimeType === "object"
  ) {
    throw new TypeError(
      "ProcessOptions is only valid in the final argument when media is a Uint8Array"
    );
  }
  return [media, mediaMimeType, options];
}

/**
 * Ensure public process* objects always expose `consolidation_state`.
 * Older natives emitted boolean consolidation_recommended/required only.
 */
function normalizeContext(raw: Record<string, unknown>): CortextContext {
  if (typeof raw.consolidation_state === "string") {
    return raw as CortextContext;
  }
  let state: ConsolidationState = "none";
  if (raw.consolidation_required === true) {
    state = "required";
  } else if (raw.consolidation_recommended === true) {
    state = "recommended";
  }
  return { ...raw, consolidation_state: state } as CortextContext;
}

function parseContext(json: string): CortextContext {
  return normalizeContext(JSON.parse(json) as Record<string, unknown>);
}

/**
 * High-level Cortext engine handle.
 *
 * Wraps the N-API `NativeCortext` class with JSON parse helpers and optional
 * default AIST model path injection for non-embedded setups.
 */
export class Cortext {
  readonly #inner: NativeCortext;

  constructor(config?: CortextConfig | null, dbPath?: string | null);
  constructor(dbPath: string);
  constructor(
    config?: CortextConfig | string | null,
    dbPath?: string | null
  ) {
    const Native = loadNative().NativeCortext;
    const hadModelEnv = Object.prototype.hasOwnProperty.call(
      process.env,
      "CORTEXT_AIST_MODEL_PATH"
    );
    const previousModelEnv = process.env.CORTEXT_AIST_MODEL_PATH;
    const defaultModel = hadModelEnv
      ? undefined
      : ensureDefaultAistModelPathSync();
    if (!hadModelEnv && defaultModel) {
      process.env.CORTEXT_AIST_MODEL_PATH = defaultModel;
    }
    try {
      if (typeof config === "string") {
        this.#inner = new (Native as NativeCortextConstructor)(config);
      } else {
        this.#inner = new (Native as NativeCortextConstructor)(config, dbPath);
      }
    } finally {
      if (!hadModelEnv) {
        delete process.env.CORTEXT_AIST_MODEL_PATH;
      } else if (previousModelEnv !== undefined) {
        process.env.CORTEXT_AIST_MODEL_PATH = previousModelEnv;
      }
    }
  }

  processTextJson(
    text: string,
    sourceId: string,
    options?: ProcessOptions | null
  ): string {
    return this.#inner.processTextJson(text, sourceId, options);
  }

  processTextWithMediaJson(
    text: string,
    sourceId: string,
    media: Media,
    options?: ProcessOptions | null
  ): string;
  processTextWithMediaJson(
    text: string,
    sourceId: string,
    media?: Uint8Array | null,
    mediaMimeType?: string | null,
    options?: ProcessOptions | null
  ): string;
  processTextWithMediaJson(
    text: string,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): string {
    const [mediaData, mimetype, resolvedOptions] = normalizeMedia(
      media,
      mediaMimeType,
      options
    );
    return this.#inner.processTextWithMediaJson(
      text,
      sourceId,
      mediaData,
      mimetype,
      resolvedOptions
    );
  }

  processText(
    text: string,
    sourceId: string,
    options?: ProcessOptions | null
  ): CortextContext {
    return parseContext(this.processTextJson(text, sourceId, options));
  }

  processTextWithMedia(
    text: string,
    sourceId: string,
    media: Media,
    options?: ProcessOptions | null
  ): CortextContext;
  processTextWithMedia(
    text: string,
    sourceId: string,
    media?: Uint8Array | null,
    mediaMimeType?: string | null,
    options?: ProcessOptions | null
  ): CortextContext;
  processTextWithMedia(
    text: string,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): CortextContext {
    const [mediaData, mimetype, resolvedOptions] = normalizeMedia(
      media,
      mediaMimeType,
      options
    );
    return parseContext(
      this.processTextWithMediaJson(
        text,
        sourceId,
        mediaData,
        mimetype,
        resolvedOptions
      )
    );
  }

  processAudioJson(
    pcm: Float32Array,
    sourceId: string,
    options?: ProcessOptions | null
  ): string {
    return this.#inner.processAudioJson(pcm, sourceId, options);
  }

  processAudio(
    pcm: Float32Array,
    sourceId: string,
    options?: ProcessOptions | null
  ): CortextContext {
    return parseContext(this.processAudioJson(pcm, sourceId, options));
  }

  processAudioWithMediaJson(
    pcm: Float32Array,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): string {
    const [mediaData, mimetype, resolvedOptions] = normalizeMedia(
      media,
      mediaMimeType,
      options
    );
    return this.#inner.processAudioWithMediaJson(
      pcm,
      sourceId,
      mediaData,
      mimetype,
      resolvedOptions
    );
  }

  processAudioWithMedia(
    pcm: Float32Array,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): CortextContext {
    return parseContext(
      this.processAudioWithMediaJson(
        pcm,
        sourceId,
        media,
        mediaMimeType,
        options
      )
    );
  }

  processImageJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    options?: ProcessOptions | null
  ): string {
    return this.#inner.processImageJson(
      data,
      width,
      height,
      channels,
      sourceId,
      options
    );
  }

  processImage(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    options?: ProcessOptions | null
  ): CortextContext {
    return parseContext(
      this.processImageJson(data, width, height, channels, sourceId, options)
    );
  }

  processImageWithMediaJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): string {
    const [mediaData, mimetype, resolvedOptions] = normalizeMedia(
      media,
      mediaMimeType,
      options
    );
    return this.#inner.processImageWithMediaJson(
      data,
      width,
      height,
      channels,
      sourceId,
      mediaData,
      mimetype,
      resolvedOptions
    );
  }

  processImageWithMedia(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    media?: Media | Uint8Array | null,
    mediaMimeType?: string | ProcessOptions | null,
    options?: ProcessOptions | null
  ): CortextContext {
    return parseContext(
      this.processImageWithMediaJson(
        data,
        width,
        height,
        channels,
        sourceId,
        media,
        mediaMimeType,
        options
      )
    );
  }

  embedTextJson(text: string): string {
    return this.#inner.embedTextJson(text);
  }

  embedText(text: string): number[] {
    return (
      JSON.parse(this.embedTextJson(text)) as { embedding: number[] }
    ).embedding;
  }

  embedAudioJson(pcm: Float32Array): string {
    return this.#inner.embedAudioJson(pcm);
  }

  embedAudio(pcm: Float32Array): number[] {
    return (
      JSON.parse(this.embedAudioJson(pcm)) as { embedding: number[] }
    ).embedding;
  }

  embedImageJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number
  ): string {
    return this.#inner.embedImageJson(data, width, height, channels);
  }

  embedImage(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number
  ): number[] {
    return (
      JSON.parse(
        this.embedImageJson(data, width, height, channels)
      ) as { embedding: number[] }
    ).embedding;
  }

  consolidateJson(): string {
    return this.#inner.consolidateJson();
  }

  consolidate(): CortextContext {
    return parseContext(this.consolidateJson());
  }

  flush(): void {
    this.#inner.flush();
  }

  reset(): void {
    this.#inner.reset();
  }
}
