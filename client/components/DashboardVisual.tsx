"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function DashboardVisual() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const sequence = [
      "[SYS] Memory leak detected in worker-04",
      "[AI] Analyzing V8 heap dump...",
      "[AI] Identified mutation in handleSessionState()",
      "[SYS] Compiling hot-fix patch",
      "[SYS] Validating against staging test suite",
      "[CMD] git commit -m \"fix: memory leak in session handler\"",
      "[CMD] git push origin && gh pr create --auto-merge",
      "[SYS] Rolling update deployed. Outage avoided.",
      "[SYS] Process completed in 4.2s"
    ];

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < sequence.length) {
        setLogs(prev => [...prev, sequence[currentIndex]]);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 bg-black border-y border-white/[0.05]">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col items-center mb-16">
          <h2 className="text-3xl font-medium text-white mb-4 tracking-tight">The engine in action.</h2>
          <p className="text-zinc-400 text-center max-w-xl font-light">Watch as the Recovera agent automatically intercepts an anomaly, synthesizes a patch, and verifies it.</p>
        </div>

        {/* Mac OS Style Terminal Window */}
        <div className="mx-auto max-w-4xl rounded-xl bg-[#0a0a0a] border border-white/10 shadow-2xl overflow-hidden shadow-black/80">
          <div className="flex items-center px-4 py-3 border-b border-white/[0.05] bg-[#111]">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-zinc-700/80"></div>
              <div className="w-3 h-3 rounded-full bg-zinc-700/80"></div>
              <div className="w-3 h-3 rounded-full bg-zinc-700/80"></div>
            </div>
            <div className="mx-auto text-[11px] font-medium text-zinc-500 font-mono tracking-wider">
              recovera ~ stdout
            </div>
            <div className="w-11"></div> {/* Spacer for symmetry */}
          </div>

          <div className="p-6 h-[400px] overflow-y-auto font-mono text-[13px] leading-relaxed">
            {logs.map((log, i) => (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                key={i}
                className={`mb-2 ${log?.includes("[AI]") ? "text-zinc-300" :
                    log?.includes("[CMD]") ? "text-white" :
                      log?.includes("Outage avoided") ? "text-white" :
                        "text-zinc-500"
                  }`}
              >
                {log?.includes("[CMD]") ? (
                  <span className="opacity-50 select-none mr-2">$</span>
                ) : null}
                {log}
              </motion.div>
            ))}
            {logs.length < sequenceLength && (
              <div className="w-2 h-4 bg-white/20 animate-pulse mt-2 inline-block align-middle"></div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const sequenceLength = 9;
