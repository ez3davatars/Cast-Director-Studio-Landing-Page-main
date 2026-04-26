import { Link } from 'react-router-dom';
import { Briefcase, Mail } from 'lucide-react';
import ContentPageLayout from '../components/ContentPageLayout';

const futureAreas = [
  'Frontend Development',
  'AI Workflow Design',
  'Creator Education & Tutorials',
  'Customer Support',
  'Marketing & Growth',
  'Community Management',
  'Creator Partnerships',
  'Technical Writing',
];

export default function Careers() {
  return (
    <ContentPageLayout title="Careers">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Careers
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          EZ3D Avatars created Cast Director Studio, its first creator tool
          for AI avatar and character-focused visual production. Our focus is
          helping creators make reusable AI actors, digital doubles, character
          references, and production-ready visual assets with more control and
          less prompt wrestling.
        </p>
      </div>

      <div className="space-y-12">
        {/* Current status */}
        <section className="p-8 rounded-2xl border border-white/[0.04] bg-white/[0.02]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0 mt-1">
              <Briefcase size={20} className="text-nano-yellow" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white mb-3">
                Current Openings
              </h2>
              <p className="text-[16px] leading-relaxed text-slate-400">
                There are no formal job postings at this time. We are a small,
                focused team behind Cast Director Studio.
                As we grow, opportunities will be listed here.
              </p>
            </div>
          </div>
        </section>

        {/* Future areas */}
        <section>
          <h2 className="font-display text-2xl font-bold text-white mb-6">
            Future Areas of Interest
          </h2>
          <p className="text-[16px] leading-relaxed text-slate-400 mb-6">
            As Cast Director Studio grows, we anticipate needs in the following
            areas:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {futureAreas.map((area) => (
              <div
                key={area}
                className="px-5 py-4 rounded-xl border border-white/[0.04] bg-white/[0.02] text-slate-300 text-[15px] font-medium"
              >
                {area}
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="p-8 rounded-2xl border border-nano-yellow/10 bg-nano-yellow/[0.02]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-nano-yellow/10 flex items-center justify-center shrink-0 mt-1">
              <Mail size={20} className="text-nano-yellow" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white mb-3">
                Interested in Collaborating?
              </h2>
              <p className="text-[16px] leading-relaxed text-slate-400 mb-4">
                If you are a serious collaborator, contractor, or creative
                professional interested in working with us, we'd like to hear
                from you. Reach out with a brief introduction and what you're
                interested in contributing.
              </p>
              <Link
                to="/contact"
                className="inline-block px-6 py-3 rounded-full bg-white/10 text-white text-sm font-bold uppercase tracking-wide hover:bg-[#d4a017] hover:text-black transition-all"
              >
                Get in Touch
              </Link>
            </div>
          </div>
        </section>
      </div>
    </ContentPageLayout>
  );
}
