/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version includes robust JSON parsing and clearer instructions to prevent common AI response errors.
 */

import {
  GoogleGenAI,
  GenerateContentResponse as SDKGenerateContentResponse,
  GenerateImagesResponse as SDKGenerateImagesResponse,
  Modality,
  HarmCategory,
  HarmProbability,
  Part,
} from "@google/genai";
import {
  ComicPanelData,
  StoryInputOptions,
  AspectRatio,
  CaptionPlacement,
  ComicStyle,
  ComicEra,
  CharacterSheetDetails,
  PollinationsSceneOutput,
  PollinationsTextModel,
} from '../types';
import { FIXED_IMAGE_SEED } from '../constants';

// --- Helper Functions ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Extracts a JSON string from a larger text block, stripping markdown fences.
 * This is more robust against models that add extra text around the JSON.
 * @param text The text response from the AI model.
 * @returns A clean JSON string or null if not found.
 */
function extractJson(text: string): string | null {
  if (!text) return null;
  // Look for ```json ... ``` and extract the content
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
      return markdownMatch[1].trim();
  }
  // Fallback for raw JSON: find the first '{' or '[' and last '}' or ']'
  const firstBracket = text.indexOf('{');
  const firstSquare = text.indexOf('[');
  let start = -1;

  if (firstBracket === -1) start = firstSquare;
  else if (firstSquare === -1) start = firstBracket;
  else start = Math.min(firstBracket, firstSquare);

  if (start === -1) return null;

  const lastBracket = text.lastIndexOf('}');
  const lastSquare = text.lastIndexOf(']');
  const end = Math.max(lastBracket, lastSquare);

  if (end === -1 || end < start) return null;

  return text.substring(start, end + 1);
}


// Helper to convert a data URL to a GenAI Part object
const dataUrlToGenaiPart = (dataUrl: string): Part => {
    const match = dataUrl.match(/data:(image\/\w+);base64,(.*)/);
    if (!match) throw new Error("Invalid data URL format");
    return {
        inlineData: {
            mimeType: match[1],
            data: match[2],
        },
    };
};


interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
  blocked?: boolean;
}

interface LLMSceneResponse {
  scenes: PollinationsSceneOutput[];
}


// --- Pollinations AI Service Functions (Unchanged) ---
// ... (The Pollinations functions are correct and do not need changes)
export const listPollinationsImageModels = async (): Promise<{ value: string; label: string }[]> => {
  try {
    const response = await fetch('https://image.pollinations.ai/models');
    if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
    const models: string[] = await response.json();
    return models.map(model => ({ value: model, label: model }));
  } catch (error) {
    console.error("Could not fetch Pollinations image models:", error);
    return [{ value: 'flux', label: 'flux' }, { value: 'turbo', label: 'turbo' }, { value: 'gptimage', label: 'gptimage' }];
  }
};

export const listPollinationsTextModels = async (): Promise<{ value: string; label: string }[]> => {
    try {
        const response = await fetch('https://text.pollinations.ai/models');
        if (!response.ok) throw new Error(`Failed to fetch text models: ${response.statusText}`);
        const models: PollinationsTextModel[] = await response.json();
        return models.map(model => ({ value: model.name, label: `${model.name} (${model.description})` }));
    } catch (error) {
        console.error("Could not fetch Pollinations text models:", error);
        return [{ value: 'llamascout', label: 'llamascout (Llama 4 Scout)' }];
    }
};

