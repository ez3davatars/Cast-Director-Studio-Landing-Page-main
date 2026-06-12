import { Clock } from 'lucide-react';
import ContentPageLayout from '../components/ContentPageLayout';

const tutorials = [
  {
    title: 'Build Your First Creative Foundation',
    description:
      'Learn how to start from references or a blank project, set visual style direction, and organize the creative controls for your first generation workflow.',
  },
  {
    title: 'Use Photo Upload or Webcam Capture',
    description:
      'Walk through reference-guided photo upload and webcam capture workflows to create stronger visual anchors for yourself, clients, spokespeople, characters, or brand personalities.',
  },
  {
    title: 'Build a Production Reference Sheet',
    description:
      'Generate multi-angle references, expression maps, wardrobe guides, and style sheets for downstream AI tools and production workflows.',
  },
  {
    title: 'Direct Production-Ready Lighting',
    description:
      "Use Cast Director Studio's guided lighting controls to communicate cleaner subject lighting before generation.",
  },
  {
    title: 'Showcase Clothing, Wardrobe, or Products',
    description:
      'Direct wardrobe, accessories, styling, props, and product presentation through structured creative controls.',
  },
  {
    title: 'Explore Multiple Visual Styles',
    description:
      'Switch between photorealistic, stylized cartoon, anime, illustration, and sci-fi directions while keeping your references and creative settings organized.',
  },
  {
    title: 'Prepare Images for AI Video Workflows',
    description:
      'Export production assets and visual references formatted for AI video tools, animation pipelines, and other downstream generative systems.',
  },
  {
    title: 'Use BYOK Mode',
    description:
      'Connect your own Gemini API key, configure BYOK settings, and run generations through your own account for direct usage pricing.',
  },
];

export default function Tutorials() {
  return (
    <ContentPageLayout title="Tutorials">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Tutorials
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          Cast Director Studio includes a built-in step-by-step user guide
          right inside the app to help you get started quickly. This page will
          be the home for upcoming video tutorials covering workflows,
          creative techniques, and feature deep-dives as they are released.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tutorials.map((t) => (
          <div
            key={t.title}
            className="p-6 rounded-2xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300 flex flex-col"
          >
            <h3 className="font-display text-lg font-bold text-white mb-3">
              {t.title}
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6 flex-1">
              {t.description}
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <Clock size={14} />
              Coming Soon
            </div>
          </div>
        ))}
      </div>
    </ContentPageLayout>
  );
}
