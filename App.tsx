
import React, { useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import StoryInputForm from './components/StoryInputForm';
import ComicDisplay from './components/ComicDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import { StoryInputOptions, ComicPanelData, GenerationProgress, AspectRatio } from './types';
import { generateScenePrompts, generateImageForPrompt } from './services/geminiService';
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
    if (!apiKey.trim()) {
      setError("Please enter your API Key to generate comics.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setComicPanels([]);
    setCurrentAspectRatio(options.aspectRatio);
    setProgress(undefined); 
    
    let scenePrompts: ComicPanelData[] = []; // Declare scenePrompts here

    try {
      setProgress({ currentStep: "Analyzing story & generating scene prompts...", percentage: 0 });
      scenePrompts = await generateScenePrompts(apiKey, options); 
      
      if (!scenePrompts || scenePrompts.length === 0) {
        throw new Error("No scene prompts generated. Story might be too short or API issue. Check API key & story.");
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
          const imageUrl = await generateImageForPrompt(
            apiKey, 
            panel.image_prompt, 
            options.aspectRatio, 
            options.imageModel,
            options.style, // Pass style
            options.era    // Pass era
          );
          setComicPanels(prevPanels => 
            prevPanels.map(p => p.scene_number === panel.scene_number ? { ...p, imageUrl } : p)
          );
        } catch (imgError) {
          console.error(`Error generating image for panel ${panel.scene_number}:`, imgError);
          setComicPanels(prevPanels => 
            prevPanels.map(p => p.scene_number === panel.scene_number ? { ...p, imageUrl: 'error' } : p) 
          );
           // Optionally, set a general error or continue with a placeholder
        }
      }
      setProgress({ currentStep: "Comic generation complete!", percentage: 100, totalPanels: totalPanels, currentPanel: totalPanels });

    } catch (err) {
      console.error("Comic generation failed:", err);
      let errorMessage = err instanceof Error ? err.message : "An unknown error occurred during comic generation.";
      if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('permission')) {
        errorMessage += " Please ensure API key is correct and has permissions for all selected models.";
      }
      setError(errorMessage);
      setComicPanels([]); 
      setProgress(undefined);
    } finally {
      // Logic to manage isLoading and progress visibility after generation
      if (error) { // If there was an error
        setIsLoading(false);
        // Keep progress visible on error, or clear after a delay:
        // setTimeout(() => setProgress(undefined), 5000); 
      } else if (comicPanels.length > 0 || (scenePrompts && scenePrompts.length > 0)) { // If successful (check if panels were at least attempted)
         setTimeout(() => {
            setIsLoading(false);
            setProgress(undefined); 
        }, 2000); 
      } else { // Other cases, like no prompts generated leading to no panels
        setIsLoading(false);
        setProgress(undefined);
      }
    }
  }, [apiKey, comicPanels.length, error]); // Added 'error' to dependency array

  const handleDownloadPdf = useCallback(async () => {
    if (comicPanels.length === 0 || isLoading) return;

    setIsDownloadingPdf(true);
    setError(null);

    try {
      const isLandscape = currentAspectRatio === AspectRatio.LANDSCAPE;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const A4_WIDTH_MM = isLandscape ? 297 : 210;
      const A4_HEIGHT_MM = isLandscape ? 210 : 297;
      const MARGIN_MM = 10;
      const MAX_IMG_WIDTH = A4_WIDTH_MM - 2 * MARGIN_MM;
      const MAX_IMG_HEIGHT_AREA = A4_HEIGHT_MM * 0.65 - MARGIN_MM; 
      const TEXT_START_Y_OFFSET = 10; 
      
      for (let i = 0; i < comicPanels.length; i++) {
        const panel = comicPanels[i];
        if (i > 0) {
          pdf.addPage();
        }

        pdf.setFontSize(10);
        pdf.setTextColor(100); 

        pdf.text(`Panel ${panel.scene_number}`, MARGIN_MM, MARGIN_MM + 5);

        if (panel.imageUrl && panel.imageUrl !== 'error') {
          try {
            const img = new Image();
            img.src = panel.imageUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Image failed to load for PDF generation.'));
            });

            let imgWidth = img.width;
            let imgHeight = img.height;
            const aspectRatio = imgWidth / imgHeight;

            let pdfImgWidth = MAX_IMG_WIDTH;
            let pdfImgHeight = pdfImgWidth / aspectRatio;

            if (pdfImgHeight > MAX_IMG_HEIGHT_AREA) {
              pdfImgHeight = MAX_IMG_HEIGHT_AREA;
              pdfImgWidth = pdfImgHeight * aspectRatio;
            }
            
            const imgX = (A4_WIDTH_MM - pdfImgWidth) / 2;
            const imgY = MARGIN_MM + 10; 

            pdf.addImage(panel.imageUrl, 'JPEG', imgX, imgY, pdfImgWidth, pdfImgHeight);
            
            let currentTextY = imgY + pdfImgHeight + TEXT_START_Y_OFFSET;

            if (panel.caption) {
              pdf.setFontSize(12);
              pdf.setTextColor(0); 
              const captionLines = pdf.splitTextToSize(`Caption: ${panel.caption}`, MAX_IMG_WIDTH);
              pdf.text(captionLines, MARGIN_MM, currentTextY);
              currentTextY += (captionLines.length * 5) + 5; 
            }

            if (panel.dialogues && panel.dialogues.length > 0) {
              pdf.setFontSize(10);
              pdf.setTextColor(50); 
              panel.dialogues.forEach(dialogue => {
                if (currentTextY > A4_HEIGHT_MM - MARGIN_MM - 10) { 
                    pdf.addPage();
                    currentTextY = MARGIN_MM;
                     pdf.text(`Panel ${panel.scene_number} (cont.)`, MARGIN_MM, currentTextY);
                     currentTextY +=10;
                }
                const dialogueLines = pdf.splitTextToSize(dialogue, MAX_IMG_WIDTH);
                pdf.text(dialogueLines, MARGIN_MM, currentTextY);
                currentTextY += (dialogueLines.length * 4) + 2;
              });
            }
          } catch (e) {
            console.error("Error processing image for PDF for panel " + panel.scene_number, e);
            const errorTextY = MARGIN_MM + 20;
            pdf.setTextColor(255,0,0); 
            pdf.text("Error loading image for this panel.", MARGIN_MM, errorTextY, {maxWidth: MAX_IMG_WIDTH});
            pdf.setTextColor(0); 
          }
        } else {
           const errorTextY = MARGIN_MM + 20;
          pdf.setFontSize(12);
          pdf.setTextColor(255,0,0); 
          pdf.text(panel.imageUrl === 'error' ? "Image generation failed for this panel." : "Image not available for this panel.", MARGIN_MM, errorTextY, {maxWidth: MAX_IMG_WIDTH});
          pdf.setTextColor(0); 
        }
      }
      pdf.save('ai-comic.pdf');
    } catch (e) {
      console.error("Failed to generate PDF:", e);
      setError(e instanceof Error ? e.message : "An unknown error occurred while generating the PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [comicPanels, isLoading, currentAspectRatio]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="type-display-large">
            AI Comic Creator
        </h1>
        <p className="type-body-large">
          Turn your stories into stunning comic strips! Provide your narrative, choose your style, and let AI bring your vision to life.
        </p>
      </header>

      <main>
        {isLoading && <LoadingSpinner progress={progress} message={!progress && isLoading ? "Preparing your comic..." : undefined} />}
        
        <section className="api-key-section">
          <label htmlFor="apiKey" className="form-label">Your Gemini API Key:</label>
          <input
            type="password"
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="form-input"
            placeholder="Enter your API Key here"
            aria-describedby="apiKeyHelp"
          />
          <p id="apiKeyHelp" className="input-description">
            Your API Key is required and used solely for API calls. It's not stored.
          </p>
        </section>

        <StoryInputForm 
            onSubmit={handleComicGeneration} 
            isLoading={isLoading} 
            isApiKeyProvided={!!apiKey.trim()}
            currentProgress={progress} 
        />

        {error && (
          <div className="error-message-container">
            <h3 className="type-title-medium">Operation Failed</h3>
            <p>{error}</p>
            <button 
              onClick={() => setError(null)} 
              className="btn error-dismiss-btn"
              aria-label="Dismiss error message"
            >
              Dismiss
            </button>
          </div>
        )}

        {comicPanels.length > 0 && !isLoading && (
          <div className="centered-action-button-container">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="btn btn-success" 
              aria-label="Download Comic as PDF"
            >
              {isDownloadingPdf ? 'Generating PDF...' : (
                <>
                  <span className="material-icons-outlined" style={{ marginRight: '8px', fontSize: '20px', verticalAlign: 'middle' }}>download</span>
                  Download Comic as PDF
                </>
              )}
            </button>
          </div>
        )}

        <ComicDisplay panels={comicPanels} aspectRatioSetting={currentAspectRatio} />
      </main>

      <footer className="app-footer">
        <p>
          Powered by Gemini AI. Comic Creator v2.0 M3 Edition
        </p>
         <p className="footer-fineprint">
          Requires a valid Gemini API Key with permissions for selected models.
        </p>
      </footer>
    </div>
  );
};

export default App;
