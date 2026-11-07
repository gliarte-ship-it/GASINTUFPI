'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FlaskConical, ArrowLeft, Upload, FileText, CheckCircle2, 
  AlertTriangle, Copy, Download, RefreshCw, Search, 
  Layers, ArrowRight, Eye, ChevronDown, ChevronUp, Sparkles, Check, Info
} from 'lucide-react';
import { parseTxtContent, TxtParseResult, TxtParseOptions } from '@/lib/txtParser';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

interface TxtLabProps {
  onBack: () => void;
  userEmail?: string | null;
}

const NORMAL_SAMPLE = `262790423285000000056PIELIETE DE BRITO ARAUJO E FLORIANO                 0537583530434666100000008524000154048ESTAVEL     Y346661-369330Z     2600100
262790423512000000056PIMARIA ROSALIA RIBEIRO BRANDIM                     2028072636834666100000006397000154048ESTAVEL     Y346661-369498Z     2600100
262791509466000000056PIPRISCILA DE SOUZA LUZ                             6270365031034666100000008524000154048ESTAVEL     Y346661-370644Z     2600100
262791151203000000056PICIBELLE SILVA ARAUJO RESENDE                      0517917742134666100000007831000154048ESTAVEL     Y446661-370968Z     2600100
262791729350000000056PIELVINA MARIA DE SOUSA BARBOSA                     3064250736834666100000011023000154048ESTAVEL     Y346661-370907Z     2600100`;

const PENSIONISTA_SAMPLE = `26279042331206648398000000056PIMARIA JOSE PEREIRA DA SILVA                  1339788535334666100000003889000154048NAO ESTAVEL Y346661-371202Z     2600100
26279116762006754228000000056PIRAIMUNDA MARIA DA CONCEICAO SILVA            4445143138734666100000002592000154048NAO ESTAVEL Y00-93983Z          2600100
26279116716706788521000000056PIMARIA DA CONCEICAO SILVA                     4116660434934666100000002028000154048NAO ESTAVEL  Y446661-368493Z    2600100
26279116724606897614000000056PIIRACEMA DE MACEDO NOGUEIRA                   3400948535334666100000004266000154048NAO ESTAVEL Y446661-369217Z     2600100
26279042201906939970000000056PIANTONIA MARILENA IBIAPINA NERES ALMEIDA      3745556739134666100000003017000154048NAO ESTAVEL Y00-25986Z          2600100`;

