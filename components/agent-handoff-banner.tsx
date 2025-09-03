'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { X, ArrowRight, User, Briefcase, Target, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentHandoffBannerProps {
  suggestedAgent: string;
  handoffMessage: string;
  onHandoff: (agent: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

const agentIcons = {
  resume: User,
  interview: Briefcase,
  planner: Target,
  jobsearch: Search,
};

const agentNames = {
  resume: 'Resume Expert',
  interview: 'Interview Coach',  
  planner: 'Career Planner',
  jobsearch: 'Job Search Advisor',
};

const agentColors = {
  resume: 'bg-blue-50 border-blue-200 text-blue-800',
  interview: 'bg-green-50 border-green-200 text-green-800',
  planner: 'bg-purple-50 border-purple-200 text-purple-800',
  jobsearch: 'bg-orange-50 border-orange-200 text-orange-800',
};

export function AgentHandoffBanner({
  suggestedAgent,
  handoffMessage,
  onHandoff,
  onDismiss,
  isLoading = false,
}: AgentHandoffBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const IconComponent = agentIcons[suggestedAgent as keyof typeof agentIcons] || User;
  const agentName = agentNames[suggestedAgent as keyof typeof agentNames] || 'Specialist';
  const colorClass = agentColors[suggestedAgent as keyof typeof agentColors] || agentColors.resume;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss();
  };

  const handleHandoff = () => {
    onHandoff(suggestedAgent);
  };

  return (
    <div className={cn(
      'relative mx-4 mb-4 p-4 rounded-lg border-2 animate-in slide-in-from-top duration-300',
      colorClass
    )}>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10 transition-colors"
        disabled={isLoading}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="flex-shrink-0 mt-0.5">
          <IconComponent className="h-5 w-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold">
              Connect with {agentName}
            </h4>
          </div>
          
          <p className="text-sm mb-3 leading-relaxed">
            {handoffMessage}
          </p>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleHandoff}
              disabled={isLoading}
              className="bg-white/80 text-gray-900 hover:bg-white/90 border border-gray-300"
            >
              {isLoading ? (
                'Connecting...'
              ) : (
                <>
                  Connect <ArrowRight className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              disabled={isLoading}
              className="text-gray-600 hover:text-gray-800"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}