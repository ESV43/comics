/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * FINAL CORRECTED VERSION: This version restores the critical creative direction (style and era)
 * to the prompt generation step, while keeping all technical bug fixes for SDK usage and JSON parsing.
 */

import {
  GoogleGenAI,
  GenerateContentResponse,
  Part,
} from "@google/genai";
import {
  ComicPanelData,
  StoryInputOptions,
  AspectRatio,
  ComicStyle,
  ComicEra,
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
  if (markdownMatch && markdownMatch[1]) { return markdownMatch[1].trim(); }
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
function parseJsonLeniently(jsonString: string): any {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn("Standard JSON.parse failed. Attempting to fix common errors.", e);
        const cleanedString = jsonString.replace(/,\s*([}\]])/g, '$1');
        try { return JSON.parse(cleanedString); } catch (finalError) {
            console.error("Lenient JSON parsing also failed on the cleaned string:", cleanedString, finalError);
            throw new Error("AI response was not valid JSON, even after attempting to fix common errors.");
        }
    }
}
const dataUrlToGenaiPart = (dataUrl: string): Part => {
    const match = dataUrl.match(/data:(image\/\w+);base64,(.*)/);
    if (!match) throw new Error("Invalid data URL format");
    return { inlineData: { mimeType: match[1], data: match[2] } };
};

// --- Pollinations AI Service Functions (Corrected and final) ---
export const listPollinationsImageModels = async (): Promise<{ value: string; label: string }[]> => { /* ... unchanged, correct ... */
    try { const response = await fetch('https://image.pollinations.ai/models'); if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`); const models: string[] = await response.json(); return models.map(model => ({ value: model, label: model })); } catch (error) { console.error("Could not fetch Pollinations image models:", error); return [{ value: 'flux', label: 'flux' }, { value: 'turbo', label: 'turbo' }]; }
};
export const listPollinationsTextModels = async (): Promise<{ value: string; label: string }[]> => { /* ... unchanged, correct ... */
    try { const response = await fetch('https://text.pollinations.ai/models'); if (!response.ok) throw new Error(`Failed to fetch text models: ${response.statusText}`); const models: PollinationsTextModel[] = await response.json(); return models.map(model => ({ value: model.name, label: `${model.name} (${model.description})` })); } catch (error) { console.error("Could not fetch Pollinations text models:", error); return [{ value: 'llamascout', label: 'llamascout (Llama 4 Scout)' }]; }
};
export const generateImageForPromptWithPollinations = async (prompt: string, model: string, aspectRatio: AspectRatio): Promise<string> => { /* ... unchanged, correct ... */
    try { const encodedPrompt = encodeURIComponent(prompt); const params = new URLSearchParams(); params.append('model', model); params.append('seed', String(FIXED_IMAGE_SEED)); switch (aspectRatio) { case AspectRatio.PORTRAIT: params.append('width', '1024'); params.append('height', '1792'); break; case AspectRatio.LANDSCAPE: params.append('width', '1792'); params.append('height', '1024'); break; default: params.append('width', '1024'); params.append('height', '1024'); break; } const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`; const response = await fetch(url); if (!response.ok) { throw new Error(`Pollinations image API returned status ${response.status}`); } const imageBlob = await response.blob(); if (!imageBlob.type.startsWith('image/')) { throw new Error('The API did not return a valid image.'); } return await blobToDataUrl(imageBlob); } catch (error) { console.error("Error generating image with Pollinations:", error); throw new Error(`Failed to generate image from Pollinations. Error: ${error instanceof Error ? error.message : "Unknown"}`); }
};
export const generateScenePromptsWithPollinations = async (options: StoryInputOptions): Promise<ComicPanelData[]> => {
  const { story, numPages, style, era, characters, includeCaptions } = options;
  // FIXED: Style and Era are now part of the initial prompt instruction.
  const styleInstruction = `All 'image_prompt' descriptions must be written to produce an image in the style of **${style}** from the **${era}** era.`;
  const characterInstruction = characters && characters.length > 0
    ? `The story features these characters: ${characters.map(c => c.name).join(', ')}. For each character, invent a consistent, detailed physical description and use it in every 'image_prompt' where they appear.`
    : "";
  const systemPrompt = `Break this story into ${numPages} scenes. ${styleInstruction} ${characterInstruction} Respond with ONLY a JSON array where each object has keys: "scene_number", "image_prompt", "caption", "dialogues". Story: """${story}"""`;
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
      const parsedScenes = parseJsonLeniently(jsonString);
      if (!Array.isArray(parsedScenes) || parsedScenes.length === 0) { throw new Error("AI response did not contain a valid, non-empty JSON array."); }
      return parsedScenes.map((panel, index) => ({
          scene_number: panel.scene_number || index + 1,
          image_prompt: panel.image_prompt, // No longer need to tack on style/era here, it's already in the prompt.
          caption: includeCaptions ? panel.caption : null,
          dialogues: includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
      }));
    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Pollinations text generation attempt ${attempt + 1} failed:`, lastError.message, "Response:", responseText);
    }
  }
  console.error(`All attempts to generate scenes with Pollinations failed. Last error: ${lastError?.message}. Triggering fallback mode.`);
  return [];
};


// --- Google Gemini Service Functions ---

export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  
  // FIXED: Destructure all necessary options, including style and era.
  const { story, numPages, textModel, characters, includeCaptions, style, era } = options;

  const isMultimodal = ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(textModel);
  let characterInstruction = '';
  if (characters && characters.length > 0) {
      const characterNames = characters.map(c => c.name).join(', ');
      characterInstruction = isMultimodal
          ? `\n\n**CHARACTER CONSISTENCY:** You are provided with reference images for: ${characterNames}. Use these images as the absolute source of truth for their appearance. In each 'image_prompt', describe the characters based on their reference image.`
          : `\n\n**CHARACTER CONSISTENCY:** The story features: ${characterNames}. Invent a detailed physical description for each, and reuse that exact description in every 'image_prompt' where they appear.`;
  }

  // FIXED: Re-introduce the creative direction as a core instruction.
  const systemInstruction = `
    You are an expert comic book assistant. Your task is to break a story into scenes, thinking and describing everything in the requested artistic style.

    **ARTISTIC STYLE (CRITICAL):**
    - The overall visual style is: **${style}**.
    - The time period and aesthetic is: **${era}**.
    - Every "image_prompt" you write MUST be infused with this style. Describe scenes, characters, and objects as they would appear in this specific context.

    **JSON FORMAT RULES (VERY IMPORTANT):**
    - Your entire response MUST be a single, valid JSON object, starting with \`{\` and ending with \`}\`.
    - The JSON object must have one key: "scenes". The value must be a JSON array.
    - **Do NOT use trailing commas.** Do not add any text or markdown outside the JSON object.

    **TASK:**
    Analyze the story and divide it into exactly ${numPages} visual scenes, following all style and formatting rules.
    ${characterInstruction}
    
    Here is the story:
    """
    ${story}
    """
  `;

  try {
    const userParts: Part[] = [{ text: systemInstruction }];
    if (characters && characters.length > 0 && isMultimodal) {
        characters.forEach(char => {
            userParts.push({ text: `\nReference image for character: ${char.name}` });
            userParts.push(dataUrlToGenaiPart(char.image));
        });
    }

    const model = ai.getGenerativeModel({ model: textModel });
    const result = await model.generateContent({
        contents: [{ role: 'USER', parts: userParts }],
        generationConfig: { responseMimeType: "application/json" }
    });

    const rawText = result.response.text();
    if (!rawText) { throw new Error("The AI model returned an empty response."); }
    
    const jsonString = extractJson(rawText);
    if (!jsonString) { throw new Error("AI response did not contain a recognizable JSON object or array."); }

    const parsedData = parseJsonLeniently(jsonString);
    const scenes = Array.isArray(parsedData) ? parsedData : parsedData?.scenes;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("AI response was valid JSON but did not have the expected structure.");
    }

    return scenes.map((panel, index) => ({
      scene_number: panel.scene_number || index + 1,
      image_prompt: panel.image_prompt, // The prompt now correctly contains the style from the start.
      caption: includeCaptions ? panel.caption : null,
      dialogues: includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
    }));
  } catch (error) {
    console.error("Error generating scene prompts with Gemini:", error);
    throw new Error(`Failed to generate scene prompts from Gemini. Error: ${error instanceof Error ? error.message : "An unknown error occurred"}`);
  }
};


