
import { ComicStyle, ComicEra, AspectRatio, ImageGenerationModel } from './types';

export const MAX_COMIC_PAGES = 175;
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

export const GEMINI_TEXT_MODEL = "gemini-2.5-flash-preview-04-17";
// GEMINI_IMAGE_MODEL is now effectively a default, actual model used will come from user selection
export const DEFAULT_GEMINI_IMAGE_MODEL = ImageGenerationModel.GEMINI_2_FLASH_IMG; 
