
import React, { useState } from 'react';
import { StoryInputOptions, ComicStyle, ComicEra, AspectRatio, GenerationProgress, ImageGenerationModel } from '../types';
import { AVAILABLE_STYLES, AVAILABLE_ERAS, AVAILABLE_ASPECT_RATIOS, MAX_COMIC_PAGES, DEFAULT_NUM_PAGES, AVAILABLE_IMAGE_MODELS, DEFAULT_GEMINI_IMAGE_MODEL } from '../constants';

interface StoryInputFormProps {
  onSubmit: (options: StoryInputOptions) => void;
  isLoading: boolean;
  isApiKeyProvided: boolean;
  currentProgress?: GenerationProgress;
}

const StoryInputForm: React.FC<StoryInputFormProps> = ({ onSubmit, isLoading, isApiKeyProvided, currentProgress }) => {
  const [story, setStory] = useState('');
  const [style, setStyle] = useState<ComicStyle>(AVAILABLE_STYLES[0].value);
  const [era, setEra] = useState<ComicEra>(AVAILABLE_ERAS[0].value);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AVAILABLE_ASPECT_RATIOS[0].value);
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [numPages, setNumPages] = useState<number>(DEFAULT_NUM_PAGES);
  const [imageModel, setImageModel] = useState<ImageGenerationModel>(DEFAULT_GEMINI_IMAGE_MODEL);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApiKeyProvided) {
      alert("Please enter your API Key above the form.");
      return;
    }
    if (!story.trim()) {
      alert("Please enter a story.");
      return;
    }
    onSubmit({ story, style, era, aspectRatio, includeCaptions, numPages, imageModel });
  };

  const commonInputClass = "w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors placeholder-gray-400";
  const commonLabelClass = "block mb-2 text-sm font-medium text-gray-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-8 p-6 md:p-8 bg-gray-800 rounded-xl shadow-2xl max-w-2xl mx-auto">
      <div>
        <label htmlFor="story" className={commonLabelClass}>Your Story:</label>
        <textarea
          id="story"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={10}
          className={`${commonInputClass} min-h-[150px] resize-y`}
          placeholder="Type or paste your comic story here. Describe characters, scenes, and actions. The AI will try to maintain character consistency and apply specific instructions like depicting crossdressers with a transgender look."
          required
          minLength={50}
          maxLength={10000}
        />
        <p className="mt-2 text-xs text-gray-400">Min. 50 characters. Max. 10000 characters.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="style" className={commonLabelClass}>Comic Style:</label>
          <select id="style" value={style} onChange={(e) => setStyle(e.target.value as ComicStyle)} className={commonInputClass}>
            {AVAILABLE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="era" className={commonLabelClass}>Comic Era:</label>
          <select id="era" value={era} onChange={(e) => setEra(e.target.value as ComicEra)} className={commonInputClass}>
            {AVAILABLE_ERAS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="aspectRatio" className={commonLabelClass}>Image Aspect Ratio:</label>
          <select id="aspectRatio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className={commonInputClass}>
            {AVAILABLE_ASPECT_RATIOS.map(ar => <option key={ar.value} value={ar.value}>{ar.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="imageModel" className={commonLabelClass}>Image Generation Model:</label>
          <select 
            id="imageModel" 
            value={imageModel} 
            onChange={(e) => setImageModel(e.target.value as ImageGenerationModel)} 
            className={commonInputClass}
          >
            {AVAILABLE_IMAGE_MODELS.map(im => <option key={im.value} value={im.value}>{im.label}</option>)}
          </select>
        </div>
      </div>
      
      <div>
        <label htmlFor="numPages" className={commonLabelClass}>Number of Pages (1-{MAX_COMIC_PAGES}):</label>
        <input
          type="number"
          id="numPages"
          value={numPages}
          onChange={(e) => setNumPages(Math.max(1, Math.min(MAX_COMIC_PAGES, parseInt(e.target.value, 10) || 1)))}
          min="1"
          max={MAX_COMIC_PAGES}
          className={commonInputClass}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="includeCaptions"
            type="checkbox"
            checked={includeCaptions}
            onChange={(e) => setIncludeCaptions(e.target.checked)}
            className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800"
          />
          <label htmlFor="includeCaptions" className="ml-2 text-sm font-medium text-gray-300">Include Captions & Dialogues</label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading || !isApiKeyProvided}
        className="w-full px-6 py-3.5 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 focus:outline-none disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors duration-300"
        aria-label={!isApiKeyProvided ? "API Key required to create comic" : "Create My Comic!"}
      >
        {isLoading ? 'Generating Your Comic...' : 'Create My Comic!'}
      </button>
      {!isApiKeyProvided && !isLoading && (
        <p className="mt-2 text-xs text-center text-yellow-400">
          Please enter your API Key above to enable comic creation.
        </p>
      )}
      {isLoading && currentProgress && (
        <div className="mt-4 text-center p-3 bg-gray-700 rounded-lg">
          <p className="text-sm text-blue-300 font-medium">{currentProgress.currentStep}</p>
          {currentProgress.currentPanel !== undefined && currentProgress.totalPanels !== undefined && (
            <p className="text-xs text-gray-400 mt-1">
              Panel {currentProgress.currentPanel} of {currentProgress.totalPanels}
            </p>
          )}
          <div className="w-full bg-gray-600 rounded-full h-2.5 mt-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-150 ease-linear"
              style={{ width: `${currentProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-blue-400 mt-1">{Math.round(currentProgress.percentage)}% Complete</p>
        </div>
      )}
    </form>
  );
};

export default StoryInputForm;
