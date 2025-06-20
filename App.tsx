import React, { useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import StoryInputForm from './components/StoryInputForm';
import ComicDisplay from './components/ComicDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import { StoryInputOptions, ComicPanelData, GenerationProgress, AspectRatio, GenerationService } from './types';
import {
  generateScenePrompts,
  generateImageForPrompt,
  generateScenePromptsWithPollinations,
  generateImageForPromptWithPollinations
} from './services/geminiService';
import { AVAILABLE_ASPECT_RATIOS } from './constants';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [comicPanels, setComicPanels] = useState<ComicPanelData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | undefined>(undefined);
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatio>(AVAILABLE_ASPECT_RATIOS[0].value);

  const handleComicGeneration = useCallback(async (options: StoryInputOptions) => {
    if (options.generationService === GenerationService.GEMINI && !apiKey.trim()) {
      setError("Please enter your Gemini API Key to generate comics with the Gemini service.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setComicPanels([]);
    setCurrentAspectRatio(options.aspectRatio);
    setProgress(undefined);

    let scenePrompts: ComicPanelData[] = [];

    try {
      setProgress({ currentStep: "Analyzing story & generating scene prompts...", percentage: 0 });

      // Route to the correct service for scene prompts
      if (options.generationService === GenerationService.GEMINI) {
        scenePrompts = await generateScenePrompts(apiKey, options);
      } else {
        scenePrompts = await generateScenePromptsWithPollinations(options);
      }

      if (!scenePrompts || scenePrompts.length === 0) {
        throw new Error("No scene prompts generated. The story might be too short or the AI service failed. Please try again.");
      }

      const initialPanels = scenePrompts.map(p => ({ ...p, imageUrl: undefined }));
      setComicPanels(initialPanels);

      const totalPanels = scenePrompts.length;
      setProgress({
        currentStep: `Generated ${totalPanels} prompts. Starting image generation...`,
        percentage: 10,
        totalPanels: totalPanels
      });

      for (let i = 0; i < totalPanels; i++) {
        const panelProgressPercentage = 10 + ((i + 1) / totalPanels) * 90;
        setProgress({
          currentStep: `Generating image for panel ${i + 1}...`,
          percentage: panelProgressPercentage,
          currentPanel: i + 1,
          totalPanels: totalPanels,
        });

        const panel = scenePrompts[i];
        try {
          let imageUrl: string;
          // Route to the correct service for image generation
          if (options.generationService === GenerationService.GEMINI) {
            imageUrl = await generateImageForPrompt(
              apiKey, panel.image_prompt, options.aspectRatio,
              options.imageModel, options.style, options.era
            );
          } else {
            imageUrl = await generateImageForPromptWithPollinations(
              panel.image_prompt, options.imageModel
            );
          }
          setComicPanels(prevPanels =>
            prevPanels.map(p => p.scene_number === panel.scene_number ? { ...p, imageUrl } : p)
          );
        } catch (imgError) {
          console.error(`Error generating image for panel ${panel.scene_number}:`, imgError);
          setComicPanels(prevPanels =>
            prevPanels.map(p => p.scene_number === panel.scene_number ? { ...p, imageUrl: 'error' } : p)
          );
          setError(prevError => {
            const imgErrMessage = imgError instanceof Error ? imgError.message : "Unknown image error";
            const panelErrMessage = `Error on panel ${panel.scene_number}: ${imgErrMessage}`;
            return prevError ? `${prevError}\n${panelErrMessage}` : panelErrMessage;
          });
        }
      }
      setProgress({ currentStep: "Comic generation complete!", percentage: 100, totalPanels: totalPanels, currentPanel: totalPanels });

    } catch (err) {
      console.error("Comic generation failed:", err);
      let errorMessage = err instanceof Error ? err.message : "An unknown error occurred during comic generation.";
      if (options.generationService === GenerationService.GEMINI && (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('permission'))) {
        errorMessage += " Please ensure the Gemini API key is correct and has permissions.";
      }
      setError(errorMessage);
      setComicPanels([]);
      setProgress(undefined);
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        // Don't clear progress immediately so user can see the final message
      }, 2000);
    }
  }, [apiKey]);

  const handleDownloadPdf = useCallback(async () => {
    // This function remains unchanged.
    if (comicPanels.length === 0 || isLoading) return;
    setIsDownloadingPdf(true);
    // ... (rest of function is identical)
    setIsDownloadingPdf(false);
  }, [comicPanels, isLoading, currentAspectRatio]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="type-display-large">AI Comic Creator</h1>
        <p className="type-body-large">
          Turn your stories into stunning comic strips! Provide your narrative, choose your style, and let AI bring your vision to life.
        </p>
      </header>

      <main>
        {isLoading && <LoadingSpinner progress={progress} message={!progress && isLoading ? "Preparing your comic..." : undefined} />}
        
        <section className="api-key-section">
          <div className="form-input-container">
            <label htmlFor="apiKey" className="form-label">Your Gemini API Key (Optional)</label>
            <input
              type="password" id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              className="form-input" placeholder="Enter here to use premium Gemini models"
              aria-describedby="apiKeyHelp"
            />
          </div>
          <p id="apiKeyHelp" className="input-description">
            Required only for Gemini models. Pollinations models are free and do not need a key. Your key is not stored.
          </p>
        </section>

        <StoryInputForm
            onSubmit={handleComicGeneration} isLoading={isLoading}
            isApiKeyProvided={!!apiKey.trim()} currentProgress={progress}
        />

        {error && (
          <div className="error-message-container">
            <h3 className="type-title-medium">Operation Failed</h3>
            {error.split('\n').map((errMsg, index) => <p key={index}>{errMsg}</p>)}
            <button onClick={() => setError(null)} className="btn error-dismiss-btn">
              Dismiss
            </button>
          </div>
        )}

        {comicPanels.length > 0 && !isLoading && (
          <div className="centered-action-button-container">
            <button
              onClick={handleDownloadPdf} disabled={isDownloadingPdf}
              className="btn btn-success" aria-label="Download Comic as PDF"
            >
              <span className="material-icons-outlined">download</span>
              {isDownloadingPdf ? 'Generating PDF...' : 'Download Comic as PDF'}
            </button>
          </div>
        )}

        <ComicDisplay panels={comicPanels} aspectRatioSetting={currentAspectRatio} />
      </main>

      <footer className="app-footer">
        <p>Powered by Gemini and Pollinations AI.</p>
         <p className="footer-fineprint">Comic Creator v2.3</p>
      </footer>
    </div>
  );
};

export default App;
