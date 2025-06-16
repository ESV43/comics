
import React from 'react';
import { ComicPanelData, AspectRatio } from '../types';
import Panel from './Panel';

interface ComicDisplayProps {
  panels: ComicPanelData[];
  aspectRatioSetting: AspectRatio;
}

const ComicDisplay: React.FC<ComicDisplayProps> = ({ panels, aspectRatioSetting }) => {
  if (!panels || panels.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-xl">Your comic will appear here once generated.</p>
        <p>Fill out the form above and click "Create My Comic!"</p>
      </div>
    );
  }

  return (
    <div className="mt-12 mb-8">
      <h2 className="text-3xl font-bold text-center mb-8 text-blue-400">Your Generated Comic</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
        {panels.map((panel) => (
          <Panel key={panel.scene_number} panel={panel} aspectRatioSetting={aspectRatioSetting} />
        ))}
      </div>
    </div>
  );
};

export default ComicDisplay;
