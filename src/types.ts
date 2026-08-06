/** Engine configuration knobs (0–1 floats unless noted). */
export interface CortextConfig {
  focus?: number;
  sensitivity?: number;
  stability?: number;
  affectInterrupt?: boolean;
  affectRetrieval?: boolean;
  reinforcementEnabled?: boolean;
  proceduralEnabled?: boolean;
  sequentialEdgesEnabled?: boolean;
  signalFilterAudioEnabled?: boolean;
  signalFilterImageEnabled?: boolean;
  signalFilterTextEnabled?: boolean;
}

/** One retrieved or working-memory item from process* output. */
export interface CortextMemory {
  id?: number | string;
  memory_id?: number | string;
  text?: string;
  source_id?: string;
  timestamp?: number;
  modality?: string;
  mimetype?: string;
  relevance?: number;
  composite_score?: number;
  salience?: number;
  contradiction?: number;
  usage_count?: number;
  soft_anchors?: unknown[];
  [key: string]: unknown;
}

export type ConsolidationState = "none" | "recommended" | "required";

/** Structured process* response (parsed from process*Json). */
export interface CortextContext {
  retrieved_memory?: CortextMemory[];
  working_memory?: CortextMemory[];
  should_interrupt?: boolean;
  interrupt_aborted?: boolean;
  at_boundary?: boolean;
  consolidation_state: ConsolidationState;
  output?: Record<string, unknown>;
  embedding?: number[];
  embedding_dimension?: number;
  encode_ms?: number;
  process_ms?: number;
  hydrate_ms?: number;
  total_ms?: number;
  [key: string]: unknown;
}

export interface CortextEmbedding {
  embedding: number[];
  dimension: number;
}

export interface Media {
  data: Uint8Array;
  mimetype: string;
}

/** Matches cortext::Retention / C API cortext_retention. */
export type Retention =
  | "natural"
  | "durable"
  | "boundary"
  | "ephemeral"
  | 0
  | 1
  | 2
  | 3;

export interface ProcessOptions {
  includeEmbedding?: boolean;
  omitEmbedding?: boolean;
  /** Natural when omitted: boundary and write algorithms decide. */
  retention?: Retention;
}

/** Shape of the N-API addon exports. */
export interface NativeCortextConstructor {
  new (config?: CortextConfig | null, dbPath?: string | null): NativeCortext;
  new (dbPath: string): NativeCortext;
}

export interface NativeCortext {
  processTextJson(
    text: string,
    sourceId: string,
    options?: ProcessOptions | null
  ): string;
  processTextWithMediaJson(
    text: string,
    sourceId: string,
    media?: Uint8Array | null,
    mediaMimeType?: string | null,
    options?: ProcessOptions | null
  ): string;
  embedTextJson(text: string): string;
  processAudioJson(
    pcm: Float32Array,
    sourceId: string,
    options?: ProcessOptions | null
  ): string;
  processAudioWithMediaJson(
    pcm: Float32Array,
    sourceId: string,
    media?: Uint8Array | null,
    mediaMimeType?: string | null,
    options?: ProcessOptions | null
  ): string;
  embedAudioJson(pcm: Float32Array): string;
  processImageJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    options?: ProcessOptions | null
  ): string;
  processImageWithMediaJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number,
    sourceId: string,
    media?: Uint8Array | null,
    mediaMimeType?: string | null,
    options?: ProcessOptions | null
  ): string;
  embedImageJson(
    data: Uint8Array,
    width: number,
    height: number,
    channels: number
  ): string;
  consolidateJson(): string;
  flush(): void;
  reset(): void;
}

export interface NativeBinding {
  NativeCortext: NativeCortextConstructor;
  version: () => string;
  lastError: () => string;
}
