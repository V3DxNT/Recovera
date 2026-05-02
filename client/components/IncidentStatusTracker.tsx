import React from "react";
import { motion } from "framer-motion";
import { Check, Clock, Play, Search, Shield, Zap } from "lucide-react";

type IncidentState = 
  | "DETECTED" 
  | "QUEUED" 
  | "PROCESSING" 
  | "ANALYZED" 
  | "DECIDED" 
  | "EXECUTED" 
  | "VERIFIED" 
  | "CLOSED" 
  | "RESOLVED" 
  | "IGNORED";

interface Props {
  status: string;
}

const STEPS = [
  { id: "DETECTED", label: "Detected" },
  { id: "QUEUED", label: "Queued" },
  { id: "PROCESSING", label: "Processing" },
  { id: "ANALYZED", label: "Analyzed" },
  { id: "DECIDED", label: "Decided" },
  { id: "EXECUTED", label: "Executed" },
  { id: "VERIFIED", label: "Verified" },
  { id: "CLOSED", label: "Closed" },
];

export const IncidentStatusTracker: React.FC<Props> = ({ status }) => {
  const currentStatus = status.toUpperCase();
  
  // Find current index
  let currentIndex = STEPS.findIndex(s => s.id === currentStatus);
  if (currentStatus === "RESOLVED") currentIndex = STEPS.length - 1;
  if (currentStatus === "IGNORED") currentIndex = -1;

  return (
    <div className="w-full py-6">
      <div className="relative flex justify-between">
        {/* Background Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-zinc-800 -translate-y-1/2" />
        
        {/* Progress Line */}
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, (currentIndex / (STEPS.length - 1)) * 100)}%` }}
          className="absolute top-1/2 left-0 h-0.5 bg-emerald-500 -translate-y-1/2 transition-all duration-500"
        />

        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isPending = idx > currentIndex;

          return (
            <div key={step.id} className="relative flex flex-col items-center group">
              <div 
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300 ${
                  isCompleted ? "bg-emerald-500 border-emerald-500" : 
                  isCurrent ? "bg-black border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : 
                  "bg-zinc-900 border-zinc-700"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3 text-black stroke-[4px]" />
                ) : isCurrent ? (
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full" />
                )}
              </div>
              
              <div className="absolute top-8 flex flex-col items-center">
                <span className={`text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap transition-colors ${
                  isCurrent ? "text-white" : isCompleted ? "text-emerald-500/80" : "text-zinc-600"
                }`}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
