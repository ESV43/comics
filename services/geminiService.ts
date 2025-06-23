/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version fixes the image generation call to use the correct SDK pattern.
 */

import {
  GoogleGenAI,
  GenerateContentResponse as SDKGenerateContentResponse,
  GenerateImagesResponse as SDKGenerateImagesResponse, // Note: This type might not be used with the new method, but we leave it for context
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

// --- Helper Functions (Unchanged) ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function extractJson(text: string): string | null {
  if (!text) return null;
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
      return markdownMatch[1].trim();
  }
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
        params.append('seed', String(FIXED_IMAGE_SEED));
        switch (aspectRatio) {
            case AspectRatio.PORTRAIT:
                params.append('width', '1024');
                params.append('height', '1792');
                break;
            case AspectRatio.LANDSCAPE:
                params.append('width', '1792');
                params.append('height', '1024');
                break;
            default:
                params.append('width', '1024');
                params.append('height', '1024');
                break;
        }
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) { throw new Error(`Pollinations image API returned status ${response.status}`); }
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith('image/')) { throw new Error('The API did not return a valid image.'); }
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
  const systemPrompt = `Break this story into ${numPages} scenes. ${characterInstruction} Respond with ONLY a JSON array where each object has keys: "scene_number", "image_prompt", "caption", "dialogues". Story: """${story}"""`;
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
  const { story, numPages, textModel, characters } = options;
  const isMultimodal = ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(textModel);
  let characterInstruction = '';
  if (characters && characters.length > 0) {
      const characterNames = characters.map(c => c.name).join(', ');
      characterInstruction = isMultimodal
          ? `\n\n**CHARACTER CONSISTENCY:** You are provided with reference images for: ${characterNames}. Use these images as the absolute source of truth for their appearance. In each 'image_prompt', describe the characters based on their reference image.`
          : `\n\n**CHARACTER CONSISTENCY:** The story features: ${characterNames}. Invent a detailed physical description for each, and reuse that exact description in every 'image_prompt' where they appear.`;
  }
  const systemInstruction = `You are an expert comic book assistant. Your task is to break a story into scenes for an AI image generator. **TASK:** Analyze the story and divide it into exactly ${numPages} visual scenes. **OUTPUT FORMAT:** Your entire response MUST be a single JSON object with one key: "scenes". The value of "scenes" must be a JSON array of the ${numPages} scene objects. Each scene object must have these keys: "scene_number" (integer), "image_prompt" (string), "caption" (string), "dialogues" (array of strings). Do not include any other text or markdown. ${characterInstruction} Here is the story: """${story}"""`;
  try {
    const userParts: Part[] = [{ text: systemInstruction }];
    if (characters && characters.length > 0 && isMultimodal) {
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
    if (!rawText) { throw new Error("The AI model returned an empty response."); }
    const jsonString = extractJson(rawText);
    if (!jsonString) { throw new Error("AI response did not contain a recognizable JSON object or array."); }
    let scenes: PollinationsSceneOutput[];
    try {
        const parsedData = JSON.parse(jsonString);
        scenes = Array.isArray(parsedData) ? parsedData : parsedData.scenes;
    } catch (e) {
        throw new Error("AI response was not valid JSON.");
    }
    if (!scenes || scenes.length === 0) { throw new Error("AI response was valid JSON but contained no scenes."); }
    return scenes.map((panel, index) => ({
      scene_number: panel.scene_number || index + 1,
      image_prompt: panel.image_prompt,
      caption: options.includeCaptions ? panel.caption : null,
      dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
    }));
  } catch (error) {
    console.error("Error generating scene prompts with Gemini:", error);
    throw new Error(`Failed to generate scene prompts from Gemini. Error: ${error instanceof Error ? error.message : "An unknown error occurred"}`);
  }
};

/**
 * **FIXED: This function now uses the correct SDK pattern for image generation.**
 */
export const generateImageForPrompt = async (
  apiKey: string,
  initialImagePrompt: string,
  inputAspectRatio: AspectRatio,
  imageModelName: string,
  style: ComicStyle | string,
  era: ComicEra | string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required for image generation.");

  // Correctly initialize the top-level AI client
  const ai = new GoogleGenAI({ apiKey });

  // Use the correct method to get a specific model
  const imageModel = ai.getGenerativeModel({
    model: imageModelName,
    // generationConfig is needed for seed and other image-specific settings
    generationConfig: {
      seed: FIXED_IMAGE_SEED
    }
  });

  const augmentedPrompt = `${initialImagePrompt}, cinematic still, in the distinct visual style of ${style}, inspired by the ${era} era.`;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Generate content using the model object, not the incorrect `ai.images`
      const result = await imageModel.generateContent(augmentedPrompt);

      const response = result.response;
      const firstCandidate = response.candidates?.[0];

      if (firstCandidate) {
        // The image data is in the `content.parts` array of the candidate
        const imagePart = firstCandidate.content.parts.find(part => part.inlineData);
        if (imagePart && imagePart.inlineData) {
          const base64Data = imagePart.inlineData.data;
          const mimeType = imagePart.inlineData.mimeType;
          return `data:${mimeType};base64,${base64Data}`;
        }
      }

      // If we reach here, no image was found in the response. Check for safety blocks.
      const blockReason = firstCandidate?.finishReason;
      const safetyRatings = firstCandidate?.safetyRatings;
      let errorMessage = "The API did not return a valid image.";
      if (blockReason && blockReason !== "STOP") {
          errorMessage += ` Blocked due to: ${blockReason}.`;
      }
      if (safetyRatings) {
          errorMessage += ` Safety Ratings: ${JSON.stringify(safetyRatings)}`;
      }
      throw new Error(errorMessage);

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