export const generateImageForPromptWithPollinations = async (
    prompt: string,
    model: string,
    aspectRatio: AspectRatio
): Promise<string> => {
    try {
        const encodedPrompt = encodeURIComponent(prompt);
        
        const params = new URLSearchParams();
        params.append('model', model);
        params.append('seed', String(FIXED_IMAGE_SEED)); // Lock seed for consistency

        switch (aspectRatio) {
            case AspectRatio.PORTRAIT:
                params.append('width', '1024');
                params.append('height', '1792');
                break;
            case AspectRatio.LANDSCAPE:
                params.append('width', '1792');
                params.append('height', '1024');
                break;
            case AspectRatio.SQUARE:
            default:
                params.append('width', '1024');
                params.append('height', '1024');
                break;
        }

        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;
        console.log("Fetching Pollinations Image URL:", url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Pollinations image API returned status ${response.status}`);
        }
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) {
           throw new Error('The API did not return a valid image.');
        }
        return await blobToDataUrl(imageBlob);
    } catch (error) {
        console.error("Error generating image with Pollinations:", error);
        throw new Error(`Failed to generate image from Pollinations. Error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
};

export const generateScenePromptsWithPollinations = async (options: StoryInputOptions): Promise<ComicPanelData[]> => {
  const { story, numPages, style, era, characters } = options;
  
  const characterInstruction = characters && characters.length > 0
    ? `The story features these characters: ${characters.map(c => c.name).join(', ')}. For each character, invent a consistent, detailed physical description and use it in every 'image_prompt' where they appear.`
    : "";

  const systemPrompt = `
    Break this story into ${numPages} scenes. ${characterInstruction} Respond with ONLY a JSON array where each object has keys: "scene_number", "image_prompt", "caption", "dialogues".
    Story: """${story}"""
  `;

  // ... rest of Pollinations logic is fine
  const maxRetries = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let responseText = '';
    try {
      if (attempt > 0) { await delay(2000); }
      const encodedPrompt = encodeURIComponent(systemPrompt);
      const url = `https://text.pollinations.ai/${encodedPrompt}`;
      const response = await fetch(url, { method: 'GET' });
      responseText = await response.text();
      if (!response.ok) { throw new Error(`Pollinations text API returned status ${response.status}.`); }
      
      const jsonString = extractJson(responseText);
      if (!jsonString) throw new Error("AI response did not contain a recognizable JSON array.");
      const parsedScenes = JSON.parse(jsonString);

      if (!Array.isArray(parsedScenes) || parsedScenes.length === 0) { throw new Error("AI response did not contain a valid, non-empty JSON array."); }
      return parsedScenes.map((panel, index) => ({
          scene_number: panel.scene_number || index + 1,
          image_prompt: `${panel.image_prompt}, in the style of ${style}, ${era}`,
          caption: options.includeCaptions ? panel.caption : null,
          dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
      }));
    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt + 1} failed:`, lastError.message, "Response:", responseText);
    }
  }
  console.error(`All attempts to generate scenes failed. Last error: ${lastError?.message}. Triggering fallback mode.`);
  return [];
};


// --- Google Gemini Service Functions ---

export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  const { story, style, era, includeCaptions, numPages, aspectRatio, textModel, captionPlacement, characters } = options;

  let aspectRatioDescription = "1:1 square";
  if (aspectRatio === AspectRatio.LANDSCAPE) aspectRatioDescription = "16:9 landscape";
  else if (aspectRatio === AspectRatio.PORTRAIT) aspectRatioDescription = "9:16 portrait";

  let captionDialogueInstruction = includeCaptions
      ? `Each scene object MUST have a "caption" (string) and "dialogues" (array of strings).`
      : `The "caption" and "dialogues" keys in the output must be empty.`;
  
  const hasCharacters = characters && characters.length > 0;
  const isMultimodal = ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(textModel);
  let characterInstruction = '';
  if (hasCharacters) {
      const characterNames = characters.map(c => c.name).join(', ');
      characterInstruction = isMultimodal
          ? `\n\n**CHARACTER CONSISTENCY:** You are provided with reference images for: ${characterNames}. Use these images as the absolute source of truth for their appearance. In each 'image_prompt', describe the characters based on their reference image.`
          : `\n\n**CHARACTER CONSISTENCY:** The story features: ${characterNames}. Invent a detailed physical description for each, and reuse that exact description in every 'image_prompt' where they appear.`;
  }
  
  const systemInstruction = `
    You are an expert comic book assistant. Your task is to break a story into scenes for an AI image generator.

    **TASK:**
    Analyze the story and divide it into exactly ${numPages} visual scenes.

    **OUTPUT FORMAT:**
    - Your entire response MUST be a single JSON object with one key: "scenes".
    - The value of "scenes" must be a JSON array containing the ${numPages} scene objects.
    - Each scene object must have these keys: "scene_number" (integer), "image_prompt" (string), "caption" (string), "dialogues" (array of strings).
    - Do not include any other text, explanations, or markdown formatting around the JSON object.

    **CRITICAL INSTRUCTIONS:**
    - The image aspect ratio is ${aspectRatioDescription}.
    - ${captionDialogueInstruction}
    - ${characterInstruction}

    Here is the story:
    """
    ${story}
    """
  `;

  try {
    const userParts: Part[] = [{ text: systemInstruction }];
    if (hasCharacters && isMultimodal) {
        characters.forEach(char => {
            userParts.push({ text: `\nReference image for character: ${char.name}` });
            userParts.push(dataUrlToGenaiPart(char.image));
        });
    }
    
    const result: SDKGenerateContentResponse = await ai.models.generateContent({
      model: textModel,
      contents: [{ role: 'USER', parts: userParts }],
      config: { responseMimeType: "application/json" }
    });
    
    const rawText = result.text;
    if (!rawText) {
        throw new Error("The AI model returned an empty response. It may have been blocked for safety reasons.");
    }
    
    const jsonString = extractJson(rawText);
    if (!jsonString) {
        console.error("Could not extract a valid JSON string from the AI response:", rawText);
        throw new Error("AI response did not contain a recognizable JSON object or array.");
    }

    let scenes: PollinationsSceneOutput[];
    try {
        const parsedData = JSON.parse(jsonString);
        if (Array.isArray(parsedData)) {
            scenes = parsedData; // Model returned an array directly
        } else if (parsedData && Array.isArray(parsedData.scenes)) {
            scenes = parsedData.scenes; // Model returned the expected { "scenes": [...] } object
        } else {
            throw new Error("JSON structure is invalid.");
        }
    } catch (e) {
        console.error("Failed to parse the extracted JSON string:", jsonString, e);
        throw new Error("AI response was not valid JSON.");
    }

    if (!scenes || scenes.length === 0) {
      throw new Error("AI response was valid JSON but contained no scenes.");
    }
    
    return scenes.map((panel, index) => ({
      scene_number: panel.scene_number || index + 1,
      image_prompt: panel.image_prompt,
      caption: options.includeCaptions ? panel.caption : null,
      dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
    }));

  } catch (error) {
    console.error("Error generating scene prompts with Gemini:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to generate scene prompts from Gemini. Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating scene prompts.");
  }
};

export const generateImageForPrompt = async (
  apiKey: string,
  initialImagePrompt: string,
  inputAspectRatio: AspectRatio,
  imageModelName: string,
  style: ComicStyle | string, 
  era: ComicEra | string     
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required for image generation.");
  const ai = new GoogleGenAI({ apiKey });

  let apiAspectRatioValue: "1:1" | "9:16" | "16:9";
  switch (inputAspectRatio) {
    case AspectRatio.SQUARE: apiAspectRatioValue = "1:1"; break;
    case AspectRatio.PORTRAIT: apiAspectRatioValue = "9:16"; break;
    case AspectRatio.LANDSCAPE: apiAspectRatioValue = "16:9"; break;
    default: apiAspectRatioValue = "1:1";
  }

  const augmentedPrompt = `${initialImagePrompt}, cinematic still, in the distinct visual style of ${style}, inspired by the ${era} era.`;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
          const result: SDKGenerateImagesResponse = await ai.images.generate({
              model: imageModelName,
              prompt: augmentedPrompt,
              number: 1,
              aspectRatio: apiAspectRatioValue,
              seed: FIXED_IMAGE_SEED, // Lock the seed for consistency
          });

          if (result.generatedImages && result.generatedImages.length > 0) {
              const imageBytes = result.generatedImages[0].image.imageBytes;
              return `data:image/jpeg;base64,${imageBytes}`;
          } else {
              throw new Error("The API did not return any images.");
          }
      } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Image generation attempt ${attempt + 1} failed for prompt "${augmentedPrompt}":`, lastError);
          if (attempt < maxRetries - 1) {
              await delay(2000 * (attempt + 1)); // Wait longer on each retry
          }
      }
  }

  throw new Error(`Failed to generate image after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};
