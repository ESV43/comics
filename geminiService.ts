
/**
 * @fileoverview This file contains the core service functions for interacting with the Google Gemini API.
 * It handles both the generation of comic scene prompts from a story (text generation)
 * and the generation of images for each of those prompts (image generation).
 * This version enhances safety filter error reporting for image generation and retries for 500 errors.
 * It also includes significantly improved prompting for character/style consistency and "4K" visual quality,
 * with hyper-strict character sheet enforcement, contextual adherence, and negative prompting against distortions.
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
  ImageGenerationModel,
  ComicStyle,
  ComicEra
} from '../types';
import { GEMINI_TEXT_MODEL } from '../constants';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface SafetyRating {
  category: HarmCategory;
  probability: HarmProbability;
  blocked?: boolean;
}

/**
 * Generates a structured list of comic panel data from a user-provided story.
 * This function includes safety policy error handling and detailed instructions for consistency and quality.
 * @param apiKey - The user's Google Gemini API key.
 * @param options - The story input and comic customization options.
 * @returns A promise that resolves to an array of ComicPanelData objects.
 */
export const generateScenePrompts = async (apiKey: string, options: StoryInputOptions): Promise<ComicPanelData[]> => {
  if (!apiKey) throw new Error("API Key is required to generate scene prompts.");
  const ai = new GoogleGenAI({ apiKey });
  const { story, style, era, includeCaptions, numPages, aspectRatio } = options;

  let aspectRatioDescription = "1:1 square";
  if (aspectRatio === AspectRatio.LANDSCAPE) {
    aspectRatioDescription = "16:9 landscape";
  } else if (aspectRatio === AspectRatio.PORTRAIT) {
    aspectRatioDescription = "9:16 portrait";
  }

  const systemInstruction = `You are an AI assistant specialized in creating highly consistent and contextually accurate comic book scripts.
Your task is to break down the provided story into exactly ${numPages} scenes.
The output MUST be a single, valid JSON array of objects. Each object must have these keys: "scene_number", "scene_description_for_prompt", "image_prompt", "caption", and "dialogues".
The "dialogues" key should contain an array of objects, each with a "character" and "line" key.

CRITICAL INSTRUCTIONS FOR CHARACTER CONSISTENCY, STORY CONTEXT, AND VISUAL QUALITY:

**PHASE 1: DEEP STORY ANALYSIS & CHARACTER DEFINITION (MANDATORY FIRST STEP)**
1.  **Thorough Story Comprehension:** Before ANY other action, conduct a deep analysis of the ENTIRE story provided. Understand the plot, character arcs, motivations, relationships, key events, and recurring visual themes or motifs.
2.  **Internal Character Sheet Creation:** After deep comprehension, you MUST internally create an exhaustive 'character sheet' for EACH distinct character. This sheet is your **ABSOLUTE CANONICAL SOURCE OF TRUTH** for all visual details. It MUST include:
    *   **Full Name/Identifier:** (e.g., Zara, The Old Man)
    *   **Internal Visual Anchor Phrase (IVAP):** A unique, highly concise summary of their MOST IMMUTABLE core visual features. This is for YOUR internal reference. (e.g., ZARA_BLUE_SPIKY_HAIR_GREEN_EYES_SCAR_LEATHER_JACKET).
    *   **Appearance Details (Exhaustive & Specific):** Specific hairstyle (e.g., 'spiky short blue hair parted on the left'), hair color, eye color and shape (e.g., 'bright green, almond-shaped eyes'), facial features (e.g., 'sharp nose, high cheekbones, a small, almost invisible scar above her left eyebrow'), distinguishing marks (e.g., 'a faint scar above left eyebrow, a tribal tattoo of a coiled serpent on the left bicep').
    *   **Typical Attire (Detailed):** Describe common clothing items, their colors, styles, and materials (e.g., 'a worn dark brown leather jacket with silver zippers over a faded black t-shirt with a barely visible band logo, ripped blue jeans with patches, heavy black combat boots with red laces').
    *   **Notable Accessories:** (e.g., 'a silver pendant shaped like a wolf's head on a leather cord', 'round wire-rimmed glasses that are slightly bent').
    *   **Approximate Age/Build/Height:** (e.g., 'early 20s, athletic build, approx 5\'7"', 'elderly, frail frame, stooped posture, approx 5\'2"').
    *   **Example Character Sheet Entry:**
        'ZARA:
        IVAP: ZARA_BLUE_SPIKY_HAIR_GREEN_EYES_SCAR_LEATHER_JACKET
        Appearance: Young woman, early 20s, athletic build, approx 5\'7". Hair: spiky short blue hair, meticulously styled with a slight side part. Eyes: bright, piercing green, almond-shaped. Face: sharp nose, high cheekbones, a small, very faint, almost invisible scar running vertically just above her left eyebrow. Determined and intense default expression.
        Attire: A well-worn dark brown leather jacket with prominent silver zippers and a slightly frayed collar, always worn over a plain, dark grey, fitted t-shirt. Ripped black skinny jeans, with one large rip across the right knee. Black, heavy-duty combat boots, often scuffed, with distinctive red laces.
        Accessories: None notable.'

**PHASE 2: PANEL SCRIPT GENERATION (APPLY WITH UNYIELDING PRECISION)**

3.  **Unyielding Character Consistency (CRITICAL & NON-NEGOTIABLE):** For EVERY "image_prompt" you generate:
    *   If a character from your internal sheet appears, you MUST BEGIN the character's description in the "image_prompt" with their name, followed IMMEDIATELY by their **COMPLETE VERBATIM VISUAL DESCRIPTION** copied from the 'Appearance Details', 'Typical Attire', and 'Notable Accessories' sections of THEIR character sheet entry.
    *   **DO NOT SUMMARIZE, PARAPHRASE, REORDER, OR OMIT ANY DETAIL from the character sheet entry for that character.** This is the cornerstone of consistency.
    *   **Example (Mandatory Format):** If Zara is in the scene, the prompt MUST include something like: "Image of Zara, a young woman, early 20s, athletic build, approx 5'7", with her spiky short blue hair, meticulously styled with a slight side part, her bright, piercing green, almond-shaped eyes, her sharp nose, high cheekbones, and the small, very faint, almost invisible scar running vertically just above her left eyebrow, wearing her well-worn dark brown leather jacket with prominent silver zippers and a slightly frayed collar over her plain, dark grey, fitted t-shirt, her ripped black skinny jeans with one large rip across the right knee, and her black, heavy-duty combat boots, often scuffed, with distinctive red laces. She is currently [describe action, expression, interaction based on story context for THIS panel]..."
    *   A character's appearance MUST remain IDENTICAL across all panels unless the story *explicitly* describes a permanent change (e.g., 'Zara dyes her hair blonde and gets a new tattoo'). Temporary changes (e.g., wearing a hat, getting covered in mud) should be described in addition to the base appearance.

4.  **Strict Contextual Adherence & Narrative Continuity (CRITICAL):**
    *   Each "image_prompt" must be a DIRECT VISUAL TRANSLATION of the events, character emotions, interactions, and environment AS DESCRIBED FOR THAT SPECIFIC SCENE in the input story. The image must tell the story of *that particular moment*.
    *   Before finalizing a panel's prompt, MENTALLY REVIEW the story context leading up to this panel and the immediate consequences. Ensure character states (e.g., injuries, fatigue, dirt, specific items they are holding, changes in attire IF STORY-DRIVEN) are accurately reflected and logically follow from previous relevant scenes.
    *   Describe the scene with "Show, Don't Just Tell" details. For example, instead of 'it was scary', describe 'long, sharp shadows stretch across the room from a single flickering candle, Zara’s eyes are wide with fear, her breath misting in the cold air.'

5.  **Style and Era Integration:** The chosen style "${style}" and era "${era}" must deeply influence the descriptive language and artistic direction in every "image_prompt". For example:
    *   If style is "Anime/Manga", describe scenes with dynamic action lines, expressive character eyes, vibrant or specific color palettes typical of the genre, and cel-shaded rendering.
    *   If style is "Photorealistic", emphasize realistic textures, lighting, anatomy, and depth of field.
    *   If era is "Vintage/Retro", suggest details like film grain, specific color palettes of the 50s-70s, or classic comic art techniques from that period.

6.  **"Immaculate Quality" Descriptors:** ALL "image_prompt" fields MUST aim for exceptionally high visual quality. Include diverse and potent descriptive terms such as: 'ultra-detailed', 'hyper-realistic textures (even for stylized art, ensure textures are detailed and appropriate for the style)', 'cinematic lighting setup (e.g. key light, fill light, rim light)', 'studio-quality lighting', 'global illumination', 'volumetric lighting', 'tack-sharp focus on subjects', 'professional digital painting', 'masterpiece composition', 'award-winning fantasy illustration (adjust genre as needed)', 'intricate environment details', 'vivid and harmonious color palette', 'flawless rendering', 'no digital artifacts', 'extremely high resolution aesthetic'.

7.  **Scene Composition:** Each "image_prompt" should clearly describe the scene setting, character actions/poses, emotions, camera angle (e.g., 'dramatic close-up focusing on eyes', 'dynamic low-angle wide shot', 'over-the-shoulder shot'), desired aspect ratio (frame as '${aspectRatioDescription}'), and overall mood (e.g., 'dramatic and moody', 'bright and energetic', 'somber and reflective').

Story to process:
---
${story}
---
Remember, produce ONLY the JSON array as your response. Do not include any explanatory text before or after the JSON.`;

  try {
    const result: SDKGenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'USER', parts: [{ text: systemInstruction }] }],
      config: { responseMimeType: "application/json" }
    });

    if (result.promptFeedback?.blockReason) {
      throw new Error(`Your story was blocked for violating content policies (${result.promptFeedback.blockReason}). Please revise your story and try again.`);
    }
    
    const responseText = result.text;
    if (!responseText) {
      console.error("API call for scene prompts returned an invalid structure or no text:", JSON.stringify(result, null, 2));
      throw new Error("API response was malformed or did not contain the expected text content for scene prompts.");
    }

    let jsonStr = responseText.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    const parsedData = JSON.parse(jsonStr) as any[];

    return parsedData.map((panel, index) => ({
      scene_number: panel.scene_number || index + 1,
      image_prompt: panel.image_prompt || "No prompt generated for this scene.",
      caption: includeCaptions ? (panel.caption || "") : null,
      dialogues: includeCaptions && Array.isArray(panel.dialogues)
        ? panel.dialogues.map((d: any) => d.character && d.line ? `${d.character}: "${d.line}"` : String(d)).filter(Boolean)
        : [],
      scene_description_for_prompt: panel.scene_description_for_prompt || ""
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    if (message.toLowerCase().includes("api key not valid") || message.toLowerCase().includes("permission denied")) {
        throw new Error(`Failed to generate scene prompts due to an API key issue: ${message}. Please check your API key and its permissions.`);
    }
    throw new Error(`Failed to generate scene prompts. Error: ${message}. Ensure your API key is valid and the model ${GEMINI_TEXT_MODEL} is accessible.`);
  }
};


/**
 * Generates a single image for a given prompt, using the correct API method and configuration.
 * Includes enhanced prompting for consistency and quality, and negative prompting against distortions.
 * @param apiKey - The user's Google Gemini API key.
 * @param prompt - The detailed text prompt for the image.
 * @param inputAspectRatio - The desired aspect ratio for the image.
 * @param imageModelName - The identifier for the image generation model.
 * @param style - The comic style (e.g., ComicStyle.ANIME).
 * @param era - The comic era (e.g., ComicEra.FUTURISTIC).
 * @returns A promise that resolves to a base64-encoded image data URL.
 */
export const generateImageForPrompt = async (
  apiKey: string,
  prompt: string,
  inputAspectRatio: AspectRatio,
  imageModelName: ImageGenerationModel | string,
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
**Primary Subject Focus & Scene Description (FROM PREVIOUS STEP - TREAT AS ABSOLUTE CANON FOR THIS IMAGE. ADHERE WITH PHOTOGRAPHIC PRECISION):**
${prompt}

**MANDATORY ARTISTIC DIRECTIVES (APPLY WITH EXTREME PRECISION AND NO DEVIATION):**
- Style Adherence: Emphasize a strong, visually distinct, and **unwavering** "${style}" aesthetic throughout the image. Every element (line work, color palette, texture, rendering technique) must conform.
- Era Consistency: The scene MUST accurately and meticulously reflect a "${era}" setting, mood, technology, and fashion (if applicable to background elements or non-player characters not detailed in primary prompt). No anachronisms.
- Supreme Visual Quality: Render with ultra-high definition, 4K or 8K equivalent visual fidelity. Implement cinematic lighting (consider volumetric lighting, rim lighting, god rays if appropriate for mood and specified in the primary prompt). Ensure tack-sharp focus on primary subjects, hyper-detailed textures appropriate to the style (e.g., intricate line work for anime, realistic pores for photorealism), intricate details in both foreground and background. Aim for masterpiece-level execution using professional digital art techniques. Flawless rendering.

**CRITICAL CONSISTENCY & CONTEXT MANDATE (NON-NEGOTIABLE):**
- Character Appearance: STRICTLY ADHERE TO ALL character physical descriptions, clothing, and accessories as detailed in the "Primary Subject Focus & Scene Description" section above. Maintain IDENTICAL hairstyles, facial features, body types, and attire for each character as described in that section. **ANY DEVIATION IS AN ABSOLUTE FAILURE.** The character's look is SACROSANCT and must be a direct visual translation of the text provided in THIS prompt.
- Style Integrity: The overall visual style ("${style}", "${era}") must be impeccably and consistently applied across the entire image. No style-mixing or deviation from these core directives.
- Narrative Context: The image MUST visually represent the specific actions, emotions, and setting details provided in the "Primary Subject Focus & Scene Description". It is a snapshot of THAT particular moment in the story.

**NEGATIVE PROMPT (AVOID THESE AT ALL COSTS):**
- DO NOT generate: distorted or malformed faces, misshapen limbs, incorrect number of fingers/toes, blurry or out-of-focus primary subjects (unless specifically requested for artistic effect like bokeh, which MUST be in the primary prompt), inconsistent anatomy, warped or illogical perspectives, pixelation, digital artifacts, banding.
- DO NOT generate: character features, hairstyle, or attire that contradict the detailed description provided in THIS prompt.
- DO NOT generate: generic backgrounds or settings unrelated to the described scene context.
- DO NOT generate: emotional expressions or character poses that do not match the described mood, action, or narrative of THIS specific panel.
- DO NOT generate: visual drift or changes in established character appearance from the details given in THIS prompt (unless a transformation is explicitly part of THIS prompt's text).

Ensure the final image is compelling, dynamic, free of distortions, and of professional comic art/illustration quality, strictly adhering to all instructions. The image must be a FAITHFUL visual execution of the complete prompt text.
`;

  const maxRetries = 2;
  let retries = 0;
  const baseDelayMs = 2000;

  while (retries <= maxRetries) {
    try {
      if (imageModelName === ImageGenerationModel.GEMINI_2_FLASH_IMG) {
        const result: SDKGenerateContentResponse = await ai.models.generateContent({
          model: imageModelName,
          contents: [{ role: 'USER', parts: [{ text: augmentedPrompt }] }], 
          config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
          }
        });
        
        const candidate = result.candidates?.[0];
        if (candidate) {
          if (candidate.finishReason === "SAFETY" || candidate.finishReason === "IMAGE_SAFETY") {
            let safetyMessage = `Image generation was blocked by safety filters (Reason: ${candidate.finishReason}).`;
            const typedSafetyRatings = candidate.safetyRatings as SafetyRating[] | undefined;
            const blockedRating = typedSafetyRatings?.find(r => r.blocked === true);
            if (blockedRating) {
              safetyMessage += ` Details: Category ${blockedRating.category}, Probability ${blockedRating.probability}.`;
            }
            safetyMessage += " Please try a different prompt or adjust story content.";
            console.error("Image generation safety block details:", JSON.stringify(candidate, null, 2));
            throw new Error(safetyMessage);
          }

          const imagePart = candidate.content?.parts?.find(part => part.inlineData);
          if (imagePart?.inlineData?.data && imagePart.inlineData.mimeType) {
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
          }
        }

        console.error("Gemini Flash response did not contain image data or was unexpected:", JSON.stringify(result, null, 2));
        const textFeedbackParts = candidate?.content?.parts?.filter(part => part.text);
        const textFeedback = textFeedbackParts && textFeedbackParts.length > 0
          ? textFeedbackParts.map(p => p.text).join(' ')
          : "No explicit text feedback from API.";

        throw new Error(`API did not return an image for ${imageModelName}. Feedback: "${textFeedback}". This could be due to restrictive safety filters, an issue with the prompt, or an API problem. Full response logged to console.`);

      } else { // Handles Imagen models
        const response: SDKGenerateImagesResponse = await ai.models.generateImages({
          model: imageModelName,
          prompt: augmentedPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: apiAspectRatioValue,
            // seed: (can be used with Imagen if desired, but consistency is primarily driven by prompt for now)
          },
        });

        if ((response as any).error || (response as any).code) {
             throw new Error(`Image generation failed for ${imageModelName}. API Error: ${JSON.stringify((response as any).error || (response as any).code)}`);
        }

        if (response.generatedImages?.[0]?.image?.imageBytes) {
          return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
        } else {
          console.error(`No image data received from ${imageModelName} API. Response:`, JSON.stringify(response, null, 2));
          throw new Error(`No image data received from ${imageModelName} API. This could be due to safety filters or other issues. Full response logged to console.`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("api key not valid") || errorMessage.toLowerCase().includes("permission denied")) {
        throw new Error(`Image generation failed for model '${imageModelName}' due to an API key issue: ${errorMessage}. Please check your API key and its permissions.`);
      }

      const isRateLimitError = errorMessage.includes("429") ||
                               errorMessage.toUpperCase().includes("RESOURCE_EXHAUSTED") ||
                               errorMessage.toUpperCase().includes("RATE_LIMIT_EXCEEDED");

      const isInternalServerError = errorMessage.includes("status: 500") ||
                                    errorMessage.toUpperCase().includes("INTERNAL ERROR") ||
                                    errorMessage.toUpperCase().includes("INTERNAL");


      if ((isRateLimitError || isInternalServerError) && retries < maxRetries) {
        retries++;
        const delayTime = baseDelayMs * Math.pow(2, retries - 1) + (Math.random() * 1000);
        console.warn(`API error for '${imageModelName}' (Type: ${isRateLimitError ? 'Rate Limit/Resource' : 'Internal Server'}). Retrying attempt ${retries}/${maxRetries} in ${Math.round(delayTime / 1000)}s... Error: ${errorMessage}`);
        await delay(delayTime);
      } else if (errorMessage.includes("blocked by safety filters") || errorMessage.includes("safety policy")) {
        throw error; // Propagate safety errors immediately
      } else {
        throw new Error(`API call failed for model '${imageModelName}' (attempt ${retries + 1}/${maxRetries +1}). Original error: ${errorMessage}`);
      }
    }
  }
  throw new Error(`Failed to generate image after all retries for model '${imageModelName}'. Check console for details.`);
};
