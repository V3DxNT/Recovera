"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Shield, Zap, CheckCircle, AlertTriangle, Terminal, Clock } from "lucide-react";

type Activity = {
  id: string;
  type: 'safety_audit' | 'action';
  status: string;
  label: string;
  details: string | null;
  createdAt: string;
};

export default function AILiveFeed({ repoFullName }: { repoFullName: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await fetch(`/api/ai/live-feed?repoFullName=${encodeURIComponent(repoFullName)}`);
        const data = await res.json();
        if (data.activities) {
          setActivities(data.activities);
        }
      } catch (err) {
        console.error("Failed to fetch AI feed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
    const interval = setInterval(fetchFeed, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [repoFullName]);

  const getIcon = (type: string, status: string) => {
    if (type === 'safety_audit') {
      if (status === 'ALLOW_AUTO_PR') return <Shield className="w-4 h-4 text-emerald-400" />;
      if (status === 'BLOCK_AND_ALERT') return <Shield className="w-4 h-4 text-red-400" />;
      return <Shield className="w-4 h-4 text-amber-400" />;
    }
    if (status === 'opened') return <Zap className="w-4 h-4 text-blue-400" />;
    if (status === 'failed') return <AlertTriangle className="w-4 h-4 text-red-400" />;
    return <Brain className="w-4 h-4 text-purple-400" />;
  };

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          AI Agent Activity
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Live</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] scrollbar-thin scrollbar-thumb-white/10">
        {loading && activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3">
            <Terminal className="w-8 h-8 animate-pulse" />
            <p className="text-xs font-mono">Analyzing telemetry...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 text-xs font-mono">
            Waiting for AI triggers...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {activities.map((activity) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative pl-6 border-l border-white/5 pb-1"
              >
                <div className="absolute left-[-9px] top-0 bg-black p-1 rounded-full border border-white/5">
                  {getIcon(activity.type, activity.status)}
                </div>
                
                <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 hover:bg-white/[0.05] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-white uppercase tracking-tight">
                      {activity.label.replace('_', ' ')}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-mono">
                      {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className="text-xs text-zinc-400 leading-relaxed">
                    {activity.type === 'safety_audit' ? (
                      <div className="flex flex-col gap-1">
                        <span className={`font-medium ${activity.status === 'ALLOW_AUTO_PR' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          Decision: {activity.status.replace('_', ' ')}
                        </span>
                        {activity.details && (
                          <span className="text-[10px] text-zinc-500 italic">
                            Reasons: {activity.details}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span>Status: <span className="text-white">{activity.status}</span></span>
                        {activity.details && <span className="text-red-400/80">{activity.details}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
      
      <div className="p-3 bg-black/40 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Real-time ingestion active
        </span>
        <span className="font-mono">v1.2.0-beta</span>
      </div>
    </div>
  );
}
