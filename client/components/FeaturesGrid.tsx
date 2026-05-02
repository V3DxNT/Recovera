import Link from "next/link";
import { Zap, GitMerge, LineChart, Code2, ShieldAlert, CloudCog, ArrowRight } from "lucide-react";

export default function FeaturesGrid() {
  return (
    <section id="features" className="py-32 bg-black text-white relative">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-20 max-w-2xl">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6">Uncompromising observability.</h2>
          <p className="text-zinc-400 text-lg md:text-xl font-light leading-relaxed">
            Every layer of your stack continuously analyzed. Recovera translates millions of telemetry points into isolated, actionable insights without prompt tuning or rule configuration.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[minmax(240px,auto)]">
          
          {/* Large Card 1 */}
          <div className="md:col-span-4 bg-[#0a0a0a] rounded-2xl border border-white/[0.08] p-8 flex flex-col justify-between overflow-hidden relative group hover:border-white/[0.15] transition-colors">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.03] rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6 text-zinc-300">
                <Search size={18} />
              </div>
              <h3 className="text-2xl font-medium tracking-tight mb-3">Root Cause AI</h3>
              <p className="text-zinc-400 font-light leading-relaxed max-w-sm">
                Forget traversing logs. Instantly traces distributed failures down to the precise lines of code.
              </p>
            </div>
            {/* Visual element simulating search mechanism */}
            <div className="mt-8 pt-8 border-t border-white/[0.08] w-full items-end hidden sm:flex">
               <div className="font-mono text-xs text-zinc-500 bg-black/50 p-3 rounded-md w-full border border-white/[0.05]">
                 $ root-cause-analyze --trace=TXN_491<br/>
                 <span className="text-zinc-600">... tracing</span><br/>
                 <span className="text-white">&gt; Memory leak found in /api/v2/charge (Line 42)</span>
               </div>
            </div>
          </div>

          {/* Small Card 1 */}
          <div className="md:col-span-2 bg-[#0a0a0a] rounded-2xl border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] transition-colors relative">
            <div>
              <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6 text-zinc-300">
                <Zap size={18} />
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-3">Auto Remediation</h3>
              <p className="text-zinc-400 font-light leading-relaxed">
                Applies tested, verifiable patches to your infrastructure the moment an anomaly is confirmed.
              </p>
            </div>
          </div>

          {/* Small Card 2 */}
          <div className="md:col-span-2 bg-[#0a0a0a] rounded-2xl border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] transition-colors">
             <div>
              <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6 text-zinc-300">
                <GitMerge size={18} />
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-3">PR Generation</h3>
              <p className="text-zinc-400 font-light leading-relaxed">
                Opens GitHub Pull Requests automatically with full unit tests attached.
              </p>
            </div>
          </div>

          {/* Large Card 2 */}
          <div className="md:col-span-4 bg-[#0a0a0a] rounded-2xl border border-white/[0.08] p-8 flex flex-col justify-between sm:flex-row gap-8 hover:border-white/[0.15] transition-colors">
            <div className="flex-1">
              <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6 text-zinc-300">
                <LineChart size={18} />
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-3">Telemetry Unification</h3>
              <p className="text-zinc-400 font-light leading-relaxed mb-6">
                Ingests data from Datadog, AWS Cloudwatch, and Prometheus. Eliminating the need to switch between dashboards dynamically over the stack.
              </p>
              <Link href="#" className="inline-flex items-center text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                View integrations <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>
            
            {/* Abstract visual */}
            <div className="flex-1 bg-black/50 rounded-xl border border-white/[0.05] p-4 hidden md:flex flex-col justify-center gap-3">
              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="w-[80%] h-full bg-zinc-400"></div></div>
              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="w-[60%] h-full bg-zinc-500"></div></div>
              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"><div className="w-[90%] h-full bg-white text-white shadow-[0_0_10px_white]"></div></div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// Simple fallback icon
function Search(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
}
