import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import type { StoryInputOptions, ComicStyle, ComicEra, AspectRatio, GenerationProgress, CaptionPlacement, CharacterReference } from '../types';
import { GenerationService } from '../types';
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

const StoryInputForm: React.FC<StoryInputFormProps> = ({ onSubmit, isLoading, isApiKeyProvided, currentProgress }: StoryInputFormProps) => {
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
  const [characters, setCharacters] = useState<CharacterReference[]>([]);
  const [newCharName, setNewCharName] = useState('');
  const [lockSeed, setLockSeed] = useState(false);

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

  const handleCharImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) {
      return;
    }

    if (!newCharName.trim()) {
      alert("Please enter a character name before uploading an image.");
      return;
    }

    if (characters.length >= 5) {
      alert("Maximum of 5 character references allowed.");
      return;
    }

    // Check if character name already exists
    if (characters.some((char: CharacterReference) => char.name.toLowerCase() === newCharName.trim().toLowerCase())) {
      alert("A character with this name already exists. Please use a different name.");
      return;
    }

    const file = e.target.files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert("Please upload an image file (JPEG, PNG, or WebP).");
      e.target.value = '';
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image file size must be less than 5MB.");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
      if (!loadEvent.target?.result) {
        alert("Failed to read the image file. Please try again.");
        return;
      }

      const newCharacter: CharacterReference = {
        id: `char-${Date.now()}`,
        name: newCharName.trim(),
        image: loadEvent.target.result as string,
      };
      setCharacters((prev: CharacterReference[]) => [...prev, newCharacter]);
      setNewCharName('');
    };

    reader.onerror = () => {
      alert("Failed to read the image file. Please try again.");
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveCharacter = (id: string) => {
    setCharacters((prev: CharacterReference[]) => prev.filter((char: CharacterReference) => char.id !== id));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (generationService === GenerationService.GEMINI && !isApiKeyProvided) {
      return;
    }
    if (!story.trim()) {
      alert("Please enter a story.");
      return;
    }

    // Validate character references
    if (characters.length > 0) {
      const characterNames = characters.map((char: CharacterReference) => char.name.toLowerCase());
      const storyLower = story.toLowerCase();
      const unusedCharacters = characters.filter((char: CharacterReference) => !storyLower.includes(char.name.toLowerCase()));
      
      if (unusedCharacters.length > 0) {
        const warning = `Warning: The following characters are not mentioned in your story:\n${unusedCharacters.map(char => char.name).join(', ')}\n\nDo you want to continue anyway?`;
        if (!window.confirm(warning)) {
          return;
        }
      }
    }

    onSubmit({
      story,
      style,
      era,
      aspectRatio,
      includeCaptions,
      numPages,
      imageModel,
      textModel,
      captionPlacement,
      generationService,
      characters,
      lockSeed
    });
  };

  const isSubmitDisabled = isLoading || (generationService === GenerationService.GEMINI && !isApiKeyProvided);

  return (
    <form onSubmit={handleSubmit} className="story-input-form-container">
      {/* Story Textarea - Unchanged */}
      <div className="form-group">
        <label htmlFor="story" className="form-label">Your Story:</label>
        <textarea
          id="story" value={story} onChange={(e) => setStory(e.target.value)}
          rows={8} className="form-textarea" placeholder="Type or paste your comic story here..."
          required minLength={50} maxLength={60000}
        />
        <p className="input-description">Min. 50 characters.</p>
      </div>

       <div className="form-group">
        <label htmlFor="generationService" className="form-label">AI Service:</label>
        <div className="form-select-wrapper">
          <select id="generationService" value={generationService} onChange={(e) => setGenerationService(e.target.value as GenerationService)} className="form-select">
            {AVAILABLE_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Style and Era Grid - Unchanged */}
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
      
      {/* Aspect Ratio and Num Pages Grid - Unchanged */}
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
      
      {/* Captions Section - Unchanged */}
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

      <div className="form-group">
        <div className="checkbox-group" style={{marginBottom: '0.5rem'}}>
          <input
            id="lockSeed"
            type="checkbox"
            checked={lockSeed}
            onChange={(e) => setLockSeed(e.target.checked)}
            className="checkbox-input"
          />
          <label htmlFor="lockSeed" className="checkbox-label">
            Lock Seed (Maintain Character Consistency)
          </label>
        </div>
        <p className="input-description">
          When enabled, this will use a fixed seed for image generation to help maintain character consistency.
        </p>
      </div>

      {/* Character Reference Section */}
      <section className="character-reference-section">
        <label className="form-label" style={{ fontWeight: 600, fontSize: '1rem' }}>Character References (up to 5)</label>
        <div className="character-list">
          {characters.map((char) => (
            <div className="character-chip" key={char.id}>
              <img src={char.image} alt={char.name} className="character-thumbnail" />
              <span className="character-name">{char.name}</span>
              <button type="button" className="character-remove-btn" onClick={() => handleRemoveCharacter(char.id)} title="Remove character">
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
          ))}
        </div>
        {characters.length < 5 && (
          <div className="add-character-controls">
            <input
              type="text"
              className="form-input"
              placeholder="Character Name"
              value={newCharName}
              onChange={e => setNewCharName(e.target.value)}
              maxLength={32}
              style={{ width: '160px' }}
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleCharImageUpload}
              style={{ width: 'auto' }}
              aria-label="Upload character reference image"
            />
          </div>
        )}
        <p className="input-description" style={{ marginTop: '0.5rem' }}>
          Add reference images and names for your main characters to help the AI maintain consistency. Only characters mentioned in your story will be used.
        </p>
      </section>

      <button
        type="submit" disabled={isSubmitDisabled}
        className="btn btn-primary btn-full-width"
        aria-label={isSubmitDisabled ? (generationService === GenerationService.GEMINI ? "API Key required for Gemini" : undefined) : "Create My Comic!"}
      >
        <span className="material-icons-outlined">auto_awesome</span>
        {isLoading ? 'Generating Your Comic...' : 'Create My Comic!'}
      </button>
      {isSubmitDisabled && !isLoading && generationService === GenerationService.GEMINI && (
        <p className="input-description" style={{ textAlign: 'center', color: 'var(--md-sys-color-tertiary)'}}>
          Please enter your Gemini API Key to enable comic creation with Gemini.
        </p>
      )}
      {/* Progress Bar - Unchanged */}
      {isLoading && currentProgress && (
        <div className="form-progress-container">
          {/* ... progress bar jsx ... */}
        </div>
      )}
    </form>
  );
};

export default StoryInputForm;
