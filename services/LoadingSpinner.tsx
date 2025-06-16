
import React from 'react';
import { GenerationProgress } from '../types';

interface LoadingSpinnerProps {
  progress?: GenerationProgress;
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ progress, message }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4 text-center">
      <div className="w-16 h-16 border-4 border-t-blue-500 border-gray-700 rounded-full animate-spin mb-6"></div>
      {message && <p className="text-xl font-semibold text-blue-300 mb-2">{message}</p>}
      {progress && (
        <div className="w-full max-w-md">
          <p className="text-lg text-gray-300 mb-2">{progress.currentStep}</p>
          {progress.currentPanel !== undefined && progress.totalPanels !== undefined && (
            <p className="text-sm text-gray-400 mb-2">
              Panel {progress.currentPanel} of {progress.totalPanels}
            </p>
          )}
          <div className="w-full bg-gray-600 rounded-full h-4 mb-4 overflow-hidden">
            <div
              className="bg-blue-500 h-4 rounded-full transition-all duration-300 ease-in-out"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-blue-400">{Math.round(progress.percentage)}% Complete</p>
        </div>
      )}
      {!progress && !message && <p className="text-xl text-gray-300">Loading...</p>}
    </div>
  );
};

export default LoadingSpinner;
