/**
 * @fileoverview This file contains the core service functions for interacting with AI models.
 * It handles comic generation for both Google Gemini and Pollinations AI.
 * This version uses the official API patterns discovered from the Pollinations GitHub repository.
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

function fallbackParseWithRegex(text: string, numPages: number): PollinationsSceneOutput[] {
    console.warn("Executing fallback Regex parser. Results may be incomplete.");
    const scenes: PollinationsSceneOutput[] = [];
    const imagePrompts = [...text.matchAll(/image_prompt["']?\s*:\s*["'](.*?)["']/g)];
    const captions = [...text.matchAll(/caption["']?\s*:\s*["'](.*?)["']/g)];
    
    for (let i = 0; i < numPages; i++) {
        scenes.push({
            scene_number: i + 1,
            image_prompt: imagePrompts[i]?.[1] || "A comic panel, the AI failed to provide a specific prompt.",
            caption: captions[i]?.[1] || "The AI failed to provide a caption.",
            dialogues: []
        });
    }
    return scenes;
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

export const generateImageForPromptWithPollinations = async (
    prompt: string,
    model: string,
    aspectRatio: AspectRatio
): Promise<string> => {
    try {
        const encodedPrompt = encodeURIComponent(prompt);
        
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
  const { story, numPages, textModel, style, era } = options;
  
  const systemPrompt = `
    Task: Break the following story into exactly ${numPages} scenes.
    Response format: Your response MUST be ONLY a JSON array. Each object in the array must have these keys: "scene_number", "image_prompt", "caption", "dialogues".
    Story: """${story}"""
  `;

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let responseText = '';
    try {
      if (attempt > 0) {
        console.log(`Retrying Pollinations text generation... Attempt ${attempt + 1}`);
        await delay(3000);
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

      let parsedScenes = extractJsonArray(responseText);
      
      if (!parsedScenes || parsedScenes.length < numPages) {
          console.warn("Primary JSON parsing failed or returned incomplete data. Trying fallback Regex parser.");
          parsedScenes = fallbackParseWithRegex(responseText, numPages);
      }

      if (!parsedScenes || !Array.isArray(parsedScenes) || parsedScenes.length === 0) {
          throw new Error("AI response could not be parsed into a valid scene array by any method.");
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
        console.error("Raw response that caused the error:", responseText);
    }
  }
  
  throw new Error(`Failed to get a valid response from the Pollinations text AI after ${maxRetries + 1} attempts. The service is likely unstable. Try a different text model, reduce the number of pages, or simplify the story. Last error: ${lastError?.message}`);
};

// --- Google Gemini Service Functions (Full, Unchanged Implementation) ---
export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  const { story, style, era, includeCaptions, numPages, aspectRatio, textModel, captionPlacement } = options;

  let aspectRatioDescription = "1:1 square";
  if (aspectRatio === AspectRatio.LANDSCAPE) {
    aspectRatioDescription = "16:9 landscape";
  } else if (aspectRatio === AspectRatio.PORTRAIT) {
    aspectRatioDescription = "9:16 portrait";
  }

  let captionDialogueInstruction = '';
  if (includeCaptions) {
    if (captionPlacement === CaptionPlacement.IN_IMAGE) {
      captionDialogueInstruction = `
IMPORTANT FOR CAPTIONS/DIALOGUES: If this scene has captions or dialogues, they MUST be incorporated directly into the 'image_prompt' itself, described as text elements visually present within the comic panel (e.g., 'a speech bubble above Zara’s head contains the text \"Let's go!\"', 'a rectangular yellow caption box at the bottom of the panel reads: \"Meanwhile, across town...\"').
The 'caption' and 'dialogues' fields in the JSON output for this panel MUST then be null or an empty array respectively. This is CRITICAL for embedding text in images.`;
    } else { // IN_UI
      captionDialogueInstruction = `
The "caption" field should contain a concise narrative caption for the scene. If no caption is appropriate, it should be null or an empty string.
The "dialogues" field should be an array of strings, where each string is a line of dialogue formatted as "CharacterName: \"Dialogue line\"". If no dialogue, it's an empty array.`;
    }
  } else {
    captionDialogueInstruction = `
Since captions and dialogues are disabled for this comic, the "caption" field in the JSON output MUST be null, and the "dialogues" field MUST be an empty array for all scenes.`;
  }


  const systemInstruction = `You are an AI assistant specialized in creating highly consistent and contextually accurate comic book scripts.
Your task is to break down the provided story into exactly ${numPages} scenes.
The output MUST be a single, valid JSON object containing two keys: "characterCanon" and "scenes".
"characterCanon" MUST be an object mapping character names to their detailed character sheets (see definition below).
"scenes" MUST be an array of objects, each representing a scene with these keys: "scene_number", "scene_description_for_prompt", "image_prompt", "caption", and "dialogues".
${captionDialogueInstruction}

**DEFINITION OF "characterCanon" OBJECT:**
A JSON object where keys are character names (e.g., "Zara", "The Guard"). Each value MUST be an object with the following keys, providing an exhaustive and UNCHANGING reference for visual consistency:
  *   "IVAP": "Internal Visual Anchor Phrase". A unique, highly concise summary of their MOST IMMUTABLE core visual features. For YOUR internal reference and prompt generation. (e.g., "ZARA_BLUE_SPIKY_HAIR_GREEN_EYES_SCAR").
  *   "appearance": A highly detailed description of their physical appearance: hairstyle, hair color, eye color and shape, facial features (e.g., nose shape, jawline, cheekbones, chin), specific facial marks (scars, moles), approximate age, build, height. This description is CRITICAL and MUST be the absolute visual canon.
  *   "attire": A highly detailed description of their typical clothing, including colors, styles, materials, and any accessories. This is also canonical unless explicitly changed by the story for a specific scene.
  *   "genderIdentityNote": (Optional) If the character is transgender, describe any specific portrayals to ensure respectful and accurate representation as per their identity, focusing on feminine features as per the story's intent unless a disguise is specified.

CRITICAL INSTRUCTIONS FOR CHARACTER CONSISTENCY, STORY CONTEXT, AND VISUAL QUALITY:

**PHASE 1: DEEP STORY ANALYSIS & CHARACTER DEFINITION (MANDATORY FIRST STEP)**
1.  **Thorough Story Comprehension:** After reviewing the ENTIRE story, identify ALL recurring characters and key visual elements.
2.  **Character Sheet Creation (CRITICAL):** For EACH character, create a comprehensive entry in the "characterCanon" object. This is your ABSOLUTE CANONICAL SOURCE OF TRUTH for ALL visual details.
3.  **Unyielding Character Consistency (CRITICAL & NON-NEGOTIABLE):** For EACH "image_prompt" you generate:
    *   **START WITH THE CANON:** Begin the prompt with the character's "IVAP" and their full "appearance" and "attire" details from the "characterCanon" object.
    *   **MAINTAIN FACIAL IDENTITY LOCK:** The character's **facial identity** must be **PERFECTLY AND UNERRINGLY REPLICATED** as described in their "characterCanon" entry.

Story to process:
---
${story}
---
CRITICAL OUTPUT FORMATTING:
1.  Produce ONLY the raw JSON object as your response. Do NOT include any explanatory text, markdown code fences (like \`\`\`json), or any other characters before or after the JSON object.
`;

  try {
    const result: SDKGenerateContentResponse = await ai.models.generateContent({
      model: textModel,
      contents: [{ role: 'USER', parts: [{ text: systemInstruction }] }],
      config: { responseMimeType: "application/json" }
    });

    if (result.promptFeedback?.blockReason) {
      throw new Error(`Your story was blocked by content policies using model ${textModel} (${result.promptFeedback.blockReason}). Please revise your story.`);
    }
    
    const responseText = result.text;
    if (!responseText) {
      console.error(`API call for scene prompts (model: ${textModel}) returned invalid structure or no text:`, JSON.stringify(result, null, 2));
      throw new Error(`API response (model: ${textModel}) was malformed or did not contain expected text content.`);
    }

    const parsedData: LLMSceneResponse = JSON.parse(responseText);

    if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.scenes)) {
        throw new Error(`API response (model: ${textModel}) did not contain the expected JSON structure. Missing 'scenes' array or 'characterCanon'.`);
    }

    const scenes = parsedData.scenes;

    return scenes.map((panel, index) => {
      let finalCaption = null;
      let finalDialogues: string[] = [];

      if (includeCaptions) {
        if (captionPlacement === CaptionPlacement.IN_UI) {
          finalCaption = panel.caption || "";
          finalDialogues = Array.isArray(panel.dialogues)
            ? panel.dialogues.map(d => String(d))
            : [];
        }
      }
      
      return {
        scene_number: panel.scene_number || index + 1,
        image_prompt: panel.image_prompt || "No prompt generated for this scene.",
        caption: finalCaption,
        dialogues: finalDialogues,
      };
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    if (message.toLowerCase().includes("api key not valid") || message.toLowerCase().includes("permission denied")) {
        throw new Error(`Failed to generate scene prompts (model: ${textModel}) due to an API key issue: ${message}. Check your API key and permissions.`);
    }
    if (error instanceof SyntaxError || message.toLowerCase().includes("json")) {
      let detailedMessage = `Failed to parse scene prompts from API response (model: ${textModel}): ${message}. This can happen if the story is too long or requests too many pages.`;
      console.error("Original JSON parsing error details:", error);
      throw new Error(detailedMessage);
    }
    throw new Error(`Failed to generate scene prompts (model: ${textModel}). Error: ${message}. Ensure API key is valid and model is accessible.`);
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

  const augmentedPrompt = `
**[ARTISTIC DIRECTIVES]**
- **Overall Style:** Apply the "${style}" style with absolute fidelity.
- **Era Integration:** The scene MUST meticulously reflect the "${era}" period.
- **Visual Quality:** Render with extreme detail, aiming for cinematic quality.
**[PROMPT]**
${initialImagePrompt}
`;

  const maxRetries = 2;
  let retries = 0;
  const baseDelayMs = 2000;

  while (retries <= maxRetries) {
    try {
        const response: SDKGenerateImagesResponse = await ai.models.generateImages({
          model: imageModelName,
          prompt: augmentedPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: apiAspectRatioValue,
            seed: FIXED_IMAGE_SEED,
          },
        });

        if ((response as any).error || (response as any).code) {
             throw new Error(`Image generation failed for ${imageModelName}. API Error: ${JSON.stringify((response as any).error || (response as any).code)}`);
        }

        if (response.generatedImages?.[0]?.image?.imageBytes) {
          return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
        } else {
          console.error(`No image data received from ${imageModelName} API. Response:`, JSON.stringify(response, null, 2));
          throw new Error(`No image data received from ${imageModelName} API. This could be due to safety filters or other issues.`);
        }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimitError = errorMessage.toLowerCase().includes("429") || errorMessage.toUpperCase().includes("RESOURCE_EXHAUSTED");
      const isInternalServerError = errorMessage.toLowerCase().includes("status: 500");

      if ((isRateLimitError || isInternalServerError) && retries < maxRetries) {
        retries++;
        const delayTime = baseDelayMs * Math.pow(2, retries - 1) + (Math.random() * 1000);
        console.warn(`API error for '${imageModelName}'. Retrying attempt ${retries}/${maxRetries} in ${Math.round(delayTime / 1000)}s... Error: ${errorMessage}`);
        await delay(delayTime);
      } else {
        throw new Error(`API call failed for model '${imageModelName}'. Original error: ${errorMessage}`);
      }
    }
  }
  throw new Error(`Failed to generate image after all retries for model '${imageModelName}'. Check console for details.`);
};
