'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserIcon, 
  BriefcaseIcon, 
  ChatBubbleLeftRightIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

export interface AgentInfo {
  name: string;
  type: 'triage' | 'resume' | 'interview' | 'planning' | 'jobsearch';
  description: string;
}

const agentConfig = {
  triage: {
    icon: UserIcon,
    color: 'from-blue-500 to-purple-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
    title: 'Career Counselor',
    description: 'Helping you get started with your career questions'
  },
  resume: {
    icon: BriefcaseIcon,
    color: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-800',
    title: 'Resume Expert',
    description: 'Optimizing your resume for maximum impact'
  },
  interview: {
    icon: ChatBubbleLeftRightIcon,
    color: 'from-orange-500 to-red-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-800',
    title: 'Interview Coach',
    description: 'Preparing you for successful interviews'
  },
  planning: {
    icon: AcademicCapIcon,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-800',
    title: 'Career Planning Specialist',
    description: 'Designing your long-term career strategy'
  },
  jobsearch: {
    icon: MagnifyingGlassIcon,
    color: 'from-indigo-500 to-blue-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-800',
    title: 'Job Search Advisor',
    description: 'Finding the perfect opportunities for you'
  }
};

interface AgentIndicatorProps {
  currentAgent?: string;
  isTransitioning?: boolean;
  transitionMessage?: string;
}

function getAgentType(agentName?: string): 'triage' | 'resume' | 'interview' | 'planning' | 'jobsearch' {
  if (!agentName) return 'triage';
  
  const name = agentName.toLowerCase();
  if (name.includes('resume')) return 'resume';
  if (name.includes('interview')) return 'interview';
  if (name.includes('planning') || name.includes('career planning')) return 'planning';
  if (name.includes('job search') || name.includes('jobsearch')) return 'jobsearch';
  
  return 'triage';
}

export function AgentIndicator({ currentAgent, isTransitioning, transitionMessage }: AgentIndicatorProps) {
  const agentType = getAgentType(currentAgent);
  const config = agentConfig[agentType];
  const IconComponent = config.icon;

  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200">
      <AnimatePresence mode="wait">
        {isTransitioning && transitionMessage ? (
          <motion.div
            key="transition"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-4 py-3"
          >
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <SparklesIcon className="w-4 h-4 text-purple-500" />
              </motion.div>
              <span>{transitionMessage}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="agent-info"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-4 py-3"
          >
            <div className={`flex items-center space-x-3 p-3 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
              <div className={`p-2 rounded-full bg-gradient-to-r ${config.color} text-white`}>
                <IconComponent className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className={`font-semibold ${config.textColor} text-sm`}>
                    {config.title}
                  </h3>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600 font-medium">Active</span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  {config.description}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}