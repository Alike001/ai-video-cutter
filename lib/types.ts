  import { z } from "zod";

  export type CutReason = "filler" | "pause" | "bad_take" | "low_value";

  export type Sentence = {
    id: string;
    text: string;
    startSec: number;
    endSec: number;
    keep: boolean;
    suggestedKeep: boolean;
    reason?: CutReason;
  };

  export type Project = {
    videoBlob: Blob;
    videoFileName: string;
    videoMimeType: string;
    durationSec: number;
    sentences: Sentence[];
    createdAt: number;
    lastModifiedAt: number;
  };

  export const cutReasonSchema = z.enum(["filler", "pause", "bad_take", "low_value"]);

  export const suggestCutsRequestSchema = z.object({
    sentences: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string(),
          startSec: z.number().nonnegative(),
          endSec: z.number().nonnegative(),
        })
      )
      .min(1)
      .max(500),
  });

  export const suggestCutsResponseSchema = z.object({
    suggestions: z.array(
      z.object({
        id: z.string().min(1),
        suggestedKeep: z.boolean(),
        reason: cutReasonSchema.nullable(),
      })
    ),
  });

  export type SuggestCutsRequest = z.infer<typeof suggestCutsRequestSchema>;
  export type SuggestCutsResponse = z.infer<typeof suggestCutsResponseSchema>;
