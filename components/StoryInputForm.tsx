
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

  return (
    <form onSubmit={handleSubmit} className="story-input-form-container">
      <div className="form-group">
        <label htmlFor="story" className="form-label">Your Story:</label>
        <textarea
          id="story"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={8} // Adjusted rows
          className="form-textarea"
          placeholder="Type or paste your comic story here. Describe characters, scenes, and actions..."
          required
          minLength={50}
          maxLength={10000}
        />
        <p className="input-description">Min. 50 characters. Max. 10000 characters.</p>
      </div>

      <div className="form-group-grid">
        <div className="form-group">
          <label htmlFor="style" className="form-label">Comic Style:</label>
          <div className="form-select-wrapper">
            <select id="style" value={style} onChange={(e) => setStyle(e.target.value as ComicStyle)} className="form-select">
              {AVAILABLE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="era" className="form-label">Comic Era:</label>
          <div className="form-select-wrapper">
            <select id="era" value={era} onChange={(e) => setEra(e.target.value as ComicEra)} className="form-select">
              {AVAILABLE_ERAS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      
      <div className="form-group-grid">
        <div className="form-group">
          <label htmlFor="aspectRatio" className="form-label">Image Aspect Ratio:</label>
          <div className="form-select-wrapper">
            <select id="aspectRatio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="form-select">
              {AVAILABLE_ASPECT_RATIOS.map(ar => <option key={ar.value} value={ar.value}>{ar.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="imageModel" className="form-label">Image Generation Model:</label>
          <div className="form-select-wrapper">
            <select 
              id="imageModel" 
              value={imageModel} 
              onChange={(e) => setImageModel(e.target.value as ImageGenerationModel)} 
              className="form-select"
            >
              {AVAILABLE_IMAGE_MODELS.map(im => <option key={im.value} value={im.value}>{im.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      
      <div className="form-group">
        <div className="form-input-container">
          <label htmlFor="numPages" className="form-label">Number of Pages (1-{MAX_COMIC_PAGES})</label>
          <input
            type="number"
            id="numPages"
            value={numPages}
            onChange={(e) => setNumPages(Math.max(1, Math.min(MAX_COMIC_PAGES, parseInt(e.target.value, 10) || 1)))}
            min="1"
            max={MAX_COMIC_PAGES}
            className="form-input"
          />
        </div>
      </div>

      <div className="checkbox-group">
        <input
          id="includeCaptions"
          type="checkbox"
          checked={includeCaptions}
          onChange={(e) => setIncludeCaptions(e.target.checked)}
          className="checkbox-input"
        />
        <label htmlFor="includeCaptions" className="checkbox-label">Include Captions & Dialogues</label>
      </div>

      <button
        type="submit"
        disabled={isLoading || !isApiKeyProvided}
        className="btn btn-primary btn-full-width"
        aria-label={!isApiKeyProvided ? "API Key required to create comic" : "Create My Comic!"}
      >
        <span className="material-icons-outlined">auto_awesome</span>
        {isLoading ? 'Generating Your Comic...' : 'Create My Comic!'}
      </button>
      {!isApiKeyProvided && !isLoading && (
        <p className="input-description" style={{ textAlign: 'center', color: 'var(--md-sys-color-tertiary)'}}>
          Please enter your API Key to enable comic creation.
        </p>
      )}
      {isLoading && currentProgress && (
        <div className="form-progress-container">
          <p className="form-progress-step">{currentProgress.currentStep}</p>
          {currentProgress.currentPanel !== undefined && currentProgress.totalPanels !== undefined && (
            <p className="form-progress-panel-info">
              Panel {currentProgress.currentPanel} of {currentProgress.totalPanels}
            </p>
          )}
          <div className="form-progress-bar-container">
            <div
              className="form-progress-bar"
              style={{ width: `${currentProgress.percentage}%` }}
            ></div>
          </div>
          <p className="form-progress-percentage">{Math.round(currentProgress.percentage)}% Complete</p>
        </div>
      )}
    </form>
  );
};

export default StoryInputForm;
