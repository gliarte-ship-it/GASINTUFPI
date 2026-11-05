import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-[#F5F5F5]">
      <h2 className="text-2xl font-bold text-zinc-900 mb-2">Página não encontrada</h2>
      <p className="text-sm text-zinc-500 mb-6">A página que você procura não existe ou foi movida.</p>
      <Link 
        href="/"
        className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-800 transition-all"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
