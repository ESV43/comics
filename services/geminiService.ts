/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version includes character consistency features using reference images and a fixed seed.
 */

import {
  GoogleGenAI,
  GenerateContentResponse as SDKGenerateContentResponse,
  Part,
  HarmCategory,
  HarmProbability,
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

function extractJsonArray(text: string): any[] | null {
    if (!text) return null;
    const match = text.match(/\[[\s\S]*\]/);
    if (match && match[0]) {
        try {
            return JSON.parse(match[0]);
        } catch (e) {
            console.error("Could not parse the extracted JSON array:", e);
            return null;
        }
    }
    return null;
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

// --- Pollinations AI Service Functions ---

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
  
  let characterInstruction = '';
  if (characters && characters.length > 0) {
    const characterNames = characters.map(c => c.name).join(', ');
    characterInstruction = `
      The story features these characters: ${characterNames}.
      IMPORTANT: For each of these characters, you must invent a consistent, detailed physical description (e.g., hair color, face shape, clothing style).
      When you generate each 'image_prompt', you MUST include the full, detailed description of any character present in that scene. This is critical for visual consistency.
      For example, for a character named 'Zorp', you might decide he is 'a tall alien with green skin, three eyes, and a silver jumpsuit'. Every prompt featuring Zorp must include this full description.
    `;
  }

  const systemPrompt = `
    Break this story into ${numPages} scenes. ${characterInstruction} Respond with ONLY a JSON array where each object has keys: "scene_number", "image_prompt", "caption", "dialogues".
    Story: """${story}"""
  `;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let responseText = '';
    try {
      if (attempt > 0) {
        console.log(`Retrying Pollinations text generation (POST)... Attempt ${attempt + 1}`);
        await delay(2000);
      }
      
      const url = `https://text.pollinations.ai/`;
      const response = await fetch(url, { 
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: systemPrompt 
      });

      responseText = await response.text();
      if (!response.ok) {
          throw new Error(`Pollinations text API returned status ${response.status}. Response: ${responseText}`);
      }

      const parsedScenes = extractJsonArray(responseText);

      if (!parsedScenes || !Array.isArray(parsedScenes) || parsedScenes.length === 0) {
          throw new Error("AI response did not contain a valid, non-empty JSON array.");
      }

      return parsedScenes.map((panel, index) => ({
          scene_number: panel.scene_number || index + 1,
          image_prompt: `${panel.image_prompt}, in the style of ${style}, ${era}`,
          caption: options.includeCaptions ? panel.caption : null,
          dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
      }));

    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt + 1} failed:`, lastError.message);
        console.error("Raw response that may have caused the error:", responseText);
    }
  }
  
  console.error(`All attempts to generate scenes failed. Last error: ${lastError?.message}. Triggering fallback mode.`);
  return [];
};

// --- Google Gemini Service Functions ---

export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  const { story, numPages, aspectRatio, textModel, captionPlacement, characters, includeCaptions } = options;

  let aspectRatioDescription = "1:1 square aspect ratio";
  if (aspectRatio === AspectRatio.LANDSCAPE) aspectRatioDescription = "16:9 landscape aspect ratio";
  else if (aspectRatio === AspectRatio.PORTRAIT) aspectRatioDescription = "9:16 portrait aspect ratio";

  let captionDialogueInstruction = '';
  if (includeCaptions) {
      captionDialogueInstruction = `Each scene object MUST have a "caption" key (string, can be empty) for narration and a "dialogues" key (an array of strings, can be empty) for character speech.`;
      if (captionPlacement === CaptionPlacement.IN_IMAGE) {
          captionDialogueInstruction += ` The 'image_prompt' should include instructions to embed the text from "caption" and "dialogues" directly into the image in comic-book style text boxes or speech bubbles.`;
      }
  } else {
      captionDialogueInstruction = `The "caption" and "dialogues" keys in the output should be empty strings or empty arrays, respectively. Do NOT include any text in the generated images.`;
  }
  
  const hasCharacters = characters && characters.length > 0;
  const isMultimodal = ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(textModel);
  let characterInstruction = '';
  if (hasCharacters) {
      const characterNames = characters.map(c => c.name).join(', ');
      if (isMultimodal) {
          characterInstruction = `\n\n**CHARACTER CONSISTENCY INSTRUCTIONS:**\nYou have been provided with reference images for the following characters: ${characterNames}. The images are the source of truth for their appearance. When a character is mentioned, you MUST refer to their image to describe their face, hair, and clothing accurately in the 'image_prompt'. This is critical for maintaining consistency. For example, if the story says "John smiled", the prompt should detail John's appearance based on his image, such as "a detailed shot of John, a man with short brown hair and a kind smile as seen in the reference, smiling warmly".`;
      } else {
          characterInstruction = `\n\n**CHARACTER CONSISTENCY INSTRUCTIONS:**\nThe story features these characters: ${characterNames}. You must invent a detailed, consistent physical description for each one. Then, for every scene a character appears in, you MUST inject their full, consistent description into that scene's 'image_prompt' to maintain visual consistency. For example, if you decide 'Zorp' is 'a tall alien with green skin and three eyes', every prompt with Zorp must include this full description.`;
      }
  }
  
  const systemInstruction = `
    You are a professional comic book writer and artist's assistant. Your task is to analyze a story and break it down into a series of distinct, visual scenes for an AI image generator.
    Divide the story into exactly ${numPages} sequential scenes.
    Respond with ONLY a valid JSON array of the scene objects. Do not include any other text, markdown formatting, or explanations.
    The output must start with \`[\` and end with \`]\`.
    CRITICAL: The final image aspect ratio will be ${aspectRatioDescription}. Include this in your prompts.
    ${captionDialogueInstruction}
    ${characterInstruction}
    Story: """${story}"""
  `;

  try {
    const userParts: Part[] = [{ text: systemInstruction }];

    if (hasCharacters && isMultimodal) {
        characters.forEach(char => {
            userParts.push({ text: `\nReference image for character: ${char.name}` });
            userParts.push(dataUrlToGenaiPart(char.image));
        });
    }

    const model = ai.getGenerativeModel({
        model: textModel,
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts: userParts }] });
    const response = result.response;
    const responseText = response.text();

    if (!responseText) {
        throw new Error("The AI model returned an empty response. It may have been blocked for safety reasons or another issue.");
    }
    
    let parsedData = JSON.parse(responseText);

    if (parsedData.scenes) {
        parsedData = parsedData.scenes;
    }

    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      throw new Error("AI response could not be parsed into a valid array of scenes.");
    }
    
    return parsedData.map((panel: any, index: number) => ({
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
  
  let aspectRatioDescription = "square 1:1 aspect ratio";
  if (inputAspectRatio === AspectRatio.LANDSCAPE) aspectRatioDescription = "landscape 16:9 aspect ratio";
  else if (inputAspectRatio === AspectRatio.PORTRAIT) aspectRatioDescription = "portrait 9:16 aspect ratio";

  const augmentedPrompt = `${initialImagePrompt}, ${aspectRatioDescription}, cinematic still, in the distinct visual style of ${style}, inspired by the ${era} era.`;

  const maxRetries = 2;
  let lastError: Error | null = null;

  const imageModel = ai.getGenerativeModel({ model: imageModelName });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // The new SDK uses generateContent for image models like Imagen 3
      const result = await imageModel.generateContent(augmentedPrompt);
      const response = result.response;

      if (response.promptFeedback?.blockReason) {
        throw new Error(`Request was blocked due to ${response.promptFeedback.blockReason}.`);
      }

      const candidate = response.candidates?.[0];
      if (!candidate || candidate.finishReason !== 'OK') {
        throw new Error(`Image generation failed or was stopped. Reason: ${candidate?.finishReason}`);
      }
      
      const imagePart = candidate.content.parts.find(p => !!p.inlineData);
      if (!imagePart || !imagePart.inlineData) {
        throw new Error("The API did not return a valid image in its response.");
      }
      
      const base64Image = imagePart.inlineData.data;
      const mimeType = imagePart.inlineData.mimeType;

      return `data:${mimeType};base64,${base64Image}`;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Image generation attempt ${attempt + 1} failed for prompt "${augmentedPrompt}":`, lastError);
      if (attempt < maxRetries - 1) {
        await delay(2000 * (attempt + 1));
      }
    }
  }

  throw new Error(`Failed to generate image after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};
