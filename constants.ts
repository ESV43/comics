
import { ComicStyle, ComicEra, AspectRatio, ImageGenerationModel, TextGenerationModel, CaptionPlacement } from './types';

export const MAX_COMIC_PAGES = 200;
export const DEFAULT_NUM_PAGES = 6;

export const AVAILABLE_STYLES: { value: ComicStyle; label: string }[] = [
  { value: ComicStyle.TWO_D, label: "2D Animation" },
  { value: ComicStyle.THREE_D, label: "3D Rendered" },
  { value: ComicStyle.REALISTIC, label: "Photorealistic" },
  { value: ComicStyle.ANIME, label: "Anime/Manga" },
  { value: ComicStyle.CARTOON, label: "Classic Cartoon" },
];

export const AVAILABLE_ERAS: { value: ComicEra; label: string }[] = [
  { value: ComicEra.OLD, label: "Vintage (1950s-70s)" },
  { value: ComicEra.NEW, label: "Modern (2000s-Now)" },
  { value: ComicEra.FUTURISTIC, label: "Futuristic/Sci-Fi" },
];

export const AVAILABLE_ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: AspectRatio.SQUARE, label: "Square (1:1)" },
  { value: AspectRatio.PORTRAIT, label: "Portrait (9:16)" },
  { value: AspectRatio.LANDSCAPE, label: "Landscape (16:9)" },
];

export const AVAILABLE_IMAGE_MODELS: { value: ImageGenerationModel; label: string }[] = [
  { value: ImageGenerationModel.IMAGEN_3, label: "Imagen 3 (Quality Focus)" },
  { value: ImageGenerationModel.GEMINI_2_FLASH_IMG, label: "Gemini 2.0 Flash Image (Speed Focus)" },
];

export const AVAILABLE_TEXT_MODELS: { value: TextGenerationModel; label: string }[] = [
  { value: TextGenerationModel.GEMINI_2_5_FLASH, label: "Gemini 2.5 Flash (Default for Prompts)" },
  { value: TextGenerationModel.GEMINI_2_5_FLASH_LITE, label: "Gemini 2.5 Flash Lite" }, // Added a label for clarity
  { value: TextGenerationModel.GEMINI_2_5_PRO, label: "Gemini 2.5 Pro" },
  { value: TextGenerationModel.GEMINI_2_0_FLASH, label: "Gemini 2.0 Flash" },
  // Add other models here if they become available and are suitable
];


export const AVAILABLE_CAPTION_PLACEMENTS: { value: CaptionPlacement; label: string }[] = [
  { value: CaptionPlacement.IN_UI, label: "Show in UI (below image)" },
  { value: CaptionPlacement.IN_IMAGE, label: "Embed in image (AI attempts)" },
];

export const DEFAULT_TEXT_MODEL = TextGenerationModel.GEMINI_2_5_FLASH;
export const DEFAULT_GEMINI_IMAGE_MODEL = ImageGenerationModel.GEMINI_2_FLASH_IMG;
export const DEFAULT_CAPTION_PLACEMENT = CaptionPlacement.IN_UI;

// This constant is effectively replaced by DEFAULT_TEXT_MODEL but kept for direct reference if needed elsewhere.
// It will now point to the default.
export const GEMINI_TEXT_MODEL = DEFAULT_TEXT_MODEL;
