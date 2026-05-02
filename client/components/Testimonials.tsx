export default function Testimonials() {
  return (
    <section className="py-32 bg-[#050505] relative overflow-hidden">
      {/* Background glow lines */}
      <div className="absolute top-0 w-full h-px bg-white/5"></div>
      <div className="absolute bottom-0 w-full h-px bg-white/5"></div>

      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col md:flex-row gap-16 justify-between items-start md:items-center mb-24">
          <h2 className="text-3xl font-medium tracking-tight text-white max-w-md">Trusted by engineering teams at the world's most demanding companies.</h2>

          <div className="flex flex-wrap gap-x-12 gap-y-8 opacity-40 grayscale">
            {/* Abstract geometric logos replacing real brands for a clean look */}
            <div className="text-xl font-bold tracking-tighter flex items-center gap-1"><div className="w-4 h-4 bg-white rounded-full"></div> Acme Corp</div>
            <div className="text-xl font-bold tracking-tighter flex items-center gap-1"><div className="w-4 h-4 border-2 border-white transform rotate-45"></div> Nexus</div>
            <div className="text-xl font-bold tracking-tighter flex items-center gap-1"><div className="w-4 h-4 bg-white"></div> Globex</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-10 border border-white/5 bg-white/[0.02] rounded-2xl">
            <div className="flex gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>)}
            </div>
            <p className="text-xl md:text-2xl font-light text-zinc-300 leading-relaxed tracking-tight mb-8">
              "Recovera caught a silent DB death spiral at 4 AM on Sunday. By the time I woke up, the incident was already patched, merged, and closed."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
              <div>
                <p className="text-sm font-medium text-white">Sarah Jenkins</p>
                <p className="text-xs text-zinc-500">Principal SRE, Global Finance</p>
              </div>
            </div>
          </div>

          <div className="p-10 border border-white/5 bg-white/[0.02] rounded-2xl md:mt-16">
            <div className="flex gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div>)}
            </div>
            <p className="text-xl md:text-2xl font-light text-zinc-300 leading-relaxed tracking-tight mb-8">
              "We deleted 4,000 lines of brittle automated runbook scripts. The AI engine just figures it out without us telling it exactly what to look for."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
              <div>
                <p className="text-sm font-medium text-white">David Chen</p>
                <p className="text-xs text-zinc-500">CTO, HyperLogistics</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
