declare module '@google/genai' {
  import { Content, GenerateContentRequest, GenerateContentResponse, GenerateContentResult, GenerationConfig, Part, Tool } from '@google/generative-ai';

  export class GoogleGenAI {
    constructor(config: { apiKey: string });
    models: {
      generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;
      getGenerativeModel(config: { model: string }): {
        generateImages(request: GenerateImagesRequest): Promise<GenerateImagesResponse>;
      };
    };
  }

  export interface GenerateImagesRequest {
    prompt: string;
    aspectRatio?: string;
    seed?: number;
    multimodal?: { images: { data: string; mimeType: string }[] };
  }

  export interface GenerateImagesResponse {
    images?: { data: string }[];
  }

  export type GenerateContentResponse = GenerateContentResult;
  export type HarmCategory = any;
  export type HarmProbability = any;
  export type Modality = any;
  export type SafetyRating = any;
}