export const generateImageForPrompt = async (apiKey: string, initialImagePrompt: string, inputAspectRatio: AspectRatio, imageModelName: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required for image generation.");
  const ai = new GoogleGenAI({ apiKey });
  const imageModel = ai.getGenerativeModel({
    model: imageModelName,
    generationConfig: { seed: FIXED_IMAGE_SEED }
  });

  // The prompt from the previous step is now fully self-contained with style info.
  // We no longer need to tack on style/era here, leading to a cleaner call.
  const augmentedPrompt = initialImagePrompt; 
  
  const maxRetries = 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await imageModel.generateContent(augmentedPrompt);
      const firstCandidate = result.response.candidates?.[0];
      if (firstCandidate) {
        const imagePart = firstCandidate.content.parts.find(part => part.inlineData);
        if (imagePart && imagePart.inlineData) {
          return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }
      }
      let errorMessage = "The API did not return a valid image.";
      if (firstCandidate?.finishReason && firstCandidate.finishReason !== "STOP") {
          errorMessage += ` Blocked due to: ${firstCandidate.finishReason}.`;
      }
      throw new Error(errorMessage);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Image generation attempt ${attempt + 1} failed:`, lastError);
      if (attempt < maxRetries - 1) { await delay(2000 * (attempt + 1)); }
    }
  }
  throw new Error(`Failed to generate image after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};
