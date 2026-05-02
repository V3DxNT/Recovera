"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export default function PipelineFlow() {
  const [activePhase, setActivePhase] = useState(0);
  const steps = [
    {
      id: "01",
      title: "Integrate & Provision",
      description: "Connect your AWS environment and GitHub repository. Recovera automatically provisions an S3 bucket and Kinesis Firehose to stream telemetry securely.",
      icon: "⚡"
    },
    {
      id: "02",
      title: "Ingest & Normalize",
      description: "Millions of CloudWatch logs and metrics stream in real-time. Our engine normalizes, deduplicates, and maps errors directly to your codebase resources.",
      icon: "🌊"
    },
    {
      id: "03",
      title: "Root Cause Analysis",
      description: "When an anomaly triggers, our Agentic AI immediately retrieves the exact source files via Vector Search and synthesizes a precise diagnostic report.",
      icon: "🧠"
    },
    {
      id: "04",
      title: "Automated Remediation",
      description: "The engine generates a verifiable code patch, evaluates it against your infrastructure safety policies, and opens a Pull Request automatically.",
      icon: "🔧"
    }
  ];

  return (
    <section id="pipeline" className="py-24 bg-black relative overflow-hidden border-b border-white/[0.05]">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-16">
          <h2 className="text-3xl lg:text-4xl font-medium tracking-tight text-white">
            The Autonomous Pipeline
          </h2>
        </div>

        <div className="relative">
          {/* Horizontal Line connecting the nodes (visible on md and up) */}
          <div className="hidden md:block absolute top-[26px] left-[10px] right-[10px] h-[1px] bg-white/[0.08] z-0" />
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6 relative z-10">
            {steps.map((step, index) => (
              <motion.div 
                key={step.id}
                onMouseEnter={() => setActivePhase(index)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col relative p-4 -ml-4 rounded-xl cursor-default transition-colors duration-300 ${activePhase === index ? 'bg-white/[0.02]' : 'hover:bg-white/[0.01]'}`}
              >
                {/* Node Dot */}
                <div className="hidden md:flex items-center mb-8 h-5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center bg-black border transition-colors duration-300 ${activePhase === index ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'border-white/20'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${activePhase === index ? 'bg-rose-500' : 'bg-white/40'}`} />
                  </div>
                </div>

                {/* Mobile Dot (only shows on small screens next to title) */}
                <div className="md:hidden w-5 h-5 rounded-full flex items-center justify-center bg-black border mb-4 transition-colors duration-300" style={{ borderColor: activePhase === index ? 'rgba(244,63,94,0.5)' : 'rgba(255,255,255,0.2)' }}>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${activePhase === index ? 'bg-rose-500' : 'bg-white/40'}`} />
                </div>

                <h3 className={`text-[15px] font-medium mb-3 transition-colors duration-300 ${activePhase === index ? 'text-white' : 'text-zinc-300'}`}>
                  {step.title}
                </h3>
                <p className={`text-[14px] leading-relaxed font-light pr-4 transition-colors duration-300 ${activePhase === index ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  {step.description}
                </p>
                <div className={`mt-4 text-[11px] font-mono tracking-widest uppercase transition-colors duration-300 ${activePhase === index ? 'text-rose-400' : 'text-zinc-600'}`}>
                  Phase {step.id}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
