"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useSession, signIn } from "next-auth/react";

export default function Hero() {
  const { data: session } = useSession();

  return (
    <section className="relative flex flex-col pt-40 pb-20 overflow-hidden bg-black min-h-[90vh]">
      {/* Absolute Noise Grain Texture */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{ backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/7/76/1k_Dissolve_Noise_Texture.png")' }}
      ></div>

      {/* Spotlights */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] bg-white opacity-[0.03] blur-[100px] rounded-full pointer-events-none"></div>

      <div className="relative z-30 px-6 max-w-4xl mx-auto flex flex-col items-center text-center w-full">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-sm mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-xs font-medium tracking-wide text-zinc-300">Recovera Engine</span>
          <ChevronRight className="w-3 h-3 text-zinc-500" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-6xl md:text-8xl font-medium tracking-tighter text-white mb-6 leading-[1.05]"
        >
          Reliability, <br className="hidden md:block" />
          <span className="text-zinc-500">engineered.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg md:text-xl text-zinc-400 max-w-2xl text-center mb-10 tracking-tight leading-relaxed font-light mx-auto"
        >
          Stop writing reactive scripts. Deploy an autonomous SRE that continuously anticipates, diagnoses, and silently resolves incidents in milliseconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto"
        >
          {session ? (
            <Link href="/dashboard" className="group relative flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-black bg-white rounded-full transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)]">
              Go to Dashboard
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:translate-x-0.5 group-hover:text-black transition-all" />
            </Link>
          ) : (
            <button 
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })} 
              className="group relative flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-black bg-white rounded-full transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-github"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              Connect with GitHub
            </button>
          )}
          <Link href="#pipeline" className="group flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-transparent border border-white/20 rounded-full hover:bg-white/5 hover:border-white/40 transition-all active:scale-95 backdrop-blur-md">
            How it works
          </Link>
        </motion.div>
      </div>

      {/* Abstract fading grid below the hero text */}
      <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-black to-transparent z-20 pointer-events-none"></div>
      <motion.div
        initial={{ opacity: 0, overflow: 'hidden' }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 1.5, delay: 0.5 }}
        className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[400px] border-t border-l border-white/20 origin-bottom transform perspective-[1000px] rotate-x-[60deg]"
        style={{ backgroundSize: '40px 40px', backgroundImage: 'linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)' }}
      ></motion.div>
    </section>
  );
}
