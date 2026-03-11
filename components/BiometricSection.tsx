import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Scan, Users, Lock, Fingerprint } from 'lucide-react';

const BiometricSection: React.FC = () => {
  const [activePhase, setActivePhase] = useState(0);
  const phases = [
    { label: "Scan Identity", desc: "5-Point visual acquisition" },
    { label: "Tokenize", desc: "Creating identity embeddings" },
    { label: "Prompt Lock", desc: "Ready for generation" }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePhase((prev) => (prev + 1) % phases.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [phases.length]);

  return (
    <section id="biometric" className="py-24 bg-nano-panel relative border-t border-nano-border">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row gap-16 items-center">
          
          {/* Left Content */}
          <div className="flex-1 space-y-8">
            <h2 className="font-mono text-nano-yellow text-sm tracking-widest uppercase mb-2">
              Nano Cast Engine
            </h2>
            <h3 className="text-4xl font-bold font-sans">
              From Scan to <br />
              <span className="text-gray-500">Universal Asset.</span>
            </h3>
            <p className="text-gray-400 leading-relaxed text-lg">
              We translate your physical appearance into a <strong>consistent digital token</strong>. 
              Our 5-point scan ensures your AI actors maintain their identity across thousands of generations, 
              costumes, and lighting scenarios.
            </p>

            <div className="space-y-6">
                <div className="flex gap-4 items-start p-4 rounded-lg bg-white/5 border border-white/5 hover:border-nano-yellow/30 transition-colors">
                    <div className="bg-nano-yellow/10 p-3 rounded text-nano-yellow">
                        <Scan size={24} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-1">Consistency Lock</h4>
                        <p className="text-sm text-gray-400">Generate thousands of images without your actor's face morphing or distorting.</p>
                    </div>
                </div>
                <div className="flex gap-4 items-start p-4 rounded-lg bg-white/5 border border-white/5 hover:border-nano-yellow/30 transition-colors">
                    <div className="bg-nano-yellow/10 p-3 rounded text-nano-yellow">
                        <Lock size={24} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-1">Style Agnostic</h4>
                        <p className="text-sm text-gray-400">Apply your locked identity to any prompt style—from Hyper-realism to Anime or Claymation.</p>
                    </div>
                </div>
            </div>
          </div>

          {/* Right Visualizer */}
          <div className="flex-1 w-full relative">
            <div className="w-full aspect-[4/5] bg-black border border-nano-border rounded-lg relative overflow-hidden flex flex-col">
                {/* Header UI */}
                <div className="h-12 border-b border-nano-border flex items-center px-4 justify-between bg-nano-dark">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500"></div>
                    </div>
                    <span className="font-mono text-xs text-gray-500">SESSION: ID-GEN-09</span>
                </div>

                {/* Main Viewport */}
                <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 to-black">
                     {/* Simulated Data Grid */}
                     <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div 
                            className="relative w-48 h-64"
                        >
                            {/* Central Identity Node */}
                            <motion.div 
                                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 3, repeat: Infinity }}
                                className="absolute inset-0 border-2 border-nano-yellow/30 rounded-lg flex items-center justify-center bg-nano-yellow/5"
                            >
                                <Fingerprint size={64} className="text-nano-yellow/50" />
                            </motion.div>

                            {/* Orbiting Nodes (representing prompts) */}
                            {[0, 1, 2, 3].map((i) => (
                                <motion.div
                                    key={i}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-[-40px] border border-dashed border-white/5 rounded-full"
                                    style={{ rotate: i * 45 }}
                                >
                                    <div className="absolute top-0 left-1/2 w-3 h-3 bg-white/20 rounded-full backdrop-blur-sm transform -translate-x-1/2 -translate-y-1/2"></div>
                                </motion.div>
                            ))}
                        </motion.div>
                     </div>

                     {/* Progress Overlay */}
                     <div className="absolute bottom-8 left-8 right-8">
                        <div className="flex justify-between mb-2">
                            <span className="font-mono text-nano-yellow text-xs">TOKENIZING IDENTITY...</span>
                            <span className="font-mono text-white text-xs">{activePhase === 0 ? 'INPUT' : activePhase === 1 ? 'PROCESSING' : 'LOCKED'}</span>
                        </div>
                        <div className="h-1 bg-gray-800 w-full rounded overflow-hidden">
                            <motion.div 
                                className="h-full bg-nano-yellow"
                                animate={{ width: activePhase === 0 ? '33%' : activePhase === 1 ? '66%' : '100%' }}
                            />
                        </div>
                        <div className="mt-4 flex justify-between gap-2">
                            {phases.map((phase, idx) => (
                                <div key={idx} className={`text-[10px] font-mono uppercase transition-colors ${idx === activePhase ? 'text-white font-bold' : 'text-gray-600'}`}>
                                    {phase.label}
                                </div>
                            ))}
                        </div>
                     </div>
                </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default BiometricSection;