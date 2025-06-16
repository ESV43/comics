
import React from 'react';
import { ComicPanelData, AspectRatio } from '../types';

interface PanelProps {
  panel: ComicPanelData;
  aspectRatioSetting: AspectRatio;
}

const Panel: React.FC<PanelProps> = ({ panel, aspectRatioSetting }) => {
  let aspectRatioClass = 'aspect-square'; // Default to square
  if (aspectRatioSetting === AspectRatio.PORTRAIT) {
    aspectRatioClass = 'aspect-[9/16]';
  } else if (aspectRatioSetting === AspectRatio.LANDSCAPE) {
    aspectRatioClass = 'aspect-[16/9]';
  }
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col h-full border border-gray-700">
      <div className={`w-full ${aspectRatioClass} bg-gray-700 flex items-center justify-center`}>
        {panel.imageUrl ? (
          <img 
            src={panel.imageUrl} 
            alt={`Comic panel ${panel.scene_number}`} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="ml-2">Generating...</span>
          </div>
        )}
      </div>
      {(panel.caption || (panel.dialogues && panel.dialogues.length > 0)) && (
        <div className="p-4 flex-grow flex flex-col justify-start">
          {panel.caption && (
            <p className="text-sm text-gray-300 italic mb-2 leading-relaxed">
              <strong>Scene {panel.scene_number}:</strong> {panel.caption}
            </p>
          )}
          {panel.dialogues && panel.dialogues.length > 0 && (
            <div className="space-y-1">
              {panel.dialogues.map((dialogue, index) => (
                <p key={index} className="text-xs text-gray-400 bg-gray-700 p-2 rounded-md">
                  {dialogue}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
       {!panel.caption && (!panel.dialogues || panel.dialogues.length === 0) && (
         <div className="p-4">
            <p className="text-sm text-gray-500 italic">Scene {panel.scene_number}</p>
         </div>
       )}
    </div>
  );
};

export default Panel;
