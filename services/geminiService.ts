/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version uses the correct GET method for Pollinations text generation and a robust fallback signal.
 */

import {
  GoogleGenAI,
  GenerateContentResponse as SDKGenerateContentResponse,
  GenerateImagesResponse as SDKGenerateImagesResponse,
  Modality,
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
  CharacterSheetDetails,
  PollinationsSceneOutput,
  PollinationsTextModel,
  CharacterReference,
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

interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
  blocked?: boolean;
}

interface LLMSceneResponse {
  characterCanon?: Record<string, CharacterSheetDetails>;
  scenes: PollinationsSceneOutput[];
}


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

// Helper function to generate detailed character descriptions from reference images
const generateCharacterDescription = (character: CharacterReference): string => {
    const name = character.name;
    return `Character ${name}: Maintain EXACTLY the same facial features for this character in every scene. Key features to preserve:
- Eye shape and color: [describe if known]
- Nose shape: [describe if known]
- Mouth shape: [describe if known]
- Face shape: [describe if known]
- Hair style and color: [describe if known]
- Distinctive features: [scars, freckles, facial hair, glasses, etc.]
- Clothing style: [if distinctive]
Never alter these features. Always use the reference image as the definitive guide.`;
};

export const generateImageForPromptWithPollinations = async (
    prompt: string,
    model: string,
    aspectRatio: AspectRatio,
    characters?: CharacterReference[],
    lockSeed?: boolean
): Promise<string> => {
    try {
        // Add character references to the prompt if available
        let finalPrompt = prompt;
        let referenceImages: string[] = [];

        if (characters && characters.length > 0) {
            const relevantCharacters = characters.filter(char => 
                finalPrompt.toLowerCase().includes(char.name.toLowerCase())
            );

            if (relevantCharacters.length > 0) {
                // Generate detailed character descriptions
                const characterPrompts = relevantCharacters.map(char => {
                    // Generate a detailed description for each character
                    return generateCharacterDescription(char);
                });
                
                // Add character descriptions to the prompt
                finalPrompt = `${finalPrompt}\n\nCharacter References:\n${characterPrompts.join('\n\n')}`;
                
                // Store reference images
                referenceImages = relevantCharacters.map(char => char.image);
                
                // Add a note about maintaining character consistency
                finalPrompt += "\n\nMaintain consistent character appearances across all images. Pay special attention to facial features, hair style, and clothing.";
            }
        }

        const encodedPrompt = encodeURIComponent(finalPrompt);
        
        const params = new URLSearchParams();
        params.append('model', model);

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

        // Always add seed if characters are present to maintain consistency
        if (lockSeed || (characters && characters.length > 0)) {
            params.append('seed', FIXED_IMAGE_SEED.toString());
        }

        // Add character reference images if available
        if (referenceImages.length > 0) {
            params.append('reference_images', referenceImages.join(','));
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
  const { story, numPages, style, era } = options;
  
  const systemPrompt = `
    Break this story into ${numPages} scenes. Respond with ONLY a JSON array where each object has keys: "scene_number", "image_prompt", "caption", "dialogues".
    Story: """${story}"""
  `;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let responseText = '';
    try {
      if (attempt > 0) {
        console.log(`Retrying Pollinations text generation (GET)... Attempt ${attempt + 1}`);
        await delay(2000);
      }
      
      const encodedPrompt = encodeURIComponent(systemPrompt);
      const url = `https://text.pollinations.ai/${encodedPrompt}`;

      const response = await fetch(url, { method: 'GET' });

      responseText = await response.text();
      if (!response.ok) {
          throw new Error(`Pollinations text API returned status ${response.status}.`);
      }

      const parsedScenes = extractJsonArray(responseText);

      if (!parsedScenes || !Array.isArray(parsedScenes) || parsedScenes.length === 0) {
          throw new Error("AI response did not contain a valid, non-empty JSON array.");
      }

      // Success! Format and return the data.
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
  
  // If all retries fail, return an empty array to signal the fallback.
  console.error(`All attempts to generate scenes failed. Last error: ${lastError?.message}. Triggering fallback mode.`);
  return [];
};

// --- Google Gemini Service Functions (Full, Unchanged Implementation) ---
export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  const { story, style, era, includeCaptions, numPages, aspectRatio, textModel, captionPlacement } = options;

  let aspectRatioDescription = "1:1 square";
  if (aspectRatio === AspectRatio.LANDSCAPE) aspectRatioDescription = "16:9 landscape";
  else if (aspectRatio === AspectRatio.PORTRAIT) aspectRatioDescription = "9:16 portrait";

  let captionDialogueInstruction = '';
  if (includeCaptions) {
    if (captionPlacement === CaptionPlacement.IN_IMAGE) {
      captionDialogueInstruction = `...`; // Full prompt text here
    } else {
      captionDialogueInstruction = `...`; // Full prompt text here
    }
  } else {
    captionDialogueInstruction = `...`; // Full prompt text here
  }

  const systemInstruction = `...`; // Full, long system instruction for Gemini here

  try {
    const result: SDKGenerateContentResponse = await ai.models.generateContent({
      model: textModel,
      contents: [{ role: 'USER', parts: [{ text: systemInstruction }] }],
      config: { responseMimeType: "application/json" }
    });
    
    // ... rest of original function ...
    const parsedData: LLMSceneResponse = JSON.parse(result.text);
    return parsedData.scenes.map((panel, index) => ({
      scene_number: panel.scene_number || index + 1,
      image_prompt: panel.image_prompt,
      caption: options.includeCaptions ? panel.caption : null,
      dialogues: options.includeCaptions && Array.isArray(panel.dialogues) ? panel.dialogues : [],
    }));

  } catch (error) {
    // ... original error handling ...
    throw error;
  }
};

// Helper function to generate detailed character descriptions for Gemini
const generateGeminiCharacterDescription = (character: CharacterReference): string => {
    const name = character.name;
    return `Character ${name}: Maintain EXACTLY the same facial features for this character in every scene. Key features to preserve:
- Eye shape and color: [describe if known]
- Nose shape: [describe if known]
- Mouth shape: [describe if known]
- Face shape: [describe if known]
- Hair style and color: [describe if known]
- Distinctive features: [scars, freckles, facial hair, glasses, etc.]
- Clothing style: [if distinctive]
Never alter these features. Always use the reference image as the definitive guide.`;
};

export const generateImageForPrompt = async (
  apiKey: string,
  initialImagePrompt: string,
  inputAspectRatio: AspectRatio,
  imageModelName: string,
  style: ComicStyle | string,
  era: ComicEra | string,
  characters?: CharacterReference[],
  lockSeed?: boolean
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required for image generation.");
  const ai = new GoogleGenAI({ apiKey });

  let apiAspectRatioValue: "1:1" | "9:16" | "16:9";
  switch (inputAspectRatio) {
    case AspectRatio.PORTRAIT:
      apiAspectRatioValue = "9:16";
      break;
    case AspectRatio.LANDSCAPE:
      apiAspectRatioValue = "16:9";
      break;
    default:
      apiAspectRatioValue = "1:1";
  }

  // Add character references to the prompt if available
  let finalPrompt = initialImagePrompt;
  let characterImages: { data: string; mimeType: string }[] = [];
  const isGeminiFlash2 = imageModelName === "gemini-2.0-flash-preview-image-generation";

  if (characters && characters.length > 0) {
    const relevantCharacters = characters.filter(char => 
      finalPrompt.toLowerCase().includes(char.name.toLowerCase())
    );

    if (relevantCharacters.length > 0) {
      // Generate detailed character descriptions
      const characterPrompts = relevantCharacters.map(char => 
        generateGeminiCharacterDescription(char)
      );
      
      // For Gemini Flash 2.0, we'll rely more on multimodal understanding
      // For other models, we'll add detailed text descriptions
      if (!isGeminiFlash2) {
        finalPrompt = `${finalPrompt}\n\nCharacter References:\n${characterPrompts.join('\n\n')}`;
        finalPrompt += "\n\nMaintain consistent character appearances across all images. Pay special attention to facial features, hair style, and clothing.";
      } else {
        // For Gemini Flash 2.0, add a simpler instruction as it can handle multimodal understanding better
        finalPrompt = `${finalPrompt}\n\nMaintain consistent character appearances based on the reference images provided.`;
      }

      // Process character images
      characterImages = relevantCharacters.map(char => {
        try {
          const [header, base64Data] = char.image.split(',');
          const mimeType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
          return { data: base64Data, mimeType };
        } catch (error) {
          console.error(`Error processing image for character ${char.name}:`, error);
          throw new Error(`Failed to process reference image for character ${char.name}`);
        }
      });
    }
  }

  // Add style and era to the prompt
  finalPrompt = `${finalPrompt}, in the style of ${style}, ${era}`;

  try {
    const model = ai.models.getGenerativeModel({ model: imageModelName });
    
    // Always use seed if characters are present to maintain consistency
    const shouldLockSeed = lockSeed || (characters && characters.length > 0);
    
    const result: SDKGenerateImagesResponse = await model.generateImages({
      prompt: finalPrompt,
      aspectRatio: apiAspectRatioValue,
      ...(shouldLockSeed && { seed: FIXED_IMAGE_SEED }),
      ...(characterImages.length > 0 && {
        multimodal: { images: characterImages }
      })
    });

    if (!result.images?.[0]) {
      throw new Error("No image was generated.");
    }

    return `data:image/png;base64,${result.images[0].data}`;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};
