import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  ScanFace, 
  Shirt, 
  Box, 
  Layers, 
  Video, 
  CheckCircle2, 
  Wand2,
  Anchor
} from 'lucide-react';

const phases = [
  {
    id: 0,
    title: "Casting Forge",
    subtitle: "The Character Generator",
    icon: <User size={20} />,
    desc: "Generate photorealistic actors with the Raw Reality Protocol. Automatically creates reference sheet turnarounds (Front, Side, Back).",
    color: "text-blue-400"
  },
  {
    id: 1,
    title: "Nano Cast",
    subtitle: "Biometrics & Identity",
    icon: <ScanFace size={20} />,
    desc: "Inject real identity using a 5-point webcam scan. Use Identity Lock to maintain facial structure across styles like Pixar or Cyberpunk.",
    color: "text-nano-yellow"
  },
  {
    id: 2,
    title: "Wardrobe Studio",
    subtitle: "Virtual Try-On",
    icon: <Shirt size={20} />,
    desc: "AI Costume Designer with Natural Drape physics for cloth and Geometric Lock for rigid armor. Cross-gender fitting adapts designs instantly.",
    color: "text-purple-400"
  },
  {
    id: 3,
    title: "Prop House",
    subtitle: "Asset Management",
    icon: <Box size={20} />,
    desc: "Generate isolated props with automatic background removal. Build a library of handheld items and set dressing assets.",
    color: "text-green-400"
  },
  {
    id: 4,
    title: "Blocking Stage",
    subtitle: "Spatial Intelligence",
    icon: <Layers size={20} />,
    desc: "Assemble scenes with depth awareness. Actors respect collision detection—no clipping through tables or walls.",
    color: "text-orange-400"
  },
  {
    id: 5,
    title: "Action",
    subtitle: "Production Rendering",
    icon: <Video size={20} />,
    desc: "Anchor DNA analyzes scene lighting to prevent the 'sticker effect'. Exports Shot Packs with JSON manifests for perfect reproducibility.",
    color: "text-red-400"
  }
];

const Workflow: React.FC = () => {
  const [activePhase, setActivePhase] = useState(0);

  return (
    <section id="workflow" className="py-24 bg-nano-dark relative border-t border-nano-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">THE PRODUCTION PIPELINE</h2>
          <p className="text-nano-text max-w-2xl mx-auto">
            A linear professional workflow. Six phases to move from concept to cinematic reality.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Phase Navigation */}
          <div className="lg:col-span-5 flex flex-col gap-2">
            {phases.map((phase) => (
              <button
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                className={`group text-left p-4 rounded-lg border transition-all duration-300 relative overflow-hidden ${
                  activePhase === phase.id 
                    ? 'bg-nano-panel border-nano-yellow shadow-[0_0_15px_rgba(250,204,21,0.1)]' 
                    : 'bg-transparent border-transparent hover:bg-nano-panel/50 hover:border-nano-border'
                }`}
              >
                <div className="flex items-start gap-4 relative z-10">
                   <div className={`mt-1 p-2 rounded-md transition-colors duration-300 ${activePhase === phase.id ? 'bg-nano-yellow text-black' : 'bg-nano-border text-gray-500 group-hover:text-gray-300'}`}>
                      {phase.icon}
                   </div>
                   <div>
                      <h3 className={`font-bold font-mono uppercase tracking-wider text-sm mb-1 transition-colors ${activePhase === phase.id ? 'text-white' : 'text-gray-400'}`}>
                        Phase 0{phase.id + 1}: {phase.title}
                      </h3>
                      <p className={`text-xs font-semibold mb-2 ${phase.color}`}>{phase.subtitle}</p>
                      <AnimatePresence>
                        {activePhase === phase.id && (
                          <motion.p 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-sm text-gray-400 leading-relaxed"
                          >
                            {phase.desc}
                          </motion.p>
                        )}
                      </AnimatePresence>
                   </div>
                </div>
              </button>
            ))}
          </div>

          {/* Right Column: Visualizer */}
          <div className="lg:col-span-7 sticky top-24">
            <div className="bg-nano-panel border border-nano-border rounded-xl aspect-[16/10] relative overflow-hidden shadow-2xl">
                {/* Viewport UI */}
                <div className="absolute top-0 left-0 right-0 h-10 bg-nano-dark/90 border-b border-nano-border flex items-center justify-between px-4 z-20 backdrop-blur-sm">
                   <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                         <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                         <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                      </div>
                      <span className="text-[10px] font-mono text-gray-500 ml-2">VIEWPORT // {phases[activePhase].title.toUpperCase()}</span>
                   </div>
                   <div className="text-[10px] font-mono text-nano-yellow animate-pulse">
                      PROCESSING_MODE: ACTIVE
                   </div>
                </div>

                {/* Dynamic Content */}
                <div className="absolute inset-0 pt-10 flex items-center justify-center bg-black/40">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-5"></div>
                  
                  <AnimatePresence mode="wait">
                    {activePhase === 0 && (
                       <CastingForgeVisual key="casting" />
                    )}
                    {activePhase === 1 && (
                       <NanoCastVisual key="nanocast" />
                    )}
                    {activePhase === 2 && (
                       <WardrobeVisual key="wardrobe" />
                    )}
                    {activePhase === 3 && (
                       <PropVisual key="prop" />
                    )}
                    {activePhase === 4 && (
                       <BlockingVisual key="blocking" />
                    )}
                    {activePhase === 5 && (
                       <ActionVisual key="action" />
                    )}
                  </AnimatePresence>
                </div>

                {/* Grid Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Sub-Visual Components ---

const CastingForgeVisual = () => (
  <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="w-full h-full p-8 flex gap-4">
     <div className="w-1/3 h-full border border-nano-border bg-black/50 p-4 font-mono text-xs text-green-400 overflow-hidden">
        <motion.div initial={{y: 20, opacity:0}} animate={{y:0, opacity:1}} transition={{staggerChildren: 0.1}}>
           <p>{" > "} Initializing Raw Reality Protocol...</p>
           <p>{" > "} Subject: Male, 30s, rugged.</p>
           <p>{" > "} Lighting: Soft cinematic.</p>
           <p className="text-white mt-2">Generating Reference Sheet...</p>
        </motion.div>
     </div>
     <div className="flex-1 h-full grid grid-cols-2 gap-2">
         {[1,2,3,4].map(i => (
             <motion.div 
               key={i} 
               initial={{scale: 0.8, opacity: 0}} 
               animate={{scale: 1, opacity: 1}} 
               transition={{delay: i * 0.2}}
               className="bg-slate-800 rounded relative overflow-hidden"
             >
                 <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900"></div>
                 <User className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600" size={40} />
             </motion.div>
         ))}
     </div>
  </motion.div>
);

const NanoCastVisual = () => (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="relative w-64 h-80 border-2 border-nano-yellow/30 rounded-lg flex items-center justify-center overflow-hidden bg-black">
        <ScanFace size={80} className="text-slate-700" />
        
        {/* Scanning Line */}
        <motion.div 
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-[2px] bg-nano-yellow shadow-[0_0_15px_rgba(250,204,21,0.8)] z-10"
        />
        
        {/* Face Points */}
        <motion.div 
            className="absolute top-1/3 left-1/3 w-2 h-2 bg-nano-yellow rounded-full"
            animate={{ scale: [1, 1.5, 1] }} 
            transition={{ repeat: Infinity, duration: 2 }}
        />
         <motion.div 
            className="absolute top-1/3 right-1/3 w-2 h-2 bg-nano-yellow rounded-full"
            animate={{ scale: [1, 1.5, 1] }} 
            transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
        />
         <motion.div 
            className="absolute bottom-1/3 left-1/2 w-2 h-2 bg-nano-yellow rounded-full"
            animate={{ scale: [1, 1.5, 1] }} 
            transition={{ repeat: Infinity, duration: 2, delay: 1 }}
        />

        <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-mono text-nano-yellow">Acquiring Biometrics...</div>
    </motion.div>
);

