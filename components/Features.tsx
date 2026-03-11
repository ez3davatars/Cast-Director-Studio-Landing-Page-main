import React from 'react';
import { motion } from 'framer-motion';
import { Shirt, Box, Clapperboard, Layers } from 'lucide-react';
import { FeatureCardProps } from '../types';

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, icon, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className="group relative p-8 bg-nano-panel border border-nano-border hover:border-nano-yellow/50 transition-colors rounded-sm overflow-hidden"
  >
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
       {/* Big background icon */}
       {React.cloneElement(icon as React.ReactElement<any>, { size: 100 })}
    </div>
    
    <div className="relative z-10">
      <div className="w-12 h-12 bg-nano-dark border border-nano-border rounded flex items-center justify-center mb-6 text-nano-yellow group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-white font-sans">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
    
    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-nano-yellow group-hover:w-full transition-all duration-500" />
  </motion.div>
);

const Features: React.FC = () => {
  const features = [
    {
      title: "Wardrobe Prompt Studio",
      description: "Define custom clothing assets that stick. Generate infinite costume variations without losing the actor's identity or body consistency.",
      icon: <Shirt />
    },
    {
      title: "Prop & Object Control",
      description: "Ensure narrative continuity. Generate specific props (watches, weapons, tools) that persist across different generated scenes.",
      icon: <Box />
    },
    {
      title: "Scene Composer",
      description: "Streamlined staging control. Place your identity-locked characters into complex environments using advanced masking and prompt weighing.",
      icon: <Layers />
    },
    {
      title: "Video AI Optimized",
      description: "The perfect starting point for motion. Export high-res, consistent character plates ready for Runway Gen-3, Pika, and Sora.",
      icon: <Clapperboard />
    }
  ];

  return (
    <section id="features" className="py-24 bg-nano-dark relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">COMPLETE PROMPT CONTROL</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
                Stop rolling the dice on random generations. 
                Our studio gives you the controls to direct every pixel before you hit generate.
            </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
                <FeatureCard key={i} {...f} delay={i * 0.1} />
            ))}
        </div>
      </div>
    </section>
  );
};

export default Features;