export default function TxtLab({ onBack, userEmail }: TxtLabProps) {
  const [txtInput, setTxtInput] = useState<string>(NORMAL_SAMPLE);
  const [inputMode, setInputMode] = useState<'paste' | 'file'>('paste');
  const [fileName, setFileName] = useState<string | null>(null);
  const [category, setCategory] = useState<'normal' | 'pensionista'>('normal');
  const [contractFormat, setContractFormat] = useState<'full' | 'short' | 'code'>('full');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  
  // Database comparison states
  const [compareWithDb, setCompareWithDb] = useState(true);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [latestReport, setLatestReport] = useState<any | null>(null);
  const [dbAssociatesMap, setDbAssociatesMap] = useState<Map<string, any>>(new Map());
  
  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'match' | 'diff' | 'new'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Derive parse result directly from input and options
  const parseResult = useMemo(() => {
    if (!txtInput.trim()) return null;
    return parseTxtContent(txtInput, { category, contractFormat });
  }, [txtInput, category, contractFormat]);

  // Load latest report and associates for comparison
  useEffect(() => {
    async function loadLatestReportData() {
      setIsLoadingDb(true);
      try {
        // Find latest normal report
        const { data: repData, error: repError } = await supabase
          .from('reports')
          .select('*')
          .eq('category', category)
          .order('year', { ascending: false })
          .order('month', { ascending: false })
          .limit(1);

        if (repError || !repData || repData.length === 0) {
          setIsLoadingDb(false);
          return;
        }

        const report = repData[0];
        setLatestReport(report);

        // Fetch associates of this report
        const { data: assocData, error: assocError } = await supabase
          .from('associates')
          .select('siape, name, cpf, value, contract')
          .eq('report_id', report.id);

        if (!assocError && assocData) {
          const map = new Map<string, any>();
          assocData.forEach((a: any) => {
            // Index by raw CPF digits or formatted CPF or SIAPE
            const cleanCpf = (a.cpf || '').replace(/\D/g, '');
            if (cleanCpf) map.set(cleanCpf, a);
            if (a.siape) map.set(`siape_${a.siape}`, a);
          });
          setDbAssociatesMap(map);
        }
      } catch (err) {
        console.error('Erro ao carregar dados do banco para comparação:', err);
      } finally {
        setIsLoadingDb(false);
      }
    }

    loadLatestReportData();
  }, [category]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setTxtInput(content);
      setCurrentPage(1);
    };
    reader.readAsText(file);
  };

  // Export to Excel for manual validation
  const exportToExcel = () => {
    if (!parseResult || parseResult.records.length === 0) return;

    const data = parseResult.records.map((r, idx) => ({
      'Nº': idx + 1,
      'SIAPE Pensionista': r.siape,
      ...(r.siape2 ? { 'SIAPE Instituidor': r.siape2 } : {}),
      'NOME': r.name,
      'CPF': r.cpf,
      'VALOR (R$)': r.value,
      'CONTRATO': r.contract,
      'RUBRICA': r.rubrica || '',
      'SITUAÇÃO': r.situacao || '',
      'CONTRATO COMPLETO': r.contractFull || '',
      'LINHA ORIGINAL': r.rawLine || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Associados_TXT');
    XLSX.writeFile(workbook, `teste_extracao_txt_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filtered & enriched records
  const enrichedRecords = useMemo(() => {
    if (!parseResult) return [];

    return parseResult.records.map(record => {
      const cleanCpf = record.rawCpf || record.cpf.replace(/\D/g, '');
      const dbMatch = dbAssociatesMap.get(cleanCpf) || dbAssociatesMap.get(`siape_${record.siape}`);

      let comparisonStatus: 'match' | 'diff' | 'new' = 'new';
      let valueDiff = 0;
      let dbContract = '';
      let dbValue = 0;

      if (dbMatch) {
        dbValue = Number(dbMatch.value || 0);
        dbContract = dbMatch.contract || '';
        valueDiff = Math.round((record.value - dbValue) * 100) / 100;
        
        if (Math.abs(valueDiff) < 0.01) {
          comparisonStatus = 'match';
        } else {
          comparisonStatus = 'diff';
        }
      }

      return {
        ...record,
        dbMatch,
        dbValue,
        dbContract,
        valueDiff,
        comparisonStatus
      };
    });
  }, [parseResult, dbAssociatesMap]);

  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter(r => {
      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          r.name.toLowerCase().includes(term) ||
          r.siape.toLowerCase().includes(term) ||
          r.cpf.toLowerCase().includes(term) ||
          r.contract.toLowerCase().includes(term);
        if (!matches) return false;
      }

      // Status filter
      if (filterStatus !== 'all' && r.comparisonStatus !== filterStatus) {
        return false;
      }

      return true;
    });
  }, [enrichedRecords, searchTerm, filterStatus]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const currentRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = useMemo(() => {
    if (!enrichedRecords.length) return null;
    const matchCount = enrichedRecords.filter(r => r.comparisonStatus === 'match').length;
    const diffCount = enrichedRecords.filter(r => r.comparisonStatus === 'diff').length;
    const newCount = enrichedRecords.filter(r => r.comparisonStatus === 'new').length;
    return {
      total: enrichedRecords.length,
      matchCount,
      diffCount,
      newCount,
      totalValue: parseResult?.totalValue || 0
    };
  }, [enrichedRecords, parseResult]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-indigo-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button 
              onClick={onBack}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all border border-white/10 text-white shrink-0 mt-1"
              title="Voltar ao Painel Principal"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  <FlaskConical className="w-3.5 h-3.5 text-indigo-300" />
                  Área de Testes e Homologação
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Exclusivo Super-Admin
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Laboratório de Importação de Arquivos TXT</h1>
              <p className="text-xs text-indigo-200/80 mt-1 max-w-3xl">
                Ambiente isolado (*sandbox*) para ler, decodificar e testar a extração automática de dados de arquivos em texto bruto (.txt da folha).
                <strong className="text-white ml-1">Nenhum dado é gravado no banco de dados oficial durante os testes.</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {parseResult && parseResult.records.length > 0 && (
              <button
                onClick={exportToExcel}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                Baixar Excel da Extração
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Input & Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Data Input */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
                Entrada de Dados (.TXT)
              </h2>
            </div>

            <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-medium">
              <button
                onClick={() => setInputMode('paste')}
                className={`px-3 py-1.5 rounded-lg transition-all ${inputMode === 'paste' ? 'bg-white shadow-sm text-black font-bold' : 'text-zinc-500 hover:text-black'}`}
              >
                Colar Linhas de Texto
              </button>
              <button
                onClick={() => setInputMode('file')}
                className={`px-3 py-1.5 rounded-lg transition-all ${inputMode === 'file' ? 'bg-white shadow-sm text-black font-bold' : 'text-zinc-500 hover:text-black'}`}
              >
                Subir Arquivo .txt
              </button>
            </div>
          </div>

          {inputMode === 'paste' ? (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-500 gap-2">
                <span>Cole aqui uma ou várias linhas do arquivo .txt:</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">Carregar amostra:</span>
                  <button
                    onClick={() => { setCategory('normal'); setTxtInput(NORMAL_SAMPLE); }}
                    className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3 text-indigo-600" />
                    Normal (5)
                  </button>
                  <button
                    onClick={() => { setCategory('pensionista'); setTxtInput(PENSIONISTA_SAMPLE); }}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3 text-indigo-600" />
                    Pensionistas (5)
                  </button>
                </div>
              </div>
              <textarea
                value={txtInput}
                onChange={(e) => setTxtInput(e.target.value)}
                placeholder="Cole as linhas do arquivo .txt aqui..."
                rows={6}
                className="w-full p-4 font-mono text-xs bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-800 resize-y"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-zinc-200 hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-zinc-50 hover:bg-indigo-50/30">
                <Upload className="w-8 h-8 text-indigo-600 mb-2" />
                <span className="text-xs font-bold text-zinc-700">
                  {fileName ? `Arquivo carregado: ${fileName}` : 'Clique para selecionar o arquivo .txt'}
                </span>
                <span className="text-[11px] text-zinc-400 mt-1">Formatos de texto da folha (.txt)</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {fileName && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between">
                  <span>Arquivo lido: <strong>{fileName}</strong></span>
                  <button
                    onClick={() => { setFileName(null); setTxtInput(''); }}
                    className="text-red-500 hover:underline text-[11px]"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-zinc-400">
              Linhas no editor: <strong>{txtInput.split(/\r?\n/).filter(l => l.trim()).length}</strong>
            </span>
            <button
              onClick={() => setCurrentPage(1)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Processar e Extrair Dados
            </button>
          </div>
        </div>

        {/* Right Column: Parameters & Settings */}
        <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-5">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-4">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
              Parâmetros de Extração
            </h2>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700">Tipo de Lista:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory('normal');
                  if (txtInput === PENSIONISTA_SAMPLE) setTxtInput(NORMAL_SAMPLE);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${category === 'normal' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}
              >
                Normal (Ativos/Apos.)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory('pensionista');
                  if (txtInput === NORMAL_SAMPLE) setTxtInput(PENSIONISTA_SAMPLE);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${category === 'pensionista' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}
              >
                Pensionistas (2 Siapes)
              </button>
            </div>
          </div>

          {/* Contract format selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
              <span>Formato do Contrato:</span>
              <span className="text-[10px] text-zinc-400 font-normal">Escolha o padrão</span>
            </label>
            
            <div className="space-y-2">
              <label className={`block p-3 rounded-xl border text-xs cursor-pointer transition-all ${contractFormat === 'full' ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900' : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="contractFormat"
                    value="full"
                    checked={contractFormat === 'full'}
                    onChange={() => setContractFormat('full')}
                    className="accent-indigo-600"
                  />
                  <span className="font-bold">Rubrica + Contrato (Recomendado)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 pl-5">Exemplo: <code className="bg-white px-1 py-0.5 rounded text-indigo-700 border border-zinc-200">346661-369330</code></p>
              </label>

              <label className={`block p-3 rounded-xl border text-xs cursor-pointer transition-all ${contractFormat === 'short' ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900' : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="contractFormat"
                    value="short"
                    checked={contractFormat === 'short'}
                    onChange={() => setContractFormat('short')}
                    className="accent-indigo-600"
                  />
                  <span className="font-bold">Apenas Dígitos Finais</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 pl-5">Exemplo: <code className="bg-white px-1 py-0.5 rounded text-indigo-700 border border-zinc-200">369330</code></p>
              </label>

              <label className={`block p-3 rounded-xl border text-xs cursor-pointer transition-all ${contractFormat === 'code' ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900' : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="contractFormat"
                    value="code"
                    checked={contractFormat === 'code'}
                    onChange={() => setContractFormat('code')}
                    className="accent-indigo-600"
                  />
                  <span className="font-bold">Código Numérico Interno</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 pl-5">Exemplo: <code className="bg-white px-1 py-0.5 rounded text-indigo-700 border border-zinc-200">154048</code></p>
              </label>
            </div>
          </div>

          {/* Database comparison toggle */}
          <div className="pt-2 border-t border-zinc-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compareWithDb}
                onChange={(e) => setCompareWithDb(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded"
              />
              <span className="text-xs font-bold text-zinc-800">
                Cruzar com a última lista do sistema
              </span>
            </label>
            <p className="text-[11px] text-zinc-500 mt-1 pl-6">
              {latestReport 
                ? `Comparando com relatório de ${latestReport.month}/${latestReport.year} (${dbAssociatesMap.size} associados).`
                : 'Nenhum relatório anterior encontrado para comparação.'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Registros Lidos</span>
            <span className="text-2xl font-black text-zinc-800">{stats.total}</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">associados extraídos</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Conferem 100%</span>
            <span className="text-2xl font-black text-emerald-600">{stats.matchCount}</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">valores idênticos à base</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Valores Alterados</span>
            <span className="text-2xl font-black text-amber-600">{stats.diffCount}</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">com variação no valor</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Novos na Folha</span>
            <span className="text-2xl font-black text-blue-600">{stats.newCount}</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">não estavam no mês ant.</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm col-span-2 md:col-span-1">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Total Acumulado</span>
            <span className="text-xl font-black text-indigo-900">
              {stats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">soma de mensalidades</span>
          </div>
        </div>
      )}

      {/* Main Results Table */}
      {parseResult && (
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Table Header & Controls */}
          <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-2xl text-indigo-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900">Resultado da Extração TXT</h3>
                <p className="text-xs text-zinc-500">
                  {filteredRecords.length} associados exibidos
                  {parseResult.ignoredLines.length > 0 && ` (${parseResult.ignoredLines.length} linhas de cabeçalho/rodapé ignoradas)`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar por nome, siape, cpf..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 text-zinc-800"
                />
              </div>

              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
                className="py-2 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-700 font-medium"
              >
                <option value="all">Todos os Registros</option>
                <option value="match">Apenas Conferem 100%</option>
                <option value="diff">Apenas Valores Alterados</option>
                <option value="new">Apenas Novos Associados</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {(() => {
            const isPensionistaMode = category === 'pensionista' || currentRecords.some(r => !!r.siape2);
            const totalCols = compareWithDb ? (isPensionistaMode ? 9 : 8) : (isPensionistaMode ? 8 : 7);

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50/70 border-b border-zinc-200/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      <th className="py-3 px-4 w-12 text-center">Nº</th>
                      {isPensionistaMode ? (
                        <>
                          <th className="py-3 px-4 whitespace-nowrap">Siape Pensionista</th>
                          <th className="py-3 px-4 whitespace-nowrap">Siape Instituidor</th>
                        </>
                      ) : (
                        <th className="py-3 px-4">SIAPE</th>
                      )}
                      <th className="py-3 px-4">Nome do Associado</th>
                      <th className="py-3 px-4">CPF</th>
                      <th className="py-3 px-4 text-right">Valor Extraído</th>
                      <th className="py-3 px-4">Contrato</th>
                      {compareWithDb && (
                        <th className="py-3 px-4">Comparação c/ Último Mês</th>
                      )}
                      <th className="py-3 px-4 text-center">Linha TXT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {currentRecords.length === 0 ? (
                      <tr>
                        <td colSpan={totalCols} className="py-12 text-center text-zinc-400">
                          Nenhum associado encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      currentRecords.map((record, index) => {
                        const rowNumber = (currentPage - 1) * pageSize + index + 1;
                        const isExpanded = expandedRow === rowNumber;

                        return (
                          <React.Fragment key={rowNumber}>
                            <tr className="hover:bg-indigo-50/30 transition-colors">
                              <td className="py-3 px-4 text-center font-mono text-zinc-400 text-[11px]">
                                {rowNumber}
                              </td>
                              {isPensionistaMode ? (
                                <>
                                  <td className="py-3 px-4 font-mono font-bold text-zinc-800">
                                    {record.siape}
                                  </td>
                                  <td className="py-3 px-4 font-mono text-zinc-600">
                                    {record.siape2 || '---'}
                                  </td>
                                </>
                              ) : (
                                <td className="py-3 px-4 font-mono font-bold text-zinc-800">
                                  {record.siape}
                                </td>
                              )}
                              <td className="py-3 px-4 font-medium text-zinc-900">
                                {record.name}
                              </td>
                              <td className="py-3 px-4 font-mono text-zinc-600 whitespace-nowrap">
                                {record.cpf}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 whitespace-nowrap">
                                {record.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded text-[11px] border border-zinc-200 whitespace-nowrap">
                              {record.contract}
                            </span>
                          </td>

                          {/* Database comparison column */}
                          {compareWithDb && (
                            <td className="py-3 px-4">
                              {record.comparisonStatus === 'match' && (
                                <div className="flex items-center gap-1.5 text-emerald-700">
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[11px] font-semibold">100% Idêntico</span>
                                </div>
                              )}

                              {record.comparisonStatus === 'diff' && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-amber-700">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="text-[11px] font-bold">
                                      {record.valueDiff > 0 ? `+ R$ ${record.valueDiff.toFixed(2)}` : `- R$ ${Math.abs(record.valueDiff).toFixed(2)}`}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    Anterior: R$ {record.dbValue.toFixed(2)}
                                  </div>
                                </div>
                              )}

                              {record.comparisonStatus === 'new' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Novo Associado
                                </span>
                              )}
                            </td>
                          )}

                          {/* Inspect button */}
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : rowNumber)}
                              className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-500 hover:text-black transition-all"
                              title="Ver linha bruta original e decomposição"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="bg-zinc-50/80">
                            <td colSpan={totalCols} className="p-4 border-y border-zinc-200 text-xs">
                              <div className="space-y-3 max-w-4xl">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-zinc-700 text-xs uppercase tracking-wider">
                                    Decomposição da Linha #{record.lineNumber} do TXT
                                  </span>
                                  <span className="text-[11px] text-zinc-400 font-mono">
                                    Tamanho: {record.rawLine?.length || 0} caracteres
                                  </span>
                                </div>

                                <div className="p-3 bg-zinc-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto">
                                  {record.rawLine}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Siape Pensionista</span>
                                    <span className="font-mono font-bold text-zinc-800">{record.siape}</span>
                                  </div>

                                  {record.siape2 && (
                                    <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                      <span className="text-[10px] text-zinc-400 uppercase font-bold block">Siape Instituidor</span>
                                      <span className="font-mono font-bold text-indigo-700">{record.siape2}</span>
                                    </div>
                                  )}

                                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Rubrica</span>
                                    <span className="font-mono font-bold text-zinc-800">{record.rubrica || '---'}</span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Situação</span>
                                    <span className="font-bold text-zinc-800 truncate block">{record.situacao || '---'}</span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Contrato TXT</span>
                                    <span className="font-mono font-bold text-indigo-600 truncate block">{record.contractFull || record.contract}</span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200">
                                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Contrato Base</span>
                                    <span className="font-mono font-bold text-zinc-700 truncate block">{record.dbContract || 'Novo'}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
            );
          })()}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>

              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50 font-medium"
                >
                  Anterior
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50 font-medium"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ignored Lines Drawer (if any) */}
      {parseResult && parseResult.ignoredLines.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-6 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <Info className="w-4 h-4" />
            <span>Linhas do arquivo ignoradas ({parseResult.ignoredLines.length})</span>
          </div>
          <p className="text-zinc-600">
            O extrator ignorou linhas que correspondem a cabeçalho do arquivo, totais ou que não contêm o padrão de associado:
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 bg-white p-3 rounded-xl border border-amber-200/60 font-mono text-[11px]">
            {parseResult.ignoredLines.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-zinc-600">
                <span className="text-amber-600 font-bold">L{l.line}:</span>
                <span className="truncate flex-1">{l.text}</span>
                <span className="text-zinc-400 text-[10px]">({l.reason})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
