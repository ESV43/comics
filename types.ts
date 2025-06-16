
export enum ComicStyle {
  TWO_D = "2D Animation",
  THREE_D = "3D Rendered",
  REALISTIC = "Photorealistic",
  ANIME = "Anime/Manga",
  CARTOON = "Classic Cartoon",
}

export enum ComicEra {
  OLD = "Vintage/Retro (e.g., 1950s-1970s style)",
  NEW = "Modern/Contemporary (e.g., 2000s-Present style)",
  FUTURISTIC = "Futuristic/Sci-Fi"
}

export enum AspectRatio {
  SQUARE = "SQUARE", // 1:1
  PORTRAIT = "PORTRAIT", // 9:16
  LANDSCAPE = "LANDSCAPE" // 16:9
}

export enum ImageGenerationModel {
  IMAGEN_3 = "imagen-3.0-generate-002",
  GEMINI_2_FLASH_IMG = "gemini-2.0-flash-preview-image-generation",
}

export interface ComicPanelData {
  scene_number: number;
  image_prompt: string;
  caption: string | null;
  dialogues: string[];
  imageUrl?: string; // To be filled after image generation
  scene_description_for_prompt?: string; // Internal helper
}

export interface StoryInputOptions {
  story: string;
  style: ComicStyle;
  era: ComicEra;
  aspectRatio: AspectRatio;
  includeCaptions: boolean;
  numPages: number; // Max 75
  imageModel: ImageGenerationModel;
}

export interface GenerationProgress {
  currentStep: string;
  percentage: number;
  currentPanel?: number;
  totalPanels?: number;
}

// Gemini API related types (simplified for this app)
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  retrievedContext?: {
    uri: string;
    title: string;
  };
}
export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
}

export interface Candidate {
  groundingMetadata?: GroundingMetadata;
  // Other candidate properties...
}
export interface GenerateContentResponse {
  text: string;
  candidates?: Candidate[];
}

export interface GeneratedImage {
  image: {
    imageBytes: string; // Base64 encoded image
  };
  // other properties if needed
}
export interface GenerateImagesResponse {
  generatedImages: GeneratedImage[];
  // Other properties like error or metadata
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}