const WardrobeVisual = () => (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="flex items-center justify-center h-full relative">
        <div className="w-48 h-80 bg-slate-800 rounded-full blur-sm opacity-50 absolute"></div>
        <User size={200} className="text-slate-700 absolute" />
        
        {/* Clothing Overlay Animation */}
        <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="absolute z-10"
        >
             <Shirt size={210} className="text-purple-400/80 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
        </motion.div>

        <div className="absolute top-10 right-20 bg-nano-panel border border-nano-border p-2 rounded text-xs font-mono">
            <div className="flex items-center gap-2 mb-1"><Wand2 size={12}/> Natural Drape: ON</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-green-500"/> Fit: 100%</div>
        </div>
    </motion.div>
);

const PropVisual = () => (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="grid grid-cols-3 gap-8 p-12 w-full h-full">
        {[1,2,3,4,5,6].map((i) => (
            <motion.div 
                key={i}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: i * 0.1, type: "spring" }}
                className="bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center hover:border-green-400/50 transition-colors"
            >
                <Box className="text-slate-400" />
            </motion.div>
        ))}
    </motion.div>
);

const BlockingVisual = () => (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="w-full h-full flex items-center justify-center perspective-1000">
        <div className="relative w-64 h-48 transform rotate-x-60 preserve-3d">
            {/* Floor Plane */}
            <div className="absolute inset-0 bg-slate-800/30 border border-slate-600 grid grid-cols-4 grid-rows-4">
                {[...Array(16)].map((_, i) => <div key={i} className="border border-slate-700/30"></div>)}
            </div>
            
            {/* Objects */}
            <motion.div 
                animate={{ z: 20, x: [0, 50, 0] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-10 top-10 w-12 h-24 bg-orange-500/80 shadow-lg transform -translate-y-1/2"
            >
                 <div className="text-[8px] text-white text-center mt-1">ACTOR_01</div>
            </motion.div>
            
            <div className="absolute right-20 top-20 w-32 h-20 bg-slate-600/80 border border-slate-400 transform translate-z-10">
                <div className="text-[8px] text-white text-center mt-1">TABLE_OBS</div>
            </div>
        </div>
    </motion.div>
);

const ActionVisual = () => (
    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="w-full h-full relative">
         <img src="https://picsum.photos/seed/action/800/500?grayscale" className="w-full h-full object-cover opacity-20" alt="" />
         
         <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
             <Anchor size={48} className="text-red-500 animate-bounce" />
             <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                 <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="h-full bg-red-500"
                 />
             </div>
             <p className="font-mono text-red-400 text-sm">ANCHOR DNA ANALYZING...</p>
         </div>
    </motion.div>
);

export default Workflow;