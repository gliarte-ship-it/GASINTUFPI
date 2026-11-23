'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyCpfButtonProps {
  cpf: string | null | undefined;
  className?: string;
}

export function extractCpfDigits(cpf: string | null | undefined): string {
  if (!cpf) return '';
  const digits = String(cpf).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 9 && digits.length <= 11) {
    return digits.padStart(11, '0');
  }
  return digits;
}

export default function CopyCpfButton({ cpf, className = '' }: CopyCpfButtonProps) {
  const [copied, setCopied] = useState(false);

  const digits = extractCpfDigits(cpf);
  if (!digits) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(digits);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = digits;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = digits;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? `Copiado: ${digits}` : `Copiar CPF sem pontos/traço (${digits})`}
      className={`no-print inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-all cursor-pointer shrink-0 ${
        copied
          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          : 'text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 border border-transparent hover:border-zinc-200'
      } ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Copiado</span>
        </>
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
