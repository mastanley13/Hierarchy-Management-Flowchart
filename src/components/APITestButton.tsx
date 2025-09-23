import React from 'react';
import { Bug } from 'lucide-react';

interface APITestButtonProps {
  className?: string;
  onOpenDebugPanel?: () => void;
}

const APITestButton: React.FC<APITestButtonProps> = ({ className = '', onOpenDebugPanel }) => {
  const handleClick = () => {
    if (onOpenDebugPanel) {
      onOpenDebugPanel();
    }
  };

  return (
    <button 
      onClick={handleClick}
      className={`toolbar__button ${className}`}
      title="Open Debug Panel"
    >
      <Bug size={16} />
      Run API Test
    </button>
  );
};

export default APITestButton;
