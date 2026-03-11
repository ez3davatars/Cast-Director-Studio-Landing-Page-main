import React from 'react';
import { HardDrive, Code2, ShieldCheck, Lock, Database, Cpu } from 'lucide-react';

const TechSpecs: React.FC = () => {
  const specs = [
    {
      icon: <HardDrive size={24} />,
      title: "Local-First Architecture",
      desc: "Native File Structure. All assets (Actors, Wardrobe) are saved to your local hard drive. You own your data."
    },
    {
      icon: <Code2 size={24} />,
      title: "Python-Powered Vision",
      desc: "Uses a local Python backend for heavy lifting like Depth Mapping and Surface Normals analysis."
    },
    {
      icon: <ShieldCheck size={24} />,
      title: "Privacy Encrypted",
      desc: "Identity processing happens locally or via secure enclave API. No public sharing of biometrics."
    },
    {
      icon: <Database size={24} />,
      title: "Shot Pack Export",
      desc: "Export JSON manifests containing exact prompts, seeds, and actor configs for perfect reproducibility."
    },
    {
      icon: <Lock size={24} />,
      title: "Strict Mode",
      desc: "Force AI adherence to reference images using proprietary weight-locking algorithms."
    },
    {
      icon: <Cpu size={24} />,
      title: "Spatial Compute",
      desc: "Calculates ground planes and occupied volumes to prevent physics hallucinations."
    }
  ];

  return (
    <section className="py-24 bg-black border-t border-nano-border">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-sm font-mono text-nano-yellow tracking-widest uppercase mb-2">Technical Superpowers</h2>
          <h3 className="text-3xl font-bold">BUILT FOR PRODUCTION</h3>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {specs.map((spec, i) => (
            <div key={i} className="bg-nano-panel/40 border border-nano-border p-6 rounded-lg hover:bg-nano-panel transition-colors group">
              <div className="mb-4 text-nano-text group-hover:text-nano-yellow transition-colors">{spec.icon}</div>
              <h4 className="text-white font-bold mb-2">{spec.title}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{spec.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechSpecs;