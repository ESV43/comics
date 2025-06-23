import React, { useState, useEffect } from 'react';
import { StoryInputOptions, ComicStyle, ComicEra, AspectRatio, GenerationProgress, CaptionPlacement, GenerationService, CharacterReference } from '../types';
import {
  AVAILABLE_STYLES,
  AVAILABLE_ERAS,
  AVAILABLE_ASPECT_RATIOS,
  MAX_COMIC_PAGES,
  DEFAULT_NUM_PAGES,
  AVAILABLE_GEMINI_IMAGE_MODELS,
  DEFAULT_GEMINI_IMAGE_MODEL,
  AVAILABLE_GEMINI_TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  AVAILABLE_CAPTION_PLACEMENTS,
  DEFAULT_CAPTION_PLACEMENT,
  AVAILABLE_SERVICES,
  DEFAULT_POLLINATIONS_IMAGE_MODEL,
  DEFAULT_POLLINATIONS_TEXT_MODEL
} from '../constants';
import { listPollinationsImageModels, listPollinationsTextModels } from '../services/geminiService';

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
  const [imageModel, setImageModel] = useState<string>(DEFAULT_GEMINI_IMAGE_MODEL);
  const [textModel, setTextModel] = useState<string>(DEFAULT_TEXT_MODEL);
  const [captionPlacement, setCaptionPlacement] = useState<CaptionPlacement>(DEFAULT_CAPTION_PLACEMENT);
  const [generationService, setGenerationService] = useState<GenerationService>(AVAILABLE_SERVICES[0].value);
  const [pollinationsImageModels, setPollinationsImageModels] = useState<{ value: string; label: string }[]>([]);
  const [pollinationsTextModels, setPollinationsTextModels] = useState<{ value: string; label: string }[]>([]);
  const [arePollinationsModelsLoading, setArePollinationsModelsLoading] = useState(false);
  
  // State for character references
  const [characters, setCharacters] = useState<CharacterReference[]>([]);
  const [newCharName, setNewCharName] = useState('');


  useEffect(() => {
    if (generationService === GenerationService.POLLINATIONS) {
      setArePollinationsModelsLoading(true);
      Promise.all([listPollinationsImageModels(), listPollinationsTextModels()])
        .then(([imageModels, textModels]) => {
          setPollinationsImageModels(imageModels);
          setPollinationsTextModels(textModels);
          setImageModel(imageModels.find(m => m.value === DEFAULT_POLLINATIONS_IMAGE_MODEL)?.value || imageModels[0]?.value);
          setTextModel(textModels.find(m => m.value === DEFAULT_POLLINATIONS_TEXT_MODEL)?.value || textModels[0]?.value);
        })
        .finally(() => setArePollinationsModelsLoading(false));
    } else {
      setTextModel(DEFAULT_TEXT_MODEL);
      setImageModel(DEFAULT_GEMINI_IMAGE_MODEL);
    }
  }, [generationService]);

  const handleCharImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && newCharName.trim()) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const newCharacter: CharacterReference = {
          id: `char-${Date.now()}`,
          name: newCharName.trim(),
          image: loadEvent.target?.result as string,
        };
        setCharacters(prev => [...prev, newCharacter]);
        setNewCharName(''); // Reset for next character
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ''; // Always reset file input to allow re-uploading the same file
  };

  const handleRemoveCharacter = (id: string) => {
    setCharacters(prev => prev.filter(char => char.id !== id));
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (generationService === GenerationService.GEMINI && !isApiKeyProvided) {
      alert("Please enter your Gemini API Key above to use the Gemini service.");
      return;
    }
    if (!story.trim()) {
      alert("Please enter a story.");
      return;
    }
    onSubmit({ story, style, era, aspectRatio, includeCaptions, numPages, imageModel, textModel, captionPlacement, generationService, characters });
  };

  const isSubmitDisabled = isLoading || (generationService === GenerationService.GEMINI && !isApiKeyProvided);

  return (
    <form onSubmit={handleSubmit} className="story-input-form-container">
      {/* Story Textarea */}
      <div className="form-group">
        <label htmlFor="story" className="form-label">Your Story:</label>
        <textarea
          id="story" value={story} onChange={(e) => setStory(e.target.value)}
          rows={8} className="form-textarea" placeholder="Type or paste your comic story here..."
          required minLength={50} maxLength={60000}
        />
        <p className="input-description">Min. 50 characters.</p>
      </div>

      {/* Character Reference Section */}
       <div className="form-group character-reference-section">
        <label className="form-label">Character References (Optional, Max 5)</label>
        <p className="input-description">
          Add character images to maintain consistency. Name your character, then click "Add Character" to upload an image.
        </p>

        <div className="character-list">
          {characters.map(char => (
            <div key={char.id} className="character-chip">
              <img src={char.image} alt={char.name} className="character-thumbnail" />
              <span className="character-name">{char.name}</span>
              <button type="button" onClick={() => handleRemoveCharacter(char.id)} className="character-remove-btn" aria-label={`Remove ${char.name}`}>×</button>
            </div>
          ))}
        </div>

        {characters.length < 5 && (
          <div className="add-character-controls">
            <div className="form-input-container" style={{ flexGrow: 1 }}>
              <label htmlFor="newCharName" className="form-label">Character Name</label>
              <input
                type="text"
                id="newCharName"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                className="form-input"
                placeholder="E.g., Captain Astro"
              />
            </div>
            <input
              type="file"
              id="character-image-input"
              accept="image/png, image/jpeg, image/webp"
              style={{ display: 'none' }}
              onChange={handleCharImageUpload}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => document.getElementById('character-image-input')?.click()}
              disabled={!newCharName.trim()}
              aria-label="Add character image"
            >
              <span className="material-icons-outlined">add_photo_alternate</span>
              Add Character
            </button>
          </div>
        )}
      </div>

       <div className="form-group">
        <label htmlFor="generationService" className="form-label">AI Service:</label>
        <div className="form-select-wrapper">
          <select id="generationService" value={generationService} onChange={(e) => setGenerationService(e.target.value as GenerationService)} className="form-select">
            {AVAILABLE_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Style and Era Grid */}
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
      
      {/* Aspect Ratio and Num Pages Grid */}
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
          <label htmlFor="numPages" className="form-label">Number of Pages (1-{MAX_COMIC_PAGES})</label>
           <div className="form-input-container" style={{paddingTop: '0.25rem', paddingBottom:'0.25rem', borderRadius: 'var(--md-sys-shape-corner-extra-small)'}}>
            <input
              type="number" id="numPages" value={numPages}
              onChange={(e) => setNumPages(Math.max(1, Math.min(MAX_COMIC_PAGES, parseInt(e.target.value, 10) || 1)))}
              min="1" max={MAX_COMIC_PAGES} className="form-input" style={{paddingTop: '0.5rem', paddingBottom: '0.5rem'}}
            />
          </div>
        </div>
      </div>

      {/* DYNAMIC MODEL SELECTION */}
       <div className="form-group-grid">
        <div className="form-group">
            <label htmlFor="textModel" className="form-label">Text Generation Model:</label>
            <div className="form-select-wrapper">
              <select 
                id="textModel" value={textModel} onChange={(e) => setTextModel(e.target.value)} 
                className="form-select" disabled={arePollinationsModelsLoading}
              >
                { generationService === GenerationService.GEMINI && AVAILABLE_GEMINI_TEXT_MODELS.map(tm => <option key={tm.value} value={tm.value}>{tm.label}</option>) }
                { generationService === GenerationService.POLLINATIONS && (
                    arePollinationsModelsLoading ? <option>Loading models...</option> :
                    pollinationsTextModels.map(tm => <option key={tm.value} value={tm.value}>{tm.label}</option>)
                )}
              </select>
            </div>
          </div>
        <div className="form-group">
          <label htmlFor="imageModel" className="form-label">Image Generation Model:</label>
          <div className="form-select-wrapper">
            <select
              id="imageModel" value={imageModel} onChange={(e) => setImageModel(e.target.value)}
              className="form-select" disabled={arePollinationsModelsLoading}
            >
              { generationService === GenerationService.GEMINI && AVAILABLE_GEMINI_IMAGE_MODELS.map(im => <option key={im.value} value={im.value}>{im.label}</option>) }
              { generationService === GenerationService.POLLINATIONS && (
                    arePollinationsModelsLoading ? <option>Loading models...</option> :
                    pollinationsImageModels.map(im => <option key={im.value} value={im.value}>{im.label}</option>)
                )}
            </select>
          </div>
        </div>
      </div>
      
      {/* Captions Section */}
      <div className="form-group">
        <div className="checkbox-group" style={{marginBottom: '0.5rem'}}>
          <input
            id="includeCaptions" type="checkbox" checked={includeCaptions}
            onChange={(e) => setIncludeCaptions(e.target.checked)} className="checkbox-input"
          />
          <label htmlFor="includeCaptions" className="checkbox-label">Include Captions & Dialogues</label>
        </div>
        {includeCaptions && (
          <div className="form-group" style={{marginTop: '0.5rem', marginLeft: '1.5rem'}}>
            <label htmlFor="captionPlacement" className="form-label" style={{paddingLeft: 0, fontSize:'0.8rem'}}>Placement:</label>
            <div className="form-select-wrapper">
              <select
                id="captionPlacement" value={captionPlacement} onChange={(e) => setCaptionPlacement(e.target.value as CaptionPlacement)}
                className="form-select" disabled={!includeCaptions}
              >
                {AVAILABLE_CAPTION_PLACEMENTS.map(cp => <option key={cp.value} value={cp.value}>{cp.label}</option>)}
              </select>
            </div>
             <p className="input-description" style={{paddingLeft: 0, fontSize:'0.7rem'}}>Note: Embedding in image is experimental.</p>
          </div>
        )}
      </div>

      <button
        type="submit" disabled={isSubmitDisabled}
        className="btn btn-primary btn-full-width"
        aria-label={isSubmitDisabled ? "API Key required for Gemini" : "Create My Comic!"}
      >
        <span className="material-icons-outlined">auto_awesome</span>
        {isLoading ? 'Generating Your Comic...' : 'Create My Comic!'}
      </button>
      {isSubmitDisabled && !isLoading && (
        <p className="input-description" style={{ textAlign: 'center', color: 'var(--md-sys-color-tertiary)'}}>
          Please enter your Gemini API Key to enable comic creation with Gemini.
        </p>
      )}
      {/* Progress Bar */}
      {isLoading && currentProgress && (
        <div className="form-progress-container">
          {/* ... progress bar jsx ... */}
        </div>
      )}
    </form>
  );
};

export default StoryInputForm;
