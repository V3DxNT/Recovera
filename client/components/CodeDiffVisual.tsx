"use client";

import { motion } from "framer-motion";

export default function CodeDiffVisual() {
  const originalCode = [
    { num: 1, code: "import { db } from '@/lib/db';", highlight: "" },
    { num: 2, code: "import { eq } from 'drizzle-orm';", highlight: "" },
    { num: 3, code: "", highlight: "" },
    { num: 4, code: "export async function getUserProfile(userId: string) {", highlight: "" },
    { num: 5, code: "  // Fetch user data", highlight: "" },
    { num: 6, code: "  const user = await db.query.users.findFirst({", highlight: "removed", prefix: "-" },
    { num: 7, code: "    where: eq(users.id, userId)", highlight: "removed", prefix: "-" },
    { num: 8, code: "  });", highlight: "removed", prefix: "-" },
    { num: 9, code: "", highlight: "" },
    { num: 10, code: "  return user;", highlight: "" },
    { num: 11, code: "}", highlight: "" },
  ];

  const updatedCode = [
    { num: 1, code: "import { db } from '@/lib/db';", highlight: "" },
    { num: 2, code: "import { eq } from 'drizzle-orm';", highlight: "" },
    { num: 3, code: "", highlight: "" },
    { num: 4, code: "export async function getUserProfile(userId: string) {", highlight: "" },
    { num: 5, code: "  // Fetch user data", highlight: "" },
    { num: 6, code: "  const user = await db.query.users.findFirst({", highlight: "added", prefix: "+" },
    { num: 7, code: "    where: eq(users.id, userId),", highlight: "added", prefix: "+" },
    { num: 8, code: "    with: { preferences: true }", highlight: "added", prefix: "+" },
    { num: 9, code: "  });", highlight: "added", prefix: "+" },
    { num: 10, code: "", highlight: "" },
    { num: 11, code: "  return user;", highlight: "" },
    { num: 12, code: "}", highlight: "" },
  ];

  return (
    <section className="py-24 bg-[#050505] relative overflow-hidden">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl lg:text-4xl font-medium tracking-tight text-white mb-4">
            Reviews codebase and creates PRs.
          </h2>
          <p className="text-zinc-400 text-lg font-light leading-relaxed">
            AutoSRE understands your repository context, generates the exact fix, and opens a verifiable pull request automatically.
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto rounded-xl border border-white/10 bg-[#0c0c0c] shadow-2xl overflow-hidden font-mono text-[13px] leading-relaxed max-w-5xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111111]">
            <div className="flex items-center gap-2 text-zinc-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>src/controllers/user.ts</span>
            </div>
            <div className="text-zinc-600 text-xs tracking-wider">
              Recovera Auto-Fix
            </div>
          </div>

          {/* Diff Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Original Code (Left) */}
            <div className="border-r border-white/5 py-4">
              {originalCode.map((line, i) => (
                <div 
                  key={i} 
                  className={`flex px-4 py-[2px] ${
                    line.highlight === "removed" ? "bg-rose-500/10" : ""
                  }`}
                >
                  <span className="w-8 select-none text-right mr-4 text-zinc-600 font-medium">
                    {line.num.toString().padStart(2, '0')}
                  </span>
                  <span className={`w-4 select-none ${line.highlight === "removed" ? "text-rose-400" : "text-transparent"}`}>
                    {line.prefix || " "}
                  </span>
                  <span className={`${
                    line.highlight === "removed" ? "text-rose-300" : "text-zinc-300"
                  }`}>
                    {line.code || " "}
                  </span>
                </div>
              ))}
            </div>

            {/* Updated Code (Right) */}
            <div className="py-4">
              {updatedCode.map((line, i) => (
                <div 
                  key={i} 
                  className={`flex px-4 py-[2px] ${
                    line.highlight === "added" ? "bg-emerald-500/10" : ""
                  }`}
                >
                  <span className="w-8 select-none text-right mr-4 text-zinc-600 font-medium">
                    {line.num.toString().padStart(2, '0')}
                  </span>
                  <span className={`w-4 select-none ${line.highlight === "added" ? "text-emerald-400" : "text-transparent"}`}>
                    {line.prefix || " "}
                  </span>
                  <span className={`${
                    line.highlight === "added" ? "text-emerald-300" : "text-zinc-300"
                  }`}>
                    {line.code || " "}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
