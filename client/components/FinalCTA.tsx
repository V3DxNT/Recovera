export default function FinalCTA() {
  return (
    <section className="py-40 bg-black relative flex items-center justify-center border-t border-white/10 overflow-hidden">
      
      {/* Intense center spotlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-white opacity-[0.05] blur-[120px] rounded-full pointer-events-none"></div>

      <div className="container mx-auto px-6 relative z-10 text-center flex flex-col items-center">
        <h2 className="text-4xl md:text-6xl font-medium tracking-tighter text-white mb-6">
          Ready to automate <span className="text-zinc-500">reliability</span>?
        </h2>
        <p className="text-lg text-zinc-400 font-light max-w-xl mx-auto mb-10">
          Join the waitlist to access the Recovera Engine 2.0. Start resolving incidents automatically in milliseconds.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button className="w-full sm:w-auto px-8 py-4 text-sm font-medium text-black bg-white rounded-md hover:bg-zinc-200 transition-colors">
            Start building for free
          </button>
          <button className="w-full sm:w-auto px-8 py-4 text-sm font-medium text-zinc-300 bg-transparent border border-white/10 rounded-md hover:bg-white/[0.05] transition-colors">
            Talk to an expert
          </button>
        </div>
      </div>
    </section>
  );
}
