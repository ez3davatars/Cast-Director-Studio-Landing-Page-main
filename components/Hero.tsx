import React from 'react';
import { motion } from 'framer-motion';
import { Play, ChevronRight, MonitorPlay, Clapperboard, Film } from 'lucide-react';

const Hero: React.FC = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-nano-dark">
      {/* Background Grid & Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-pattern bg-[size:60px_60px] opacity-[0.05]" />
        <div className="absolute inset-0 bg-radial-fade" />
      </div>

      <div className="container mx-auto px-6 z-10 grid lg:grid-cols-2 gap-16 items-center">
        {/* Text Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-nano-yellow/30 bg-nano-yellow/5">
            <div className="w-2 h-2 rounded-full bg-nano-yellow animate-pulse" />
            <span className="text-xs font-mono text-nano-yellow tracking-widest uppercase">
              Production Suite v2.0
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-tight font-sans tracking-tight">
            PROFESSIONAL <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-nano-text">
              CINEMATIC STAGING
            </span>
          </h1>

          <p className="text-xl text-nano-text max-w-lg leading-relaxed border-l-2 border-nano-yellow pl-6">
            A localized, privacy-first production studio. 
            <br />
            <span className="text-white font-medium">Turn a single user into a full film crew:</span> Casting Director, Costume Designer, and Cinematographer.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button className="flex items-center justify-center gap-3 bg-nano-yellow hover:bg-nano-gold text-black font-bold py-4 px-8 rounded-sm transition-all group shadow-[0_0_20px_rgba(250,204,21,0.3)]">
              <Clapperboard size={20} />
              <span className="tracking-wide">ENTER STUDIO</span>
              <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="flex items-center justify-center gap-3 glass-panel hover:bg-white/5 text-white py-4 px-8 rounded-sm transition-all">
              <Play size={18} className="fill-current" />
              <span className="tracking-wide">WATCH REEL</span>
            </button>
          </div>
        </motion.div>

        {/* Visual Content - The "Director's Monitor" */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          {/* Main Monitor Frame */}
          <div className="relative aspect-video w-full bg-nano-panel border border-nano-border rounded-lg shadow-2xl overflow-hidden group ring-1 ring-white/10">
             {/* Monitor UI Overlay */}
            <div className="absolute inset-0 z-20 pointer-events-none p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div className="font-mono text-[10px] text-nano-yellow flex flex-col gap-1">
                        <span>REC [●] 00:04:12:09</span>
                        <span>ISO 800 / 4300K / 24FPS</span>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-1 w-8 bg-green-500 rounded-full"></div>
                        <div className="h-1 w-8 bg-green-500 rounded-full"></div>
                        <div className="h-1 w-4 bg-yellow-500 rounded-full"></div>
                    </div>
                </div>
                
                {/* Center Focus Reticle */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-white/20 rounded-sm">
                    <div className="absolute top-1/2 left-0 w-2 h-[1px] bg-white/50"></div>
                    <div className="absolute top-1/2 right-0 w-2 h-[1px] bg-white/50"></div>
                    <div className="absolute top-0 left-1/2 h-2 w-[1px] bg-white/50"></div>
                    <div className="absolute bottom-0 left-1/2 h-2 w-[1px] bg-white/50"></div>
                </div>

                <div className="flex justify-between items-end">
                    <div className="glass-panel px-3 py-2 rounded text-xs font-mono text-nano-text">
                        <span className="text-white">LENS:</span> 35MM ANAMORPHIC <br/>
                        <span className="text-white">DEPTH:</span> 4.5M
                    </div>
                    <div className="text-right font-mono text-[10px] text-nano-text">
                        SOURCE: NATIVE_LOCAL<br/>
                        RENDER: REALTIME
                    </div>
                </div>
            </div>

            {/* Main Image */}
            <div className="w-full h-full bg-black relative">
                 <img 
                    src="https://picsum.photos/seed/cinematic/1920/1080?grayscale&blur=2" 
                    alt="Cinematic Render" 
                    className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-nano-dark/80 via-transparent to-nano-dark/20" />
            </div>
          </div>
          
          {/* Floating Tools Palette */}
          <motion.div 
             animate={{ x: [0, 5, 0] }}
             transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
             className="absolute -left-6 bottom-12 glass-panel p-3 rounded-lg shadow-xl border-l-2 border-nano-yellow flex flex-col gap-3"
          >
             <div className="w-8 h-8 rounded bg-nano-yellow/20 flex items-center justify-center text-nano-yellow border border-nano-yellow/30"><Clapperboard size={16}/></div>
             <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-gray-400 border border-white/10"><Film size={16}/></div>
             <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-gray-400 border border-white/10"><MonitorPlay size={16}/></div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;