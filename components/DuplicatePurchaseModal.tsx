import React from 'react';

interface DuplicatePurchaseModalProps {
  productName: string;
  duplicateType: 'block' | 'warn' | 'allow';
  isSupport: boolean;
  onClose: () => void;
  onContinueAnyway: () => void;
}

const DuplicatePurchaseModal: React.FC<DuplicatePurchaseModalProps> = ({
  productName,
  duplicateType,
  isSupport,
  onClose,
  onContinueAnyway
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-nano-border rounded-sm w-full max-w-md overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-nano-border bg-[#111] text-center">
            <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wide text-nano-yellow">
                {isSupport ? "You may already have active support" : "You already own this license"}
            </h2>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 text-center">
          <p className="text-gray-300 mb-6">
            {isSupport
              ? `This account appears to already have access to ${productName}. Buying it again may overlap with your current support period.`
              : `This account already appears to have an active ${productName} license. Buying it again may create a duplicate purchase.`}
          </p>

          {!isSupport && (
            <div className="bg-nano-panel/50 p-4 border border-nano-border rounded-sm mb-6">
              <p className="text-sm text-nano-text">
                If you meant to recover your download, use your Account Dashboard instead.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onClose}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold uppercase tracking-wide transition-colors rounded-sm"
            >
              Cancel
            </button>
            <button
               onClick={onContinueAnyway}
               className="w-full py-3 bg-red-900/50 hover:bg-red-800 text-red-200 font-bold uppercase tracking-wide transition-colors rounded-sm border border-red-500/50"
            >
               Continue Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicatePurchaseModal;
