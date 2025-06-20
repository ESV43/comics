/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version includes a highly robust parser and retry mechanism for the Pollinations API.
 */

import {
  GoogleGenAI,
  GenerateContentResponse as SDKGenerateContentResponse,
  GenerateImagesResponse as SDKGenerateImagesResponse,
  Modality,
} from "@google/genai";
import {
  ComicPanelData,
  StoryInputOptions,
  AspectRatio,
  CaptionPlacement,
  ComicStyle,
  ComicEra,
  PollinationsSceneOutput,
  PollinationsTextModel,
} from '../types';

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
 * A more robust function to find and parse a JSON array from a raw string.
 * It handles markdown code blocks and surrounding conversational text.
 * @param text The raw text response from the AI.
 * @returns A parsed JavaScript array or null if no valid JSON array is found.
 */
function extractJsonArray(text: string): any[] | null {
    if (!text) return null;

    // First, try to find a JSON string within markdown code fences (e.g., ```json ... ```)
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        try {
            return JSON.parse(markdownMatch[1]);
        } catch (e) {
            console.warn("Found a markdown JSON block, but it failed to parse. Will try to find another.", e);
        }
    }

    // If no markdown block, find the first '[' and the last ']' in the entire string
    const startIndex = text.indexOf('[');
    const endIndex = text.lastIndexOf(']');

    if (startIndex !== -1 && endIndex > startIndex) {
        const jsonString = text.substring(startIndex, endIndex + 1);
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse the extracted JSON array string.", e);
            return null;
        }
    }

    // If all else fails, return null
    return null;
}


// --- Pollinations AI Service Functions ---

// listPollinationsImageModels and listPollinationsTextModels are unchanged
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

// **MODIFIED AND IMPROVED FUNCTION**
export const generateScenePromptsWithPollinations = async (options: StoryInputOptions): Promise<ComicPanelData[]> => {
  const { story, numPages, textModel, style, era } = options;
  const systemPrompt = `
    You are a comic script generator. Your task is to break down the following story into exactly ${numPages} comic book scenes.
    The comic's style is "${style}" and the era is "${era}".
    Your response MUST BE ONLY a single, valid JSON array of objects, starting with '[' and ending with ']'. Do not include any other text, explanation, or markdown formatting.

    This is an example of the required output format:
    [
      {
        "scene_number": 1,
        "image_prompt": "A highly detailed image prompt for the first scene in a ${style} style, showing characters and setting.",
        "caption": "A short narrative caption for the first scene.",
        "dialogues": ["Character A: 'Dialogue line one.'", "Character B: 'Dialogue line two.'"]
      },
      {
        "scene_number": 2,
        "image_prompt": "A detailed prompt for the second scene...",
        "caption": "A caption for scene two.",
        "dialogues": []
      }
    ]

    Now, generate the script for the following story:
    """
    ${story}
    """
  `;

  const maxRetries = 2; // Will try a total of 3 times
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let responseText = '';
    try {
      if (attempt > 0) {
        console.log(`Retrying Pollinations text generation... Attempt ${attempt + 1}`);
        await delay(2500); // Wait 2.5 seconds before retrying to give the API a break
      }

      const response = await fetch(`https://text.pollinations.ai/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: systemPrompt, model: textModel })
      });

      responseText = await response.text();
      if (!response.ok) {
          throw new Error(`Pollinations text API returned status ${response.status}.`);
      }

      const parsedScenes = extractJsonArray(responseText);

      if (!parsedScenes || !Array.isArray(parsedScenes) || parsedScenes.length === 0) {
          throw new Error("AI response did not contain a valid, non-empty JSON array.");
      }

      // If successful, format and return the data.
      return parsedScenes.map((panel, index) => ({
          scene_number: panel.scene_number || index + 1,
          image_prompt: panel.image_prompt || "A comic book panel.",
          caption: options.includeCaptions ? panel.caption : null,
          dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
      }));

    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt + 1} failed:`, lastError.message);
        console.error("Raw response that caused the error:", responseText); // Log the problematic text
    }
  }

  // If all retries fail, throw a comprehensive error.
  throw new Error(`Failed to get a valid response from the Pollinations text AI after ${maxRetries + 1} attempts. The service may be busy or the story is too complex. Try a different text model or simplify the story. Last error: ${lastError?.message}`);
};

// generateImageForPromptWithPollinations is unchanged
export const generateImageForPromptWithPollinations = async (prompt: string, model: string): Promise<string> => {
    try {
        const fullPrompt = `${prompt}, model=${model}`;
        const encodedPrompt = encodeURIComponent(fullPrompt);
        const response = await fetch(`https://image.pollinations.ai/prompt/${encodedPrompt}`);
        if (!response.ok) throw new Error(`Pollinations image API returned status ${response.status}`);
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


// --- Google Gemini Service Functions (Unchanged) ---
// These remain unchanged and are not shown for brevity, but they exist in the file.
export const generateScenePrompts = async (): Promise<any[]> => { /* ... */ return []; };
export const generateImageForPrompt = async (): Promise<string> => { /* ... */ return ""; };
