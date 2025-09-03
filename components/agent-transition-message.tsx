'use client';

import { motion } from 'framer-motion';
import { ArrowRightIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface AgentTransitionMessageProps {
  fromAgent?: string;
  toAgent: string;
  message?: string;
}

export function AgentTransitionMessage({ fromAgent, toAgent, message }: AgentTransitionMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex justify-center py-4"
    >
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 max-w-md">
        <div className="flex items-center justify-center space-x-3">
          <div className="flex items-center space-x-2 text-sm text-purple-600">
            <SparklesIcon className="w-4 h-4" />
            <span className="font-medium">
              {fromAgent && `${fromAgent} `}
            </span>
            {fromAgent && (
              <ArrowRightIcon className="w-4 h-4 text-purple-400" />
            )}
            <span className="font-semibold text-purple-700">
              {toAgent}
            </span>
          </div>
        </div>
        
        {message && (
          <div className="mt-2 text-center">
            <p className="text-xs text-gray-600 italic">
              {message}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}